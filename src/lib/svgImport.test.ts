import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Boundary } from '../growth/boundary'
import { captureDrawing, PICTURE_ONLY, readSvgDrawing, SvgShapeError } from './svgImport'

const fixture = (name: string) => readFileSync(new URL(`../../test-fixtures/${name}`, import.meta.url), 'utf8')
const PT = 25.4 / 72

describe('SVG import', () => {
  it('reads an Illustrator file on its own page, in points', () => {
    const d = readSvgDrawing(fixture('blob-with-seeds.svg'))
    expect(d.units).toBe('illustrator')
    expect(d.width).toBeCloseTo(400 * PT, 6)
    expect(d.height).toBeCloseTo(300 * PT, 6)
    expect(d.paths.map(p => [p.element, p.closed])).toEqual([[0, true], [0, true], [1, false], [2, true], [3, false]])
  })

  it('captures the largest closed path as the boundary, holes and all, and grows the rest', () => {
    const d = readSvgDrawing(fixture('blob-with-seeds.svg'))
    const first = captureDrawing(d)
    const b = new Boundary(first.boundary!)
    const capture = captureDrawing(d, (x, y) => b.contains(x, y))
    expect(capture.boundary).toHaveLength(2)
    expect(capture.grow.map(p => p.closed)).toEqual([false, true])
    expect(capture.outside).toBe(1)
    // The hole stays empty.
    expect(b.contains(280 * PT, 150 * PT)).toBe(false)
    expect(b.contains(200 * PT, 150 * PT)).toBe(true)
  })

  it('reads Gil’s pill outlines, and without closed paths leaves the boundary to the sheet', () => {
    const pill = readSvgDrawing(fixture('pill-with-hole.svg'))
    expect(pill.width).toBeCloseTo(840.08 * PT, 4)
    const c = captureDrawing(pill)
    expect(c.boundary).toHaveLength(2)
    expect(c.grow).toHaveLength(0)
    const lines = readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><polyline points="10 10 40 30 60 10"/></svg>')
    expect(lines.width).toBe(100)
    expect(captureDrawing(lines)).toEqual({ boundary: null, grow: [{ closed: false, points: [[10, 10], [40, 30], [60, 10]] }], outside: 0 })
  })

  it('reads a picture’s outline from the clipping mask that trims it, as Illustrator exports one', () => {
    // Gil’s JHU ICE asset: a picture of the page with a ticket-shaped window, clipped to that outline by a class.
    const ticket = 'M243,425.6c0,2.49-2.01,4.5-4.5,4.5-7.44,0-13.5,6.06-13.5,13.5,0,2.49-2.01,4.5-4.5,4.5H92c-2.49,0-4.5-2.01-4.5-4.5,'
      + '0-7.44-6.06-13.5-13.5-13.5-2.49,0-4.5-2.01-4.5-4.5v-152.04c0-2.49,2.01-4.5,4.5-4.5,7.44,0,13.5-6.06,13.5-13.5,0-2.49,2.01-4.5,'
      + '4.5-4.5h128.5c2.49,0,4.5,2.01,4.5,4.5,0,7.44,6.06,13.5,13.5,13.5,2.49,0,4.5,2.01,4.5,4.5v152.04Z'
    const asset = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 688 868">
  <defs><style>
      .cls-1 { fill: none; }

      .cls-2 { clip-path: url(#clippath); }
    </style>
    <clipPath id="clippath"><path class="cls-1" d="M2,2v864h684V2H2Z${ticket}"/></clipPath></defs>
  <g id="Layer_1-2" data-name="Layer 1"><g class="cls-2">
    <image width="688" height="868" xlink:href="data:image/png;base64,iVBORw0KGgo="/>
  </g></g>
</svg>`
    const d = readSvgDrawing(asset)
    expect(d.fromClip).toBe(true)
    expect(d.units).toBe('illustrator')
    expect(d.width).toBeCloseTo(688 * PT, 6)
    expect(d.paths.map(p => [p.element, p.closed])).toEqual([[0, true], [0, true]])
    const c = captureDrawing(d)
    expect(c.boundary).toHaveLength(2)
    expect(c.grow).toHaveLength(0)
    const b = new Boundary(c.boundary!)
    expect(b.contains(400 * PT, 600 * PT)).toBe(true)
    expect(b.contains(150 * PT, 350 * PT)).toBe(false) // inside the ticket window
  })

  it('places a clipping mask in the space of whatever uses it', () => {
    const svg = (use: string) => readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <defs><clipPath id="c" transform="translate(5 0)"><path d="M0 0H10V10H0"/></clipPath></defs>
      <g transform="translate(20 30)"><image ${use} width="50" height="50" href="a.png"/></g></svg>`).paths
    const placed = [{ closed: true, points: [[25, 30], [35, 30], [35, 40], [25, 40]], element: 0 }]
    expect(svg('clip-path="url(#c)"')).toEqual(placed)
    expect(svg('style="opacity:.5; clip-path: url(\'#c\')"')).toEqual(placed)
    // Used twice in the same place, it's still one outline.
    expect(svg('clip-path="url(#c)"/><image clip-path="url(#c)"')).toEqual(placed)
  })

  it('prefers shapes to clipping masks, and says when a file is only a picture', () => {
    const both = readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs>
      <image clip-path="url(#c)" width="50" height="50" href="a.png"/><circle cx="50" cy="50" r="20"/></svg>`)
    expect(both.fromClip).toBe(false)
    expect(both.paths).toHaveLength(1)
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image width="10" height="10" href="a.png"/></svg>')).toThrow(PICTURE_ONLY)
    // A clip sized to whatever uses it has no outline of its own.
    expect(() => readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath>
      <image clip-path="url(#c)" width="10" height="10" href="a.png"/></svg>`)).toThrow('only a picture')
  })

  it('explains files it can’t use', () => {
    expect(() => readSvgDrawing('hello')).toThrow(SvgShapeError)
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>hi</text></svg>')).toThrow('no paths or shapes')
    // Cut short by a failed download: its paths are broken, so it says so instead of using what's there.
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 0 L10 10Z"/><path d="M0 0 L10')).toThrow('cut short')
  })
})
