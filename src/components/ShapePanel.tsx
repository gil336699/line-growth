import { memo } from 'react'
import type { CellPosition } from '../growth/cells'
import type { StartShape } from '../growth/seeds'
import type { Imported } from '../lib/design'
import { matchPreset, presetSize, SHEET_PRESETS } from '../lib/presets'
import { LIMITS, marginMax, type BoundaryShape, type Settings } from '../lib/settings'
import { formatLength, pixelSize, type Units } from '../lib/units'
import { AnchorField, Button, LengthField, NumberField, RangeField, Section, Segmented, type Option } from './Controls'
import type { Change } from './GrowPanel'
import { Icon } from './Icon'

const UNITS: Option<Units>[] = [
  { value: 'mm', label: 'mm', tip: 'Show lengths in millimetres.' },
  { value: 'in', label: 'in', tip: 'Show lengths in inches. SVG and DXF files are written in inches too.' },
  { value: 'pt', label: 'pt', tip: 'Show lengths in points (72 per inch), as Illustrator does. SVG files are sized in points.' },
  { value: 'px', label: 'px', tip: 'Show lengths in pixels at the pixels per inch below, for screen graphics.' },
]
const shapes = (imported: boolean): Option<BoundaryShape>[] => [
  { value: 'rect', label: 'Rectangle', tip: 'Grow inside the sheet, inset by the margin.' },
  { value: 'ellipse', label: 'Ellipse', tip: 'Grow inside the circle or oval that fits the sheet, inset by the margin.' },
  { value: 'imported', label: 'Imported', tip: 'Grow inside the closed shape you imported from an SVG, holes and all.', unavailable: !imported && 'Import an SVG first, with the button below.' },
]
const STARTS: Option<StartShape>[] = [
  { value: 'circle', label: 'Circle', tip: 'Start from a small circle in the roomiest part of the boundary.' },
  { value: 'line', label: 'Line', tip: 'Start from a short straight line across the middle.' },
  { value: 'circles', label: 'Circles', tip: 'Start from several small circles scattered at random. The seed places them.' },
  { value: 'cells', label: 'Cells', tip: 'Start from Voronoi cells that fill the boundary, holes and all, each a closed line that grows into its own piece. The seed places them.' },
  { value: 'outline', label: 'Outline', tip: 'Start from a copy of the boundary, set in from the edge, which grows inward.' },
  { value: 'custom', label: 'Drawn', tip: 'The lines you drew with the Draw tool or imported from an SVG.' },
]
// Where a smaller area of cells sits, and so which way they burst out of it.
const POSITIONS: Option<CellPosition>[] = ([
  ['top-left', 'Top left', 'in the top-left corner', 'down and to the right'],
  ['top', 'Top', 'along the top', 'down and to both sides'],
  ['top-right', 'Top right', 'in the top-right corner', 'down and to the left'],
  ['left', 'Left', 'along the left side', 'to the right, up and down'],
  ['center', 'Middle', 'in the middle', 'on every side'],
  ['right', 'Right', 'along the right side', 'to the left, up and down'],
  ['bottom-left', 'Bottom left', 'in the bottom-left corner', 'up and to the right'],
  ['bottom', 'Bottom', 'along the bottom', 'up and to both sides'],
  ['bottom-right', 'Bottom right', 'in the bottom-right corner', 'up and to the left'],
] as const).map(([value, label, where, toward]) => ({ value, label, tip: `${label}: the cells start ${where} of the boundary and burst out ${toward}.` }))

const ASSUMED = {
  css: 'The file doesn’t say how big it is, so it was read at 96 units per inch, the web standard. Check the width and height.',
  illustrator: 'The file doesn’t say how big it is. It looks like it came from Illustrator, so it was read at 72 points per inch, as Illustrator writes it.',
}

