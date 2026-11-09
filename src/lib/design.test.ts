import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { autoTune } from '../growth/autotune'
import { Boundary } from '../growth/boundary'
import { Grower } from '../growth/engine'
import { startPaths } from '../growth/seeds'
import { addLine, boundaryOfDesign, freshDesign, growthParams, planChange, removeLine, resetState, type Design } from './design'
import { growthDxf, LAYER_BOUNDARY, LAYER_LINES, LAYER_NODES } from './dxfExport'
import { parseProject, ProjectError, serializeProject } from './project'
import { DEFAULTS, sanitizeSettings } from './settings'
import { smoothSegments } from './smooth'
import { captureDrawing, readSvgDrawing } from './svgImport'
import { growthSvg } from './svgExport'

const grow = (d: Design, steps: number): Design => {
  const g = new Grower(d.state.strands.map(s => ({ closed: s.closed, points: s.points.slice() })), d.state.step, growthParams(d.settings), boundaryOfDesign(d))
  for (let i = 0; i < steps; i++) g.stepOnce()
  return { ...d, state: { strands: g.strands, step: g.step } }
}

describe('auto tune', () => {
  it('picks the Illustrator panel’s values, scaled to the sheet', () => {
    // A 1,200-unit square captured with a 600-unit open line: the panel's own space, so no scaling.
    const t = autoTune([0, 0, 1200, 1200], 600, 4800, false)
    expect(t.segmentLength).toBeCloseTo(1200 / 72, 9)
    expect(t.repelRadius).toBeCloseTo((1200 / 72) * 2.6, 9)
    expect(t.maxNodes).toBe(2160)
    expect(t.stepsPerFrame).toBe(2)
    // The same drawing at a tenth of the size tunes to a tenth of the lengths and the same strengths.
    const small = autoTune([0, 0, 120, 120], 60, 480, false)
    expect(small.segmentLength).toBeCloseTo(t.segmentLength / 10, 9)
    expect(small.stepSize).toBeCloseTo(t.stepSize / 10, 9)
    expect(small.repulsion).toBeCloseTo(t.repulsion, 12)
    expect(small.maxNodes).toBe(t.maxNodes)
  })
})

describe('auto tune and max nodes', () => {
  it('scales the lengths to a hand-set Max nodes: four times the nodes, half the spacing, the same forces', () => {
    const d = freshDesign(DEFAULTS)
    const s0 = d.settings
    const { design, discards } = planChange(d, { maxNodes: s0.maxNodes * 4 })
    const s = design.settings
    expect(discards).toBe(false)
    expect(design.state).toBe(d.state)
    expect(s.autoNodes).toBe(false)
    expect(s.maxNodes).toBe(s0.maxNodes * 4)
    for (const k of ['segmentLength', 'repelRadius', 'stepSize', 'lineWidth'] as const) expect(s[k]).toBeCloseTo(s0[k] / 2, 6)
    for (const k of ['repulsion', 'alignment', 'attraction', 'stepsPerFrame'] as const) expect(s[k]).toBe(s0[k])
  })

  it('keeps a hand-set Max nodes through a new shape, and gives it back to Auto tune when Auto tune is turned on again', () => {
    const fine = planChange(freshDesign(DEFAULTS), { maxNodes: 9000 }).design
    const rect = planChange(fine, { shape: 'rect' }).design
    expect(rect.settings.maxNodes).toBe(9000)
    // The panel's rectangle tuning, scaled to 9,000 nodes.
    const panel = planChange(freshDesign(DEFAULTS), { shape: 'rect' }).design.settings
    expect(rect.settings.segmentLength).toBeCloseTo(panel.segmentLength * Math.sqrt(panel.maxNodes / 9000), 6)
    const off = planChange(rect, { autoTune: false }).design
    const on = planChange(off, { autoTune: true }).design
    expect(on.settings.autoNodes).toBe(true)
    expect(on.settings.maxNodes).toBe(panel.maxNodes)
    expect(on.settings.segmentLength).toBeCloseTo(panel.segmentLength, 6)
  })

  it('only caps the nodes below Auto tune’s own choice, as before', () => {
    const d = freshDesign(DEFAULTS)
    const s = planChange(d, { maxNodes: 400 }).design.settings
    expect(s.maxNodes).toBe(400)
    expect(s.segmentLength).toBe(d.settings.segmentLength)
  })

  it('leaves the lengths alone when Auto tune is off', () => {
    const manual = planChange(freshDesign(DEFAULTS), { autoTune: false }).design
    const s = planChange(manual, { maxNodes: 9000 }).design.settings
    expect(s.maxNodes).toBe(9000)
    expect(s.segmentLength).toBe(manual.settings.segmentLength)
  })

  it('opens old projects with Auto tune choosing Max nodes', () => {
    const { autoNodes, ...old } = DEFAULTS
    expect(autoNodes).toBe(true)
    expect(sanitizeSettings(old).autoNodes).toBe(true)
  })

  it('lets lines use the nodes: at four times Max nodes, the default circle fills with about four times as many', () => {
    const run = (d: Design) => {
      const g = new Grower(d.state.strands.map(s => ({ ...s, points: s.points.slice() })), 0, growthParams(d.settings), boundaryOfDesign(d))
      while (!g.filled && !g.settling && g.step < 6000) g.stepOnce()
      return g.nodes
    }
    const base = planChange(freshDesign(DEFAULTS), { maxNodes: 4000 }).design
    const fine = planChange(base, { maxNodes: 16000 }).design
    const a = run(base), b = run(fine)
    expect(b / a).toBeGreaterThan(3.3)
  }, 60_000)
})

