import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Boundary } from '../growth/boundary'
import type { Strand } from '../growth/engine'
import type { Polygon, Vec } from '../growth/geometry'
import { clearance, type Path } from '../growth/seeds'
import { crossesLines, crossesStroke, distanceToLines } from '../lib/drawing'
import { drawGrowth } from '../lib/render'
import type { Settings } from '../lib/settings'

export type Tool = 'draw' | 'erase' | 'pan'
export type StageControls = { fit: () => void; zoomBy: (factor: number) => void }

type View = { zoom: number; panX: number; panY: number }
type Drag =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  // blocked: the stroke reached another line, or itself, and stops there.
  | { kind: 'draw'; points: Vec[]; travel: number; lastX: number; lastY: number; blocked: boolean }
  | { kind: 'pinch'; distance: number; view: View; worldX: number; worldY: number }

const ZOOM_MIN = 0.25, ZOOM_MAX = 60
const STOPPED = 'Lines can’t cross, so the line stops where it meets one.'
const FIT_PADDING = 20

// The nearest line to a point, within `reach` millimetres.
function nearestLine(strands: Strand[], x: number, y: number, reach: number): number {
  let best = reach * reach, index = -1
  strands.forEach((s, i) => {
    const p = s.points
    const n = p.length / 2
    for (let k = 0; k < n; k++) {
      const j = k + 1 < n ? k + 1 : s.closed ? 0 : k
      const ax = p[k * 2], ay = p[k * 2 + 1], ex = p[j * 2] - ax, ey = p[j * 2 + 1] - ay
      const len2 = ex * ex + ey * ey
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0
      const d = (ax + ex * t - x) ** 2 + (ay + ey * t - y) ** 2
      if (d < best) { best = d; index = i }
    }
  })
  return index
}