export const ShapePanel = memo(function ShapePanel({ s, imported, customCount, change, onImport }: {
  s: Settings; imported: Imported | null; customCount: number; change: Change; onImport: () => void
}) {
  const preset = matchPreset(s.width, s.height, s.shape, s.units, s.dpi)
  const [pw, ph] = pixelSize(s.width, s.height, s.dpi)
  const aspect = s.shape === 'imported' && imported ? imported.width / imported.height : null
  const rings = imported?.rings.length ?? 0
  const sizeLabel = s.start === 'outline' ? 'Inset' : 'Size'
  return <>
    <Section title="Sheet">
      <label className="field" data-tip="Common sizes. Choosing one sets the size, units and boundary shape.">
        <span className="field-label"><span>Preset</span></span>
        <select value={preset} onChange={event => {
          const p = SHEET_PRESETS.find(item => item.id === event.currentTarget.value)
          if (!p) return
          const [width, height] = presetSize(p, s.dpi)
          change({ width, height, units: p.units, shape: p.shape }, 'preset')
        }}>
          <option value="custom">Custom…</option>
          {SHEET_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <Segmented label="Units" options={UNITS} value={s.units} onChange={units => change({ units }, 'units')} />
      <div className="pair">
        <LengthField label="Width" mm={s.width} min={LIMITS.width[0]} max={LIMITS.width[1]} units={s.units} dpi={s.dpi} compact
          tip={aspect ? 'Sheet width. The height follows, so the imported drawing keeps its proportions, and everything scales with it.' : 'Sheet width. Grown lines stretch with the sheet.'}
          onChange={width => change(aspect ? { width, height: width / aspect } : { width }, 'width')} />
        <Button className="icon-button swap" label="Swap width and height" tip="Swap width and height, to turn the sheet on its side."
          unavailable={Boolean(aspect) && 'Swapping would stretch the imported drawing. Rotate it in your drawing app instead.'}
          onClick={() => change({ width: s.height, height: s.width }, 'swap')}><Icon name="swap" /></Button>
        <LengthField label="Height" mm={s.height} min={LIMITS.height[0]} max={LIMITS.height[1]} units={s.units} dpi={s.dpi} compact
          tip={aspect ? 'Sheet height. The width follows, keeping the imported drawing’s proportions.' : 'Sheet height.'}
          onChange={height => change(aspect ? { height, width: height * aspect } : { height }, 'height')} />
      </div>
      <NumberField label="Pixels per inch" value={s.dpi} min={LIMITS.dpi[0]} max={LIMITS.dpi[1]} suffix="ppi"
        tip="Resolution for pixel sizes and PNG export. 300 suits print; 72–144 suits screens." onChange={dpi => change({ dpi: Math.round(dpi) }, 'dpi')} />
      <p className="hint">PNG: {pw.toLocaleString()} × {ph.toLocaleString()} px at {s.dpi} pixels per inch.</p>
    </Section>

    <Section title="Boundary" tip="The closed shape the lines grow inside. They never cross it, and they keep out of its holes.">
      <Segmented label="Shape" options={shapes(Boolean(imported))} value={s.shape} onChange={shape => {
        // Back to the imported drawing at the current width, with the height that keeps it from stretching.
        if (shape === 'imported' && imported) change({ shape, height: s.width * (imported.height / imported.width) }, 'shape')
        else change({ shape }, 'shape')
      }} />
      {s.shape !== 'imported' && <LengthField label="Margin" mm={Math.min(s.margin, marginMax(s))} min={0} max={marginMax(s)} units={s.units} dpi={s.dpi} small
        tip="Gap between the sheet edge and the boundary." onChange={margin => change({ margin }, 'margin')} />}
      <Button className="wide" tip="Open an SVG from Illustrator, Inkscape or Figma. Its largest closed path becomes the boundary, shapes cut into it become holes, and every other path grows. You can also drop an SVG on the window."
        onClick={onImport}><Icon name="import" />Import SVG…</Button>
      {imported && <p className="hint">
        <b>{imported.name}</b>: {formatLength(imported.width, s.units, s.dpi)} × {formatLength(imported.height, s.units, s.dpi)} page,
        boundary of {rings} {rings === 1 ? 'outline' : 'outlines'}.{s.shape === 'imported' ? '' : ' Choose Imported to use it.'}
      </p>}
      {/* Illustrator files are read the way Illustrator writes them, so that's a note; a guessed web size is worth a check. */}
      {imported && s.shape === 'imported' && imported.sized === 'illustrator' && <p className="hint">{ASSUMED.illustrator}</p>}
      {imported && s.shape === 'imported' && imported.sized === 'css' && <div className="notice" role="status"><p>{ASSUMED.css}</p></div>}
    </Section>

    <Section title="Start" tip="The lines growth begins from. Reset goes back to them.">
      <Segmented label="Start from" columns={3} options={STARTS.map(o => o.value === 'custom' && !customCount ? { ...o, unavailable: 'Draw a line with the Draw tool, or import an SVG with lines to grow.' } : o)}
        value={s.start} onChange={start => change({ start }, 'start')} />
      {s.start !== 'custom' && s.start !== 'cells' && <RangeField label={sizeLabel} value={s.startSize} min={LIMITS.startSize[0]} max={s.start === 'outline' ? 95 : LIMITS.startSize[1]} step={1} digits={0} suffix="%"
        tip={s.start === 'outline' ? 'How far in from the edge the outline starts, as a share of half the boundary’s smaller side.' : 'How big the start shape is, as a share of the boundary’s smaller side.'}
        onChange={startSize => change({ startSize: Math.round(startSize) }, 'startSize')} />}
      {s.start === 'circles' && <RangeField label="Count" value={s.startCount} min={LIMITS.startCount[0]} max={LIMITS.startCount[1]} step={1} digits={0}
        tip="How many circles to start from. Fewer fit when they’re large." onChange={startCount => change({ startCount: Math.round(startCount) }, 'startCount')} />}
      {s.start === 'cells' && <>
        <RangeField label="Count" value={s.cellCount} min={LIMITS.cellCount[0]} max={LIMITS.cellCount[1]} step={1} digits={0}
          tip="How many cells to start from. Auto tune makes the lines finer for smaller cells, with more nodes." onChange={cellCount => change({ cellCount: Math.round(cellCount) }, 'cellCount')} />
        <RangeField label="Size" value={s.cellSize} min={LIMITS.cellSize[0]} max={LIMITS.cellSize[1]} step={1} digits={0} suffix="%"
          tip="How much of the boundary the cells fill. At 100 % they fill it to the edge; below, they fill a smaller copy of it, placed by Position, and can burst out of it, up to the boundary."
          onChange={cellSize => change({ cellSize: Math.round(cellSize) }, 'cellSize')} />
        <AnchorField label="Position" options={POSITIONS} value={s.cellPosition}
          tip="Where the cells start when they fill less than the whole boundary. Against a side or corner, they burst out only the other way."
          unavailable={s.cellSize >= 100 && 'At 100 % the cells fill the whole boundary. Lower Size to place them.'}
          onChange={cellPosition => change({ cellPosition }, 'cellPosition')} />
        <RangeField label="Gap" value={s.cellGap} min={LIMITS.cellGap[0]} max={LIMITS.cellGap[1]} step={1} digits={0} suffix="%"
          tip="How far apart neighbouring cells start, as a share of a cell’s width, so they have room to fold into each other."
          onChange={cellGap => change({ cellGap: Math.round(cellGap) }, 'cellGap')} />
        {s.colors === 'one' && <Button className="wide" tip="Fill each cell in its own colour, from a rainbow left to right. Change the gradient on the Style tab."
          onClick={() => change({ colors: 'gradient', fill: true }, 'colors')}><Icon name="cells" />Colour the cells</Button>}
      </>}
      <p className="hint">{s.start === 'custom' ? `${customCount} drawn or imported ${customCount === 1 ? 'line' : 'lines'}. ` : ''}Draw more with the Draw tool, even while the lines grow.</p>
    </Section>
  </>
})
