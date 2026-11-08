import { memo } from 'react'
import { LIMITS, scaledRange, type Settings } from '../lib/settings'
import { decimals, mmPerUnit, UNIT_LABEL } from '../lib/units'
import { Button, NumberField, RangeField, Section, SwitchField } from './Controls'
import { Icon } from './Icon'

export type Change = (patch: Partial<Settings>, key?: string | null) => void

// Lengths that scale with the sheet, shown in the sheet's unit with enough decimals for their range.
function LengthRange({ s, k, label, tip, change }: { s: Settings; k: 'segmentLength' | 'repelRadius' | 'stepSize'; label: string; tip: string; change: Change }) {
  const [min, max] = scaledRange(k, s)
  const scale = 1 / mmPerUnit(s.units, s.dpi)
  // Enough decimals to show the smallest value in the range, from whole pixels to thousandths of an inch.
  const digits = Math.min(5, Math.max(decimals(s.units, true), Math.ceil(-Math.log10(Math.max(1e-9, min * scale))) + 1))
  return <RangeField label={label} value={s[k]} min={min} max={max} step={(max - min) / 1000} digits={digits} scale={scale} suffix={UNIT_LABEL[s.units]}
    tip={tip} onChange={value => change({ [k]: value }, k)} />
}

// Memoised: the panel only re-renders when its own props change, not on every growth frame.
export const GrowPanel = memo(function GrowPanel({ s, change, onShuffle }: { s: Settings; change: Change; onShuffle: () => void }) {
  return <>
    <Section title="Growth">
      <SwitchField label="Auto tune" checked={s.autoTune}
        tip="Choose growth settings to suit the boundary and start shape, now and whenever either changes, as the Illustrator panel did on Capture. Turn off to keep your own."
        onChange={autoTune => change({ autoTune }, 'autoTune')} />
      <RangeField label="Max nodes" value={s.maxNodes} min={LIMITS.maxNodes[0]} max={LIMITS.maxNodes[1]} step={1} digits={0} log
        tip="Most points the lines can have. At the limit the lines keep settling. Lines also stop adding nodes when they fill the boundary; a smaller segment length makes room for more."
        onChange={maxNodes => change({ maxNodes: Math.round(maxNodes) }, 'maxNodes')} />
      <RangeField label="Speed" value={s.stepsPerFrame} min={LIMITS.stepsPerFrame[0]} max={LIMITS.stepsPerFrame[1]} step={1} digits={0} suffix="/ frame"
        tip="Growth steps per screen update. Higher grows faster but looks less smooth."
        onChange={stepsPerFrame => change({ stepsPerFrame: Math.round(stepsPerFrame) }, 'stepsPerFrame')} />
    </Section>

    <Section title="Forces" tip="The rules every node follows on each step. They can change while the lines grow.">
      <LengthRange s={s} k="segmentLength" label="Segment length" change={change}
        tip="The ideal distance between neighbouring nodes, and the spacing of the fixed points along the boundary. Smaller grows finer, denser lines." />
      <LengthRange s={s} k="repelRadius" label="Repel radius" change={change}
        tip="How far each node pushes other nodes, and the boundary pushes nodes, away. Larger keeps lines farther apart and farther from the edge." />
      <RangeField label="Repulsion" value={s.repulsion} min={LIMITS.repulsion[0]} max={LIMITS.repulsion[1]} step={0.01} digits={2}
        tip="How hard nearby nodes push apart, and the boundary pushes back (twice as hard). More spreads the lines and keeps them off the edge."
        onChange={repulsion => change({ repulsion }, 'repulsion')} />
      <RangeField label="Attraction" value={s.attraction} min={LIMITS.attraction[0]} max={LIMITS.attraction[1]} step={0.01} digits={2}
        tip="How strongly neighbouring nodes pull toward the segment length. More keeps a line tighter and more elastic."
        onChange={attraction => change({ attraction }, 'attraction')} />
      <RangeField label="Alignment" value={s.alignment} min={LIMITS.alignment[0]} max={LIMITS.alignment[1]} step={0.01} digits={2}
        tip="How much each node moves toward the middle of its two neighbours. More gives smoother, less jagged curves."
        onChange={alignment => change({ alignment }, 'alignment')} />
      <LengthRange s={s} k="stepSize" label="Step size" change={change}
        tip="How far nodes move on each step. Larger changes faster but can become unstable." />
      <RangeField label="Randomness" value={s.randomness * 100} min={0} max={100} step={1} digits={0} suffix="%"
        tip="How far each new node is nudged sideways, so even shapes break into organic folds. At 0 % growth follows the Illustrator panel’s rules."
        onChange={value => change({ randomness: value / 100 }, 'randomness')} />
      <div className="seed-row">
        <NumberField label="Seed" value={s.seed} min={LIMITS.seed[0]} max={LIMITS.seed[1]}
          tip="The same seed and settings always grow the same lines."
          onChange={seed => change({ seed: Math.round(seed) }, 'seed')} />
        <Button className="icon-button" label="Shuffle seed" tip="Pick a new random seed. Lines already grown stay; new growth follows the new seed." onClick={onShuffle}><Icon name="dice" /></Button>
      </div>
      <p className="hint">Repulsion spreads the lines, attraction and alignment keep them smooth, and long edges split into new nodes until Max nodes. Try one change at a time while it grows.</p>
    </Section>
  </>
})