// The sheet preview. It fills the window behind the panels and fits the sheet into the free area between
// them (the frame). Drag to draw a line, click a line to erase it with the Erase tool, Space-drag or the Pan
// tool to pan, wheel or pinch to zoom. A tap of Space grows or pauses.
export function Stage({ strands, colors, rings, boundary, settings, tool, frameRef, controlRef, onDraw, onErase, onZoom, onNotice, onSpaceTap }: {
  strands: Strand[]
  colors: string[] | null
  rings: Polygon[]
  boundary: Boundary
  settings: Settings
  tool: Tool
  frameRef: RefObject<HTMLDivElement | null>
  controlRef: RefObject<StageControls | null>
  onDraw: (path: Path) => void
  onErase: (index: number) => void
  onZoom: (zoom: number) => void
  onNotice: (text: string) => void
  onSpaceTap: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0, frame: { x: 0, y: 0, width: 0, height: 0 } })
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 })
  const [hover, setHover] = useState<number | null>(null)
  const [draft, setDraft] = useState<Vec[] | null>(null)
  const [cursor, setCursor] = useState('crosshair')
  const drag = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const space = useRef({ down: false, panned: false })
  const live = useRef(strands)
  useEffect(() => { live.current = strands }, [strands])
  const toolCursor = tool === 'pan' ? 'grab' : tool === 'erase' ? 'default' : 'crosshair'

  // Track the window and the free frame between panels.
  useLayoutEffect(() => {
    const measure = () => {
      const outer = box.current?.getBoundingClientRect()
      const inner = frameRef.current?.getBoundingClientRect()
      if (!outer) return
      const frame = inner && inner.width > 40 && inner.height > 40
        ? { x: inner.left - outer.left, y: inner.top - outer.top, width: inner.width, height: inner.height }
        : { x: 0, y: 0, width: outer.width, height: outer.height }
      setSize({ width: outer.width, height: outer.height, frame })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (box.current) observer.observe(box.current)
    if (frameRef.current) observer.observe(frameRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [frameRef])

  const fitScale = Math.max(1e-6, Math.min((size.frame.width - FIT_PADDING * 2) / settings.width, (size.frame.height - FIT_PADDING * 2) / settings.height))
  const centerX = size.frame.x + size.frame.width / 2, centerY = size.frame.y + size.frame.height / 2
  const originX = useCallback((s: number, pan: number) => centerX - (settings.width / 2) * s + pan, [centerX, settings.width])
  const originY = useCallback((s: number, pan: number) => centerY - (settings.height / 2) * s + pan, [centerY, settings.height])
  const scale = fitScale * view.zoom
  const ox = originX(scale, view.panX), oy = originY(scale, view.panY)

  useEffect(() => onZoom(view.zoom), [view.zoom, onZoom])

  // Draw whenever anything visible changes, before the browser paints.
  useLayoutEffect(() => {
    const el = canvas.current
    if (!el || !size.width) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(size.width * dpr), h = Math.round(size.height * dpr)
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h }
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    drawGrowth(ctx, strands, rings, settings, { scale, ox, oy, dpr, preview: true, hover, draft, colors })
    // Read-only view state for QA scripts in development builds.
    if (import.meta.env.DEV) (window as unknown as { __stage: unknown }).__stage = { scale, ox, oy, rect: box.current?.getBoundingClientRect() }
  }, [strands, colors, rings, settings, scale, ox, oy, size, hover, draft])

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect()
    return [(clientX - r.left - ox) / scale, (clientY - r.top - oy) / scale] as const
  }, [ox, oy, scale])

  const zoomAround = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const cx = clientX === undefined ? centerX : clientX - r.left
    const cy = clientY === undefined ? centerY : clientY - r.top
    setView(v => {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor))
      const s0 = fitScale * v.zoom, s1 = fitScale * zoom
      const wx = (cx - originX(s0, v.panX)) / s0, wy = (cy - originY(s0, v.panY)) / s0
      return { zoom, panX: cx - wx * s1 - originX(s1, 0), panY: cy - wy * s1 - originY(s1, 0) }
    })
  }, [fitScale, centerX, centerY, originX, originY])

  useEffect(() => {
    controlRef.current = { fit: () => setView({ zoom: 1, panX: 0, panY: 0 }), zoomBy: factor => zoomAround(factor) }
  }, [controlRef, zoomAround])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomAround(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX, event.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  // Space held while dragging pans; a tap of Space on its own grows or pauses.
  const tapRef = useRef(onSpaceTap)
  useEffect(() => { tapRef.current = onSpaceTap }, [onSpaceTap])
  useEffect(() => {
    const ignored = (event: KeyboardEvent) => event.target instanceof Element && Boolean(event.target.closest('input, select, textarea, button, [role=dialog], [role=alertdialog]'))
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || ignored(event)) return
      event.preventDefault()
      if (event.repeat || space.current.down) return
      space.current = { down: true, panned: false }
      setCursor('grab')
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !space.current.down) return
      const tapped = !space.current.panned
      space.current = { down: false, panned: false }
      setCursor(toolCursor)
      if (tapped) tapRef.current()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [toolCursor])
  useEffect(() => { if (!space.current.down) setCursor(toolCursor) }, [toolCursor])

  const inside = (x: number, y: number): Vec => (boundary.empty || boundary.contains(x, y) ? [x, y] : boundary.closest(x, y))

  // A finished stroke: a click adds a small circle, a stroke that ends where it began is closed. Neither
  // crosses a line already there.
  const finishDraw = (d: Extract<Drag, { kind: 'draw' }>) => {
    const px = 1 / scale
    if (d.travel < 4 * px) {
      const [x, y] = d.points[0]
      if (!boundary.empty && !boundary.contains(x, y)) { onNotice('Draw inside the boundary.'); return }
      const room = Math.min(boundary.empty ? Infinity : clearance(boundary, x, y), distanceToLines(live.current, x, y)) * 0.9
      const r = Math.min(Math.max(settings.repelRadius * 1.2, 8 * px), room)
      if (!(r >= settings.segmentLength)) { onNotice('There’s no room for a circle there. Click between the lines.'); return }
      onDraw({ closed: true, points: Array.from({ length: 32 }, (_, i): Vec => [x + r * Math.cos((i / 32) * Math.PI * 2), y + r * Math.sin((i / 32) * Math.PI * 2)]) })
      return
    }
    const points = d.points
    if (points.length < 2) return
    const first = points[0], last = points[points.length - 1]
    const near = Math.max(14 * px, settings.segmentLength * 2)
    let closed = Math.hypot(first[0] - last[0], first[1] - last[1]) <= near && d.travel > near * 4
    // A closed stroke drops its last points where they double back over the start. One whose closing edge
    // would cross a line stays open.
    let trimmed = points
    if (closed) {
      while (trimmed.length > 3 && Math.hypot(trimmed[trimmed.length - 1][0] - first[0], trimmed[trimmed.length - 1][1] - first[1]) < near / 2) trimmed = trimmed.slice(0, -1)
      const end = trimmed[trimmed.length - 1]
      if (crossesLines(live.current, end, first) || crossesStroke(trimmed, end, first, true)) { closed = false; trimmed = points }
    }
    onDraw({ closed, points: trimmed })
    if (d.blocked) onNotice(STOPPED)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* the pointer already ended */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    setHover(null)
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom and drag to pan. A stroke one finger started is dropped.
      const [a, b] = [...pointers.current.values()]
      const [wx, wy] = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2)
      drag.current = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), view, worldX: wx, worldY: wy }
      setDraft(null)
      return
    }
    if (pointers.current.size > 2) return
    const panning = tool === 'pan' || space.current.down || event.button === 1
    if (panning) {
      if (space.current.down) space.current.panned = true
      drag.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, panX: view.panX, panY: view.panY }
      setCursor('grabbing')
      return
    }
    if (event.button !== 0) return
    const [x, y] = toWorld(event.clientX, event.clientY)
    if (tool === 'erase') {
      const index = nearestLine(live.current, x, y, (event.pointerType === 'touch' ? 22 : 10) / scale)
      if (index >= 0) onErase(index)
      return
    }
    const p = inside(x, y)
    drag.current = { kind: 'draw', points: [p], travel: 0, lastX: x, lastY: y, blocked: false }
    setDraft([p])
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const d = drag.current
    if (d?.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, d.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, d.distance))))
      const r = box.current!.getBoundingClientRect()
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
      const s1 = fitScale * zoom
      setView({ zoom, panX: mx - d.worldX * s1 - originX(s1, 0), panY: my - d.worldY * s1 - originY(s1, 0) })
      return
    }
    if (d?.kind === 'pan') { setView(v => ({ ...v, panX: d.panX + event.clientX - d.startX, panY: d.panY + event.clientY - d.startY })); return }
    const [x, y] = toWorld(event.clientX, event.clientY)
    if (d?.kind === 'draw') {
      const step = Math.hypot(x - d.lastX, y - d.lastY)
      if (d.blocked || step < 1.5 / scale) return
      const a = d.points[d.points.length - 1], b = inside(x, y)
      if (crossesLines(live.current, a, b) || crossesStroke(d.points, a, b)) {
        d.blocked = true
        onNotice(STOPPED)
        return
      }
      d.travel += step; d.lastX = x; d.lastY = y
      d.points.push(b)
      setDraft([...d.points])
      return
    }
    if (event.pointerType === 'touch' || tool !== 'erase' || space.current.down) { if (hover !== null) setHover(null); return }
    const index = nearestLine(live.current, x, y, 10 / scale)
    setHover(index >= 0 ? index : null)
    setCursor(index >= 0 ? 'pointer' : 'default')
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId)
    const d = drag.current
    if (d?.kind === 'pinch' && pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      drag.current = { kind: 'pan', startX: p.x, startY: p.y, panX: view.panX, panY: view.panY }
      return
    }
    if (pointers.current.size === 0) {
      drag.current = null
      setDraft(null)
      setCursor(space.current.down ? 'grab' : toolCursor)
      if (d?.kind === 'draw' && event.type === 'pointerup') finishDraw(d)
    }
  }

  return <div ref={box} className="stage-canvas">
    <canvas ref={canvas} style={{ cursor }} aria-label="Sheet preview. Drag to draw a line to grow; with the Erase tool, click a line to remove it."
      role="img" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onPointerLeave={() => { if (!drag.current) setHover(null) }} onContextMenu={event => event.preventDefault()} />
  </div>
}
