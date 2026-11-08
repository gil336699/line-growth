// Differential line growth, the rules of Gil's Illustrator panel: every node is pushed away from nearby nodes
// and from fixed points along the boundary, pulled toward its neighbours' ideal spacing and toward the middle
// of its neighbours, and long edges are split until the node budget is spent. A grid finds nearby nodes, so a
// step costs about the same per node however many there are. Plain TypeScript, deterministic: the same lines,
// settings and step count always give the same result, bit for bit.
import type { Boundary, Repellers } from './boundary'

export type Strand = { closed: boolean; points: Float64Array } // x0, y0, x1, y1, … in millimetres

export type GrowthParams = {
  maxNodes: number
  segmentLength: number // mm: the ideal distance between neighbouring nodes
  repelRadius: number // mm: how far a node pushes others away
  repulsion: number
  alignment: number
  attraction: number
  stepSize: number // mm per step for a force of 1
  randomness: number // 0–1: how far new nodes are nudged sideways, so symmetric shapes break up
  seed: number
}

export const SPLIT_FACTOR = 1.25 // an edge longer than this many segment lengths is split
export const ENDPOINT_DAMPING = 0.15 // the free ends of open lines move this much
export const EDGE_FORCE = 2 // boundary points push this many times harder than nodes
const MAX_REPELLERS_PER_MM = 1 / 20_000 // boundary points are at most one per 1/20,000 of the boundary's length

// A repeatable number in [0, 1) for each new node, so randomness doesn't depend on the order of anything else.
function mix(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}
export const noise = (seed: number, step: number, strand: number, k: number) =>
  mix(mix(mix(mix(seed >>> 0) ^ step) ^ strand) ^ k) / 4294967296

// Nodes binned into square cells at least as wide as the search radius, so a node's neighbours are in the 3 × 3
// cells round it. The cell size grows when needed so there are never many more cells than nodes.
type Grid = { x0: number; y0: number; inv: number; cols: number; rows: number; start: Int32Array; items: Int32Array }
function buildGrid(xs: Float64Array, ys: Float64Array, n: number, radius: number, minCells: number): Grid {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (!(n > 0)) { x0 = y0 = 0; x1 = y1 = 1 }
  const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9)
  const limit = Math.max(minCells, 4 * n)
  let cell = Math.max(radius, 1e-9)
  if ((w / cell + 1) * (h / cell + 1) > limit) cell = Math.max(cell, Math.sqrt((w * h) / limit), (w + h) / limit)
  const cols = Math.floor(w / cell) + 1, rows = Math.floor(h / cell) + 1
  const inv = 1 / cell
  const start = new Int32Array(cols * rows + 1)
  const cellOf = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const c = Math.floor((xs[i] - x0) * inv) + Math.floor((ys[i] - y0) * inv) * cols
    cellOf[i] = c
    start[c + 1]++
  }
  for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c]
  const fill = start.slice(0, cols * rows)
  const items = new Int32Array(n)
  for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i
  return { x0, y0, inv, cols, rows, start, items }
}

// How many new nodes each strand gets this step: as many as it needs, unless the budget runs out, when it
// is shared out one at a time in strand order, as the panel did.
export function shareBudget(needs: number[], budget: number): number[] {
  const total = needs.reduce((a, b) => a + b, 0)
  if (total <= budget) return needs.slice()
  const sorted = needs.slice().sort((a, b) => a - b)
  let level = 0, used = 0, left = needs.length
  for (const need of sorted) {
    const rise = (need - level) * left
    if (used + rise > budget) break
    used += rise; level = need; left--
  }
  level += Math.floor((budget - used) / Math.max(1, left))
  const caps = needs.map(need => Math.min(need, level))
  let rest = budget - caps.reduce((a, b) => a + b, 0)
  for (let s = 0; s < needs.length && rest > 0; s++) if (needs[s] > caps[s]) { caps[s]++; rest-- }
  return caps
}

