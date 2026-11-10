// The Cells start: Voronoi cells that fill the boundary's outline. The seed scatters a point for each cell, a few
// rounds of Lloyd's relaxation even them out, and each cell is the part of the outline nearer its own point than
// any other. Every cell is set in by half the gap, from its neighbours and from the outline, so neighbours start
// apart and fold into each other like jigsaw pieces as they grow.
//
// The cells fill any outline, holes included, as Voronoi Studio's do: Clipper2 clips each cell to it. A cell the
// outline cuts in two becomes two lines. A cell with a hole wholly inside it is cut in two through the hole first,
// since one line can't go round a hole and also hold it out. Below 100 %, Size fills a smaller copy of the outline
// round its middle, which leaves room for the cells to burst out of it, up to the boundary.
import { EndType, FillRule, inflatePathsD, intersectD, JoinType, rectClip, unionD, type PathsD } from 'clipper2-ts'
import type { Boundary } from './boundary'
import { centroid, signedArea, type Box, type Polygon, type Vec } from './geometry'

export type CellOptions = {
  count: number // how many cells
  size: number // percent: the area the cells fill, as a share of the outline's size, round its middle
  gap: number // percent: how far apart neighbours start, as a share of a cell's width
  seed: number
}

export const RELAX_ROUNDS = 2 // even enough to read as cells, still uneven enough to look grown
const PRECISION = 4 // Clipper rounds to 0.1 µm
const ARC_TOLERANCE = 0.005 // mm: how far round offsets may stray from a true arc

