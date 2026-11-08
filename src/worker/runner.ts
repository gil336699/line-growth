// Owns the growing lines inside the worker. It steps in batches, applies edits between steps, and sends the
// page one frame at a time, only after the page has drawn the last one, so drawing never falls behind and a
// slow step never freezes the page.
import { boundaryOf } from '../growth/boundary'
import { Grower, type GrowthParams, type Strand } from '../growth/engine'
import type { Polygon } from '../growth/geometry'

export type Packed = { points: Float64Array; lengths: Int32Array; closed: Uint8Array }
// held: nodes held back from crossing on the last step; filled: no room for more nodes at this segment length.
export type Frame = Packed & { step: number; nodes: number; settling: boolean; filled: boolean; stepsPerSecond: number; held: number }

export type ToRunner =
  | { kind: 'load'; lines: Packed; step: number; params: GrowthParams; rings: Polygon[] }
  | { kind: 'params'; params: GrowthParams }
  | { kind: 'boundary'; rings: Polygon[] }
  // steps: null grows until stopped; a number runs that many steps, as Step does.
  | { kind: 'play'; run: number; steps: number | null; perBatch: number }
  | { kind: 'speed'; perBatch: number }
  | { kind: 'stop' }
  | { kind: 'add'; line: Packed }
  | { kind: 'remove'; index: number }
  // The page drew the last frame and can take another.
  | { kind: 'ack' }
export type FromRunner =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'stopped'; run: number; reason: string; frame: Frame }
  | { kind: 'error'; message: string }

export function pack(strands: Strand[]): Packed {
  const total = strands.reduce((sum, s) => sum + s.points.length, 0)
  const points = new Float64Array(total), lengths = new Int32Array(strands.length), closed = new Uint8Array(strands.length)
  let at = 0
  strands.forEach((s, i) => { points.set(s.points, at); at += s.points.length; lengths[i] = s.points.length / 2; closed[i] = s.closed ? 1 : 0 })
  return { points, lengths, closed }
}

// Strands that share the packed buffer. Treat them as read-only.
export function unpack({ points, lengths, closed }: Packed): Strand[] {
  const out: Strand[] = []
  let at = 0
  for (let i = 0; i < lengths.length; i++) { out.push({ closed: closed[i] === 1, points: points.subarray(at, at + lengths[i] * 2) }); at += lengths[i] * 2 }
  return out
}

const copyStrands = (strands: Strand[]): Strand[] => strands.map(s => ({ closed: s.closed, points: s.points.slice() }))

type Run = { id: number; remaining: number | null; perBatch: number; timer?: ReturnType<typeof setTimeout> }
const BATCH_MS = 16 // one batch per display frame at most
const DEADLINE_MS = 30 // a batch stops early after this, so Stop and edits are never kept waiting long
// Browsers slow a hidden page's timers, even a worker's, to a few a second. A batch then catches up on the
// steps it missed, for up to half the time since the last batch and never more than this.
const CATCH_UP_MS = 120

export function createRunner(post: (message: FromRunner, transfer: Transferable[]) => void, now: () => number = () => performance.now()) {
  let grower: Grower | null = null
  let run: Run | null = null
  let lastBatch = 0
  let dirty = false, inFlight = false
  // Steps per second over the last second or so of growing.
  let rateSteps = 0, rateStart = 0, rate = 0

  function frame(): [Frame, Transferable[]] {
    const g = grower!
    const packed = pack(g.strands)
    dirty = false
    inFlight = true
    return [{ ...packed, step: g.step, nodes: g.nodes, settling: g.settling, filled: g.filled, stepsPerSecond: run ? rate : 0, held: g.held }, [packed.points.buffer, packed.lengths.buffer, packed.closed.buffer]]
  }
  function flush() {
    if (!grower || !dirty || inFlight) return
    const [out, transfer] = frame()
    post({ kind: 'frame', frame: out }, transfer)
  }
  function end(reason: string) {
    if (!run) return
    clearTimeout(run.timer)
    const id = run.id
    run = null
    rate = 0
    const [out, transfer] = frame()
    post({ kind: 'stopped', run: id, reason, frame: out }, transfer)
  }

  function batch() {
    const current = run, g = grower
    if (!current || !g) return
    const started = now()
    const since = lastBatch ? Math.min(1000, started - lastBatch) : BATCH_MS
    lastBatch = started
    // Growing runs Speed steps per display frame, catching up when timers fire late; Step runs exactly its count.
    const limit = current.remaining === null ? Math.max(current.perBatch, Math.round((current.perBatch * since) / BATCH_MS)) : Math.min(current.perBatch, current.remaining)
    const deadline = current.remaining === null ? Math.min(CATCH_UP_MS, Math.max(DEADLINE_MS, since / 2)) : DEADLINE_MS
    let steps = 0
    while (steps < limit && (steps === 0 || now() - started < deadline)) {
      if (!g.stepOnce()) return end('There are no lines to grow. Draw one, or choose a start shape on the Shape tab.')
      steps++
    }
    const t = now()
    rateSteps += steps
    if (t - rateStart >= 500) { rate = (rateSteps * 1000) / Math.max(1, t - rateStart); rateSteps = 0; rateStart = t }
    dirty = true
    if (current.remaining !== null) {
      current.remaining -= steps
      if (current.remaining <= 0) return end('')
    }
    current.timer = setTimeout(guarded(batch), Math.max(0, BATCH_MS - (t - started)))
    flush()
  }

  function fail(error: unknown) {
    if (run) clearTimeout(run.timer)
    run = null
    post({ kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
  const guarded = (fn: () => void) => () => { try { fn() } catch (error) { fail(error) } }

  function handle(message: ToRunner) {
    switch (message.kind) {
      case 'load':
        grower = new Grower(copyStrands(unpack(message.lines)), message.step, message.params, boundaryOf(message.rings))
        // The page already has these lines; the first frame it needs is the next change.
        dirty = false
        return
      case 'ack': inFlight = false; flush(); return
    }
    const g = grower
    if (!g) return
    switch (message.kind) {
      case 'params': g.setParams(message.params); return
      case 'boundary': g.setBoundary(boundaryOf(message.rings)); return
      case 'speed': if (run) run.perBatch = message.perBatch; return
      case 'play':
        if (run) clearTimeout(run.timer)
        run = { id: message.run, remaining: message.steps, perBatch: Math.max(1, message.perBatch) }
        rateSteps = 0; rateStart = now(); rate = 0; lastBatch = 0
        run.timer = setTimeout(guarded(batch), 0)
        return
      case 'stop': end(''); return
      case 'add': g.strands = [...g.strands, ...copyStrands(unpack(message.line))]; break
      case 'remove': g.strands = g.strands.filter((_, i) => i !== message.index); break
    }
    dirty = true
    flush()
  }

  return { handle: (message: ToRunner) => guarded(() => handle(message))() }
}
