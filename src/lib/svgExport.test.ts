import { describe, expect, it } from 'vitest'
import type { Strand } from '../growth/engine'
import type { Polygon } from '../growth/geometry'
import { DEFAULTS, sanitizeSettings } from './settings'
import { exportContents, fillPath, growthSvg, MAX_PATH_SEGMENTS, strandPath, strandPaths } from './svgExport'

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
        const line = circle(2 * MAX_PATH_SEGMENTS + 2, closed)
        const pieces = strandPaths(line, smooth)
        expect(pieces).toHaveLength(3)
        for (const d of pieces) expect(anchors(d)).toBeLessThanOrEqual(MAX_PATH_SEGMENTS + 1)
        // Every segment is written once, and each piece starts where the one before ends.
        expect(pieces.reduce((sum, d) => sum + anchors(d) - 1, 0)).toBe(closed ? 2 * MAX_PATH_SEGMENTS + 2 : 2 * MAX_PATH_SEGMENTS + 1)
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
    expect(group?.[1].match(/<path/g)).toHaveLength(3)
    expect(svg.match(/<path/g)).toHaveLength(4)
  })

  // A wavy closed line, so straight edges between its cuts pass both inside and outside it.
  const flower = (n: number): Strand => {
    const points = new Float64Array(n * 2)
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, r = 60 + 30 * Math.sin(t * 7) + 8 * Math.sin(t * 23)
      points[i * 2] = 100 + r * Math.cos(t); points[i * 2 + 1] = 100 + r * Math.sin(t)
    }
    return { closed: true, points }
  }
  // Subpaths of straight segments, each closed as a fill closes it, and the winding number of a point for them.
  const subpathsOf = (d: string) => d.split('M').slice(1).map(sub => (sub.replace(/Z$/, '').match(/-?[\d.]+/g) ?? []).map(Number))
  const winding = (subs: number[][], x: number, y: number) => {
    let w = 0
    for (const v of subs) {
      for (let i = 0; i < v.length; i += 2) {
        const x0 = v[i], y0 = v[i + 1], x1 = v[(i + 2) % v.length], y1 = v[(i + 3) % v.length]
        if ((y0 <= y) === (y1 <= y)) continue
        const side = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)
        if (y0 <= y && side > 0) w++
        else if (y0 > y && side < 0) w--
      }
    }
    return w
  }

  it('fills a closed line too long for one path exactly as the whole line would fill', () => {
    const line = flower(2 * MAX_PATH_SEGMENTS + 1)
    const whole = strandPath(line, false), fill = fillPath(line, false)
    const subpaths = fill.split('M').slice(1)
    expect(subpaths.length).toBeGreaterThan(3)
    for (const sub of subpaths) expect((sub.match(/L/g) ?? []).length).toBeLessThanOrEqual(MAX_PATH_SEGMENTS)
    expect(fill.split('L').length - 1).toBeLessThan(2 * MAX_PATH_SEGMENTS + 1 + subpaths.length * 2) // every node once, plus the cuts
    const wholeSubs = subpathsOf(whole), fillSubs = subpathsOf(fill)
    let inside = 0
    for (let k = 0; k < 1500; k++) {
      const x = 5 + ((k * 7919) % 1900) / 10, y = 5 + ((k * 104729) % 1900) / 10
      const a = winding(wholeSubs, x, y) !== 0, b = winding(fillSubs, x, y) !== 0
      expect(b).toBe(a)
      if (a) inside++
    }
    expect(inside).toBeGreaterThan(250)
    // Within the limit, the fill is the line's own path.
    expect(fillPath(flower(500), true)).toBe(strandPath(flower(500), true))
  })

  it('puts the fill under the lines, for closed lines only, when Fill is on', () => {
    const open = { closed: false, points: new Float64Array([10, 10, 50, 50, 90, 10]) }
    const lines = [flower(MAX_PATH_SEGMENTS + 1), flower(200), open]
    const off = growthSvg(lines, [], { ...DEFAULTS, showBoundary: false })
    expect(off).not.toContain('id="fill"')
    const on = growthSvg(lines, [], { ...DEFAULTS, showBoundary: false, fill: true, fillColor: '#b92d5d' })
    expect(on.indexOf('<g id="fill" fill="#b92d5d"')).toBeGreaterThan(0)
    expect(on.indexOf('id="fill"')).toBeLessThan(on.indexOf('id="lines"'))
    const fills = on.slice(on.indexOf('id="fill"'), on.indexOf('id="lines"'))
    expect(fills.match(/<path/g)).toHaveLength(2) // the open line has no inside
    expect(exportContents({ showBoundary: false, showNodes: false, fill: true })).toEqual(['the lines', 'the fill'])
    // Projects from before Fill open with it off.
    expect(sanitizeSettings({}).fill).toBe(false)
    expect(sanitizeSettings({ fill: true, fillColor: 'pink' }).fillColor).toBe(DEFAULTS.fillColor)
  })

  it('keeps the boundary’s holes clear of the fill, and fills an island in a hole again', () => {
    // A closed line round most of a square boundary, with a hole inside the line, an island in the hole, and a
    // second hole the line runs across, which its own inside decides.
    const square = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    const rings = [square(10, 10, 190, 190), square(60, 60, 120, 120), square(80, 80, 100, 100), square(170, 90, 188, 110)]
    for (const points of [[20, 20, 180, 20, 180, 180, 20, 180], [20, 180, 180, 180, 180, 20, 20, 20]]) {
      const line: Strand = { closed: true, points: new Float64Array(points) }
      const svg = growthSvg([line], rings, { ...DEFAULTS, showBoundary: false, fill: true, smoothCurves: false })
      const subs = subpathsOf(/<g id="fill"[^>]*>\n<path d="([^"]+)"/.exec(svg)![1])
      expect(subs).toHaveLength(3) // the line, the hole and the island
      expect(winding(subs, 40, 40)).not.toBe(0) // inside the line
      expect(winding(subs, 70, 70)).toBe(0) // in the hole
      expect(winding(subs, 90, 90)).not.toBe(0) // on the island
      expect(winding(subs, 100, 195)).toBe(0) // outside the line
    }
    // A boundary without holes leaves the fill as the line's own path.
    const plain = growthSvg([flower(200)], [square(0, 0, 200, 200)], { ...DEFAULTS, showBoundary: false, fill: true })
    expect(plain).toContain(`<path d="${fillPath(flower(200), true)}"/>`)
  })
})
