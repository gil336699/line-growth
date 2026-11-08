import { describe, expect, it } from 'vitest'
import { Boundary } from './boundary'
import { Grower, nodeCount, shareBudget, subdivide, type GrowthParams, type Strand } from './engine'
import { ellipseRing, flat, resample, type Polygon, type Vec } from './geometry'

// ---------- The Illustrator panel's step, copied from cep-extension/js/main.js as a reference ----------
type OldNode = { x: number; y: number }
type OldStrand = { closed: boolean; nodes: OldNode[] }
type OldParams = { target: number; repelRadius: number; repulsion: number; attraction: number; alignment: number; stepSize: number; maxNodes: number }

function oldSubdivide(strands: OldStrand[], p: OldParams) {
  const all = () => strands.reduce((n, s) => n + s.nodes.length, 0)
  const splitLength = p.target * 1.25
  let remaining = p.maxNodes - all()
  if (remaining <= 0 || all() < 2) return
  let inserted = true
  while (remaining > 0 && inserted) {
    inserted = false
    for (let s = 0; s < strands.length && remaining > 0; s++) {
      const strand = strands[s], nodes = strand.nodes
      if (nodes.length < 2) continue
      const next: OldNode[] = []
      let didInsert = false
      const count = strand.closed ? nodes.length : nodes.length - 1
      for (let i = 0; i < count; i++) {
        const a = nodes[i], b = nodes[(i + 1) % nodes.length]
        next.push(a)
        if (!didInsert && Math.hypot(a.x - b.x, a.y - b.y) > splitLength) {
          next.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
          didInsert = true; inserted = true; remaining--
        }
      }
      if (!strand.closed) next.push(nodes[nodes.length - 1])
      if (didInsert) strand.nodes = next
    }
  }
}

function oldStep(strands: OldStrand[], boundary: Vec[], p: OldParams) {
  oldSubdivide(strands, p)
  const nodes = strands.flatMap(s => s.nodes)
  const repellers = resample(boundary, true, Math.max(Math.min(Math.max(1, p.target), 40), 0)).map(([x, y]) => ({ x, y }))
  const moves: { node: OldNode; x: number; y: number }[] = []
  for (const strand of strands) {
    const sn = strand.nodes, closed = strand.closed
    for (let i = 0; i < sn.length; i++) {
      const node = sn[i]
      let fx = 0, fy = 0, efx = 0, efy = 0
      for (const other of nodes) {
        if (node === other) continue
        const dx = node.x - other.x, dy = node.y - other.y
        const d = Math.sqrt(dx * dx + dy * dy) || 0.000001
        if (d < p.repelRadius) { const st = (1 - d / p.repelRadius) * p.repulsion; fx += (dx / d) * st; fy += (dy / d) * st }
      }
      for (const r of repellers) {
        const dx = node.x - r.x, dy = node.y - r.y
        const d = Math.sqrt(dx * dx + dy * dy) || 0.000001
        if (d < p.repelRadius) { const st = (1 - d / p.repelRadius) * p.repulsion * 2; efx += (dx / d) * st; efy += (dy / d) * st }
      }
      const prev = sn[i === 0 ? (closed ? sn.length - 1 : 0) : i - 1]
      const next = sn[i === sn.length - 1 ? (closed ? 0 : sn.length - 1) : i + 1]
      for (const nb of [prev, next]) {
        if (nb === node) continue
        const dx = nb.x - node.x, dy = nb.y - node.y
        const d = Math.sqrt(dx * dx + dy * dy) || 0.000001
        const pull = (d - p.target) * p.attraction / p.target
        fx += (dx / d) * pull; fy += (dy / d) * pull
      }
      if (prev !== node && next !== node) {
        fx += ((prev.x + next.x) / 2 - node.x) * p.alignment / Math.max(p.target, 1)
        fy += ((prev.y + next.y) / 2 - node.y) * p.alignment / Math.max(p.target, 1)
      }
      if (!closed && (i === 0 || i === sn.length - 1)) { fx *= 0.15; fy *= 0.15 }
      moves.push({ node, x: (fx + efx) * p.stepSize, y: (fy + efy) * p.stepSize })
    }
  }
  const inside = (x: number, y: number) => {
    let c = false
    for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
      const [xi, yi] = boundary[i], [xj, yj] = boundary[j]
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 0.000001) + xi) c = !c
    }
    return c
  }
  for (const m of moves) {
    let x = m.node.x + m.x, y = m.node.y + m.y
    if (!inside(x, y)) {
      let best = Infinity, bx = x, by = y
      for (let i = 0; i < boundary.length; i++) {
        const [ax, ay] = boundary[i], [cx, cy] = boundary[(i + 1) % boundary.length]
        const dx = cx - ax, dy = cy - ay
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 0.000001)))
        const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(qx - x, qy - y)
        if (d < best) { best = d; bx = qx; by = qy }
      }
      x = bx; y = by
    }
    m.node.x = x; m.node.y = y
  }
}
// -------------------------------------------------------------------------------------------------------

