import { describe, expect, it } from 'vitest'
import { Boundary } from './boundary'
import { voronoiCells } from './cells'
import { centroid, ellipseRing, signedArea, type Polygon, type Vec } from './geometry'

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
const boxOfAll = (cells: Vec[][]) => cells.flat().reduce<[number, number, number, number]>(
  ([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity])
// The middle of all the cells' area.
const middleOf = (cells: Vec[][]): Vec => {
  let a = 0, x = 0, y = 0
  for (const c of cells) { const w = Math.abs(signedArea(c)), [cx, cy] = centroid(c); a += w; x += cx * w; y += cy * w }
  return [x / a, y / a]
}

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

  it('sit where Position puts them, against the boundary, with room to burst out the other way', () => {
    const extent = (cells: Vec[][]) => boxOfAll(cells)
    // In the square sheet, bottom left: flush with the left and bottom, 114 mm across, room at the top and right.
    const half = (0.1 * Math.sqrt((114 * 114) / 30)) / 2
    const [x0, y0, x1, y1] = extent(voronoiCells(sheet, { count: 30, size: 60, gap: 10, seed: 1, position: 'bottom-left' }))
    expect(x0).toBeCloseTo(5 + half, 2); expect(y1).toBeCloseTo(195 - half, 2)
    expect(x1).toBeLessThanOrEqual(5 + 114 - half + 1e-3); expect(y0).toBeGreaterThanOrEqual(195 - 114 + half - 1e-3)
    // In a tall rectangle, the copy slides to the corner and then along the side, so it's flush with both.
    const tall = new Boundary([square(0, 0, 210, 297)])
    const t = extent(voronoiCells(tall, { count: 30, size: 60, gap: 10, seed: 1, position: 'bottom-left' }))
    const th = (0.1 * Math.sqrt((126 * 178.2) / 30)) / 2
    expect(t[0]).toBeCloseTo(th, 2); expect(t[3]).toBeCloseTo(297 - th, 2)
    // Top right and right go the other way; the middle stays round the middle.
    const tr = extent(voronoiCells(tall, { count: 30, size: 60, gap: 10, seed: 1, position: 'top-right' }))
    expect(tr[2]).toBeCloseTo(210 - th, 2); expect(tr[1]).toBeCloseTo(th, 2)
    const right = extent(voronoiCells(tall, { count: 30, size: 60, gap: 10, seed: 1, position: 'right' }))
    expect(right[2]).toBeCloseTo(210 - th, 2); expect((right[1] + right[3]) / 2).toBeCloseTo(148.5, 0)
    const mid = extent(voronoiCells(tall, { count: 30, size: 60, gap: 10, seed: 1 }))
    expect((mid[0] + mid[2]) / 2).toBeCloseTo(105, 0); expect((mid[1] + mid[3]) / 2).toBeCloseTo(148.5, 0)
    // In a circle, bottom left touches the circle's edge at the bottom left, rather than its box's corner.
    const round = new Boundary([ellipseRing(100, 100, 95, 95, 0.05)])
    const cells = voronoiCells(round, { count: 20, size: 40, gap: 10, seed: 4, position: 'bottom-left' })
    expect(cells).toHaveLength(20)
    const [cx, cy] = middleOf(cells)
    // The copy's radius is 38 mm; touching at 225°, its middle is 95 - 38 = 57 mm from the circle's, down and left.
    expect(Math.hypot(cx - 100, cy - 100)).toBeCloseTo(57, -0.5)
    expect(cx).toBeLessThan(65); expect(cy).toBeGreaterThan(135)
    for (const c of cells) for (const [x, y] of c) expect(round.contains(x, y)).toBe(true)
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

  it('leave the outline’s own holes out of a smaller area, with no smaller copies of them', () => {
    // A hole near the top-left corner; a 60 % copy of the outline round the middle would have held a 24 mm copy of
    // it at 52–76 mm, where there's no hole.
    const holed = new Boundary([square(0, 0, 200, 200), square(20, 20, 60, 60)])
    const cells = voronoiCells(holed, { count: 30, size: 60, gap: 10, seed: 6 })
    let covered = 0, tried = 0
    for (let x = 54; x <= 74; x += 2) for (let y = 54; y <= 74; y += 2) { tried++; if (cells.some(c => inside(c, [x, y]))) covered++ }
    expect(covered / tried).toBeGreaterThan(0.6)
    // The real hole stays out.
    for (const c of cells) for (const [x, y] of c) expect(holed.contains(x, y)).toBe(true)
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
