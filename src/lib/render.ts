// Draws a design on a 2D canvas, for the on-screen preview and for PNG export. World units are millimetres;
// the caller passes the scale (pixels per millimetre) and offset.
import type { Strand } from '../growth/engine'
import type { Polygon, Vec } from '../growth/geometry'
import type { Settings } from './settings'
import { BOUNDARY_COLOR, boundaryWidth, DRAFT_COLOR, HOVER_COLOR, nodeRadius } from './style'

export type DrawOptions = {
  scale: number; ox: number; oy: number; dpr: number
  preview: boolean // adds the paper shadow, minimum line widths, the dashed guide and editing marks
  transparent?: boolean
  hover?: number | null // the line the Erase tool would remove
  draft?: Vec[] | null // the line being drawn
  colors?: string[] | null // each line's own colour (lib/colors.ts), for its stroke, fill and nodes
}

const PREVIEW_MIN_LINE = 0.75 // css px

function strandPath(ctx: CanvasRenderingContext2D, { closed, points: p }: Strand) {
  if (p.length < 2) return
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
  if (closed) ctx.closePath()
}

// The strands to draw in each colour, so lines that share one are stroked together.
function byColor(strands: Strand[], colors: string[] | null | undefined, fallback: string, keep: (s: Strand) => boolean = () => true): Map<string, Strand[]> {
  const groups = new Map<string, Strand[]>()
  strands.forEach((strand, i) => {
    if (!keep(strand)) return
    const color = colors?.[i] ?? fallback, list = groups.get(color)
    if (list) list.push(strand); else groups.set(color, [strand])
  })
  return groups
}

function ringsPath(ctx: CanvasRenderingContext2D, rings: Polygon[]) {
  for (const ring of rings) {
    ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  }
}

export function drawGrowth(ctx: CanvasRenderingContext2D, strands: Strand[], rings: Polygon[], s: Settings, o: DrawOptions) {
  const px = 1 / o.scale // one css pixel, in millimetres
  const minLine = o.preview ? PREVIEW_MIN_LINE * px : 0
  ctx.setTransform(o.dpr * o.scale, 0, 0, o.dpr * o.scale, o.dpr * o.ox, o.dpr * o.oy)

  if (!o.transparent) {
    ctx.save()
    if (o.preview) { ctx.shadowColor = 'rgba(15, 23, 42, .28)'; ctx.shadowBlur = 28 * o.dpr; ctx.shadowOffsetY = 8 * o.dpr }
    ctx.fillStyle = s.background
    ctx.fillRect(0, 0, s.width, s.height)
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, s.width, s.height); ctx.clip()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  if (s.showBoundary && rings.length) {
    ctx.beginPath(); ringsPath(ctx, rings)
    ctx.strokeStyle = BOUNDARY_COLOR
    ctx.lineWidth = Math.max(boundaryWidth(s.lineWidth), minLine)
    // The preview dashes the guide, as the Illustrator panel did; exports draw it solid.
    if (o.preview) ctx.setLineDash([5 * px, 3 * px])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Each closed line's inside, filled on its own as Illustrator fills separate paths. With a colour for each line,
  // it fills in its own colour; otherwise in the fill colour. The fill stays inside the boundary, so its holes stay
  // clear, as they are of the lines (the SVG cuts them out of each fill: svgExport's fillHoles).
  if (s.fill) {
    ctx.save()
    if (rings.length > 1) { ctx.beginPath(); ringsPath(ctx, rings); ctx.clip('evenodd') }
    strands.forEach((strand, i) => {
      if (!strand.closed || strand.points.length < 6) return
      ctx.fillStyle = o.colors?.[i] ?? s.fillColor
      ctx.beginPath(); strandPath(ctx, strand); ctx.fill('nonzero')
    })
    ctx.restore()
  }

  ctx.lineWidth = Math.max(s.lineWidth, minLine)
  for (const [color, group] of byColor(strands, o.colors, s.lineColor)) {
    ctx.beginPath()
    for (const strand of group) strandPath(ctx, strand)
    ctx.strokeStyle = color
    ctx.stroke()
  }

  if (s.showNodes) {
    const r = Math.max(nodeRadius(s.lineWidth), o.preview ? 1.4 * px : 0)
    for (const [color, group] of byColor(strands, o.colors, s.lineColor)) {
      ctx.fillStyle = color
      ctx.beginPath()
      for (const { points: p } of group) for (let i = 0; i < p.length; i += 2) { ctx.moveTo(p[i] + r, p[i + 1]); ctx.arc(p[i], p[i + 1], r, 0, Math.PI * 2) }
      ctx.fill()
    }
  }
  ctx.restore()

  if (o.preview && o.hover !== undefined && o.hover !== null && strands[o.hover]) {
    ctx.beginPath(); strandPath(ctx, strands[o.hover])
    ctx.strokeStyle = HOVER_COLOR; ctx.lineWidth = Math.max(s.lineWidth * 1.5, 2.5 * px); ctx.stroke()
  }
  if (o.preview && o.draft && o.draft.length > 1) {
    ctx.beginPath()
    o.draft.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.strokeStyle = DRAFT_COLOR; ctx.lineWidth = Math.max(s.lineWidth, 2 * px); ctx.stroke()
  }
}

// Largest PNG the app will try. Browsers fail above roughly 16k pixels a side or a few hundred megapixels.
export const PNG_MAX_SIDE = 16_384
export const PNG_MAX_PIXELS = 120_000_000

export function pngProblem(width: number, height: number): string | null {
  if (width > PNG_MAX_SIDE || height > PNG_MAX_SIDE) return `That PNG would be ${width.toLocaleString()} × ${height.toLocaleString()} px, over the ${PNG_MAX_SIDE.toLocaleString()} px a side browsers can draw. Lower the pixels per inch on the Shape tab, or export SVG.`
  if (width * height > PNG_MAX_PIXELS) return `That PNG would be ${Math.round((width * height) / 1e6)} megapixels, more than browsers can draw. Lower the pixels per inch on the Shape tab, or export SVG.`
  return null
}

export function renderPng(strands: Strand[], rings: Polygon[], s: Settings, width: number, height: number, colors: string[] | null = null): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  drawGrowth(ctx, strands, rings, s, { scale: width / s.width, ox: 0, oy: 0, dpr: 1, preview: false, transparent: s.transparentPng, colors })
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ? withResolution(blob, s.dpi) : null), 'image/png'))
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// A PNG keeps its print size as pixels per metre in a pHYs chunk. The browser writes none, and without one
// Illustrator, InDesign and Photoshop read 72 pixels per inch, so a 100 mm sheet at 300 ppi placed at 417 mm.
// This writes the sheet's pixels per inch into the file, after the header, in place of any there.
export async function withResolution(png: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = (at: number) => String.fromCharCode(...bytes.subarray(at + 4, at + 8))
  if (bytes.length < 33 || type(8) !== 'IHDR') return png
  const chunk = new Uint8Array(21), out = new DataView(chunk.buffer)
  const perMetre = Math.round(dpi / 0.0254)
  out.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  out.setUint32(8, perMetre); out.setUint32(12, perMetre); chunk[16] = 1 // the unit is the metre
  out.setUint32(17, crc32(chunk.subarray(4, 17)))
  const parts: Uint8Array[] = [bytes.subarray(0, 33), chunk]
  for (let at = 33; at + 12 <= bytes.length;) {
    const next = at + 12 + view.getUint32(at)
    if (type(at) !== 'pHYs') parts.push(bytes.subarray(at, next))
    at = next
  }
  return new Blob(parts as BlobPart[], { type: 'image/png' })
}