const params = (over: Partial<GrowthParams> = {}): GrowthParams => ({
  maxNodes: 400, segmentLength: 7, repelRadius: 18, repulsion: 0.75, alignment: 0.35, attraction: 0.32,
  stepSize: 0.65, randomness: 0, seed: 1, ...over,
})
const square: Polygon = [[0, 0], [300, 0], [300, 300], [0, 300]]
const circle = (cx: number, cy: number, r: number, n = 24): Vec[] =>
  Array.from({ length: n }, (_, i): Vec => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)])
const toStrand = (points: Vec[], closed: boolean): Strand => ({ closed, points: flat(points) })

// Places where lines cross each other or themselves (edges sharing a node don't count). Brute force with a box test.
function crossings(strands: Strand[]): number {
  const e: number[][] = []
  strands.forEach((s, k) => { const n = s.points.length / 2; for (let i = 0; i < (s.closed ? n : n - 1); i++) { const j = (i + 1) % n; e.push([s.points[i * 2], s.points[i * 2 + 1], s.points[j * 2], s.points[j * 2 + 1], k, i, j]) } })
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  let count = 0
  for (let a = 0; a < e.length; a++) for (let b = a + 1; b < e.length; b++) {
    const p = e[a], q = e[b]
    if (p[4] === q[4] && (p[5] === q[5] || p[5] === q[6] || p[6] === q[5] || p[6] === q[6])) continue
    if (Math.max(p[0], p[2]) < Math.min(q[0], q[2]) || Math.max(q[0], q[2]) < Math.min(p[0], p[2]) || Math.max(p[1], p[3]) < Math.min(q[1], q[3]) || Math.max(q[1], q[3]) < Math.min(p[1], p[3])) continue
    if (o(p[0], p[1], p[2], p[3], q[0], q[1]) * o(p[0], p[1], p[2], p[3], q[2], q[3]) < 0 && o(q[0], q[1], q[2], q[3], p[0], p[1]) * o(q[0], q[1], q[2], q[3], p[2], p[3]) < 0) count++
  }
  return count
}

describe('resample', () => {
  it('spaces points evenly and keeps an open path\'s end', () => {
    const open = resample([[0, 0], [10, 0], [10, 10]], false, 3)
    expect(open[0]).toEqual([0, 0])
    expect(open[open.length - 1]).toEqual([10, 10])
    // Every 3 mm along the path, round the corner: 0, 3, 6, 9 on the first side, then 2, 5, 8 up the second.
    expect(open.map(([x, y]) => [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9])).toEqual([[0, 0], [3, 0], [6, 0], [9, 0], [10, 2], [10, 5], [10, 8], [10, 10]])
    const closed = resample(circle(0, 0, 10, 64), true, 2)
    expect(closed.length).toBe(31)
  })
})

