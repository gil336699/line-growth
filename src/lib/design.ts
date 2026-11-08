// A design: its settings, an imported boundary if any, the start lines when they were drawn or imported,
// and the grown lines. Also the rules for what each change does to the growth, so the page and the tests
// agree. Plain TypeScript, no React.
import { autoTune } from '../growth/autotune'
import { boundaryOf, type Boundary } from '../growth/boundary'
import type { GrowthParams, Strand } from '../growth/engine'
import { boxOf, ellipseRing, flat, pathLength, resample, unflat, type Box, type Polygon, type Vec } from '../growth/geometry'
import { startPaths, type Path } from '../growth/seeds'
import { marginMax, sanitizeSettings, scaledRange, type Settings } from './settings'

export type SizedBy = 'file' | 'css' | 'illustrator'
// An imported boundary, in millimetres on a page of the file's size. It scales with the sheet.
export type Imported = { name: string; sized: SizedBy; width: number; height: number; rings: Polygon[] }
export type GrowthState = { strands: Strand[]; step: number }
export type Design = { settings: Settings; imported: Imported | null; custom: Path[]; state: GrowthState }

let ringCache: { key: string; imported: Imported | null; rings: Polygon[] } | null = null

export function boundaryRings(s: Settings, imported: Imported | null): Polygon[] {
  const { width: w, height: h } = s
  const m = Math.min(s.margin, marginMax(s))
  const key = `${s.shape}|${w}|${h}|${m}`
  if (ringCache && ringCache.key === key && ringCache.imported === imported) return ringCache.rings
  let rings: Polygon[]
  if (s.shape === 'imported' && imported) {
    const kx = w / imported.width, ky = h / imported.height
    rings = imported.rings.map(ring => ring.map(([x, y]): Vec => [x * kx, y * ky]))
  } else if (s.shape === 'ellipse') rings = [ellipseRing(w / 2, h / 2, Math.max(0.5, w / 2 - m), Math.max(0.5, h / 2 - m), Math.max(w, h) / 40_000)]
  else rings = [[[m, m], [w - m, m], [w - m, h - m], [m, h - m]]]
  ringCache = { key, imported, rings }
  return rings
}

export const boundaryOfDesign = (d: Pick<Design, 'settings' | 'imported'>): Boundary => boundaryOf(boundaryRings(d.settings, d.imported))

let startCache: { key: string; boundary: Boundary; paths: Path[] } | null = null

// The lines growth starts from: a preset shape made from the settings, or the drawn and imported lines.
export function startOf(d: Pick<Design, 'settings' | 'imported' | 'custom'>): Path[] {
  const s = d.settings
  if (s.start === 'custom') return d.custom
  const b = boundaryOfDesign(d)
  const key = `${s.start}|${s.startSize}|${s.startCount}|${s.start === 'circles' ? s.seed : 0}`
  if (startCache && startCache.key === key && startCache.boundary === b) return startCache.paths
  const paths = startPaths(s.start, b, s.startSize, s.startCount, s.seed)
  startCache = { key, boundary: b, paths }
  return paths
}

// Start lines are spaced a little wider than the segment length, as the panel did, so growth begins calmly.
export function initialSpacing(s: Settings, b: Boundary): number {
  const span = Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1], 1e-6)
  return Math.max(s.segmentLength * 1.35, span / 400)
}

export function strandOf(path: Path, spacing: number, b: Boundary): Strand {
  let points = resample(path.points, path.closed, spacing)
  // A tiny closed line still gets a few nodes, so it has room to grow.
  if (path.closed && points.length < 6) points = resample(path.points, true, Math.max(1e-6, pathLength(path.points, true) / 6))
  const inside = points.map(([x, y]): Vec => (b.empty || b.contains(x, y) ? [x, y] : b.closest(x, y)))
  return { closed: path.closed, points: flat(inside) }
}

export function resetState(d: Pick<Design, 'settings' | 'imported' | 'custom'>): GrowthState {
  const b = boundaryOfDesign(d)
  const spacing = initialSpacing(d.settings, b)
  return { strands: startOf(d).map(path => strandOf(path, spacing, b)), step: 0 }
}

export function growthParams(s: Settings): GrowthParams {
  return {
    maxNodes: s.maxNodes, segmentLength: s.segmentLength, repelRadius: s.repelRadius, repulsion: s.repulsion,
    alignment: s.alignment, attraction: s.attraction, stepSize: s.stepSize, randomness: s.randomness, seed: s.seed,
  }
}

// Auto tune: starting values for this boundary and start shape, as the panel chose them on Capture.
export function tuned(d: Pick<Design, 'settings' | 'imported' | 'custom'>): Settings {
  const s = d.settings
  if (!s.autoTune) return s
  const b = boundaryOfDesign(d)
  const start = startOf(d)
  const box = boxOf([...b.rings, ...start.map(p => p.points)])
  const growLength = start.reduce((sum, p) => sum + pathLength(p.points, p.closed), 0)
  const t = autoTune(box, growLength, b.length, start.some(p => p.closed))
  return sanitizeSettings({ ...s, ...t, lineWidth: Math.max(0.01, t.lineWidth) })
}

