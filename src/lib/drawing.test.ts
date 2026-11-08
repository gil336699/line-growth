import { describe, expect, it } from 'vitest'
import type { Strand } from '../growth/engine'
import { flat, type Vec } from '../growth/geometry'
import { crossesLines, crossesStroke, distanceToLines } from './drawing'

const square: Strand = { closed: true, points: flat([[0, 0], [10, 0], [10, 10], [0, 10]]) }
const open: Strand = { closed: false, points: flat([[20, 0], [20, 10]]) }

describe('drawing by hand', () => {
  it('finds where a stroke would cross a line, including a closed line’s last edge', () => {
    expect(crossesLines([square], [5, 5], [15, 5])).toBe(true)
    // The edge from (0, 10) back to (0, 0).
    expect(crossesLines([square], [-5, 5], [5, 5])).toBe(true)
    expect(crossesLines([square], [2, 2], [8, 8])).toBe(false)
    expect(crossesLines([open], [15, 5], [25, 5])).toBe(true)
    // An open line has no edge from its end back to its start.
    expect(crossesLines([open], [15, 5], [19, 5])).toBe(false)
  })

  it('finds where a stroke would cross itself, but not where it meets its own last point', () => {
    const stroke: Vec[] = [[0, 0], [10, 0], [10, 10], [5, 10]]
    expect(crossesStroke(stroke, [5, 10], [5, -5])).toBe(true)
    expect(crossesStroke(stroke, [5, 10], [5, 5])).toBe(false)
    // Closing back to the start: the first edge meets the start and doesn't count.
    expect(crossesStroke(stroke, [5, 10], [0, 0], true)).toBe(false)
    expect(crossesStroke([[0, 0], [5, 5], [5, -5], [10, 0]], [10, 0], [0, 0], true)).toBe(true)
  })

  it('measures how much room there is for a circle between lines', () => {
    expect(distanceToLines([square], 5, 5)).toBeCloseTo(5)
    expect(distanceToLines([square, open], 17, 5)).toBeCloseTo(3)
    expect(distanceToLines([], 5, 5)).toBe(Infinity)
  })
})
