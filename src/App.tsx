import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dock, Inspector, ViewBar, type ViewKey } from './components/Bars'
import { FilePanel, type ExportKind } from './components/FilePanel'
import { GrowPanel } from './components/GrowPanel'
import { ConfirmDialog, HelpDialog, QuickStart, type Pending } from './components/Help'
import { ShapePanel } from './components/ShapePanel'
import { Stage, type StageControls, type Tool } from './components/Stage'
import { StylePanel } from './components/StylePanel'
import { TabPanel, Tabs } from './components/Tabs'
import { TooltipLayer } from './components/Tooltip'
import { Boundary, boundaryOf } from './growth/boundary'
import type { Polygon, Vec } from './growth/geometry'
import { lineColors } from './lib/colors'
import { boundaryRings, freshDesign, startOf, type Design, type Imported } from './lib/design'
import { growthDxf } from './lib/dxfExport'
import { EXTENSION, parseProject, ProjectError, serializeProject } from './lib/project'
import { pngProblem, renderPng } from './lib/render'
import { saveFile } from './lib/saveFile'
import { DEFAULTS, LIMITS, sanitizeSettings, type Settings } from './lib/settings'
import { growthSvg } from './lib/svgExport'
import { captureDrawing, readSvgDrawing, SvgShapeError } from './lib/svgImport'
import { MAX_PATH_SEGMENTS, segmentCount } from './lib/pieces'
import { pixelSize, toUnits, trimZeros, UNIT_LABEL } from './lib/units'
import { useGrowth, type Status } from './useGrowth'

type TabId = 'grow' | 'shape' | 'style' | 'file'
const SESSION_KEY = 'line-growth:session'
const SESSION_UNSAVED_KEY = 'line-growth:session-unsaved'
const QUICK_START_KEY = 'line-growth:quick-start-dismissed'

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* private mode or full: skip */ } },
}

const randomSeed = () => 1 + Math.floor(Math.random() * 999_999)

// The last session comes back after a reload or a closed tab, so work is never lost to an accident.
function initialDesign(): { design: Design; saved: boolean; restored: boolean } {
  const text = storage.get(SESSION_KEY)
  if (text) {
    try { return { design: parseProject(text), saved: storage.get(SESSION_UNSAVED_KEY) !== '1', restored: true } } catch { /* an unreadable session starts fresh */ }
  }
  return { design: freshDesign(DEFAULTS), saved: true, restored: false }
}

const baseName = (s: Settings, imported: Imported | null) => {
  if (s.shape === 'imported' && imported) return `${imported.name.replace(/\.svg$/i, '')}-grown`
  const unit = s.units
  const v = (mm: number) => trimZeros(toUnits(mm, unit, s.dpi).toFixed(unit === 'in' ? 2 : unit === 'px' || unit === 'pt' ? 0 : 1))
  return `line-growth-${v(s.width)}x${v(s.height)}${UNIT_LABEL[unit]}`
}

// Brings an imported drawing within the sheet's size limits, scaling it evenly if needed.
function fitPage(width: number, height: number): number {
  const big = Math.max(width, height), small = Math.min(width, height)
  if (big > LIMITS.width[1]) return LIMITS.width[1] / big
  if (small < LIMITS.width[0]) return LIMITS.width[0] / small
  return 1
}