describe('splitting edges', () => {
  it('shares a short budget one node at a time, in strand order', () => {
    expect(shareBudget([5, 1, 5], 100)).toEqual([5, 1, 5])
    expect(shareBudget([5, 1, 5], 6)).toEqual([3, 1, 2])
    expect(shareBudget([5, 1, 5], 7)).toEqual([3, 1, 3])
    expect(shareBudget([0, 4], 2)).toEqual([0, 2])
  })

  it('splits the same edges as the panel, whatever the budget', () => {
    for (const maxNodes of [30, 41, 57, 200]) {
      const shapes: [Vec[], boolean][] = [[circle(100, 100, 30, 8), true], [[[10, 10], [80, 15], [90, 70]], false], [circle(200, 200, 12, 5), true]]
      const old: OldStrand[] = shapes.map(([pts, closed]) => ({ closed, nodes: pts.map(([x, y]) => ({ x, y })) }))
      const mine = shapes.map(([pts, closed]) => toStrand(pts, closed))
      oldSubdivide(old, { ...params(), target: 7, maxNodes })
      subdivide(mine, params({ maxNodes }), 0)
      expect(mine.map(s => Array.from(s.points))).toEqual(old.map(s => s.nodes.flatMap(n => [n.x, n.y])))
    }
  })
})

