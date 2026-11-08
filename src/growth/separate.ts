// Start lines that touch each other, as the edges of a Voronoi drawing meet at its corners, can't move without
// making a crossing, so the crossing check would hold them still for good. So before growth starts, a closed
// line that comes within `gap` of another line is set in from its edge by half the gap, and an open line's end
// that comes within `gap` of another line is drawn back along the line by half the gap. Neighbours then begin
// apart and repulsion can take over. Lines that touch nothing are left exactly as they are.
import type { Strand } from './engine'

// The distance from point p to segment a–b.
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0
  return Math.hypot(ax + ex * t - px, ay + ey * t - py)
}

export type Contact = { any: boolean; start: boolean; end: boolean }

// Which strands come within `gap` of a different strand, and for open ones whether their first or last node
// does, using a grid of segments binned by their bounds.
export function touchingStrands(strands: Strand[], gap: number): Contact[] {
  const segs: [number, number, number, number, number][] = [] // strand, ax, ay, bx, by
  strands.forEach((s, si) => {
    const p = s.points, n = p.length / 2
    const edges = s.closed && n > 2 ? n : n - 1
    for (let k = 0; k < edges; k++) { const j = (k + 1) % n; segs.push([si, p[k * 2], p[k * 2 + 1], p[j * 2], p[j * 2 + 1]]) }
    if (n === 1) segs.push([si, p[0], p[1], p[0], p[1]])
  })
  const cell = Math.max(gap, 1e-9), grid = new Map<string, number[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
  segs.forEach((g, i) => {
    const x0 = Math.floor((Math.min(g[1], g[3]) - gap) / cell), x1 = Math.floor((Math.max(g[1], g[3]) + gap) / cell)
    const y0 = Math.floor((Math.min(g[2], g[4]) - gap) / cell), y1 = Math.floor((Math.max(g[2], g[4]) + gap) / cell)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = `${x},${y}`; const list = grid.get(k); if (list) list.push(i); else grid.set(k, [i]) }
  })
  const near = (si: number, x: number, y: number) => (grid.get(key(x, y)) ?? []).some(j => segs[j][0] !== si && toSegment(x, y, segs[j][1], segs[j][2], segs[j][3], segs[j][4]) < gap)
  return strands.map((s, si) => {
    const p = s.points, n = p.length / 2
    const start = n > 0 && near(si, p[0], p[1]), end = n > 1 && near(si, p[n * 2 - 2], p[n * 2 - 1])
    let any = start || end
    for (let i = 2; i < p.length - 2 && !any; i += 2) any = near(si, p[i], p[i + 1])
    return { any, start, end }
  })
}

// Draws an open line's first node back towards the second by `by`, or at most a third of that segment.
function pullBack(points: Float64Array, fromEnd: boolean, by: number) {
  const n = points.length / 2
  if (n < 2) return
  const a = fromEnd ? n - 1 : 0, b = fromEnd ? n - 2 : 1
  const dx = points[b * 2] - points[a * 2], dy = points[b * 2 + 1] - points[a * 2 + 1], len = Math.hypot(dx, dy)
  if (!(len > 0)) return
  const move = Math.min(by, len / 3)
  points[a * 2] += (dx / len) * move
  points[a * 2 + 1] += (dy / len) * move
}

// Moves every node of a closed line `by` towards its inside, along the bisector of its two edges. Sharp
// corners move further, up to twice `by`, so the edges stay `by` in from where they were.
export function inset(points: Float64Array, by: number): Float64Array {
  const n = points.length / 2
  if (n < 3) return points.slice()
  let area = 0
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; area += points[k * 2] * points[j * 2 + 1] - points[j * 2] * points[k * 2 + 1] }
  const inward = area > 0 ? 1 : -1 // with y down, a positive area runs clockwise on screen, and its inside is to the right
  const out = new Float64Array(points.length)
  for (let k = 0; k < n; k++) {
    const i = (k + n - 1) % n, j = (k + 1) % n
    const ax = points[k * 2] - points[i * 2], ay = points[k * 2 + 1] - points[i * 2 + 1]
    const bx = points[j * 2] - points[k * 2], by2 = points[j * 2 + 1] - points[k * 2 + 1]
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by2) || 1
    // Normals to each edge, pointing inside.
    const n1x = (-ay / la) * inward, n1y = (ax / la) * inward, n2x = (-by2 / lb) * inward, n2y = (bx / lb) * inward
    let mx = n1x + n2x, my = n1y + n2y
    const ml = Math.hypot(mx, my)
    if (ml < 1e-9) { mx = n1x; my = n1y } else { mx /= ml; my /= ml }
    const cos = Math.max(0.5, mx * n1x + my * n1y)
    out[k * 2] = points[k * 2] + (mx * by) / cos
    out[k * 2 + 1] = points[k * 2 + 1] + (my * by) / cos
  }
  return out
}

// Closed start lines that touch another line are set in by half the gap, or a fifth of their own width if
// that's less, so a small one can't turn inside out. Open lines draw back the ends that touch. Returns new
// strands; untouched ones are the same objects.
export function separateStarts(strands: Strand[], gap: number): Strand[] {
  if (strands.length < 2 || !(gap > 0)) return strands
  const touching = touchingStrands(strands, gap)
  return strands.map((s, i) => {
    const c = touching[i]
    if (!c.any) return s
    if (!s.closed) {
      if (!c.start && !c.end) return s
      const points = s.points.slice()
      if (c.start) pullBack(points, false, gap / 2)
      if (c.end) pullBack(points, true, gap / 2)
      return { closed: false, points }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let k = 0; k < s.points.length; k += 2) { x0 = Math.min(x0, s.points[k]); x1 = Math.max(x1, s.points[k]); y0 = Math.min(y0, s.points[k + 1]); y1 = Math.max(y1, s.points[k + 1]) }
    return { closed: true, points: inset(s.points, Math.min(gap / 2, 0.2 * Math.min(x1 - x0, y1 - y0))) }
  })
}
