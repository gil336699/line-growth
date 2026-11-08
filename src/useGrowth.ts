// The page's model of a design: settings, start lines and grown lines, undo history, unsaved state, and the
// growth worker. The worker owns the lines while they grow; the page keeps a mirror of its latest frame for
// drawing, and commits it to the design when growth stops.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Path } from './growth/seeds'
import { addLine, boundaryRings, growthParams, lineLength, nodeCount, planChange, removeLine, resetState, type Design, type GrowthState, type Imported } from './lib/design'
import { emptyHistory, record, redo as redoStep, undo as undoStep, type History } from './lib/history'
import type { Settings } from './lib/settings'
import { GrowthClient } from './worker/client'
import { unpack, type FromRunner } from './worker/runner'

export type Status = { text: string; warning?: boolean } | null
export type Stats = { revision: number; step: number; nodes: number; lines: number; length: number; settling: boolean; rate: number }

// Settings the worker needs while it grows; anything else only changes how lines are drawn.
const GROWTH_KEYS: (keyof Settings)[] = ['maxNodes', 'segmentLength', 'repelRadius', 'repulsion', 'alignment', 'attraction', 'stepSize', 'randomness', 'seed']

export function useGrowth(initial: () => { design: Design; saved: boolean }, setStatus: (status: Status) => void) {
  const [first] = useState(initial)
  const [design, setDesign] = useState<Design>(first.design)
  const committed = useRef<Design>(first.design)
  const live = useRef<GrowthState>(first.design.state)
  const statsOf = (state: GrowthState, revision: number, settling = false, rate = 0): Stats =>
    ({ revision, step: state.step, nodes: nodeCount(state), lines: state.strands.length, length: lineLength(state.strands), settling, rate })
  const [stats, setStats] = useState<Stats>(() => statsOf(first.design.state, 0))
  const revision = useRef(0)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const runningRef = useRef(false)
  const runId = useRef(0)
  const waiters = useRef<(() => void)[]>([])
  const history = useRef<History<Design>>(emptyHistory())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [unsaved, setUnsaved] = useState(!first.saved)
  const client = useRef<GrowthClient | null>(null)
  const statusRef = useRef(setStatus)
  useEffect(() => { statusRef.current = setStatus }, [setStatus])

  const current = useCallback((): Design => ({ ...committed.current, state: live.current }), [])
  const show = useCallback((state: GrowthState, settling = false, rate = 0) => {
    live.current = state
    setStats(statsOf(state, ++revision.current, settling, rate))
  }, [])
  const commit = useCallback((d: Design) => {
    committed.current = d
    setDesign(d)
    show(d.state, nodeCount(d.state) >= d.settings.maxNodes)
  }, [show])
  const syncHistory = () => { setCanUndo(history.current.past.length > 0); setCanRedo(history.current.future.length > 0) }
  const remember = useCallback((before: Design, key: string | null) => {
    history.current = record(history.current, before, key)
    syncHistory()
  }, [])
  const load = useCallback((d: Design) => {
    client.current?.load(d.state.strands, d.state.step, growthParams(d.settings), boundaryRings(d.settings, d.imported))
  }, [])

  useEffect(() => {
    const onMessage = (message: FromRunner) => {
      const c = client.current
      if (message.kind === 'error') {
        runningRef.current = false
        setRunning(false); setStopping(false)
        statusRef.current({ text: `Growth stopped: ${message.message}`, warning: true })
        waiters.current.splice(0).forEach(resolve => resolve())
        return
      }
      const { frame } = message
      const state: GrowthState = { strands: unpack(frame), step: frame.step }
      if (message.kind === 'frame') {
        show(state, frame.settling, frame.stepsPerSecond)
        // Ready for the next frame once this one is drawn, or after a moment when the browser draws no frames
        // (a hidden tab), so the counts still update.
        let acked = false
        const ack = () => { if (!acked) { acked = true; c?.ack() } }
        requestAnimationFrame(ack)
        setTimeout(ack, 250)
        return
      }
      // Stopped: the worker's final lines become the design's.
      const before = committed.current.state.step
      committed.current = { ...committed.current, state }
      setDesign(committed.current)
      show(state, frame.settling, 0)
      c?.ack()
      if (message.run === runId.current) {
        runningRef.current = false
        setRunning(false); setStopping(false)
      }
      if (frame.step !== before) setUnsaved(true)
      if (message.reason) statusRef.current({ text: message.reason, warning: true })
      waiters.current.splice(0).forEach(resolve => resolve())
    }
    const c = new GrowthClient({ onMessage })
    client.current = c
    const d = committed.current
    c.load(d.state.strands, d.state.step, growthParams(d.settings), boundaryRings(d.settings, d.imported))
    return () => { c.dispose(); client.current = null }
  }, [show])

  // Stops growing and waits for the worker's last lines, so nothing after it works from a stale copy.
  const halt = useCallback((): Promise<void> => {
    if (!runningRef.current) return Promise.resolve()
    setStopping(true)
    client.current?.stop()
    return new Promise(resolve => waiters.current.push(resolve))
  }, [])

  const replace = useCallback(async (next: Design, remembered = true) => {
    await halt()
    if (remembered) remember(current(), null)
    commit(next)
    load(next)
    setUnsaved(true)
  }, [halt, remember, current, commit, load])

  // A settings change. Ones that move or restart the lines wait for growth to stop; the rest apply live.
  const change = useCallback((patch: Partial<Settings>, key: string | null = null, imported?: Imported | null) => {
    const apply = () => {
      const cur = current()
      const plan = planChange(cur, patch, imported === undefined ? cur.imported : imported)
      const next = plan.design
      remember(cur, key)
      setUnsaved(true)
      if (next.state !== cur.state || next.imported !== cur.imported || next.settings.shape !== cur.settings.shape) {
        commit(next)
        load(next)
        return
      }
      commit({ ...next, state: live.current })
      if (GROWTH_KEYS.some(k => next.settings[k] !== cur.settings[k])) client.current?.params(growthParams(next.settings))
      if (next.settings.stepsPerFrame !== cur.settings.stepsPerFrame) client.current?.speed(next.settings.stepsPerFrame)
    }
    const cur = current()
    const moves = planChange(cur, patch, imported === undefined ? cur.imported : imported).design.state !== cur.state || imported !== undefined
    if (moves && runningRef.current) void halt().then(apply)
    else apply()
  }, [current, remember, commit, load, halt])

  // Whether a change would start the lines again, losing grown ones, so the page can ask first.
  const discards = useCallback((patch: Partial<Settings>, imported?: Imported | null) => {
    const cur = current()
    return planChange(cur, patch, imported === undefined ? cur.imported : imported).discards
  }, [current])

  const play = useCallback(() => {
    if (runningRef.current) return
    remember(current(), null)
    runningRef.current = true
    setRunning(true)
    runId.current = client.current?.play(null, committed.current.settings.stepsPerFrame) ?? 0
  }, [remember, current])

  const step = useCallback(() => {
    if (runningRef.current) return
    remember(current(), 'step')
    runningRef.current = true
    setRunning(true)
    runId.current = client.current?.play(1, 1) ?? 0
  }, [remember, current])

  const pause = useCallback(() => { if (runningRef.current) { setStopping(true); client.current?.stop() } }, [])

  const reset = useCallback(async () => {
    await halt()
    const cur = current()
    remember(cur, null)
    const next = { ...cur, state: resetState(cur) }
    commit(next)
    load(next)
    setUnsaved(true)
  }, [halt, current, remember, commit, load])

  const undo = useCallback(async () => {
    await halt()
    const result = undoStep(history.current, current())
    if (!result) return
    history.current = result.history
    syncHistory()
    commit(result.state)
    load(result.state)
    setUnsaved(true)
  }, [halt, current, commit, load])

  const redo = useCallback(async () => {
    await halt()
    const result = redoStep(history.current, current())
    if (!result) return
    history.current = result.history
    syncHistory()
    commit(result.state)
    load(result.state)
    setUnsaved(true)
  }, [halt, current, commit, load])

  // Drawing and erasing work while lines grow: the worker takes the edit between steps.
  const draw = useCallback((path: Path) => {
    const cur = current()
    remember(cur, null)
    const next = addLine(cur, path)
    commit(next)
    client.current?.add(next.state.strands[next.state.strands.length - 1])
    setUnsaved(true)
  }, [current, remember, commit])

  const erase = useCallback((index: number) => {
    const cur = current()
    if (!cur.state.strands[index]) return
    remember(cur, null)
    commit(removeLine(cur, index))
    client.current?.remove(index)
    setUnsaved(true)
  }, [current, remember, commit])

  const markSaved = useCallback(() => setUnsaved(false), [])

  return {
    design, stats, live, running, stopping, unsaved, canUndo, canRedo,
    current, change, discards, play, step, pause, reset, undo, redo, draw, erase, replace, markSaved,
  }
}

export type GrowthModel = ReturnType<typeof useGrowth>