describe('growth step', () => {
  it('matches the Illustrator panel step for step', () => {
    const seeds: [Vec[], boolean][] = [[resample(circle(150, 150, 25, 48), true, 7 * 1.35), true], [[[40, 60], [70, 50], [90, 80]], false]]
    const old: OldStrand[] = seeds.map(([pts, closed]) => ({ closed, nodes: pts.map(([x, y]) => ({ x, y })) }))
    const grower = new Grower(seeds.map(([pts, closed]) => toStrand(pts, closed)), 0, params(), new Boundary([square]))
    const p: OldParams = { target: 7, repelRadius: 18, repulsion: 0.75, attraction: 0.32, alignment: 0.35, stepSize: 0.65, maxNodes: 400 }
    for (let step = 0; step < 80; step++) { oldStep(old, square, p); grower.stepOnce() }
    const theirs = old.flatMap(s => s.nodes.flatMap(n => [n.x, n.y]))
    const ours = grower.strands.flatMap(s => Array.from(s.points))
    expect(ours.length).toBe(theirs.length)
    expect(ours.length / 2).toBeGreaterThan(150)
    let worst = 0
    for (let i = 0; i < ours.length; i++) worst = Math.max(worst, Math.abs(ours[i] - theirs[i]))
    expect(worst).toBeLessThan(1e-6)
  })

  it('keeps every node inside the shape and out of its holes', () => {
    const hole = ellipseRing(150, 150, 40, 40, 0.01)
    const b = new Boundary([square, hole])
    const grower = new Grower([toStrand(resample(circle(60, 60, 20, 32), true, 9), true)], 0, params({ maxNodes: 1500, randomness: 0.4 }), b)
    for (let i = 0; i < 600; i++) grower.stepOnce()
    expect(grower.nodes).toBeGreaterThan(800)
    for (const s of grower.strands) for (let i = 0; i < s.points.length; i += 2) {
      const x = s.points[i], y = s.points[i + 1]
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(300 + 1e-9)
      expect(Math.hypot(x - 150, y - 150)).toBeGreaterThan(40 - 0.02)
    }
  })

  it('never lets lines cross, where the panel\u2019s rules alone would', () => {
    // A start circle many segment lengths across buckles all at once; without the check, lines crossed by step 100.
    const disc = ellipseRing(100, 100, 95, 95, 0.01)
    for (const randomness of [0.25, 0]) {
      const g = new Grower([toStrand(resample(circle(100, 100, 14.25, 200), true, 1.08), true)], 0,
        params({ maxNodes: 4000, segmentLength: 0.8, repelRadius: 2.08, stepSize: 0.072, repulsion: 0.95, attraction: 0.47, alignment: 0.48, randomness }), new Boundary([disc]))
      let held = 0
      for (let i = 0; i < 110; i++) { g.stepOnce(); held += g.held }
      expect(crossings(g.strands)).toBe(0)
      expect(held).toBeGreaterThan(0)
    }
  })

  it('lets lines that already cross move, rather than freezing them there', () => {
    // Two lines laid across each other, as an imported drawing can have. Holding back every node of the two
    // crossing edges would pin them in place for good.
    const across = toStrand(Array.from({ length: 21 }, (_, i): Vec => [100 + i * 5, 150]), false)
    const down = toStrand(Array.from({ length: 21 }, (_, i): Vec => [152, 102.5 + i * 5]), false)
    const g = new Grower([across, down], 0, params({ randomness: 0 }), new Boundary([square]))
    const before = g.strands.map(s => s.points.slice())
    g.stepOnce()
    expect(g.held).toBe(0)
    // The nodes either side of the crossing at (152, 150) still move.
    const moved = (s: number, k: number) => Math.hypot(g.strands[s].points[k * 2] - before[s][k * 2], g.strands[s].points[k * 2 + 1] - before[s][k * 2 + 1])
    const nodeAt = (s: number, x: number, y: number) => Array.from({ length: g.strands[s].points.length / 2 }, (_, k) => k)
      .find(k => before[s][k * 2] === x && before[s][k * 2 + 1] === y)!
    for (const [s, x, y] of [[0, 150, 150], [0, 155, 150], [1, 152, 147.5], [1, 152, 152.5]]) expect(moved(s, nodeAt(s, x, y))).toBeGreaterThan(0)
  })

  it('says when lines have filled the boundary below the node limit, until a smaller segment length makes room', () => {
    const small: Polygon = [[0, 0], [60, 0], [60, 60], [0, 60]]
    const g = new Grower([toStrand(resample(circle(30, 30, 6, 24), true, 9), true)], 0, params({ maxNodes: 5000 }), new Boundary([small]))
    let steps = 0
    while (!g.filled && steps < 3000) { g.stepOnce(); steps++ }
    expect(g.filled).toBe(true)
    expect(g.settling).toBe(false)
    const full = g.nodes
    expect(full).toBeLessThan(5000)
    g.setParams(params({ maxNodes: 5000, segmentLength: 3.5, repelRadius: 9, stepSize: 0.33 }))
    expect(g.filled).toBe(false)
    for (let i = 0; i < 400; i++) g.stepOnce()
    expect(g.nodes).toBeGreaterThan(full * 1.5)
  })

  it('keeps settling at the node limit, and is the same run after run', () => {
    const run = (seed: number, steps: number) => {
      const g = new Grower([toStrand(resample(circle(150, 150, 20, 40), true, 9), true)], 0, params({ maxNodes: 120, randomness: 0.3, seed }), new Boundary([square]))
      for (let i = 0; i < steps; i++) g.stepOnce()
      return g
    }
    const a = run(7, 300), b = run(7, 300), c = run(8, 300)
    expect(a.step).toBe(300)
    expect(a.nodes).toBe(120)
    expect(Array.from(a.strands[0].points)).toEqual(Array.from(b.strands[0].points))
    expect(Array.from(a.strands[0].points)).not.toEqual(Array.from(c.strands[0].points))
  })

  it('continues a run handed over half way exactly as an uninterrupted one', () => {
    const start = () => [toStrand(resample(circle(150, 150, 20, 40), true, 9), true), toStrand([[20, 20], [60, 40]], false)]
    const whole = new Grower(start(), 0, params({ randomness: 0.5, seed: 3 }), new Boundary([square]))
    for (let i = 0; i < 400; i++) whole.stepOnce()
    const first = new Grower(start(), 0, params({ randomness: 0.5, seed: 3 }), new Boundary([square]))
    for (let i = 0; i < 170; i++) first.stepOnce()
    // Through JSON, as a project file stores it.
    const saved = JSON.parse(JSON.stringify({ step: first.step, strands: first.strands.map(s => ({ closed: s.closed, points: Array.from(s.points) })) }))
    const second = new Grower(saved.strands.map((s: { closed: boolean; points: number[] }) => ({ closed: s.closed, points: Float64Array.from(s.points) })), saved.step, params({ randomness: 0.5, seed: 3 }), new Boundary([square]))
    for (let i = 0; i < 230; i++) second.stepOnce()
    expect(nodeCount(second.strands)).toBe(nodeCount(whole.strands))
    expect(second.strands.map(s => Array.from(s.points))).toEqual(whole.strands.map(s => Array.from(s.points)))
  })
})
