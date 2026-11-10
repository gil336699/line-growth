import { describe, expect, it } from 'vitest'
import { Boundary } from './boundary'
import { voronoiCells } from './cells'
import { ellipseRing, signedArea, type Polygon, type Vec } from './geometry'

const square = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const toSegment = ([px, py]: Vec, [ax, ay]: Vec, [bx, by]: Vec) => {
  const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)))
  return Math.hypot(ax + ex * t - px, ay + ey * t - py)
}
// The distance between two convex polygons that don't overlap: the nearest vertex of one to an edge of the other.
const apart = (a: Vec[], b: Vec[]) => Math.min(
  ...a.map(p => Math.min(...b.map((q, i) => toSegment(p, q, b[(i + 1) % b.length])))),
  ...b.map(p => Math.min(...a.map((q, i) => toSegment(p, q, a[(i + 1) % a.length])))))
const inside = (poly: Vec[], [x, y]: Vec) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[j][1] > y) !== (poly[i][1] > y) && x < poly[j][0] + ((y - poly[j][1]) * (poly[i][0] - poly[j][0])) / (poly[i][1] - poly[j][1])) c = !c
  return c
}
const area = (cells: Vec[][]) => cells.reduce((sum, c) => sum + Math.abs(signedArea(c)), 0)

describe('Voronoi cells', () => {
  const sheet = new Boundary([square(5, 5, 195, 195)])

  it('fill a smaller copy of the outline with as many cells as asked, set apart by the gap', () => {
    const cells = voronoiCells(sheet, { count: 30, size: 60, gap: 10, seed: 1 })
    expect(cells).toHaveLength(30)
    // The area is the 190 mm square outline at 60 %, 114 mm square round the middle; the gap is 10 % of a cell's
    // width. Clipper rounds to 0.1 µm.
    const gap = 0.1 * Math.sqrt((114 * 114) / 30)
    for (const cell of cells) for (const [x, y] of cell) {
      expect(x).toBeGreaterThanOrEqual(43 + gap / 2 - 1e-3); expect(x).toBeLessThanOrEqual(157 - gap / 2 + 1e-3)
      expect(y).toBeGreaterThanOrEqual(43 + gap / 2 - 1e-3); expect(y).toBeLessThanOrEqual(157 - gap / 2 + 1e-3)
    }
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      expect(cells[j].some(p => inside(cells[i], p))).toBe(false)
      expect(apart(cells[i], cells[j])).toBeGreaterThanOrEqual(gap - 1e-3)
    }
    // Between them they cover the area, less the gaps.
    expect(area(cells) / (114 * 114)).toBeGreaterThan(0.8)
    expect(area(cells) / (114 * 114)).toBeLessThan(1)
  })

  it('come out the same in every version, so saved designs keep their colours', () => {
    // A project keeps a preset start's settings, not its lines, and each line's colour comes from its start line.
    // If this changes, cells grown in an earlier version would take other cells' colours when reopened.
    const cells = voronoiCells(sheet, { count: 30, size: 100, gap: 10, seed: 1 })
    expect(cells).toHaveLength(30)
    expect(cells.reduce((n, c) => n + c.length, 0)).toBe(161)
    expect(cells.flat(2).reduce((a, v) => a + v, 0)).toBeCloseTo(33352.2143, 3)
    expect(cells[0][0][0]).toBeCloseTo(96.9994, 4)
    expect(cells[0][0][1]).toBeCloseTo(122.1361, 4)
  })

  it('are placed by the seed', () => {
    const a = voronoiCells(sheet, { count: 30, size: 60, gap: 10, seed: 7 })
    expect(voronoiCells(sheet, { count: 30, size: 60, gap: 10, seed: 7 })).toEqual(a)
    expect(voronoiCells(sheet, { count: 30, size: 60, gap: 10, seed: 8 })).not.toEqual(a)
  })

  it('fill a round outline, set in from its edge', () => {
    const round = new Boundary([ellipseRing(100, 100, 95, 95, 0.05)])
    const cells = voronoiCells(round, { count: 40, size: 100, gap: 10, seed: 2 })
    expect(cells).toHaveLength(40)
    const half = (0.1 * Math.sqrt(area([round.rings[0]]) / 40)) / 2
    for (const cell of cells) for (const [x, y] of cell) {
      expect(round.contains(x, y)).toBe(true)
      const [qx, qy] = round.closest(x, y)
      expect(Math.hypot(qx - x, qy - y)).toBeGreaterThan(half * 0.99)
    }
    expect(area(cells) / area([round.rings[0]])).toBeGreaterThan(0.75)
  })

  it('fill an outline with a hole, going round it', () => {
    // A 40 mm hole in the middle of a 200 mm square. One cell would hold the hole whole, so it's cut in two.
    const holed = new Boundary([square(0, 0, 200, 200), square(80, 80, 120, 120)])
    for (const count of [1, 30]) {
      const cells = voronoiCells(holed, { count, size: 100, gap: 10, seed: 3 })
      expect(cells.length).toBeGreaterThanOrEqual(count === 1 ? 2 : count)
      for (const cell of cells) {
        for (const [x, y] of cell) expect(holed.contains(x, y)).toBe(true)
        // No line goes round the hole.
        expect(inside(cell, [100, 100])).toBe(false)
      }
      // The gap is a share of a cell's width, so one big cell is set in a long way.
      expect(area(cells) / (200 * 200 - 40 * 40)).toBeGreaterThan(count === 1 ? 0.6 : 0.75)
    }
  })

  it('make a cell the outline cuts in two into two lines', () => {
    // Two 80 mm squares 40 mm apart, and one cell over both.
    const islands = new Boundary([square(0, 0, 80, 80), square(120, 0, 200, 80)])
    const cells = voronoiCells(islands, { count: 1, size: 100, gap: 10, seed: 1 })
    expect(cells).toHaveLength(2)
    for (const cell of cells) for (const [x, y] of cell) expect(islands.contains(x, y)).toBe(true)
    // A shape that isn't convex is filled to its edges, inside them.
    const u = new Boundary([[[0, 0], [60, 0], [60, 140], [140, 140], [140, 0], [200, 0], [200, 200], [0, 200]]])
    const filled = voronoiCells(u, { count: 12, size: 100, gap: 10, seed: 5 })
    for (const cell of filled) for (const [x, y] of cell) expect(u.contains(x, y)).toBe(true)
    expect(area(filled) / (200 * 200 - 80 * 140)).toBeGreaterThan(0.75)
  })
})