// Splits long edges at their middles, each new node nudged sideways by up to randomness × a quarter of the
// edge. Edges are split depth first, in order along the strand, as the panel's repeated passes did, so a
// budget cuts off the same nodes. Returns the new points, or null when nothing changes; with count only,
// returns how many splits it would make (as a length-1 array).
function splitStrand(strand: Strand, split: number, cap: number, randomness: number, seed: number, step: number, index: number, countOnly: boolean): Float64Array | null {
  const p = strand.points, n = p.length / 2
  const edges = strand.closed ? n : n - 1
  const out: number[] = []
  let made = 0
  const visit = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay
    const d = Math.sqrt(dx * dx + dy * dy)
    if (made >= cap || !(d > split)) return
    const k = made++
    let mx = (ax + bx) / 2, my = (ay + by) / 2
    if (randomness > 0 && d > 0) {
      const offset = (noise(seed, step, index, k) * 2 - 1) * randomness * 0.25 * d
      mx += (-dy / d) * offset; my += (dx / d) * offset
    }
    visit(ax, ay, mx, my)
    if (!countOnly) out.push(mx, my)
    visit(mx, my, bx, by)
  }
  for (let i = 0; i < n; i++) {
    if (!countOnly) out.push(p[i * 2], p[i * 2 + 1])
    if (i < edges) {
      const j = (i + 1) % n
      visit(p[i * 2], p[i * 2 + 1], p[j * 2], p[j * 2 + 1])
    }
  }
  if (countOnly) return Float64Array.of(made)
  return made ? Float64Array.from(out) : null
}

export function subdivide(strands: Strand[], params: GrowthParams, step: number): void {
  const total = strands.reduce((sum, s) => sum + s.points.length / 2, 0)
  const budget = Math.floor(params.maxNodes) - total
  if (budget <= 0 || total < 2) return
  const split = params.segmentLength * SPLIT_FACTOR
  const needs = strands.map((s, i) => s.points.length >= 4 ? splitStrand(s, split, budget, params.randomness, params.seed, step, i, true)![0] : 0)
  const caps = shareBudget(needs, budget)
  strands.forEach((s, i) => {
    if (!caps[i]) return
    const next = splitStrand(s, split, caps[i], params.randomness, params.seed, step, i, false)
    if (next) s.points = next
  })
}

export const nodeCount = (strands: Strand[]) => strands.reduce((sum, s) => sum + s.points.length / 2, 0)

export class Grower {
  strands: Strand[]
  step: number
  private params: GrowthParams
  private boundary: Boundary
  private repellers: Repellers | null = null
  private repelGrid: Grid | null = null
  private repelKey = ''
  private X = new Float64Array(0); private Y = new Float64Array(0)
  private DX = new Float64Array(0); private DY = new Float64Array(0)

  constructor(strands: Strand[], step: number, params: GrowthParams, boundary: Boundary) {
    this.strands = strands
    this.step = step
    this.params = params
    this.boundary = boundary
  }

  setParams(params: GrowthParams) { this.params = params }
  setBoundary(boundary: Boundary) { this.boundary = boundary; this.repelKey = '' }
  get nodes() { return nodeCount(this.strands) }
  get settling() { return this.nodes >= Math.floor(this.params.maxNodes) }

  // The fixed boundary points, spaced one segment length apart, rebuilt when the spacing or reach changes.
  boundaryPoints(): Repellers {
    const { segmentLength, repelRadius } = this.params
    const spacing = Math.max(segmentLength, this.boundary.length * MAX_REPELLERS_PER_MM)
    const key = `${spacing}|${repelRadius}`
    if (!this.repellers || key !== this.repelKey) {
      this.repellers = this.boundary.repellers(spacing)
      const r = this.repellers
      this.repelGrid = buildGrid(r.x, r.y, r.x.length, repelRadius, 1024)
      this.repelKey = key
    }
    return this.repellers
  }

