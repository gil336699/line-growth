// SVG at real size, for Illustrator, plotters and laser software. The page is the sheet, so a design that
// came from an Illustrator file lines up with the original artwork when placed at the artboard's corner.
// Like every export, it holds what the view shows: the lines, plus the boundary and nodes when they're on.
import type { Strand } from '../growth/engine'
import type { Polygon } from '../growth/geometry'
import { num } from './format'
import type { Settings } from './settings'
import { smoothSegments } from './smooth'
import { BOUNDARY_COLOR, boundaryWidth, nodeRadius } from './style'

function sizeAttributes(s: Settings): string {
  if (s.units === 'in') return `width="${num(s.width / 25.4, 4)}in" height="${num(s.height / 25.4, 4)}in"`
  if (s.units === 'pt') return `width="${num((s.width / 25.4) * 72, 3)}pt" height="${num((s.height / 25.4) * 72, 3)}pt"`
  if (s.units === 'px') return `width="${Math.round((s.width / 25.4) * s.dpi)}" height="${Math.round((s.height / 25.4) * s.dpi)}"`
  return `width="${num(s.width)}mm" height="${num(s.height)}mm"`
}

export function strandPath(strand: Strand, smooth: boolean): string {
  const p = strand.points, n = p.length / 2
  if (n === 0) return ''
  let d = `M${num(p[0])} ${num(p[1])}`
  if (smooth && n > 2) {
    for (const [a, b, c, e, x, y] of smoothSegments(strand)) d += `C${num(a)} ${num(b)} ${num(c)} ${num(e)} ${num(x)} ${num(y)}`
    return strand.closed ? `${d}Z` : d
  }
  for (let i = 1; i < n; i++) d += `L${num(p[i * 2])} ${num(p[i * 2 + 1])}`
  return strand.closed ? `${d}Z` : d
}

export const ringsPath = (rings: Polygon[]) => rings.map(r => `M${r.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`).join('')

// What an export will hold, in plain words, for the File tab.
export function exportContents(s: Pick<Settings, 'showBoundary' | 'showNodes'>): string[] {
  return ['the lines', ...(s.showBoundary ? ['the boundary'] : []), ...(s.showNodes ? ['the nodes'] : [])]
}

export function growthSvg(strands: Strand[], rings: Polygon[], s: Settings): string {
  const lw = num(s.lineWidth, 4)
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttributes(s)} viewBox="0 0 ${num(s.width)} ${num(s.height)}">\n`
    + `<title>Line Growth</title>\n`
  if (s.showBoundary && rings.length) {
    svg += `<g id="boundary" fill="none" stroke="${BOUNDARY_COLOR}" stroke-width="${num(boundaryWidth(s.lineWidth), 4)}" stroke-linejoin="round">`
      + `<path fill-rule="evenodd" d="${ringsPath(rings)}"/></g>\n`
  }
  svg += `<g id="lines" fill="none" stroke="${s.lineColor}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round">\n`
  for (const strand of strands) if (strand.points.length >= 4) svg += `<path d="${strandPath(strand, s.smoothCurves)}"/>\n`
  svg += `</g>\n`
  if (s.showNodes) {
    const r = num(nodeRadius(s.lineWidth), 4)
    svg += `<g id="nodes" fill="${s.lineColor}">\n`
    for (const strand of strands) for (let i = 0; i < strand.points.length; i += 2) svg += `<circle cx="${num(strand.points[i])}" cy="${num(strand.points[i + 1])}" r="${r}"/>\n`
    svg += `</g>\n`
  }
  return `${svg}</svg>\n`
}