export function App() {
  const [first] = useState(initialDesign)
  const [status, setStatus] = useState<Status>(() => (first.restored ? { text: 'Restored your last session.' } : null))
  const growth = useGrowth(() => first, setStatus)
  const { design, stats } = growth
  const s = design.settings
  const [tab, setTab] = useState<TabId>('grow')
  const [tool, setTool] = useState<Tool>('draw')
  const [zoom, setZoom] = useState(1)
  const [showHelp, setShowHelp] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(() => storage.get(QUICK_START_KEY) !== '1')
  const [pending, setPending] = useState<Pending | null>(null)
  const [openError, setOpenError] = useState('')
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<StageControls | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const svgInput = useRef<HTMLInputElement>(null)

  // Routine messages fade back to the counts; warnings stay until something else happens.
  useEffect(() => {
    if (!status || status.warning) return
    const timer = window.setTimeout(() => setStatus(null), 5000)
    return () => window.clearTimeout(timer)
  }, [status])

  const rings = boundaryRings(s, design.imported)
  const boundary = boundaryOf(rings)
  // The fixed points along the boundary, as the engine spaces them, for the measurements.
  const boundaryPoints = useMemo(() => boundary.repellers(Math.max(s.segmentLength, boundary.length / 20_000)).x.length, [boundary, s.segmentLength])
  // The lines as the worker last sent them; stats.revision changes with every frame.
  const strands = growth.live.current.strands
  // Each line's own colour, by where it starts, when Colours is Gradient.
  const start = startOf(design)
  const colors = useMemo(() => lineColors(s, start, strands.length), [s, start, strands.length])
  // How many paths the longest line exports as, past Illustrator's limit on points in a path.
  const splitInto = strands.reduce((most, t) => Math.max(most, Math.ceil(segmentCount(t.points.length / 2, t.closed) / MAX_PATH_SEGMENTS)), 1)

  // Keep a copy of the session a moment after the last change, while nothing is growing.
  const { current, running, unsaved: unsavedNow } = growth
  useEffect(() => {
    if (running) return
    const timer = window.setTimeout(() => {
      storage.set(SESSION_KEY, serializeProject(current()))
      storage.set(SESSION_UNSAVED_KEY, unsavedNow ? '1' : '0')
    }, 800)
    return () => window.clearTimeout(timer)
  }, [design, running, unsavedNow, current])

  // While lines grow, keep a copy every few seconds and whenever the page is hidden or closed, so a reload or a
  // closed tab mid-run loses a few seconds of growth at most. A copy made mid-run counts as unsaved.
  useEffect(() => {
    const keep = () => {
      storage.set(SESSION_KEY, serializeProject(current()))
      storage.set(SESSION_UNSAVED_KEY, unsavedNow || running ? '1' : '0')
    }
    const hidden = () => { if (document.visibilityState === 'hidden') keep() }
    window.addEventListener('pagehide', keep)
    document.addEventListener('visibilitychange', hidden)
    const timer = running ? window.setInterval(keep, 5000) : undefined
    return () => { window.removeEventListener('pagehide', keep); document.removeEventListener('visibilitychange', hidden); window.clearInterval(timer) }
  }, [running, unsavedNow, current])

  // Asks before discarding unsaved work, in an in-app dialog (embedded browsers can block confirm()).
  const guard = useCallback((when: boolean, p: Pending) => { if (when) setPending(p); else p.run() }, [])
  const { change: changeDesign, discards, unsaved } = growth

  // Changing the boundary shape or start shape grows from the start again, so unsaved growth is confirmed.
  const change = useCallback((patch: Partial<Settings>, key: string | null = null) => {
    guard(unsaved && discards(patch), {
      title: 'Start the lines again?', confirm: 'Start again',
      body: 'A new boundary shape or start shape grows from the start, replacing the lines grown so far. Undo brings them back.',
      run: () => changeDesign(patch, key),
    })
  }, [guard, unsaved, discards, changeDesign])

  const newDesign = () => guard(unsaved, {
    title: 'Start a new design?', confirm: 'Discard and start new',
    body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
    run: () => { void growth.replace(freshDesign({ ...DEFAULTS, seed: randomSeed() })); setStatus({ text: 'New design.' }) },
  })

  const openProject = () => guard(unsaved, {
    title: 'Open another project?', confirm: 'Discard and open',
    body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
    run: () => fileInput.current?.click(),
  })

  const readProject = async (file: File) => {
    try {
      const opened = parseProject(await file.text())
      await growth.replace(opened)
      growth.markSaved()
      setOpenError('')
      setStatus({ text: `Opened ${file.name}.` })
    } catch (error) {
      // The current design stays as it was.
      setOpenError(error instanceof ProjectError ? error.message : `${file.name} could not be read.`)
      setTab('file')
    }
  }

  // An SVG becomes the boundary and the lines to grow, by the Illustrator panel's Capture rule.
  const importGuard = (run: () => void) => guard(unsaved && stats.step > 0, {
    title: 'Replace the grown lines?', confirm: 'Import',
    body: 'An imported drawing starts the growth again with its own boundary and lines. Undo brings the current lines back.',
    run,
  })
  const importSvg = () => importGuard(() => svgInput.current?.click())

  const readSvg = async (file: File) => {
    try {
      const drawing = readSvgDrawing(await file.text())
      const k = fitPage(drawing.width, drawing.height)
      const scaled = (points: Vec[]): Vec[] => points.map(([x, y]) => [x * k, y * k])
      const page = { width: drawing.width * k, height: drawing.height * k }
      const found = captureDrawing({ ...drawing, paths: drawing.paths.map(p => ({ ...p, points: scaled(p.points) })) })
      const imported: Imported | null = found.boundary ? { name: file.name, sized: drawing.units, ...page, rings: found.boundary as Polygon[] } : null
      const inside = imported ? new Boundary(imported.rings) : null
      const capture = inside ? captureDrawing({ ...drawing, paths: drawing.paths.map(p => ({ ...p, points: scaled(p.points) })) }, (x, y) => inside.contains(x, y)) : found
      const cur = growth.current().settings
      const settings = sanitizeSettings({
        ...cur, ...page,
        shape: imported ? 'imported' : 'rect', margin: imported ? cur.margin : 0,
        start: capture.grow.length ? 'custom' : cur.start === 'custom' ? 'circle' : cur.start,
        units: drawing.units === 'illustrator' ? 'pt' : cur.units,
      })
      await growth.replace(freshDesign(settings, imported, capture.grow))
      setTab('shape')
      const lines = capture.grow.length
      const parts = [
        imported && drawing.fromClip ? `${file.name} is a picture, so the outline of its clipping mask is the boundary`
          : imported ? `Using ${file.name}: its largest closed path is the boundary` : `${file.name} has no closed path, so the lines grow inside the page`,
        lines ? `${lines} ${lines === 1 ? 'line' : 'lines'} to grow` : 'and a start shape grows, as it has no other paths',
      ]
      const notes = [
        capture.outside ? `${capture.outside} ${capture.outside === 1 ? 'line outside the boundary was' : 'lines outside the boundary were'} left out.` : '',
        k !== 1 ? `The drawing was scaled to ${Math.round(k * 100)} % to fit the sheet limits.` : '',
      ].filter(Boolean).join(' ')
      setStatus({ text: `${parts[0]}, ${parts[1]}.${notes ? ` ${notes}` : ''}`, warning: Boolean(notes) || drawing.fromClip })
    } catch (error) {
      setStatus({ text: error instanceof SvgShapeError ? error.message : `${file.name} could not be read as an SVG.`, warning: true })
    }
  }

  // Files dropped on the window: SVGs are imported, project files open.
  useEffect(() => {
    const over = (event: DragEvent) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault() }
    const drop = (event: DragEvent) => {
      const file = event.dataTransfer?.files[0]
      if (!file) return
      event.preventDefault()
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') importGuard(() => void readSvg(file))
      else if (/\.json$/i.test(file.name)) guard(unsaved, {
        title: 'Open another project?', confirm: 'Discard and open',
        body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
        run: () => void readProject(file),
      })
      else setStatus({ text: `${file.name} isn’t an SVG or a Line Growth project.`, warning: true })
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  })

  const report = (name: string, result: Awaited<ReturnType<typeof saveFile>>) => {
    if (result === 'saved' || result === 'downloaded') setStatus({ text: `${result === 'saved' ? 'Saved' : 'Downloaded'} ${name}.` })
    else if (result === 'failed') setStatus({ text: `${name} could not be saved.`, warning: true })
    return result === 'saved' || result === 'downloaded'
  }

  const busy = (growth.running || growth.stopping) && 'Pause the growth first, so the file has the finished lines.'

  const saveProject = async () => {
    if (busy) { setStatus({ text: busy }); return }
    const snapshot = growth.current()
    const name = `${baseName(s, design.imported)}${EXTENSION}`
    if (report(name, await saveFile(name, serializeProject(snapshot), 'application/json', 'Line Growth project'))) growth.markSaved()
  }

  const exportFile = async (kind: ExportKind) => {
    if (busy) return
    const d = growth.current()
    const base = baseName(s, d.imported)
    const lines = d.state.strands
    const own = lineColors(s, startOf(d), lines.length)
    if (kind === 'svg') report(`${base}.svg`, await saveFile(`${base}.svg`, growthSvg(lines, rings, s, own), 'image/svg+xml', 'SVG drawing'))
    if (kind === 'dxf') report(`${base}.dxf`, await saveFile(`${base}.dxf`, growthDxf(lines, rings, s), 'application/dxf', 'DXF drawing'))
    if (kind === 'png') {
      const [w, h] = pixelSize(s.width, s.height, s.dpi)
      const problem = pngProblem(w, h)
      if (problem) { setStatus({ text: problem, warning: true }); return }
      setStatus({ text: `Drawing a ${w.toLocaleString()} × ${h.toLocaleString()} px PNG…` })
      const blob = await renderPng(lines, rings, s, w, h, own)
      if (!blob) { setStatus({ text: 'The browser could not draw a PNG this large. Lower the pixels per inch.', warning: true }); return }
      report(`${base}.png`, await saveFile(`${base}.png`, blob, 'image/png', 'PNG image'))
    }
  }

  const noLines = stats.nodes === 0 && 'There are no lines to grow. Draw one, or choose a start shape on the Shape tab.'
  const resetBlocked = stats.step === 0 && !growth.running && 'The lines are already at the start.'
  const reset = () => guard(unsaved && stats.step > 0, {
    title: 'Reset to the start lines?', confirm: 'Reset',
    body: 'The grown lines go back to where they started. Undo brings them back.',
    run: () => { void growth.reset(); setStatus({ text: 'Back to the start lines.' }) },
  })
  // Growing clears old messages so the counts show; pausing says so briefly.
  const grow = () => { setStatus(null); growth.play() }
  const pause = () => { growth.pause(); setStatus({ text: 'Paused. Press Grow to carry on.' }) }
  const toggleGrow = () => { if (growth.running) pause(); else if (!noLines) grow() }
  const toggle = (key: ViewKey) => changeDesign({ [key]: !s[key] }, key)
  const shuffle = useCallback(() => changeDesign({ seed: randomSeed() }, 'seed'), [changeDesign])
  const closeQuickStart = () => { setShowQuickStart(false); storage.set(QUICK_START_KEY, '1') }

  // Keyboard shortcuts, ignored while typing. Re-registered each render so handlers see current state.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const typing = Boolean(target?.closest('input, select, textarea'))
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') { setShowHelp(false); setPending(null); if (!typing) setTool('draw'); return }
      if (pending || showHelp) return
      if (mod && key === 's') { event.preventDefault(); void saveProject(); return }
      if (mod && key === 'o') { event.preventDefault(); openProject(); return }
      if (typing) return
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) void growth.redo(); else void growth.undo(); return }
      if (mod && key === 'y') { event.preventDefault(); void growth.redo(); return }
      if (mod || event.altKey) return
      if (key === 's') { if (!growth.running && !noLines) growth.step() }
      else if (key === 'r') { if (!resetBlocked) reset() }
      else if (key === 'd') setTool('draw')
      else if (key === 'e') setTool('erase')
      else if (key === 'h') setTool('pan')
      else if (key === '1') toggle('showBoundary')
      else if (key === '2') toggle('showNodes')
      else if (key === 'f' || key === '0') stageRef.current?.fit()
      else if (key === '+' || key === '=') stageRef.current?.zoomBy(1.25)
      else if (key === '-' || key === '_') stageRef.current?.zoomBy(1 / 1.25)
      else if (event.key === '?') setShowHelp(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const counts = `${stats.nodes.toLocaleString()} nodes · ${stats.lines.toLocaleString()} ${stats.lines === 1 ? 'line' : 'lines'} · step ${stats.step.toLocaleString()}`
  // Many nodes held back from crossing on every step means the forces are out of balance, usually a repel
  // radius far larger than the segment length.
  const ratio = s.repelRadius / s.segmentLength
  // The advice names the repel radius only when it is the likely cause. Otherwise the lines are packed closer
  // than the forces suit, as in a detailed imported drawing: in Gil's Voronoi export, lowering Repulsion made it
  // worse, and a finer scale with more nodes fixed it.
  const strained = growth.running && stats.held > Math.max(40, stats.nodes * 0.02)
    && (ratio > 4
      ? `Lines are packed too tightly to move freely. The repel radius is ${ratio.toFixed(1)} segment lengths; keep it under about 5${s.autoTune ? '' : ', or turn on Auto tune'}.`
      : s.autoTune
        ? 'Lines are packed too tightly to move freely. Raise Max nodes: Auto tune then makes the lines finer, with room to move.'
        : 'Lines are packed too tightly to move freely. Make the segment length, repel radius and step size smaller together, and raise Max nodes.')
  const statusText = status?.text ?? (strained || (growth.stopping ? 'Stopping after the current step…'
    : growth.running ? `${stats.settling ? 'Settling at max nodes' : stats.filled ? (s.autoTune ? 'Filled the shape; raise Max nodes for finer lines' : 'Filled at this segment length, settling') : 'Growing'} · ${counts}` : counts))

  return <main className="studio">
    <TooltipLayer />
    <div className="stage">
      <Stage strands={strands} colors={colors} rings={rings} boundary={boundary} settings={s} tool={tool} frameRef={frameRef} controlRef={stageRef}
        onDraw={path => { growth.draw(path); setStatus(null) }} onErase={index => { growth.erase(index); setStatus({ text: 'Removed a line. Undo brings it back.' }) }}
        onZoom={setZoom} onNotice={text => setStatus({ text })} onSpaceTap={() => { if (!pending && !showHelp) toggleGrow() }} />
    </div>

    <header className="brand glass">
      <div><p className="app-kicker">Differential line growth</p><h1>Line Growth</h1></div>
      <button type="button" className="icon-button" aria-label="Keyboard shortcuts and help" data-tip="Keyboard shortcuts and the quick start." data-key="?" onClick={() => setShowHelp(true)}>?</button>
    </header>

    <aside className="sidebar side-panel glass" aria-label="Design controls">
      <Tabs label="Design controls" idBase="design" value={tab} onChange={setTab} tabs={[
        { id: 'grow', label: 'Grow', title: 'How the lines grow: node limit, speed and the forces between nodes.' },
        { id: 'shape', label: 'Shape', title: 'Sheet size, the boundary the lines grow inside, and the start lines.' },
        { id: 'style', label: 'Style', title: 'Line width, colours, and whether the boundary and nodes show.' },
        { id: 'file', label: 'File', title: 'Save or open a project, and export SVG, DXF or PNG.', badge: unsaved ? 'unsaved changes' : undefined },
      ]} />
      <TabPanel idBase="design" id="grow" value={tab}><GrowPanel s={s} change={change} onShuffle={shuffle} /></TabPanel>
      <TabPanel idBase="design" id="shape" value={tab}>
        <ShapePanel s={s} imported={design.imported} customCount={design.custom.length} change={change} onImport={importSvg} />
      </TabPanel>
      <TabPanel idBase="design" id="style" value={tab}><StylePanel s={s} change={change} /></TabPanel>
      <TabPanel idBase="design" id="file" value={tab}>
        <FilePanel s={s} change={change} splitInto={splitInto} unsaved={unsaved} busy={busy} openError={openError} fromFile={s.shape === 'imported' && Boolean(design.imported)}
          onNew={newDesign} onOpen={openProject} onSave={() => void saveProject()} onExport={kind => void exportFile(kind)} />
      </TabPanel>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Choose a project file" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readProject(file)
      }} />
      <input ref={svgInput} type="file" accept=".svg,image/svg+xml" hidden aria-label="Choose an SVG drawing" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readSvg(file)
      }} />
    </aside>

    <div className="center">
      <ViewBar tool={tool} setTool={setTool} s={s} toggle={toggle} zoom={zoom} onFit={() => stageRef.current?.fit()} onZoom={f => stageRef.current?.zoomBy(f)} />
      <div className="sheet-frame" ref={frameRef}>
        {showQuickStart && <QuickStart onClose={closeQuickStart} />}
      </div>
      <Dock running={growth.running} stopping={growth.stopping} canGrow={noLines}
        onGrow={grow} onPause={pause} onStep={() => { setStatus(null); growth.step() }} onReset={reset} canReset={resetBlocked}
        status={statusText} warning={Boolean(status ? status.warning : strained)}
        canUndo={growth.canUndo} canRedo={growth.canRedo} onUndo={() => void growth.undo()} onRedo={() => void growth.redo()} />
    </div>

    <aside className="inspector side-panel glass" aria-label="Measurements">
      <Inspector s={s} stats={stats} boundaryLength={boundary.length} boundaryPoints={boundaryPoints} />
    </aside>

    {pending && <ConfirmDialog pending={pending} onCancel={() => setPending(null)} />}
    {showHelp && <HelpDialog onClose={() => setShowHelp(false)} onQuickStart={() => { setShowHelp(false); setShowQuickStart(true) }} />}
  </main>
}
