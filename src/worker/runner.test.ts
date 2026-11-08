import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boundaryOf } from '../growth/boundary'
import { Grower, type GrowthParams, type Strand } from '../growth/engine'
import { ellipseRing, flat, resample, type Polygon } from '../growth/geometry'
import { createRunner, pack, unpack, type FromRunner } from './runner'

const rings: Polygon[] = [[[0, 0], [300, 0], [300, 300], [0, 300]]]
const params: GrowthParams = { maxNodes: 500, segmentLength: 7, repelRadius: 18, repulsion: 0.75, alignment: 0.35, attraction: 0.32, stepSize: 0.65, randomness: 0.3, seed: 4 }
const start = (): Strand[] => [{ closed: true, points: flat(resample(ellipseRing(150, 150, 20, 20, 0.01), true, 9)) }]

describe('growth worker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends one frame at a time and ends a set number of steps exactly where a direct run does', () => {
    const got: FromRunner[] = []
    let clock = 0
    const runner = createRunner(message => got.push(message), () => (clock += 1))
    runner.handle({ kind: 'load', lines: pack(start()), step: 0, params, rings })
    runner.handle({ kind: 'play', run: 1, steps: 120, perBatch: 7 })
    vi.advanceTimersByTime(20)
    expect(got.filter(m => m.kind === 'frame')).toHaveLength(1)
    // Without an acknowledgement the worker keeps stepping but sends nothing more.
    vi.advanceTimersByTime(200)
    expect(got.filter(m => m.kind === 'frame')).toHaveLength(1)
    for (let i = 0; i < 40 && !got.some(m => m.kind === 'stopped'); i++) { runner.handle({ kind: 'ack' }); vi.advanceTimersByTime(20) }
    const stopped = got.find(m => m.kind === 'stopped')
    expect(stopped?.kind).toBe('stopped')
    if (stopped?.kind !== 'stopped') return
    expect(stopped.frame.step).toBe(120)
    const direct = new Grower(start(), 0, params, boundaryOf(rings))
    for (let i = 0; i < 120; i++) direct.stepOnce()
    expect(unpack(stopped.frame).map(s => Array.from(s.points))).toEqual(direct.strands.map(s => Array.from(s.points)))
  })

  it('applies edits between steps and stops when asked', () => {
    const got: FromRunner[] = []
    const runner = createRunner(message => got.push(message))
    runner.handle({ kind: 'load', lines: pack(start()), step: 0, params, rings })
    runner.handle({ kind: 'add', line: pack([{ closed: false, points: Float64Array.from([20, 20, 60, 40]) }]) })
    const frame = got.find(m => m.kind === 'frame')
    expect(frame?.kind === 'frame' && frame.frame.lengths.length).toBe(2)
    runner.handle({ kind: 'ack' })
    runner.handle({ kind: 'play', run: 2, steps: null, perBatch: 3 })
    vi.advanceTimersByTime(100)
    runner.handle({ kind: 'stop' })
    const stopped = got.find(m => m.kind === 'stopped')
    expect(stopped?.kind === 'stopped' && stopped.frame.step).toBeGreaterThan(0)
    expect(stopped?.kind === 'stopped' && stopped.run).toBe(2)
  })
})
