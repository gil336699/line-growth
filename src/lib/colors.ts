// Each line's own colour, from a gradient, by where the line starts. A line keeps its colour as it grows, and a
// cell of the Cells start keeps its place in the rainbow however far it spreads. The gradient runs from the line
// whose middle is furthest back along the direction to the one furthest forward, so the first and last lines
// take its two end colours.
import type { Path } from '../growth/seeds'
import { centroid, type Vec } from '../growth/geometry'
import type { GradientName, Settings } from './settings'

export const GRADIENTS: Record<Exclude<GradientName, 'custom'>, string[]> = {
  // Purple and blue, through cyan, green and yellow, to orange and red: Apple's system colours, bright all the way.
  rainbow: ['#af52de', '#5e5ce6', '#0a84ff', '#32ade6', '#34c759', '#ffcc00', '#ff9500', '#ff3b30'],
  sunset: ['#3b1c6e', '#9b2d8f', '#e5466b', '#f7883a', '#fcd45b'],
  ocean: ['#0d2b5e', '#1460aa', '#1d9fd0', '#4fd1c5', '#c6f3e3'],
  // The scientific colour map: even steps of lightness, readable in greyscale and by most colour-blind readers.
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
}

type ColorSettings = Pick<Settings, 'colors' | 'gradient' | 'gradientAngle' | 'gradientFrom' | 'gradientTo'>

export const gradientStops = (s: ColorSettings): string[] => s.gradient === 'custom' ? [s.gradientFrom, s.gradientTo] : GRADIENTS[s.gradient]

const channels = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')

// The colour a fraction t of the way along evenly spaced stops.
export function colorAt(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0]
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0.5)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i
  const a = channels(stops[i]), b = channels(stops[i + 1])
  return `#${a.map((v, k) => hex2(v + (b[k] - v) * f)).join('')}`
}

// Where a line is, for its colour: the middle of a closed line's area, or the average of an open line's points.
export function middleOf(path: Path): Vec {
  if (path.closed && path.points.length >= 3) return centroid(path.points)
  const n = Math.max(1, path.points.length)
  return [path.points.reduce((sum, p) => sum + p[0], 0) / n, path.points.reduce((sum, p) => sum + p[1], 0) / n]
}

// The colour of each of `count` lines, line i grown from start line i, or null when every line has the one
// colour. A line with no start line to go by, as a project from another version may have, takes the middle colour.
export function lineColors(s: ColorSettings, start: Path[], count: number): string[] | null {
  if (s.colors !== 'gradient') return null
  const stops = gradientStops(s)
  const a = (s.gradientAngle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a)
  const along = start.map(p => { const [x, y] = middleOf(p); return x * ux + y * uy })
  let lo = Infinity, hi = -Infinity
  for (const v of along) { if (v < lo) lo = v; if (v > hi) hi = v }
  const span = hi - lo
  return Array.from({ length: count }, (_, i) => colorAt(stops, i < along.length && span > 1e-9 ? (along[i] - lo) / span : 0.5))
}

// A CSS gradient of the stops, for the swatch on the Style tab.
export const gradientCss = (s: ColorSettings) => `linear-gradient(90deg, ${gradientStops(s).join(', ')})`