function rng(seed: number) {
  let a = (Math.floor(seed) >>> 0) ^ 0x5bd1e995 || 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const toPaths = (rings: Polygon[]): PathsD => rings.map(r => r.map(([x, y]) => ({ x, y })))
const fromPaths = (paths: PathsD): Polygon[] =>
  paths.filter(p => p.length >= 3).map(p => p.map(({ x, y }): Vec => [x, y])).filter(p => Math.abs(signedArea(p)) > 1e-9)
const boxOfRings = (rings: Polygon[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return [x0, y0, x1, y1]
}

// Keeps the part of a convex polygon where nx·x + ny·y ≤ c.
export function clipHalfPlane(poly: Vec[], nx: number, ny: number, c: number): Vec[] {
  const out: Vec[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

// The cell of point i within a box: the box, cut by the line halfway between it and every other point, moved
// toward it by `half` so neighbouring cells end up 2 × half apart.
function cellOf(sites: Vec[], i: number, [x0, y0, x1, y1]: Box, half: number): Vec[] {
  const [sx, sy] = sites[i]
  // Nearest points first, so the cell shrinks quickly and points too far away to cut it can be skipped.
  const order = sites.map((_, j) => j).filter(j => j !== i)
    .sort((a, b) => Math.hypot(sites[a][0] - sx, sites[a][1] - sy) - Math.hypot(sites[b][0] - sx, sites[b][1] - sy))
  let cell: Vec[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  for (const j of order) {
    const dx = sites[j][0] - sx, dy = sites[j][1] - sy, d = Math.hypot(dx, dy)
    if (!(d > 1e-12)) continue
    let reach = 0
    for (const [x, y] of cell) reach = Math.max(reach, Math.hypot(x - sx, y - sy))
    if (d > 2 * reach + 2 * half) break
    const nx = dx / d, ny = dy / d
    cell = clipHalfPlane(cell, nx, ny, nx * (sx + dx / 2) + ny * (sy + dy / 2) - half)
    if (cell.length < 3) return []
  }
  return cell
}

// Clips cells to an area. Only the part of a long ring near the cell is used, as Voronoi Studio does, so a cell
// costs about the same however detailed the outline: 200 cells in a 4,096-point outline went from 340 ms to 109 ms.
function clipper(area: Polygon[]) {
  const paths = toPaths(area), boxes = area.map(r => boxOfRings([r]))
  return (cell: Vec[]): Polygon[] => {
    if (cell.length < 3) return []
    const [x0, y0, x1, y1] = boxOfRings([cell])
    const pad = 1e-3 * Math.max(x1 - x0, y1 - y0, 1e-6)
    const rect = { left: x0 - pad, top: y0 - pad, right: x1 + pad, bottom: y1 + pad }
    const local: PathsD = []
    area.forEach((ring, i) => {
      const [a, b, c, d] = boxes[i]
      if (a > rect.right || c < rect.left || b > rect.bottom || d < rect.top) return
      if (ring.length <= 48) local.push(paths[i])
      else local.push(...rectClip(rect, paths[i], PRECISION))
    })
    return local.length ? fromPaths(intersectD(toPaths([cell]), local, FillRule.NonZero, PRECISION)) : []
  }
}

// Even-odd: inside an odd number of rings.
const insideRings = (rings: Polygon[], x: number, y: number) => {
  let inside = false
  for (const poly of rings) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i]
      if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside
    }
  }
  return inside
}

// The middle of a cell's pieces, weighted by area.
function middle(pieces: Polygon[]): Vec | null {
  let a = 0, x = 0, y = 0
  for (const p of pieces) { const w = signedArea(p), [cx, cy] = centroid(p); a += w; x += cx * w; y += cy * w }
  return Math.abs(a) > 1e-12 ? [x / a, y / a] : null
}

// Cuts a convex cell in two through any hole that lies wholly inside it, each half `half` back from the cut, until
// no part holds a hole.
function aroundHoles(cell: Vec[], holes: Polygon[], half: number): Vec[][] {
  const parts: Vec[][] = []
  const todo: { part: Vec[]; depth: number }[] = [{ part: cell, depth: 0 }]
  while (todo.length) {
    const { part, depth } = todo.pop()!
    const hole = depth < 8 ? holes.find(h => h.every(([x, y]) => insideRings([part], x, y))) : undefined
    if (!hole) { parts.push(part); continue }
    // A connected hole always reaches the vertical line through the middle of its area, so the cut crosses it.
    const [cx] = centroid(hole)
    for (const side of [1, -1]) {
      const piece = clipHalfPlane(part, side, 0, side * cx - half)
      if (piece.length >= 3) todo.push({ part: piece, depth: depth + 1 })
    }
  }
  return parts
}

export function voronoiCells(b: Boundary, o: CellOptions): Vec[][] {
  if (b.empty) return []
  // The outline as Clipper keeps it: outer rings positive, holes negative.
  const outline = fromPaths(unionD(toPaths(b.rings), [], FillRule.EvenOdd, PRECISION))
  if (!outline.length) return []
  const [bx0, by0, bx1, by1] = boxOfRings(outline)
  const k = Math.max(0.01, Math.min(1, o.size / 100))
  const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2
  // A smaller area is the outline scaled round its middle, and kept within the outline itself.
  const area0 = k < 1
    ? fromPaths(intersectD(toPaths(outline.map(r => r.map(([x, y]): Vec => [mx + (x - mx) * k, my + (y - my) * k]))), toPaths(outline), FillRule.NonZero, PRECISION))
    : outline
  const size = area0.reduce((sum, r) => sum + signedArea(r), 0)
  if (!(size > 0)) return []
  const count = Math.max(1, Math.min(500, Math.round(o.count)))
  const half = (Math.max(0, o.gap) / 100) * Math.sqrt(size / count) / 2
  const box = boxOfRings(area0)
  const pad = Math.max(box[2] - box[0], box[3] - box[1]) * 0.01 + half
  const frame: Box = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]

  // The points: scattered over the area by the seed, then each moved to the middle of its cell a few times.
  const random = rng(o.seed)
  let sites: Vec[] = []
  for (let tries = 0; tries < count * 400 && sites.length < count; tries++) {
    const x = box[0] + random() * (box[2] - box[0]), y = box[1] + random() * (box[3] - box[1])
    if (insideRings(area0, x, y)) sites.push([x, y])
  }
  const inArea = clipper(area0)
  for (let round = 0; round < RELAX_ROUNDS; round++) {
    sites = sites.map((site, i) => middle(inArea(cellOf(sites, i, frame, 0))) ?? site)
  }

  // Each cell set in by half the gap from its neighbours and from the outline.
  const area = half > 0 ? fromPaths(inflatePathsD(toPaths(area0), -half, JoinType.Round, EndType.Polygon, 2, PRECISION, ARC_TOLERANCE)) : area0
  const holes = area.filter(r => signedArea(r) < 0)
  const inSet = clipper(area)
  const tiny = (size / count) * 0.02
  const cells: Vec[][] = []
  for (let i = 0; i < sites.length; i++) {
    for (const part of aroundHoles(cellOf(sites, i, frame, half), holes, half)) {
      for (const piece of inSet(part)) if (signedArea(piece) > tiny) cells.push(piece)
    }
  }
  return cells
}
