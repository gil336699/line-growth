// Start shapes: the lines growth begins from. Each is made inside the boundary from a size, a count and the
// seed, so the same settings always give the same start.
import { EndType, FillRule, inflatePathsD, JoinType, unionD } from 'clipper2-ts'
import type { Boundary } from './boundary'
import { voronoiCells, type CellOptions } from './cells'
import { distance, pathLength, resample, signedArea, type Vec } from './geometry'

const PRECISION = 4 // Clipper rounds to 0.1 µm
const ARC_TOLERANCE = 0.005 // mm: how far round offsets may stray from a true arc

export type StartShape = 'circle' | 'line' | 'circles' | 'cells' | 'outline' | 'custom'
export type Path = { closed: boolean; points: Vec[] }

function rng(seed: number) {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const circlePoints = (cx: number, cy: number, r: number, n = 96): Vec[] =>
  Array.from({ length: n }, (_, i): Vec => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)])

export const clearance = (b: Boundary, x: number, y: number) => { const [px, py] = b.closest(x, y); return Math.hypot(px - x, py - y) }

// sizePct: the shape's diameter or length as a percentage of the boundary's smaller side. For Outline it is
// how far in from the edge, as a percentage of half the smaller side. Cells take their own count, size and gap.
export function startPaths(kind: StartShape, b: Boundary, sizePct: number, count: number, seed: number,
  cells: Omit<CellOptions, 'seed'> = { count: 30, size: 100, gap: 10, position: 'center' }): Path[] {
  if (b.empty || kind === 'custom') return []
  if (kind === 'cells') return voronoiCells(b, { ...cells, seed }).map(points => ({ closed: true, points }))
  const [x0, y0, x1, y1] = b.box
  const side = Math.min(x1 - x0, y1 - y0)
  const size = (Math.max(0.5, Math.min(100, sizePct)) / 100) * side
  if (kind === 'circle') {
    const [cx, cy] = b.roomiest()
    const r = Math.min(size / 2, clearance(b, cx, cy) * 0.9)
    return r > 0 ? [{ closed: true, points: circlePoints(cx, cy, r) }] : []
  }
  if (kind === 'line') {
    const [cx, cy] = b.roomiest()
    const half = size / 2
    const pieces = b.clipSegment(cx - half, cy, cx + half, cy)
    // The piece through the middle, kept a little clear of the edge.
    const t = pieces.find(([t0, t1]) => t0 <= 0.5 && t1 >= 0.5) ?? pieces[0]
    if (!t) return []
    const pad = Math.min(0.05, (t[1] - t[0]) / 4)
    const a: Vec = [cx - half + 2 * half * (t[0] + (t[0] > 0 ? pad : 0)), cy], c: Vec = [cx - half + 2 * half * (t[1] - (t[1] < 1 ? pad : 0)), cy]
    return distance(a, c) > 1e-6 ? [{ closed: false, points: [a, c] }] : []
  }
  if (kind === 'circles') {
    const random = rng(seed)
    const r = size / 2
    const placed: Vec[] = []
    const n = Math.max(1, Math.min(200, Math.round(count)))
    for (let tries = 0; tries < 4000 && placed.length < n; tries++) {
      const x = x0 + random() * (x1 - x0), y = y0 + random() * (y1 - y0)
      if (!b.contains(x, y) || clearance(b, x, y) < r * 1.4) continue
      if (placed.some(p => distance(p, [x, y]) < r * 2.8)) continue
      placed.push([x, y])
    }
    return placed.map(([x, y]) => ({ closed: true, points: circlePoints(x, y, r, 48) }))
  }
  // Outline: the boundary set in from every edge, holes and all, as an offset path is: each ring of the set-in
  // shape is a closed start line, the outline's own and one round each hole. Where the shape is narrower than twice
  // the inset, as at a narrow fissure or between close holes, it drops out or parts in two, so the start lines never
  // cross the boundary, a hole or each other. (Moving each point in on its own did: points either side of a narrow
  // gap landed far apart, and the lines round close holes overlapped, so growth was held back from the start.)
  const inset = Math.max(side * 0.005, (Math.max(0.5, Math.min(95, sizePct)) / 100) * (side / 2))
  const shape = unionD(b.rings.map(r => r.map(([x, y]) => ({ x, y }))), [], FillRule.EvenOdd, PRECISION)
  const setIn = inflatePathsD(shape, -inset, JoinType.Round, EndType.Polygon, 2, PRECISION, Math.min(ARC_TOLERANCE, inset / 50))
  return setIn.map(p => p.map(({ x, y }): Vec => [x, y]))
    .filter(ring => ring.length >= 3 && Math.abs(signedArea(ring)) > 1e-9 && pathLength(ring, true) > inset)
    .map(ring => ({ closed: true, points: resample(ring, true, Math.max(side / 300, pathLength(ring, true) / 2000)) }))
}