  // One growth step. Returns false, and doesn't count a step, when there's nothing to grow.
  stepOnce(): boolean {
    const total = this.nodes
    if (total < 2) return false
    const p = this.params
    subdivide(this.strands, p, this.step)
    const strands = this.strands
    const n = nodeCount(strands)
    if (this.X.length < n) {
      const size = Math.max(n, Math.ceil(this.X.length * 1.5))
      this.X = new Float64Array(size); this.Y = new Float64Array(size)
      this.DX = new Float64Array(size); this.DY = new Float64Array(size)
    }
    const { X, Y, DX, DY } = this
    let g = 0
    for (const s of strands) for (let i = 0; i < s.points.length; i += 2) { X[g] = s.points[i]; Y[g] = s.points[i + 1]; g++ }

    const target = p.segmentLength, R = p.repelRadius, R2 = R * R
    const rep = p.repulsion, att = p.attraction, ali = p.alignment, stepSize = p.stepSize
    const grid = buildGrid(X, Y, n, R, 64)
    const rp = this.boundaryPoints(), rg = this.repelGrid!
    const maxMove = R

    let off = 0
    for (const s of strands) {
      const m = s.points.length / 2, closed = s.closed
      for (let i = 0; i < m; i++) {
        const gi = off + i, x = X[gi], y = Y[gi]
        let fx = 0, fy = 0, efx = 0, efy = 0

        // Push away from every node within the repel radius, on any strand, neighbours included.
        {
          const cx = Math.floor((x - grid.x0) * grid.inv), cy = Math.floor((y - grid.y0) * grid.inv)
          for (let yy = Math.max(0, cy - 1); yy <= Math.min(grid.rows - 1, cy + 1); yy++) {
            for (let xx = Math.max(0, cx - 1); xx <= Math.min(grid.cols - 1, cx + 1); xx++) {
              const c = yy * grid.cols + xx
              for (let k = grid.start[c]; k < grid.start[c + 1]; k++) {
                const j = grid.items[k]
                if (j === gi) continue
                const dx = x - X[j], dy = y - Y[j]
                const d2 = dx * dx + dy * dy
                if (d2 >= R2 || d2 === 0) continue
                const d = Math.sqrt(d2)
                const strength = (1 - d / R) * rep
                fx += (dx / d) * strength
                fy += (dy / d) * strength
              }
            }
          }
        }

        // Push away from the fixed boundary points, twice as hard. A node right on one goes straight in.
        {
          const cx = Math.floor((x - rg.x0) * rg.inv), cy = Math.floor((y - rg.y0) * rg.inv)
          for (let yy = Math.max(0, cy - 1); yy <= Math.min(rg.rows - 1, cy + 1); yy++) {
            for (let xx = Math.max(0, cx - 1); xx <= Math.min(rg.cols - 1, cx + 1); xx++) {
              const c = yy * rg.cols + xx
              for (let k = rg.start[c]; k < rg.start[c + 1]; k++) {
                const j = rg.items[k]
                const dx = x - rp.x[j], dy = y - rp.y[j]
                const d = Math.sqrt(dx * dx + dy * dy) || 0.000001
                if (d < 0.0001) { efx += rp.nx[j] * rep * EDGE_FORCE; efy += rp.ny[j] * rep * EDGE_FORCE; continue }
                if (d < R) {
                  const strength = (1 - d / R) * rep * EDGE_FORCE
                  efx += (dx / d) * strength
                  efy += (dy / d) * strength
                }
              }
            }
          }
        }

        // Pull toward the ideal spacing from each neighbour, and toward the middle of the two.
        const prev = i === 0 ? (closed ? m - 1 : 0) : i - 1
        const next = i === m - 1 ? (closed ? 0 : m - 1) : i + 1
        if (prev !== i) {
          const dx = X[off + prev] - x, dy = Y[off + prev] - y
          const d = Math.sqrt(dx * dx + dy * dy) || 0.000001
          const pull = ((d - target) * att) / target
          fx += (dx / d) * pull
          fy += (dy / d) * pull
        }
        if (next !== i) {
          const dx = X[off + next] - x, dy = Y[off + next] - y
          const d = Math.sqrt(dx * dx + dy * dy) || 0.000001
          const pull = ((d - target) * att) / target
          fx += (dx / d) * pull
          fy += (dy / d) * pull
        }
        if (prev !== i && next !== i) {
          const midX = (X[off + prev] + X[off + next]) / 2, midY = (Y[off + prev] + Y[off + next]) / 2
          fx += ((midX - x) * ali) / target
          fy += ((midY - y) * ali) / target
        }
        if (!closed && (i === 0 || i === m - 1)) { fx *= ENDPOINT_DAMPING; fy *= ENDPOINT_DAMPING }

        let mx = (fx + efx) * stepSize, my = (fy + efy) * stepSize
        // A safety limit far above normal moves, so extreme settings can't fling nodes across the sheet.
        const len2 = mx * mx + my * my
        if (len2 > maxMove * maxMove) { const k = maxMove / Math.sqrt(len2); mx *= k; my *= k }
        DX[gi] = mx; DY[gi] = my
      }
      off += m
    }

    // Move every node at once, then bring any that left the shape back to its nearest edge.
    const b = this.boundary
    g = 0
    for (const s of strands) {
      const pts = s.points
      for (let i = 0; i < pts.length; i += 2) {
        let x = X[g] + DX[g], y = Y[g] + DY[g]
        if (!b.empty && !b.contains(x, y)) [x, y] = b.closest(x, y)
        pts[i] = x; pts[i + 1] = y
        g++
      }
    }
    this.step++
    return true
  }
}
