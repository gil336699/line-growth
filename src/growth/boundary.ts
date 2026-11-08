// The closed shape the lines grow inside: one or more rings, read even-odd, so rings inside the outline are
// holes the lines keep out of. A grid of the rings' edges makes "is this point inside?" and "where is the
// nearest edge?" fast enough to ask for every node on every step.
import { boxOf, overlaps, resample, type Box, type Polygon, type Vec } from './geometry'

export class Boundary {
  readonly rings: Polygon[]
  readonly box: Box
  readonly length: number
  private readonly ex0: Float64Array; private readonly ey0: Float64Array
  private readonly ex1: Float64Array; private readonly ey1: Float64Array
  private readonly cols: number; private readonly rows: number
  private readonly cw: number; private readonly ch: number
  private readonly buckets: Int32Array[]
  private readonly stamp: Int32Array
  private tick = 0

  constructor(rings: Polygon[]) {
    this.rings = rings.filter(r => r.length >= 3)
    this.box = boxOf(this.rings)
    const n = this.rings.reduce((sum, r) => sum + r.length, 0)
    this.ex0 = new Float64Array(n); this.ey0 = new Float64Array(n); this.ex1 = new Float64Array(n); this.ey1 = new Float64Array(n)
    let k = 0, length = 0
    for (const ring of this.rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        this.ex0[k] = a[0]; this.ey0[k] = a[1]; this.ex1[k] = b[0]; this.ey1[k] = b[1]; k++
        length += Math.hypot(b[0] - a[0], b[1] - a[1])
      }
    }
    this.length = length
    const [x0, y0, x1, y1] = this.box
    const w = Math.max(1e-9, x1 - x0), h = Math.max(1e-9, y1 - y0)
    const side = Math.max(4, Math.min(256, Math.round(Math.sqrt(n))))
    this.cols = Math.max(1, Math.round(side * Math.sqrt(w / h))); this.rows = Math.max(1, Math.round(side * Math.sqrt(h / w)))
    this.cw = w / this.cols; this.ch = h / this.rows
    const lists: number[][] = Array.from({ length: this.cols * this.rows }, () => [])
    for (let e = 0; e < n; e++) {
      const [c0, r0] = this.cell(Math.min(this.ex0[e], this.ex1[e]), Math.min(this.ey0[e], this.ey1[e]))
      const [c1, r1] = this.cell(Math.max(this.ex0[e], this.ex1[e]), Math.max(this.ey0[e], this.ey1[e]))
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) lists[r * this.cols + c].push(e)
    }
    this.buckets = lists.map(l => Int32Array.from(l))
    this.stamp = new Int32Array(n)
  }

  get empty() { return this.ex0.length === 0 }

  private cell(x: number, y: number): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.box[0]) / this.cw))),
      Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.box[1]) / this.ch))),
    ]
  }

  // Even-odd ray cast to the right, through only the grid row the point is in.
  contains(x: number, y: number): boolean {
    const [x0, y0, x1, y1] = this.box
    if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return false
    const [col, row] = this.cell(x, y)
    const tick = ++this.tick
    let inside = false
    for (let c = col; c < this.cols; c++) {
      for (const e of this.buckets[row * this.cols + c]) {
        if (this.stamp[e] === tick) continue
        this.stamp[e] = tick
        const ay = this.ey0[e], by = this.ey1[e]
        if ((ay > y) === (by > y)) continue
        const xi = this.ex0[e] + ((y - ay) * (this.ex1[e] - this.ex0[e])) / (by - ay)
        if (xi > x) inside = !inside
      }
    }
    return inside
  }

  // Visit each edge that might touch the box, once.
  private near(box: Box, visit: (e: number) => void): void {
    if (!overlaps(box, this.box)) return
    const [c0, r0] = this.cell(box[0], box[1]), [c1, r1] = this.cell(box[2], box[3])
    const tick = ++this.tick
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const e of this.buckets[r * this.cols + c]) {
          if (this.stamp[e] === tick) continue
          this.stamp[e] = tick
          visit(e)
        }
      }
    }
  }

  // The nearest point on any edge. Searches a growing square round the point: an edge within h of the
  // point must cross the square of half-size h, so once the best is within h nothing farther can beat it.
  closest(x: number, y: number): Vec {
    if (this.empty) return [x, y]
    const [bx0, by0, bx1, by1] = this.box
    const outside = Math.hypot(Math.max(bx0 - x, 0, x - bx1), Math.max(by0 - y, 0, y - by1))
    let h = Math.max(this.cw, this.ch) + outside
    const span = Math.hypot(bx1 - bx0, by1 - by0) + outside
    for (;;) {
      let best = Infinity, px = x, py = y
      this.near([x - h, y - h, x + h, y + h], e => {
        const ax = this.ex0[e], ay = this.ey0[e], ex = this.ex1[e] - ax, ey = this.ey1[e] - ay
        const len2 = ex * ex + ey * ey || 0.000001
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2))
        const qx = ax + ex * t, qy = ay + ey * t
        const d = (qx - x) * (qx - x) + (qy - y) * (qy - y)
        if (d < best) { best = d; px = qx; py = qy }
      })
      if (best <= h * h || h > span) return [px, py]
      h *= 2
    }
  }

  // The parts of the segment a–b inside the shape, as [t0, t1] ranges along it.
  clipSegment(ax: number, ay: number, bx: number, by: number): [number, number][] {
    const ts: number[] = [0, 1]
    const dx = bx - ax, dy = by - ay
    this.near([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], e => {
      const ex = this.ex1[e] - this.ex0[e], ey = this.ey1[e] - this.ey0[e]
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-18) return
      const qx = this.ex0[e] - ax, qy = this.ey0[e] - ay
      const t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
    })
    ts.sort((p, q) => p - q)
    const out: [number, number][] = []
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1]
      if (t1 - t0 < 1e-9) continue
      const m = (t0 + t1) / 2
      if (!this.contains(ax + dx * m, ay + dy * m)) continue
      const last = out[out.length - 1]
      if (last && Math.abs(last[1] - t0) < 1e-12) last[1] = t1
      else out.push([t0, t1])
    }
    return out
  }

  // Fixed points along every ring, `spacing` apart, that push growing lines away from the edge. Each carries
  // the direction into the shape, used when a node lands right on one.
  repellers(spacing: number): Repellers {
    const xs: number[] = [], ys: number[] = [], nxs: number[] = [], nys: number[] = []
    for (const ring of this.rings) {
      const points = resample(ring, true, spacing)
      const n = points.length
      for (let i = 0; i < n; i++) {
        const [x, y] = points[i]
        const a = points[(i + n - 1) % n], b = points[(i + 1) % n]
        let nx = -(b[1] - a[1]), ny = b[0] - a[0]
        const l = Math.hypot(nx, ny) || 1
        nx /= l; ny /= l
        const probe = Math.max(1e-6, spacing * 0.01)
        if (!this.contains(x + nx * probe, y + ny * probe)) { nx = -nx; ny = -ny }
        xs.push(x); ys.push(y); nxs.push(nx); nys.push(ny)
      }
    }
    return { x: Float64Array.from(xs), y: Float64Array.from(ys), nx: Float64Array.from(nxs), ny: Float64Array.from(nys) }
  }

  // A point well inside the shape: the centre of the box if it's inside, otherwise the sample point
  // farthest from every edge, so start shapes have room.
  roomiest(): Vec {
    const [x0, y0, x1, y1] = this.box
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const clearance = (x: number, y: number) => { const [px, py] = this.closest(x, y); return Math.hypot(px - x, py - y) }
    const centre = this.contains(cx, cy) ? clearance(cx, cy) : -1
    let best: Vec = [cx, cy], bestClear = centre
    const n = 24
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + ((i + 0.5) / n) * (x1 - x0), y = y0 + ((j + 0.5) / n) * (y1 - y0)
      if (!this.contains(x, y)) continue
      const c = clearance(x, y)
      // The centre wins unless somewhere has clearly more room.
      if (c > bestClear * 1.5 + 1e-9 && c > bestClear) { best = [x, y]; bestClear = c }
    }
    return best
  }
}

export type Repellers = { x: Float64Array; y: Float64Array; nx: Float64Array; ny: Float64Array }

const cache = new WeakMap<Polygon[], Boundary>()
export function boundaryOf(rings: Polygon[]): Boundary {
  let b = cache.get(rings)
  if (!b) cache.set(rings, (b = new Boundary(rings)))
  return b
}
