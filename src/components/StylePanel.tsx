import { memo } from 'react'
import { LIMITS, type Settings } from '../lib/settings'
import { ColorField, LengthField, Section, SwitchField } from './Controls'
import type { Change } from './GrowPanel'

// Memoised: the panel only re-renders when its own props change, not on every growth frame.
export const StylePanel = memo(function StylePanel({ s, change }: { s: Settings; change: Change }) {
  return <>
    <Section title="Lines">
      <LengthField label="Line width" mm={s.lineWidth} min={LIMITS.lineWidth[0]} max={LIMITS.lineWidth[1]} units={s.units} dpi={s.dpi} small
        tip="Stroke width of the lines in the preview, SVG and PNG. Auto tune sets it to suit the segment length." onChange={lineWidth => change({ lineWidth }, 'lineWidth')} />
      <ColorField label="Line colour" value={s.lineColor} tip="Colour of the lines and nodes." onChange={lineColor => change({ lineColor }, 'lineColor')} />
      <SwitchField label="Fill" checked={s.fill} tip="Fill the inside of each closed line, for a two-tone pattern. Open lines have no inside, so they stay lines. SVG exports the fill as its own group under the lines; PNG includes it; DXF holds the lines only."
        onChange={fill => change({ fill }, 'fill')} />
      {s.fill && <ColorField label="Fill colour" value={s.fillColor} tip="Colour of the inside of closed lines." onChange={fillColor => change({ fillColor }, 'fillColor')} />}
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