describe('start shapes', () => {
  const b = new Boundary(boundaryOfDesign({ settings: DEFAULTS, imported: null }).rings)
  it('makes every start shape inside the boundary', () => {
    for (const kind of ['circle', 'line', 'circles', 'outline'] as const) {
      const paths = startPaths(kind, b, 20, 6, 3)
      expect(paths.length, kind).toBeGreaterThan(0)
      for (const p of paths) for (const [x, y] of p.points) expect(b.contains(x, y), kind).toBe(true)
    }
    expect(startPaths('circles', b, 10, 6, 3)).toHaveLength(6)
  })

  it('finds room beside a hole in the middle of the shape', () => {
    const pill = readSvgDrawing(readFileSync(new URL('../../test-fixtures/pill-with-hole.svg', import.meta.url), 'utf8'))
    const holed = new Boundary(captureDrawing(pill).boundary!)
    const [circle] = startPaths('circle', holed, 15, 1, 1)
    for (const [x, y] of circle.points) expect(holed.contains(x, y)).toBe(true)
  })
})

describe('changes', () => {
  const grown = grow(freshDesign(DEFAULTS), 150)

  it('carries grown lines along when the sheet is resized, and starts again for a new shape', () => {
    const resized = planChange(grown, { width: 300 })
    expect(resized.discards).toBe(false)
    expect(resized.design.state.step).toBe(150)
    const b = boundaryOfDesign(resized.design)
    // Every node is inside the new boundary, or on its edge.
    for (const s of resized.design.state.strands) for (let i = 0; i < s.points.length; i += 2) {
      const [x, y] = [s.points[i], s.points[i + 1]], [px, py] = b.closest(x, y)
      expect(b.contains(x, y) || Math.hypot(px - x, py - y) < 1e-9).toBe(true)
    }
    expect(Math.max(...resized.design.state.strands[0].points.filter((_, i) => i % 2 === 0))).toBeGreaterThan(Math.max(...grown.state.strands[0].points.filter((_, i) => i % 2 === 0)))
    const reshaped = planChange(grown, { shape: 'rect' })
    expect(reshaped.discards).toBe(true)
    expect(reshaped.design.state.step).toBe(0)
    expect(planChange(grown, { start: 'line' }).discards).toBe(true)
    // Forces and style apply to the grown lines as they are.
    const stronger = planChange(grown, { repulsion: 2, lineColor: '#ff0000' })
    expect(stronger.design.state).toBe(grown.state)
    expect(stronger.discards).toBe(false)
  })

  it('re-tunes for a new boundary only while Auto tune is on', () => {
    const tuned = planChange(freshDesign(DEFAULTS), { width: 400, height: 400 }).design.settings
    // The panel's rule: a 72nd of the larger side, here the 390 mm boundary inside a 5 mm margin.
    expect(tuned.segmentLength).toBeCloseTo(390 / 72, 3)
    const manual = planChange(freshDesign({ ...DEFAULTS, autoTune: false, segmentLength: 3 }), { width: 400, height: 400 })
    expect(manual.design.settings.segmentLength).toBe(3)
    // Turning it back on tunes straight away and keeps the lines.
    const on = planChange(manual.design, { autoTune: true })
    expect(on.design.settings.segmentLength).toBeCloseTo(390 / 72, 3)
    expect(on.design.state).toBe(manual.design.state)
  })

  it('adds drawn lines to the start and the growth, and erases them from both', () => {
    const drawn = addLine(grown, { closed: false, points: [[50, 150], [150, 150]] })
    expect(drawn.settings.start).toBe('custom')
    expect(drawn.custom).toHaveLength(2)
    expect(drawn.state.strands).toHaveLength(2)
    expect(drawn.state.strands[0]).toBe(grown.state.strands[0])
    const erased = removeLine(drawn, 0)
    expect(erased.custom).toHaveLength(1)
    expect(erased.state.strands).toHaveLength(1)
    expect(resetState(erased).strands).toHaveLength(1)
  })
})

