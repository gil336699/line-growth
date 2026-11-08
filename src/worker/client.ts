// The page's side of the growth worker. Every message is fire-and-forget; frames and stops come back
// through the callbacks.
import type { GrowthParams, Strand } from '../growth/engine'
import type { Polygon } from '../growth/geometry'
import { pack, type FromRunner, type ToRunner } from './runner'

export type Handlers = { onMessage: (message: FromRunner) => void }

export class GrowthClient {
  private worker: Worker
  private runs = 0

  constructor(handlers: Handlers) {
    this.worker = new Worker(new URL('./growth.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<FromRunner>) => handlers.onMessage(event.data)
    this.worker.onerror = event => handlers.onMessage({ kind: 'error', message: event.message || 'The growth worker stopped.' })
  }

  private send(message: ToRunner, transfer: Transferable[] = []) { this.worker.postMessage(message, transfer) }

  load(strands: Strand[], step: number, params: GrowthParams, rings: Polygon[]) {
    const lines = pack(strands)
    this.send({ kind: 'load', lines, step, params, rings }, [lines.points.buffer])
  }
  params(params: GrowthParams) { this.send({ kind: 'params', params }) }
  boundary(rings: Polygon[]) { this.send({ kind: 'boundary', rings }) }
  play(steps: number | null, perBatch: number): number { this.send({ kind: 'play', run: ++this.runs, steps, perBatch }); return this.runs }
  speed(perBatch: number) { this.send({ kind: 'speed', perBatch }) }
  stop() { this.send({ kind: 'stop' }) }
  add(strand: Strand) { const line = pack([strand]); this.send({ kind: 'add', line }, [line.points.buffer]) }
  remove(index: number) { this.send({ kind: 'remove', index }) }
  ack() { this.send({ kind: 'ack' }) }
  dispose() { this.worker.terminate() }
}
