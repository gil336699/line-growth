// Starting values that suit a shape's size, from the Illustrator panel's Auto tune. The panel scaled captured
// art so its larger side was 1,200 units and tuned in those units; this does the same and converts back, so a
// 50 mm tile and a 2 m mural start with the same look.
import type { Box } from './geometry'

export const SIM_SPAN = 1200
// The panel's slider ranges, in its 1,200-unit space. Lengths scale with the sheet.
export const SIM_RANGE = {
  segmentLength: [0.3, 40], repelRadius: [0.6, 80], stepSize: [0.01, 3],
  repulsion: [0, 3], alignment: [0, 1.5], attraction: [0, 1.5],
} as const

export type Tuned = {
  maxNodes: number; stepsPerFrame: number; segmentLength: number; repelRadius: number
  repulsion: number; alignment: number; attraction: number; stepSize: number; lineWidth: number
}

const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value))

// box: the boundary and start lines together, as Capture measured them. growLength: the start lines' total
// length; boundaryLength: the boundary's; anyClosed: whether a start line is closed. Lengths in mm.
export function autoTune(box: Box, growLength: number, boundaryLength: number, anyClosed: boolean): Tuned {
  const width = Math.max(1e-9, box[2] - box[0]), height = Math.max(1e-9, box[3] - box[1])
  const k = SIM_SPAN / Math.max(width, height) // mm to panel units
  const span = SIM_SPAN, area = width * k * height * k
  const grow = growLength * k
  const edge = boundaryLength > 0 ? boundaryLength * k : span * 4
  let target = clamp(1, span / 72, 40)
  if (grow > 0) target = clamp(Math.max(1, grow / 180), target, Math.min(40, Math.max(1, grow / 8)))
  const repelRadius = clamp(2, target * 2.6, 80)
  const areaCapacity = Math.sqrt(Math.max(1, area)) * 1.8
  const lineCapacity = grow > 0 ? (grow / target) * 12 : 120
  const boundaryCapacity = edge > 0 ? (edge / target) * 3 : 120
  const maxNodes = Math.round(clamp(40, Math.max(120, areaCapacity, lineCapacity, boundaryCapacity), 2600))
  const stepsPerFrame = maxNodes > 1800 || target < 3 ? 2 : maxNodes > 1000 ? 3 : 4
  const compactness = clamp(0, grow / Math.max(edge, 1), 1)
  return {
    maxNodes,
    stepsPerFrame,
    segmentLength: target / k,
    repelRadius: repelRadius / k,
    repulsion: clamp(0, 0.58 + (repelRadius / 80) * 0.65 + compactness * 0.15, 3),
    alignment: clamp(0, 0.24 + (target / 40) * 0.45 + (anyClosed ? 0.05 : 0), 1.5),
    attraction: clamp(0, 0.22 + (target / 40) * 0.55 + compactness * 0.12, 1.5),
    stepSize: clamp(0.05, target * 0.09, 3) / k,
    lineWidth: (target * 0.11) / k,
  }
}

// A length range in millimetres for a sheet whose larger side is `span` mm.
export const lengthRange = (key: 'segmentLength' | 'repelRadius' | 'stepSize', span: number): [number, number] =>
  [SIM_RANGE[key][0] * span / SIM_SPAN, SIM_RANGE[key][1] * span / SIM_SPAN]