describe('project files', () => {
  it('reopen a design exactly, and it keeps growing the same way', () => {
    const d = grow(freshDesign({ ...DEFAULTS, randomness: 0.4, seed: 9 }), 120)
    const back = parseProject(serializeProject(d))
    expect(back.settings).toEqual(d.settings)
    expect(back.state.step).toBe(120)
    expect(grow(back, 80).state.strands.map(s => Array.from(s.points))).toEqual(grow(d, 80).state.strands.map(s => Array.from(s.points)))
  })

  it('keep an imported boundary and drawn start lines', () => {
    const drawing = readSvgDrawing(readFileSync(new URL('../../test-fixtures/blob-with-seeds.svg', import.meta.url), 'utf8'))
    const capture = captureDrawing(drawing)
    const imported = { name: 'blob.svg', sized: drawing.units, width: drawing.width, height: drawing.height, rings: capture.boundary! }
    const d = freshDesign(sanitizeSettings({ ...DEFAULTS, width: drawing.width, height: drawing.height, shape: 'imported', start: 'custom' }), imported, capture.grow.slice(0, 2))
    const back = parseProject(serializeProject(d))
    expect(back.imported?.rings).toEqual(imported.rings)
    expect(back.custom).toHaveLength(2)
    expect(back.settings.shape).toBe('imported')
  })

  it('explain files they can’t open', () => {
    expect(() => parseProject('nope')).toThrow(ProjectError)
    expect(() => parseProject('{"schema":"voronoi-studio/project","version":2}')).toThrow('not a Line Growth project')
    expect(() => parseProject('{"schema":"line-growth/project","version":99}')).toThrow('newer version')
    expect(() => parseProject('{"schema":"line-growth/project","version":1,"growth":{"lines":[{"points":[1,"x"]}]}}')).toThrow('damaged')
    // A file without growth starts from its start lines; unknown settings take their defaults.
    const bare = parseProject('{"schema":"line-growth/project","version":1,"settings":{"width":120,"shape":"hexagon"}}')
    expect(bare.settings.width).toBe(120)
    expect(bare.settings.shape).toBe(DEFAULTS.shape)
    expect(bare.state.strands.length).toBeGreaterThan(0)
  })
})

describe('exports', () => {
  const d = grow(freshDesign(DEFAULTS), 60)
  const rings = boundaryOfDesign(d).rings

  it('write SVG at real size with what the view shows', () => {
    const lines = growthSvg(d.state.strands, rings, { ...d.settings, showBoundary: false, showNodes: false })
    expect(lines).toContain('width="200mm" height="200mm" viewBox="0 0 200 200"')
    expect([...lines.matchAll(/<g id="([^"]+)"/g)].map(m => m[1])).toEqual(['lines'])
    const all = growthSvg(d.state.strands, rings, { ...d.settings, showBoundary: true, showNodes: true })
    expect([...all.matchAll(/<g id="([^"]+)"/g)].map(m => m[1])).toEqual(['boundary', 'lines', 'nodes'])
    expect(all.match(/<circle /g)).toHaveLength(d.state.strands[0].points.length / 2)
    expect(growthSvg(d.state.strands, rings, { ...d.settings, units: 'pt' })).toContain('width="566.929pt"')
  })

  it('draws smooth curves through every node', () => {
    const strand = d.state.strands[0]
    const segments = smoothSegments(strand)
    expect(segments).toHaveLength(strand.points.length / 2)
    segments.forEach(([, , , , x, y], i) => {
      const j = (i + 1) % (strand.points.length / 2)
      expect(x).toBe(strand.points[j * 2]); expect(y).toBe(strand.points[j * 2 + 1])
    })
  })

  it('writes DXF polylines on their layers, y up', () => {
    const dxf = growthDxf(d.state.strands, rings, { ...d.settings, showBoundary: true, showNodes: true })
    const lines = dxf.trimEnd().split('\n')
    expect(lines.slice(0, 2)).toEqual(['0', 'SECTION'])
    expect(lines.slice(-2)).toEqual(['0', 'EOF'])
    expect(dxf.match(/\nPOLYLINE\n/g)).toHaveLength(2)
    for (const layer of [LAYER_LINES, LAYER_BOUNDARY, LAYER_NODES]) expect(dxf).toContain(`\n2\n${layer}\n`)
    // The first node, flipped.
    const [x, y] = [d.state.strands[0].points[0], d.state.strands[0].points[1]]
    expect(dxf).toContain(`\n10\n${Number(x.toFixed(4))}\n20\n${Number((200 - y).toFixed(4))}\n`)
  })
})
