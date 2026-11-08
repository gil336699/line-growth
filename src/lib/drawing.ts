// Lines drawn by hand never cross the lines on the sheet or themselves, as grown lines never do: a stroke
// stops where it would, and a clicked circle shrinks to fit between the lines round it.
import { crossed, type Strand } from '../growth/engine'
import type { Vec } from '../growth/geometry'

// Whether the segment a–b crosses any edge of the lines.
export function crossesLines(strands: Strand[], a: Vec, b: Vec): boolean {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
  for (const s of strands) {
    const p = s.points, n = p.length / 2
    const edges = s.closed && n > 2 ? n : n - 1
    for (let k = 0; k < edges; k++) {
      const j = k + 1 < n ? k + 1 : 0
      const px = p[k * 2], py = p[k * 2 + 1], qx = p[j * 2], qy = p[j * 2 + 1]
      if (Math.max(px, qx) < x0 || Math.min(px, qx) > x1 || Math.max(py, qy) < y0 || Math.min(py, qy) > y1) continue
      if (crossed(a[0], a[1], b[0], b[1], px, py, qx, qy)) return true
    }
  }
  return false
}

// Whether adding the segment a–b to a stroke would cross the stroke itself. The stroke's last point is a, so
// its last segment, which meets a–b there, is skipped; with `closing`, so is its first, which meets b.
export function crossesStroke(points: Vec[], a: Vec, b: Vec, closing = false): boolean {
  for (let k = closing ? 1 : 0; k < points.length - 2; k++) {
    const p = points[k], q = points[k + 1]
    if (crossed(a[0], a[1], b[0], b[1], p[0], p[1], q[0], q[1])) return true
  }
  return false
}

// The distance from a point to the nearest line.
export function distanceToLines(strands: Strand[], x: number, y: number): number {
  let best = Infinity
  for (const s of strands) {
    const p = s.points, n = p.length / 2
    for (let k = 0; k < n; k++) {
      const j = k + 1 < n ? k + 1 : s.closed ? 0 : k
      const ax = p[k * 2], ay = p[k * 2 + 1], ex = p[j * 2] - ax, ey = p[j * 2 + 1] - ay
      const len2 = ex * ex + ey * ey
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0
      best = Math.min(best, (ax + ex * t - x) ** 2 + (ay + ey * t - y) ** 2)
    }
  }
  return Math.sqrt(best)
}
