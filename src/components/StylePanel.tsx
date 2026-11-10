import { memo } from 'react'
import { gradientCss } from '../lib/colors'
import { LIMITS, type ColorMode, type GradientName, type Settings } from '../lib/settings'
import { ColorField, LengthField, RangeField, Section, Segmented, SwitchField, type Option } from './Controls'
import type { Change } from './GrowPanel'

const MODES: Option<ColorMode>[] = [
  { value: 'one', label: 'One colour', tip: 'Every line in the line colour, and every fill in the fill colour.' },
  { value: 'gradient', label: 'Gradient', tip: 'Each line in its own colour from a gradient, by where it starts, as a rainbow of Voronoi cells. Its fill and nodes take the same colour.' },
]
const GRADIENT_NAMES: { value: GradientName; label: string }[] = [
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'viridis', label: 'Viridis' },
  { value: 'custom', label: 'Your two colours' },
]

// Memoised: the panel only re-renders when its own props change, not on every growth frame.
export const StylePanel = memo(function StylePanel({ s, change }: { s: Settings; change: Change }) {
  const gradient = s.colors === 'gradient'
  return <>
    <Section title="Lines">
      <LengthField label="Line width" mm={s.lineWidth} min={LIMITS.lineWidth[0]} max={LIMITS.lineWidth[1]} units={s.units} dpi={s.dpi} small
        tip="Stroke width of the lines in the preview, SVG and PNG. Auto tune sets it to suit the segment length." onChange={lineWidth => change({ lineWidth }, 'lineWidth')} />
      <Segmented label="Colours" options={MODES} value={s.colors} onChange={colors => change({ colors }, 'colors')} />
      {!gradient && <ColorField label="Line colour" value={s.lineColor} tip="Colour of the lines and nodes." onChange={lineColor => change({ lineColor }, 'lineColor')} />}
      {gradient && <>
        <label className="field" data-tip="The colours the lines are given, from the first line to the last along the direction.">
          <span className="field-label"><span>Gradient</span></span>
          <select value={s.gradient} onChange={event => change({ gradient: event.currentTarget.value as GradientName }, 'gradient')}>
            {GRADIENT_NAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <span className="gradient-swatch" style={{ background: gradientCss(s) }} aria-hidden="true" />
        </label>
        {s.gradient === 'custom' && <>
          <ColorField label="From" value={s.gradientFrom} tip="Colour of the first line along the direction." onChange={gradientFrom => change({ gradientFrom }, 'gradientFrom')} />
          <ColorField label="To" value={s.gradientTo} tip="Colour of the last line along the direction." onChange={gradientTo => change({ gradientTo }, 'gradientTo')} />
        </>}
        <RangeField label="Direction" value={s.gradientAngle} min={LIMITS.gradientAngle[0]} max={LIMITS.gradientAngle[1]} step={1} digits={0} suffix="°"
          tip="Which way the gradient runs across the lines: 0° left to right, 90° top to bottom, 180° right to left, 270° bottom to top."
          onChange={gradientAngle => change({ gradientAngle: Math.round(gradientAngle) }, 'gradientAngle')} />
        <p className="hint">Each line takes the colour at the middle of where it started, so it keeps its colour as it grows.</p>
      </>}
      <SwitchField label="Fill" checked={s.fill} tip={gradient
        ? 'Fill the inside of each closed line in its own colour, so each cell is one solid colour. Open lines have no inside, so they stay lines. SVG exports the fill as its own group under the lines; PNG includes it; DXF holds the lines only.'
        : 'Fill the inside of each closed line, for a two-tone pattern. Open lines have no inside, so they stay lines. SVG exports the fill as its own group under the lines; PNG includes it; DXF holds the lines only.'}
        onChange={fill => change({ fill }, 'fill')} />
      {s.fill && !gradient && <ColorField label="Fill colour" value={s.fillColor} tip="Colour of the inside of closed lines." onChange={fillColor => change({ fillColor }, 'fillColor')} />}
      <ColorField label="Background" value={s.background} tip="Sheet colour in the preview and PNG. SVG and DXF files have no background." onChange={background => change({ background }, 'background')} />
    </Section>
    <Section title="Show">
      <SwitchField label="Boundary" checked={s.showBoundary} tip="Show the boundary as a mint guide. Exports include it, drawn solid, when it’s shown."
        onChange={showBoundary => change({ showBoundary }, 'showBoundary')} />
      <SwitchField label="Nodes" checked={s.showNodes} tip="Show the nodes the lines are made of. Exports include them when they’re shown."
        onChange={showNodes => change({ showNodes }, 'showNodes')} />
      <p className="hint">These match the Boundary and Nodes buttons above the sheet. Exports hold what the view shows.</p>
    </Section>
  </>
})
