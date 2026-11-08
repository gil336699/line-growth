// DXF for CAD, plotters and CAM, as AutoCAD R12 text, the most widely readable version. Each line is one
// polyline through its nodes; the boundary and nodes go on their own layers when the view shows them.
// DXF's y axis points up, so y is flipped.
import type { Strand } from '../growth/engine'
import type { Polygon } from '../growth/geometry'
import { num } from './format'
import type { Settings } from './settings'

export const LAYER_LINES = 'LINES'
export const LAYER_BOUNDARY = 'BOUNDARY'
export const LAYER_NODES = 'NODES'

export function growthDxf(strands: Strand[], rings: Polygon[], s: Settings): string {
  const inches = s.units === 'in'
  const k = inches ? 1 / 25.4 : 1
  const X = (x: number) => num(x * k, 4), Y = (y: number) => num((s.height - y) * k, 4)
  const out: string[] = []
  const pair = (code: number, value: string | number) => { out.push(String(code), String(value)) }

  pair(0, 'SECTION'); pair(2, 'HEADER')
  pair(9, '$ACADVER'); pair(1, 'AC1009')
  pair(9, '$INSUNITS'); pair(70, inches ? 1 : 4)
  pair(9, '$MEASUREMENT'); pair(70, inches ? 0 : 1)
  pair(9, '$EXTMIN'); pair(10, X(0)); pair(20, Y(s.height)); pair(30, 0)
  pair(9, '$EXTMAX'); pair(10, X(s.width)); pair(20, Y(0)); pair(30, 0)
  pair(0, 'ENDSEC')

  // AutoCAD colours: 7 black or white, 4 cyan, 1 red.
  const layers: [string, number][] = [[LAYER_LINES, 7]]
  if (s.showBoundary && rings.length) layers.push([LAYER_BOUNDARY, 4])
  if (s.showNodes) layers.push([LAYER_NODES, 1])
  pair(0, 'SECTION'); pair(2, 'TABLES')
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, layers.length)
  for (const [name, colour] of layers) { pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, colour); pair(6, 'CONTINUOUS') }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC')

  pair(0, 'SECTION'); pair(2, 'ENTITIES')
  const polyline = (p: ArrayLike<number>, closed: boolean, layer: string) => {
    pair(0, 'POLYLINE'); pair(8, layer); pair(66, 1); pair(10, 0); pair(20, 0); pair(30, 0); pair(70, closed ? 1 : 0)
    for (let i = 0; i + 1 < p.length; i += 2) { pair(0, 'VERTEX'); pair(8, layer); pair(10, X(p[i])); pair(20, Y(p[i + 1])); pair(30, 0) }
    pair(0, 'SEQEND'); pair(8, layer)
  }
  if (s.showBoundary) for (const ring of rings) polyline(ring.flat(), true, LAYER_BOUNDARY)
  for (const strand of strands) if (strand.points.length >= 4) polyline(strand.points, strand.closed, LAYER_LINES)
  if (s.showNodes) for (const strand of strands) for (let i = 0; i < strand.points.length; i += 2) {
    pair(0, 'POINT'); pair(8, LAYER_NODES); pair(10, X(strand.points[i])); pair(20, Y(strand.points[i + 1])); pair(30, 0)
  }
  pair(0, 'ENDSEC'); pair(0, 'EOF')
  return `${out.join('\n')}\n`
}