export function freshDesign(settings: Settings, imported: Imported | null = null, custom: Path[] = []): Design {
  const base = { settings, imported, custom }
  const s = tuned(base)
  return { ...base, settings: s, state: resetState({ ...base, settings: s }) }
}

export const nodeCount = (state: GrowthState) => state.strands.reduce((sum, s) => sum + s.points.length / 2, 0)
export const lineLength = (strands: Strand[]) => strands.reduce((sum, s) => {
  const p = s.points, n = p.length / 2
  let total = 0
  for (let i = 0; i < (s.closed ? n : n - 1); i++) {
    const j = (i + 1) % n
    total += Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1])
  }
  return sum + total
}, 0)

// ---------- What a change does ----------

const SHEET = ['width', 'height', 'margin'] as const
const START = ['start', 'startSize', 'startCount'] as const

export type Plan = { design: Design; discards: boolean }

// Maps points from one box to another, then brings any that fall outside the new boundary to its edge.
function mapPoints(points: Float64Array, from: Box, to: Box, b: Boundary): Float64Array {
  const kx = (to[2] - to[0]) / Math.max(1e-9, from[2] - from[0]), ky = (to[3] - to[1]) / Math.max(1e-9, from[3] - from[1])
  const out = new Float64Array(points.length)
  for (let i = 0; i < points.length; i += 2) {
    let x = to[0] + (points[i] - from[0]) * kx, y = to[1] + (points[i + 1] - from[1]) * ky
    if (!b.empty && !b.contains(x, y)) [x, y] = b.closest(x, y)
    out[i] = x; out[i + 1] = y
  }
  return out
}

// The next design after a settings change. A new boundary shape or start shape starts the growth again
// (discards is true when that loses grown lines); a new size or margin carries the grown lines along.
export function planChange(d: Design, patch: Partial<Settings>, imported: Imported | null = d.imported): Plan {
  const s = d.settings
  const next = sanitizeSettings({ ...s, ...patch })
  const grown = d.state.step > 0
  const shapeChanged = next.shape !== s.shape || imported !== d.imported
  const startChanged = START.some(k => next[k] !== s[k]) || (next.start === 'circles' && next.seed !== s.seed)
  const sheetChanged = SHEET.some(k => next[k] !== s[k])
  const base = { settings: next, imported, custom: d.custom }
  if (shapeChanged || startChanged) {
    const settings = tuned(base)
    return { design: { ...base, settings, state: resetState({ ...base, settings }) }, discards: grown }
  }
  if (sheetChanged) {
    const from = boundaryOfDesign(d), toB = boundaryOfDesign(base)
    const custom = d.custom.map(p => ({ closed: p.closed, points: unflat(mapPoints(flat(p.points), from.box, toB.box, toB)) }))
    const moved = { ...base, custom }
    const settings = grown ? (next.autoTune ? { ...next, ...pickScaled(tuned(moved)) } : clampScaled(next)) : tuned(moved)
    if (!grown) return { design: { ...moved, settings, state: resetState({ ...moved, settings }) }, discards: false }
    const strands = d.state.strands.map(st => ({ closed: st.closed, points: mapPoints(st.points, from.box, toB.box, toB) }))
    return { design: { ...moved, settings, state: { strands, step: d.state.step } }, discards: false }
  }
  return { design: { ...d, settings: next }, discards: false }
}

// While lines are grown, a new size keeps the node budget and look, and only rescales the lengths.
const pickScaled = (s: Settings) => ({ segmentLength: s.segmentLength, repelRadius: s.repelRadius, stepSize: s.stepSize, lineWidth: s.lineWidth })
const clampScaled = (s: Settings): Settings => {
  const out = { ...s }
  for (const key of ['segmentLength', 'repelRadius', 'stepSize'] as const) {
    const [lo, hi] = scaledRange(key, s)
    out[key] = Math.min(hi, Math.max(lo, s[key]))
  }
  return out
}

// ---------- Drawing and erasing lines ----------

// Adds a line to the start and to the growth, so it grows from where it is.
export function addLine(d: Design, path: Path): Design {
  const b = boundaryOfDesign(d)
  const custom = [...startOf(d), path]
  const strand = strandOf(path, initialSpacing(d.settings, b), b)
  return { ...d, settings: { ...d.settings, start: 'custom' }, custom, state: { ...d.state, strands: [...d.state.strands, strand] } }
}

export function removeLine(d: Design, index: number): Design {
  const custom = startOf(d).filter((_, i) => i !== index)
  return { ...d, settings: { ...d.settings, start: 'custom' }, custom, state: { ...d.state, strands: d.state.strands.filter((_, i) => i !== index) } }
}
