import { memo, type ReactNode } from 'react'
import type { Settings } from '../lib/settings'
import { formatLength, formatLong } from '../lib/units'
import type { Stats } from '../useGrowth'
import { Button } from './Controls'
import { Icon, type IconName } from './Icon'
import type { Tool } from './Stage'

// The floating bars round the sheet: tools and visibility on top, growth controls and status below, and
// the measurements panel.

const TOOLS: { id: Tool; label: string; icon: IconName; key: string; tip: string }[] = [
  { id: 'draw', label: 'Draw', icon: 'draw', key: 'D', tip: 'Drag to draw a line to grow; it stops where it meets another line. End where you started to close it. Click between lines to add a small circle.' },
  { id: 'erase', label: 'Erase', icon: 'erase', key: 'E', tip: 'Click a line to remove it.' },
  { id: 'pan', label: 'Pan', icon: 'pan', key: 'H', tip: 'Drag to move the view. Holding Space pans with any tool.' },
]

const TOOL_CAPTION: Record<Tool, string> = {
  draw: 'Drag to draw a line · End at the start to close it · Click for a circle · Space+drag to pan · Scroll to zoom',
  erase: 'Click a line to remove it · Esc for Draw',
  pan: 'Drag to move the view · Scroll or pinch to zoom · Esc for Draw',
}

export type ViewKey = 'showBoundary' | 'showNodes'

export function ViewBar({ tool, setTool, s, toggle, zoom, onFit, onZoom }: {
  tool: Tool; setTool: (tool: Tool) => void; s: Settings
  toggle: (key: ViewKey) => void; zoom: number; onFit: () => void; onZoom: (factor: number) => void
}) {
  return <div className="viewport-bars">
    <div className="viewport-bar-row">
      <div className="floating-bar glass" role="toolbar" aria-label="Tools">
        {TOOLS.map(t => <Button key={t.id} pressed={tool === t.id} tip={t.tip} shortcut={t.key} label={t.label} onClick={() => setTool(t.id)}>
          <Icon name={t.icon} /><span className="compact-label">{t.label}</span></Button>)}
      </div>
      <div className="floating-bar glass" role="toolbar" aria-label="Show">
        <Button pressed={s.showBoundary} shortcut="1" tip="Show or hide the boundary the lines grow inside. Exports include it when it’s shown." onClick={() => toggle('showBoundary')}>Boundary</Button>
        <Button pressed={s.showNodes} shortcut="2" tip="Show or hide the nodes, the points the lines are made of. Exports include them when they’re shown." onClick={() => toggle('showNodes')}>Nodes</Button>
        <span className="bar-divider" aria-hidden="true" />
        <Button className="icon-button zoom-step" label="Zoom out" shortcut="−" tip="Zoom out." onClick={() => onZoom(1 / 1.25)}><Icon name="minus" /></Button>
        <Button className="zoom-readout" shortcut="F" tip="Fit the whole sheet in the window." label={`Zoom ${Math.round(zoom * 100)} percent. Fit to window`} onClick={onFit}>{Math.round(zoom * 100)}%</Button>
        <Button className="icon-button zoom-step" label="Zoom in" shortcut="+" tip="Zoom in." onClick={() => onZoom(1.25)}><Icon name="plus" /></Button>
      </div>
    </div>
    <p className="view-caption"><span>{TOOL_CAPTION[tool]}</span></p>
  </div>
}

export function Dock({ running, stopping, canGrow, onGrow, onPause, onStep, onReset, canReset, status, warning, canUndo, canRedo, onUndo, onRedo }: {
  running: boolean; stopping: boolean; canGrow: string | false
  onGrow: () => void; onPause: () => void; onStep: () => void; onReset: () => void; canReset: string | false
  status: ReactNode; warning: boolean; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void
}) {
  const busy = running && 'Pause the growth first.'
  return <div className="dock">
    <div className="timeline glass">
      <div className="transport" role="group" aria-label="Growth">
        {running
          ? <Button className="primary" shortcut="Space" unavailable={stopping && 'Stopping after the current step…'} tip="Pause the growth. Press Grow to carry on." onClick={onPause}>
            <Icon name="pause" />{stopping ? 'Stopping…' : 'Pause'}</Button>
          : <Button className="primary" shortcut="Space" unavailable={canGrow} tip="Grow the lines until you pause. Settings can change while they grow." onClick={onGrow}>
            <Icon name="play" />Grow</Button>}
        <Button shortcut="S" unavailable={busy || canGrow} tip="Grow by a single step." onClick={onStep}><Icon name="step" /><span className="compact-label">Step</span></Button>
        <Button shortcut="R" unavailable={canReset} tip="Go back to the start lines. Undo brings the growth back." onClick={onReset}><Icon name="reset" /><span className="compact-label">Reset</span></Button>
      </div>
      <span className="timeline-status" role="status" data-warning={warning}>{status}</span>
      <div className="transport" role="group" aria-label="History">
        <Button className="icon-button" label="Undo" shortcut="⌘Z" unavailable={!canUndo && 'Nothing to undo yet.'} tip="Undo the last change. Undoing while lines grow pauses them first." onClick={onUndo}><Icon name="undo" /></Button>
        <Button className="icon-button" label="Redo" shortcut="⇧⌘Z" unavailable={!canRedo && 'Nothing to redo.'} tip="Redo the change you undid." onClick={onRedo}><Icon name="redo" /></Button>
      </div>
    </div>
  </div>
}

// Memoised on the numbers it shows, so it redraws with the frame counter only.
export const Inspector = memo(function Inspector({ s, stats, boundaryLength, boundaryPoints }: { s: Settings; stats: Stats; boundaryLength: number; boundaryPoints: number }) {
  const length = stats.length
  const L = (mm: number) => formatLength(mm, s.units, s.dpi, true)
  const rows: [string, string, string][] = [
    ['Sheet', `${formatLength(s.width, s.units, s.dpi)} × ${formatLength(s.height, s.units, s.dpi)}`, 'Width × height of the sheet, which is also the size of every export.'],
    ['Nodes', `${stats.nodes.toLocaleString()} of ${s.maxNodes.toLocaleString()}`, 'Points the lines are made of. New ones are added until the limit, then the lines keep settling.'],
    ['Lines', stats.lines.toLocaleString(), 'Separate lines growing. They push each other away but never join.'],
    ['Steps', stats.step.toLocaleString(), 'Growth steps since the start lines.'],
    ['Line length', formatLong(length, s.units), 'Total length of every line, to estimate plotter or laser time.'],
    ['Average segment', stats.nodes > stats.lines ? L(length / Math.max(1, stats.nodes - stats.lines)) : '—', 'Average distance between neighbouring nodes. Growth aims for the segment length.'],
    ['Boundary', `${formatLong(boundaryLength, s.units)} · ${boundaryPoints.toLocaleString()} points`, 'Length of the boundary, and the fixed points along it, one segment length apart, that push the lines away from the edge.'],
    ['Speed', stats.rate ? `${Math.round(stats.rate).toLocaleString()} steps/s` : '—', 'Steps per second while growing.'],
  ]
  return <section className="measurements" aria-labelledby="measure-title">
    <h2 id="measure-title">Measurements</h2>
    <dl>{rows.map(([term, value, tip]) => <div key={term}><dt data-tip={tip} tabIndex={0}>{term}</dt><dd>{value}</dd></div>)}</dl>
  </section>
})
