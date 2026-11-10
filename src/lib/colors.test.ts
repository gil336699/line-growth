import { describe, expect, it } from 'vitest'
import type { Strand } from '../growth/engine'
import { flat } from '../growth/geometry'
import type { Path } from '../growth/seeds'
import { colorAt, GRADIENTS, lineColors } from './colors'
import { drawGrowth } from './render'
import { DEFAULTS, sanitizeSettings, type Settings } from './settings'
import { growthSvg, MAX_PATH_SEGMENTS } from './svgExport'

const box = (x: number, y: number, r = 10): Path => ({ closed: true, points: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]] })
const strandOf = (p: Path): Strand => ({ closed: p.closed, points: flat(p.points) })
const rainbow = GRADIENTS.rainbow
const gradient = (over: Partial<Settings> = {}) => sanitizeSettings({ ...DEFAULTS, colors: 'gradient', fill: true, ...over })

describe('line colours', () => {
  it('blend evenly between the gradient’s stops', () => {
    expect(colorAt(['#000000', '#ffffff'], 0)).toBe('#000000')
    expect(colorAt(['#000000', '#ffffff'], 1)).toBe('#ffffff')
    expect(colorAt(['#000000', '#ffffff'], 0.5)).toBe('#808080')
    expect(colorAt(['#ff0000', '#00ff00', '#0000ff'], 0.25)).toBe('#808000')
    expect(colorAt(rainbow, 0)).toBe(rainbow[0])
  })

  it('run from the first line to the last along the direction', () => {
    const start = [box(150, 50), box(20, 100), box(72, 180)] // right, left, 40 % of the way
    expect(lineColors(gradient(), start, 3)).toEqual([rainbow[rainbow.length - 1], rainbow[0], colorAt(rainbow, 0.4)])
    // 180° runs right to left; 90° top to bottom.
    expect(lineColors(gradient({ gradientAngle: 180 }), start, 3)).toEqual([rainbow[0], rainbow[rainbow.length - 1], colorAt(rainbow, 0.6)])
    const down = lineColors(gradient({ gradientAngle: 90 }), start, 3)!
    expect(down[0]).toBe(rainbow[0])
    expect(down[2]).toBe(rainbow[rainbow.length - 1])
    // Your two colours.
    expect(lineColors(gradient({ gradient: 'custom', gradientFrom: '#102030', gradientTo: '#405060' }), start, 3)).toEqual(['#405060', '#102030', '#233343'])
  })

  it('are off with one colour, and a line with no start line takes the middle colour', () => {
    expect(lineColors(DEFAULTS, [box(10, 10)], 1)).toBeNull()
    expect(lineColors(gradient(), [box(10, 10), box(90, 10)], 3)?.[2]).toBe(colorAt(rainbow, 0.5))
  })
})

describe('line colours in exports', () => {
  const start = [box(30, 50), box(100, 50), box(170, 50)]
  const strands = start.map(strandOf)

  it('write each line, and its fill under the lines, in its own colour in SVG', () => {
    const s = gradient()
    const colors = lineColors(s, start, strands.length)!
    const svg = growthSvg(strands, [], s, colors)
    const fills = [...svg.matchAll(/<path fill="(#[0-9a-f]{6})"/g)].map(m => m[1])
    const strokes = [...svg.matchAll(/<path stroke="(#[0-9a-f]{6})"/g)].map(m => m[1])
    expect(fills).toEqual(colors)
    expect(strokes).toEqual(colors)
    expect(new Set(colors).size).toBe(3)
    expect(svg.indexOf('<g id="fill"')).toBeLessThan(svg.indexOf('<g id="lines"'))
  })

  it('give a line split for Illustrator its colour on the group of its pieces', () => {
    const n = MAX_PATH_SEGMENTS + 10, points = new Float64Array(n * 2)
    for (let i = 0; i < n; i++) { points[i * 2] = 100 + 80 * Math.cos((i / n) * Math.PI * 2); points[i * 2 + 1] = 100 + 80 * Math.sin((i / n) * Math.PI * 2) }
    const svg = growthSvg([{ closed: true, points }], [], gradient({ fill: false }), ['#123456'])
    expect(svg).toMatch(/<g stroke="#123456">\n<path d="M[^"]+"\/>\n<path d="M/)
  })

  it('leave SVG as it was with one colour', () => {
    const s = sanitizeSettings({ ...DEFAULTS, fill: true, showNodes: true })
    const svg = growthSvg(strands, [], s, null)
    expect(svg).toBe(growthSvg(strands, [], s))
    expect(svg).not.toMatch(/<path (fill|stroke)=/)
    expect(svg).not.toMatch(/<g fill="#[0-9a-f]{6}">\n<circle/)
  })

  it('draw each line, fill and node in its own colour in the preview and PNG', () => {
    const calls: string[] = []
    const ctx = new Proxy({ fillStyle: '', strokeStyle: '' } as Record<string, unknown>, {
      get: (t, key: string) => key in t ? t[key] : key === 'fill' ? () => calls.push(`fill ${t.fillStyle}`) : key === 'stroke' ? () => calls.push(`stroke ${t.strokeStyle}`) : () => undefined,
      set: (t, key: string, value) => { t[key] = value; return true },
    }) as unknown as CanvasRenderingContext2D
    const s = gradient({ showBoundary: false, showNodes: true, background: '#ffffff' })
    const colors = ['#aa0000', '#00aa00', '#0000aa']
    drawGrowth(ctx, strands, [], s, { scale: 1, ox: 0, oy: 0, dpr: 1, preview: false, colors })
    // The fills, then the lines over them, then the nodes, each in its line's colour.
    expect(calls).toEqual([...colors.map(c => `fill ${c}`), ...colors.map(c => `stroke ${c}`), ...colors.map(c => `fill ${c}`)])
  })
})

