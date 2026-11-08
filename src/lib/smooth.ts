// Smooth curves through the nodes for export: each segment becomes a cubic Bézier whose handles follow the
// neighbouring nodes (Catmull–Rom), so the curve passes through every node with no corners.
import type { Strand } from '../growth/engine'

export type Cubic = [number, number, number, number, number, number] // c1x, c1y, c2x, c2y, x, y

export function smoothSegments({ closed, points: p }: Strand): Cubic[] {
  const n = p.length / 2
  const out: Cubic[] = []
  const at = (i: number): [number, number] => {
    const k = closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))
    return [p[k * 2], p[k * 2 + 1]]
  }
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    out.push([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]])
  }
  return out
}
