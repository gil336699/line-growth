// Project files: the settings, any imported boundary, the start lines and every grown node, so a design
// reopens exactly as it was and keeps growing the same way. Numbers are stored in full, which keeps a
// reopened run bit for bit the same as one that never stopped.
import type { Strand } from '../growth/engine'
import type { Polygon, Vec } from '../growth/geometry'
import type { Path } from '../growth/seeds'
import { resetState, type Design, type Imported, type SizedBy } from './design'
import { sanitizeSettings } from './settings'

export const SCHEMA = 'line-growth/project'
export const VERSION = 1
export const EXTENSION = '.linegrowth.json'
export class ProjectError extends Error {}

const pairs = (points: Vec[]) => points.flatMap(([x, y]) => [x, y])

export function serializeProject(d: Design): string {
  return JSON.stringify({
    schema: SCHEMA,
    version: VERSION,
    settings: d.settings,
    imported: d.imported && { name: d.imported.name, sized: d.imported.sized, width: d.imported.width, height: d.imported.height, rings: d.imported.rings.map(pairs) },
    start: d.custom.map(p => ({ closed: p.closed, points: pairs(p.points) })),
    growth: { step: d.state.step, lines: d.state.strands.map(s => ({ closed: s.closed, points: Array.from(s.points) })) },
  })
}

const isNumbers = (v: unknown): v is number[] => Array.isArray(v) && v.length % 2 === 0 && v.every(n => typeof n === 'number' && Number.isFinite(n))
const toVecs = (v: number[]): Vec[] => { const out: Vec[] = []; for (let i = 0; i < v.length; i += 2) out.push([v[i], v[i + 1]]); return out }

function readLines(raw: unknown, what: string): { closed: boolean; points: number[] }[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new ProjectError(`The ${what} in this project file are damaged.`)
  return raw.map(line => {
    const l = line as { closed?: unknown; points?: unknown }
    if (!l || typeof l !== 'object' || !isNumbers(l.points)) throw new ProjectError(`The ${what} in this project file are damaged.`)
    return { closed: Boolean(l.closed), points: l.points }
  })
}

export function parseProject(text: string): Design {
  let data: Record<string, unknown>
  try { data = JSON.parse(text) } catch { throw new ProjectError('This file is not a Line Growth project (it isn’t valid JSON).') }
  if (!data || typeof data !== 'object' || data.schema !== SCHEMA) throw new ProjectError('This file is not a Line Growth project.')
  if (typeof data.version !== 'number' || data.version > VERSION) throw new ProjectError('This project was made by a newer version of Line Growth. Update the app to open it.')
  let settings = sanitizeSettings(data.settings)
  let imported: Imported | null = null
  const im = data.imported as Record<string, unknown> | null | undefined
  if (im && typeof im === 'object') {
    const rings = Array.isArray(im.rings) && im.rings.every(isNumbers) ? (im.rings as number[][]).map(toVecs).filter(r => r.length >= 3) as Polygon[] : []
    const width = Number(im.width), height = Number(im.height)
    if (rings.length && width > 0 && height > 0) {
      const sized: SizedBy = im.sized === 'file' || im.sized === 'illustrator' ? im.sized : 'css'
      imported = { name: typeof im.name === 'string' ? im.name : 'imported shape', sized, width, height, rings }
    }
  }
  if (settings.shape === 'imported' && !imported) settings = { ...settings, shape: 'rect' }
  const custom: Path[] = readLines(data.start, 'start lines').map(l => ({ closed: l.closed, points: toVecs(l.points) }))
  const growth = data.growth as { step?: unknown; lines?: unknown } | undefined
  const base = { settings, imported, custom }
  const lines = readLines(growth?.lines, 'grown lines')
  const strands: Strand[] = lines.map(l => ({ closed: l.closed, points: Float64Array.from(l.points) }))
  const step = typeof growth?.step === 'number' && growth.step >= 0 ? Math.floor(growth.step) : 0
  return { ...base, state: strands.length ? { strands, step } : resetState(base) }
}
