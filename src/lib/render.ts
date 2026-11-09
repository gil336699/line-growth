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
}

const PREVIEW_MIN_LINE = 0.75 // css px

function strandPath(ctx: CanvasRenderingContext2D, { closed, points: p }: Strand) {
  if (p.length < 2) return
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
  if (closed) ctx.closePath()
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

  // Each closed line's inside, filled on its own as Illustrator fills separate paths.
  if (s.fill) {
    ctx.fillStyle = s.fillColor
    for (const strand of strands) if (strand.closed && strand.points.length >= 6) { ctx.beginPath(); strandPath(ctx, strand); ctx.fill('nonzero') }
  }

  ctx.beginPath()
  for (const strand of strands) strandPath(ctx, strand)
  ctx.strokeStyle = s.lineColor
  ctx.lineWidth = Math.max(s.lineWidth, minLine)
  ctx.stroke()

  if (s.showNodes) {
    const r = Math.max(nodeRadius(s.lineWidth), o.preview ? 1.4 * px : 0)
    ctx.fillStyle = s.lineColor
    ctx.beginPath()
    for (const { points: p } of strands) for (let i = 0; i < p.length; i += 2) { ctx.moveTo(p[i] + r, p[i + 1]); ctx.arc(p[i], p[i + 1], r, 0, Math.PI * 2) }
    ctx.fill()
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

export function renderPng(strands: Strand[], rings: Polygon[], s: Settings, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  drawGrowth(ctx, strands, rings, s, { scale: width / s.width, ox: 0, oy: 0, dpr: 1, preview: false, transparent: s.transparentPng })
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'))
}
