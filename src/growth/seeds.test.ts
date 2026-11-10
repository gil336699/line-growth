import { describe, expect, it } from 'vitest'
import { Boundary } from './boundary'
import { ellipseRing, type Polygon, type Vec } from './geometry'
import { startPaths } from './seeds'

const segmentsOf = (points: Vec[], closed: boolean) => points.slice(0, closed ? points.length : points.length - 1).map((p, i): [Vec, Vec] => [p, points[(i + 1) % points.length]])
const crosses = ([a, b]: [Vec, Vec], [c, d]: [Vec, Vec]) => {
  const o = (p: Vec, q: Vec, r: Vec) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}
const toSegment = ([px, py]: Vec, [ax, ay]: Vec, [bx, by]: Vec) => {
  const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)))
  return Math.hypot(ax + ex * t - px, ay + ey * t - py)
}

describe('Outline start', () => {
  // A coronal-section-like outline: two lobes joined below a slot 1.2 mm wide that runs down from the top (a
  // fissure), with two holes close together under it (ventricles), 6 mm apart and 10 mm below the slot.
  const outline: Polygon = [[10, 10], [99.4, 10], [99.4, 70], [100.6, 70], [100.6, 10], [190, 10], [190, 160], [10, 160]]
  const hole = (cx: number): Polygon => ellipseRing(cx, 85, 12, 5, 0.05).reverse()
  const rings = [outline, hole(85), hole(115)]
  const b = new Boundary(rings)

  for (const pct of [5, 15, 30]) {
    it(`never crosses the boundary, its holes or itself, and keeps the inset from every edge (${pct} %)`, () => {
      const paths = startPaths('outline', b, pct, 5, 1)
      expect(paths.length).toBeGreaterThan(0)
      const inset = (pct / 100) * (150 / 2)
      const edges = rings.flatMap(r => segmentsOf(r, true))
      const all = paths.map(p => segmentsOf(p.points, p.closed))
      for (const [k, segs] of all.entries()) {
        expect(paths[k].closed).toBe(true)
        for (const s of segs) {
          expect(edges.some(e => crosses(s, e))).toBe(false)
          // No long jumps across the shape: each step stays near the spacing the line was resampled at.
          expect(Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1])).toBeLessThan(3)
          expect(Math.min(...edges.map(([p, q]) => toSegment(s[0], p, q)))).toBeGreaterThan(inset * 0.98)
        }
      }
      let crossings = 0
      for (let i = 0; i < all.length; i++) for (let j = i; j < all.length; j++) {
        for (let x = 0; x < all[i].length; x++) for (let y = i === j ? x + 2 : 0; y < all[j].length; y++) {
          if (i === j && x === 0 && y === all[i].length - 1) continue
          if (crosses(all[i][x], all[j][y])) crossings++
        }
      }
      expect(crossings).toBe(0)
    })
  }

  it('is one closed line in a plain circle', () => {
    const circle = new Boundary([ellipseRing(100, 100, 90, 90)])
    const paths = startPaths('outline', circle, 15, 5, 1)
    expect(paths).toHaveLength(1)
    expect(paths[0].closed).toBe(true)
    // 15 % of half the 180 mm side in from the edge: a circle of radius 90 − 13.5 mm.
    for (const [x, y] of paths[0].points) expect(Math.hypot(x - 100, y - 100)).toBeCloseTo(76.5, 0)
  })
})
