// SVG at real size, for Illustrator, plotters and laser software. The page is the sheet, so a design that
// came from an Illustrator file lines up with the original artwork when pasted in place in it (File › Place would
// size the drawing to its own lines, not the page, and put it where it's dropped).
// Like every export, it holds what the view shows: the lines, plus the boundary and nodes when they're on.
import type { Strand } from '../growth/engine'
import { signedArea, type Polygon } from '../growth/geometry'
import { num } from './format'
import { MAX_PATH_SEGMENTS, pieceRanges, segmentCount } from './pieces'
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

export { MAX_PATH_SEGMENTS } from './pieces'

// A line's path data, in pieces when it's too long for one path in Illustrator. Each piece starts at the node where
// the one before it ends, written the same way, so they join exactly; a split closed line's last piece ends at its
// start.
export function strandPaths(strand: Strand, smooth: boolean, max = MAX_PATH_SEGMENTS): string[] {
  const p = strand.points, n = p.length / 2
  if (n === 0) return []
  const ranges = pieceRanges(segmentCount(n, strand.closed), max)
  if (ranges.length === 1) return [strandPath(strand, smooth)]
  const cubics = smooth && n > 2 ? smoothSegments(strand) : null
  const node = (i: number) => { const k = i % n; return `${num(p[k * 2])} ${num(p[k * 2 + 1])}` }
  return ranges.map(([start, end]) => {
    let d = `M${node(start)}`
    for (let i = start; i < end; i++) {
      if (cubics) { const [a, b, c, e] = cubics[i]; d += `C${num(a)} ${num(b)} ${num(c)} ${num(e)} ${node(i + 1)}` }
      else d += `L${node(i + 1)}`
    }
    return d
  })
}

// Where to cut a closed line too long for one path into pieces for its fill: each cut is the node, between half
// and all of max segments after the last one, nearest the last one, which keeps the hidden edges short.
function fillCuts(p: ArrayLike<number>, n: number, max: number): number[] {
  const cuts = [0]
  while (n - cuts[cuts.length - 1] > max) {
    const a = cuts[cuts.length - 1], ax = p[a * 2], ay = p[a * 2 + 1]
    let best = a + max, nearest = Infinity
    for (let j = a + Math.ceil(max / 2); j <= Math.min(a + max, n - 1); j++) {
      const d = (p[j * 2] - ax) ** 2 + (p[j * 2 + 1] - ay) ** 2
      if (d < nearest) { nearest = d; best = j }
    }
    cuts.push(best)
  }
  return cuts
}

// The outline that fills a closed line. Within Illustrator's limit it's the line's own path. A longer line is one
// compound path of open pieces: a fill closes each piece with a straight edge from its end back to its start, and
// a last closed part through the cuts runs along each of those edges the other way, so they cancel and the fill
// is exactly the line's. On screen, those hidden edges can show as a faint hairline.
export function fillPath(strand: Strand, smooth: boolean, max = MAX_PATH_SEGMENTS): string {
  const p = strand.points, n = p.length / 2
  if (n <= max) return strandPath({ closed: true, points: p }, smooth)
  const cuts = fillCuts(p, n, max)
  const cubics = smooth ? smoothSegments({ closed: true, points: p }) : null
  const node = (i: number) => { const k = i % n; return `${num(p[k * 2])} ${num(p[k * 2 + 1])}` }
  let d = ''
  cuts.forEach((a, c) => {
    d += `M${node(a)}`
    for (let i = a; i < (cuts[c + 1] ?? n); i++) {
      if (cubics) { const [x1, y1, x2, y2] = cubics[i]; d += `C${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${node(i + 1)}` }
      else d += `L${node(i + 1)}`
    }
  })
  return `${d}M${cuts.map(node).join('L')}Z`
}

export const ringsPath = (rings: Polygon[]) => rings.map(r => `M${r.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`).join('')

const insideRing = (ring: Polygon, x: number, y: number) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < xj + ((y - yj) * (xi - xj)) / (yi - yj)) c = !c
  }
  return c
}

