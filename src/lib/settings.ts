// Every setting of a design, its default, and the range it may take. Lengths are millimetres.
import { SIM_RANGE, SIM_SPAN } from '../growth/autotune'
import type { StartShape } from '../growth/seeds'
import type { Units } from './units'

export type BoundaryShape = 'rect' | 'ellipse' | 'imported'
// One colour for every line, or each line its own colour from a gradient, by where the line starts.
export type ColorMode = 'one' | 'gradient'
export type GradientName = 'rainbow' | 'sunset' | 'ocean' | 'viridis' | 'custom'

export type Settings = {
  // Sheet and boundary
  units: Units; width: number; height: number; dpi: number
  shape: BoundaryShape; margin: number
  // Start. The Cells start has its own count, and its size and gap in percent (see growth/cells.ts).
  start: StartShape; startSize: number; startCount: number
  cellCount: number; cellSize: number; cellGap: number
  // Growth. autoNodes: Auto tune picks Max nodes too; once Max nodes is set by hand, Auto tune keeps it and
  // scales the lengths to suit it.
  autoTune: boolean; autoNodes: boolean
  maxNodes: number; stepsPerFrame: number
  segmentLength: number; repelRadius: number; repulsion: number; alignment: number; attraction: number; stepSize: number
  randomness: number; seed: number
  // Style. fill: the inside of each closed line is filled with fillColor, for a two-tone pattern.
  lineWidth: number; lineColor: string; background: string; fill: boolean; fillColor: string
  // colors 'gradient': each line, its fill and its nodes take the gradient's colour where the line starts, along
  // gradientAngle (degrees clockwise from left to right). 'custom' runs from gradientFrom to gradientTo.
  colors: ColorMode; gradient: GradientName; gradientAngle: number; gradientFrom: string; gradientTo: string
  showBoundary: boolean; showNodes: boolean
  // Export
  smoothCurves: boolean; transparentPng: boolean
}

export const DEFAULTS: Settings = {
  units: 'mm', width: 200, height: 200, dpi: 300,
  shape: 'ellipse', margin: 5,
  start: 'circle', startSize: 15, startCount: 5,
  cellCount: 30, cellSize: 100, cellGap: 10,
  autoTune: true, autoNodes: true,
  // Auto tune replaces these for the default sheet; they are what it picks for a 200 mm circle.
  maxNodes: 2160, stepsPerFrame: 2, segmentLength: 2.78, repelRadius: 7.22, repulsion: 1.07, alignment: 0.49, attraction: 0.47, stepSize: 0.25,
  randomness: 0.25, seed: 1,
  lineWidth: 0.3, lineColor: '#1d1d1f', background: '#ffffff', fill: false, fillColor: '#1d1d1f',
  colors: 'one', gradient: 'rainbow', gradientAngle: 0, gradientFrom: '#0a84ff', gradientTo: '#ff375f',
  showBoundary: true, showNodes: false,
  smoothCurves: true, transparentPng: false,
}

export const LIMITS = {
  width: [10, 5000], height: [10, 5000], dpi: [30, 1200],
  startSize: [1, 100], startCount: [1, 50],
  cellCount: [2, 200], cellSize: [10, 100], cellGap: [0, 50], gradientAngle: [0, 359],
  maxNodes: [40, 100_000], stepsPerFrame: [1, 30],
  repulsion: SIM_RANGE.repulsion, alignment: SIM_RANGE.alignment, attraction: SIM_RANGE.attraction,
  randomness: [0, 1], seed: [1, 999_999], lineWidth: [0.01, 20],
} as const

// Lengths that scale with the sheet: the Illustrator panel's ranges in its 1,200-unit space.
export type ScaledKey = 'segmentLength' | 'repelRadius' | 'stepSize'
export const scaledRange = (key: ScaledKey, s: Pick<Settings, 'width' | 'height'>): [number, number] => {
  const span = Math.max(s.width, s.height)
  return [(SIM_RANGE[key][0] * span) / SIM_SPAN, (SIM_RANGE[key][1] * span) / SIM_SPAN]
}
export const marginMax = (s: Pick<Settings, 'width' | 'height'>) => Math.min(s.width, s.height) / 4

const CHOICES = {
  units: ['mm', 'in', 'pt', 'px'],
  shape: ['rect', 'ellipse', 'imported'],
  start: ['circle', 'line', 'circles', 'cells', 'outline', 'custom'],
  colors: ['one', 'gradient'],
  gradient: ['rainbow', 'sunset', 'ocean', 'viridis', 'custom'],
} as const

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

// Settings from a file or the last session: unknown keys are dropped, missing ones take their default and
// out-of-range numbers are brought into range.
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s: Settings = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = r[key], base = DEFAULTS[key]
    if (typeof base === 'number' && typeof value === 'number' && Number.isFinite(value)) (s as Record<string, unknown>)[key] = value
    else if (typeof base === 'boolean' && typeof value === 'boolean') (s as Record<string, unknown>)[key] = value
    else if (typeof base === 'string' && typeof value === 'string') (s as Record<string, unknown>)[key] = value
  }
  for (const [key, list] of Object.entries(CHOICES)) {
    if (!(list as readonly string[]).includes(s[key as keyof typeof CHOICES])) (s as Record<string, unknown>)[key] = DEFAULTS[key as keyof typeof CHOICES]
  }
  for (const [key, range] of Object.entries(LIMITS)) (s as Record<string, unknown>)[key] = clamp(s[key as keyof typeof LIMITS] as number, range)
  s.maxNodes = Math.round(s.maxNodes); s.stepsPerFrame = Math.round(s.stepsPerFrame); s.startCount = Math.round(s.startCount); s.seed = Math.round(s.seed)
  s.cellCount = Math.round(s.cellCount)
  s.margin = clamp(s.margin, [0, marginMax(s)])
  for (const key of ['segmentLength', 'repelRadius', 'stepSize'] as const) s[key] = clamp(s[key], scaledRange(key, s))
  for (const key of ['lineColor', 'background', 'fillColor', 'gradientFrom', 'gradientTo'] as const) if (!/^#[0-9a-f]{6}$/i.test(s[key])) s[key] = DEFAULTS[key]
  return s
}
