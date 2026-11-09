import { describe, expect, it } from 'vitest'
import type { Strand } from '../growth/engine'
import { DEFAULTS } from './settings'
import { growthSvg, MAX_PATH_SEGMENTS, strandPath, strandPaths } from './svgExport'

const circle = (n: number, closed = true): Strand => {
  const points = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) { points[i * 2] = 100 + 80 * Math.cos((i / n) * Math.PI * 2); points[i * 2 + 1] = 100 + 80 * Math.sin((i / n) * Math.PI * 2) }
  return { closed, points }
}
const anchors = (d: string) => (d.match(/[ML]|C/g) ?? []).length
const ends = (d: string) => { const m = /(-?[\d.]+) (-?[\d.]+)Z?$/.exec(d)!; return `${m[1]} ${m[2]}` }
const start = (d: string) => /^M(-?[\d.]+ -?[\d.]+)/.exec(d)![1]

describe('SVG export', () => {
  it('writes an ordinary line as one path, as before', () => {
    const line = circle(MAX_PATH_SEGMENTS)
    expect(strandPaths(line, true)).toEqual([strandPath(line, true)])
    expect(strandPath(line, true).endsWith('Z')).toBe(true)
  })

  it('splits a line too long for Illustrator into pieces that meet end to end', () => {
    for (const smooth of [true, false]) {
      for (const closed of [true, false]) {
        const line = circle(25_001, closed)
        const pieces = strandPaths(line, smooth)
        expect(pieces).toHaveLength(3)
        for (const d of pieces) expect(anchors(d)).toBeLessThanOrEqual(MAX_PATH_SEGMENTS + 1)
        // Every segment is written once, and each piece starts where the one before ends.
        expect(pieces.reduce((sum, d) => sum + anchors(d) - 1, 0)).toBe(closed ? 25_001 : 25_000)
        for (let i = 1; i < pieces.length; i++) expect(start(pieces[i])).toBe(ends(pieces[i - 1]))
        expect(start(pieces[0])).toBe(start(strandPath(line, smooth)))
        // A closed line comes back to its start; an open one ends at its last node.
        expect(ends(pieces[2])).toBe(closed ? start(pieces[0]) : ends(strandPath(line, smooth)))
        if (smooth) {
          // The curves are the whole line's curves, cut between segments.
          const whole = strandPath(line, true).replace(/Z$/, '').split('C').slice(1)
          expect(pieces.flatMap(d => d.split('C').slice(1))).toEqual(whole)
        }
      }
    }
  })

  it('groups a split line’s pieces, so it selects as one line in Illustrator', () => {
    const svg = growthSvg([circle(83_143), circle(100)], [], { ...DEFAULTS, showBoundary: false })
    const group = /<g>\n((?:<path d="[^"]+"\/>\n)+)<\/g>/.exec(svg)
    expect(group?.[1].match(/<path/g)).toHaveLength(9)
    expect(svg.match(/<path/g)).toHaveLength(10)
  })
})