// The boundary's holes stay clear of the fill, as they are of the lines. Each hole inside a closed line is one more
// part of the line's fill, wound against it, so the nonzero rule leaves the hole empty; an island in a hole is wound
// with the line again and fills. A ring the line runs across is left out, as the line's own inside decides there.
export function fillHoles(strand: Strand, rings: Polygon[]): string {
  if (rings.length < 2) return ''
  const p = strand.points, n = p.length / 2
  let area = 0
  for (let i = 0, j = n - 1; i < n; j = i++) area += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]
  const inLine = (x: number, y: number) => {
    let c = false
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = p[i * 2 + 1], yj = p[j * 2 + 1]
      if ((yi > y) !== (yj > y) && x < p[j * 2] + ((y - yj) * (p[i * 2] - p[j * 2])) / (yi - yj)) c = !c
    }
    return c
  }
  let d = ''
  rings.forEach((ring, k) => {
    // How many other rings this one is inside: odd for a hole, even for an outline or an island in a hole.
    const depth = rings.reduce((sum, other, m) => sum + (m !== k && insideRing(other, ring[0][0], ring[0][1]) ? 1 : 0), 0)
    if (!depth) return
    if (![0, 0.25, 0.5, 0.75].every(t => { const [x, y] = ring[Math.floor(t * ring.length)]; return inLine(x, y) })) return
    const wanted = depth % 2 ? -Math.sign(area) : Math.sign(area)
    const r = Math.sign(signedArea(ring)) === wanted ? ring : [...ring].reverse()
    d += `M${r.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`
  })
  return d
}

// What an export will hold, in plain words, for the File tab.
export function exportContents(s: Pick<Settings, 'showBoundary' | 'showNodes' | 'fill'>): string[] {
  return ['the lines', ...(s.fill ? ['the fill'] : []), ...(s.showBoundary ? ['the boundary'] : []), ...(s.showNodes ? ['the nodes'] : [])]
}

// colors: each line's own colour (lib/colors.ts), written on its path, or null for the one line and fill colour.
export function growthSvg(strands: Strand[], rings: Polygon[], s: Settings, colors: string[] | null = null): string {
  const lw = num(s.lineWidth, 4)
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttributes(s)} viewBox="0 0 ${num(s.width)} ${num(s.height)}">\n`
    + `<title>Line Growth</title>\n`
  if (s.showBoundary && rings.length) {
    svg += `<g id="boundary" fill="none" stroke="${BOUNDARY_COLOR}" stroke-width="${num(boundaryWidth(s.lineWidth), 4)}" stroke-linejoin="round">`
      + `<path fill-rule="evenodd" d="${ringsPath(rings)}"/></g>\n`
  }
  // The fill sits under the lines, in its own group, so either can be used or removed in Illustrator. Open lines
  // have no inside, so only closed lines are filled.
  // Each line's own colour goes on its path, or on the group of its pieces, so it stays one colour in Illustrator.
  const own = (i: number, attr: 'fill' | 'stroke') => (colors?.[i] ? ` ${attr}="${colors[i]}"` : '')
  const filled = s.fill ? strands.map((t, i) => [t, i] as const).filter(([t]) => t.closed && t.points.length >= 6) : []
  if (filled.length) {
    svg += `<g id="fill" fill="${s.fillColor}" fill-rule="nonzero" stroke="none">\n`
    for (const [strand, i] of filled) svg += `<path${own(i, 'fill')} d="${fillPath(strand, s.smoothCurves)}${fillHoles(strand, rings)}"/>\n`
    svg += `</g>\n`
  }
  svg += `<g id="lines" fill="none" stroke="${s.lineColor}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round">\n`
  strands.forEach((strand, i) => {
    if (strand.points.length < 4) return
    const pieces = strandPaths(strand, s.smoothCurves)
    svg += pieces.length === 1 ? `<path${own(i, 'stroke')} d="${pieces[0]}"/>\n` : `<g${own(i, 'stroke')}>\n${pieces.map(d => `<path d="${d}"/>\n`).join('')}</g>\n`
  })
  svg += `</g>\n`
  if (s.showNodes) {
    const r = num(nodeRadius(s.lineWidth), 4)
    const dots = (strand: Strand) => { let out = ''; for (let i = 0; i < strand.points.length; i += 2) out += `<circle cx="${num(strand.points[i])}" cy="${num(strand.points[i + 1])}" r="${r}"/>\n`; return out }
    svg += `<g id="nodes" fill="${s.lineColor}">\n`
    strands.forEach((strand, i) => { svg += colors?.[i] ? `<g fill="${colors[i]}">\n${dots(strand)}</g>\n` : dots(strand) })
    svg += `</g>\n`
  }
  return `${svg}</svg>\n`
}
