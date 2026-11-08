import { describe, expect, it } from 'vitest'
import { Boundary } from './boundary'
import { Grower, type GrowthParams, type Strand } from './engine'
import { flat, resample, type Vec } from './geometry'
import { separateStarts, touchingStrands } from './separate'

const square = (x: number, y: number, size: number): Strand => ({ closed: true, points: flat(resample([[x, y], [x + size, y], [x + size, y + size], [x, y + size]], true, 2)) })
const open = (points: Vec[]): Strand => ({ closed: false, points: flat(points) })
// The closest any node of a comes to any node of b.
const gapBetween = (a: Strand, b: Strand) => {
  let best = Infinity
  for (let i = 0; i < a.points.length; i += 2) for (let j = 0; j < b.points.length; j += 2) best = Math.min(best, Math.hypot(a.points[i] - b.points[j], a.points[i + 1] - b.points[j + 1]))
  return best
}

describe('separating start lines that touch', () => {
  it('sets two squares that share an edge apart, and leaves a line that touches nothing alone', () => {
    const left = square(10, 10, 20), right = square(30, 10, 20), far = square(80, 80, 10)
    expect(gapBetween(left, right)).toBe(0)
    const [a, b, c] = separateStarts([left, right, far], 2)
    expect(gapBetween(a, b)).toBeGreaterThan(1.8)
    expect(c).toBe(far)
    // Set in, not out: the left square's right edge moved left.
    expect(Math.max(...Array.from(a.points).filter((_, i) => i % 2 === 0))).toBeCloseTo(29, 6)
  })

  it('draws back the ends of open lines that meet, as Voronoi edges do at a corner', () => {
    const lines = [open([[0, 0], [10, 0]]), open([[10, 0], [20, 5]]), open([[10, 0], [10, -10]])]
    expect(touchingStrands(lines, 1).map(c => [c.start, c.end])).toEqual([[false, true], [true, false], [true, false]])
    const moved = separateStarts(lines, 1)
    expect(Array.from(moved[0].points)).toEqual([0, 0, 9.5, 0])
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(gapBetween(moved[i], moved[j])).toBeGreaterThan(0.45)
  })

  it('never turns a small closed line inside out', () => {
    const tiny: Strand = { closed: true, points: flat(resample([[10, 10], [11, 10], [11, 11], [10, 11]], true, 0.25)) }, big = square(11, 10, 20)
    const [a] = separateStarts([tiny, big], 4)
    const xs = Array.from(a.points).filter((_, i) => i % 2 === 0)
    // Set in by a fifth of its width at most, so it keeps its shape and its place.
    expect(Math.min(...xs)).toBeGreaterThan(10)
    expect(Math.max(...xs)).toBeLessThan(11)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5)
  })

  it('lets a honeycomb drawn as separate edges grow, where the crossing check held every node still', () => {
    // Edges that meet three at a corner, as a Voronoi export draws its cells.
    const r = 8, t = 2, edges = new Map<string, [Vec, Vec]>()
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const cx = 15 + col * r * Math.sqrt(3) + (row % 2) * r * Math.sqrt(3) / 2, cy = 15 + row * r * 1.5
      const v = Array.from({ length: 6 }, (_, i): Vec => [+(cx + r * Math.cos(Math.PI / 6 + i * Math.PI / 3)).toFixed(2), +(cy + r * Math.sin(Math.PI / 6 + i * Math.PI / 3)).toFixed(2)])
      for (let i = 0; i < 6; i++) { const a = v[i], b = v[(i + 1) % 6]; edges.set([a, b].map(p => p.join(',')).sort().join('|'), [a, b]) }
    }
    const lines = [...edges.values()].map(([a, b]) => open(resample([a, b], false, 1.35 * t)))
    const params: GrowthParams = { maxNodes: 1000, segmentLength: t, repelRadius: 2.6 * t, repulsion: 0.95, alignment: 0.48, attraction: 0.47, stepSize: 0.09 * t, randomness: 0, seed: 1 }
    const held = (strands: Strand[]) => {
      const g = new Grower(strands.map(s => ({ ...s, points: s.points.slice() })), 0, params, new Boundary([[[0, 0], [80, 0], [80, 60], [0, 60]]]))
      let sum = 0
      for (let i = 0; i < 20; i++) { g.stepOnce(); sum += g.held }
      return sum / 20
    }
    const nodes = lines.reduce((n, s) => n + s.points.length / 2, 0)
    expect(held(lines)).toBeGreaterThan(nodes * 0.5)
    expect(held(separateStarts(lines, t * 0.5))).toBe(0)
  })
})
