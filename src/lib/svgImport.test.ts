import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Boundary } from '../growth/boundary'
import { captureDrawing, readSvgDrawing, SvgShapeError } from './svgImport'

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

  it('explains files it can’t use', () => {
    expect(() => readSvgDrawing('hello')).toThrow(SvgShapeError)
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>hi</text></svg>')).toThrow('no paths or shapes')
    // Cut short by a failed download: its paths are broken, so it says so instead of using what's there.
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 0 L10 10Z"/><path d="M0 0 L10')).toThrow('cut short')
  })
})
