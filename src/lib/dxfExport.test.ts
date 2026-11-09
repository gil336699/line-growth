import { describe, expect, it } from 'vitest'
import type { Strand } from '../growth/engine'
import { growthDxf } from './dxfExport'
import { MAX_PATH_SEGMENTS } from './pieces'
import { DEFAULTS } from './settings'

const ring = (n: number): Strand => {
  const points = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) { points[i * 2] = 100 + 80 * Math.cos((i / n) * Math.PI * 2); points[i * 2 + 1] = 100 + 80 * Math.sin((i / n) * Math.PI * 2) }
  return { closed: true, points }
}
// Each POLYLINE's closed flag and vertices, read back from the DXF text.
function polylines(dxf: string) {
  const t = dxf.split('\n'), out: { closed: boolean; v: string[] }[] = []
  let entity = ''
  for (let i = 0; i + 1 < t.length; i += 2) {
    const code = t[i], value = t[i + 1]
    if (code === '0') { entity = value; if (value === 'POLYLINE') out.push({ closed: false, v: [] }) }
    else if (entity === 'POLYLINE' && code === '70') out[out.length - 1].closed = value === '1'
    else if (entity === 'VERTEX' && code === '10') out[out.length - 1].v.push(value)
    else if (entity === 'VERTEX' && code === '20') out[out.length - 1].v[out[out.length - 1].v.length - 1] += ` ${value}`
  }
  return out
}

describe('DXF export', () => {
  const s = { ...DEFAULTS, showBoundary: false }

  it('writes a line within Illustrator’s limit as one closed polyline', () => {
    const p = polylines(growthDxf([ring(MAX_PATH_SEGMENTS)], [], s))
    expect(p).toHaveLength(1)
    expect(p[0].closed).toBe(true)
    expect(p[0].v).toHaveLength(MAX_PATH_SEGMENTS)
  })

  it('writes a longer line as polylines that meet end to end and come back to the start', () => {
    const n = 2 * MAX_PATH_SEGMENTS + 2
    const p = polylines(growthDxf([ring(n)], [], s))
    expect(p).toHaveLength(3)
    for (const piece of p) { expect(piece.closed).toBe(false); expect(piece.v.length).toBeLessThanOrEqual(MAX_PATH_SEGMENTS + 1) }
    for (let i = 1; i < p.length; i++) expect(p[i].v[0]).toBe(p[i - 1].v[p[i - 1].v.length - 1])
    expect(p[2].v[p[2].v.length - 1]).toBe(p[0].v[0])
    expect(p.reduce((sum, piece) => sum + piece.v.length - 1, 0)).toBe(n) // every segment once
  })
})
