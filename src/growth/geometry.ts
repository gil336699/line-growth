// Small 2D helpers shared by the engine, the start shapes and the file formats. Lengths are millimetres.
export type Vec = [number, number]
export type Polygon = Vec[] // a closed ring; the last point is not repeated
export type Box = [number, number, number, number] // x0, y0, x1, y1

export const distance = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function signedArea(ring: Polygon): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return a / 2
}

export function pathLength(points: Vec[], closed: boolean): number {
  let total = 0
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) total += distance(points[i], points[(i + 1) % points.length])
  return total
}

export function boxOf(rings: Vec[][]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

export const overlaps = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

// Points spaced evenly along a path, starting at its first point, as the Illustrator panel resampled
// captured paths. An open path keeps its last point.
export function resample(points: Vec[], closed: boolean, spacing: number): Vec[] {
  if (points.length < 2 || !(spacing > 0)) return points.map(p => [p[0], p[1]])
  const result: Vec[] = [[points[0][0], points[0][1]]]
  let carried = 0
  let last: Vec = [points[0][0], points[0][1]]
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const end: Vec = [points[(i + 1) % points.length][0], points[(i + 1) % points.length][1]]
    let segment = distance(last, end)
    while (carried + segment >= spacing) {
      const t = (spacing - carried) / segment
      const next: Vec = [last[0] + (end[0] - last[0]) * t, last[1] + (end[1] - last[1]) * t]
      result.push(next)
      last = next
      segment = distance(last, end)
      carried = 0
    }
    carried += segment
    last = end
    if (!closed && i === count - 1) result.push(end)
  }
  if (closed && result.length > 2 && distance(result[0], result[result.length - 1]) < spacing * 0.5) result.pop()
  return result
}

// An ellipse as a ring whose straight sides stray from the true curve by at most `tolerance`.
export function ellipseRing(cx: number, cy: number, rx: number, ry: number, tolerance = 0.005): Polygon {
  const r = Math.max(rx, ry, 1e-9)
  const step = tolerance < r ? 2 * Math.acos(1 - tolerance / r) : Math.PI / 2
  const n = Math.min(4096, Math.max(16, Math.ceil((Math.PI * 2) / step)))
  return Array.from({ length: n }, (_, i): Vec => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)])
}

export const flat = (points: Vec[]): Float64Array => {
  const out = new Float64Array(points.length * 2)
  points.forEach(([x, y], i) => { out[i * 2] = x; out[i * 2 + 1] = y })
  return out
}

export const unflat = (points: Float64Array): Vec[] => {
  const out: Vec[] = []
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]])
  return out
}
