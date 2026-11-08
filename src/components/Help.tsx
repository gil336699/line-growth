import { Modal } from './Modal'

// The quick start card and the ? dialog with every shortcut.

export function QuickStart({ onClose }: { onClose: () => void }) {
  return <section className="quick-start glass" aria-labelledby="quick-start-title">
    <h2 id="quick-start-title">Quick start</h2>
    <ol>
      <li><b>Grow:</b> press <kbd>Space</kbd> and watch the line fold and fill its boundary. Change the forces while it grows.</li>
      <li><b>Shape:</b> pick a boundary and a start shape, draw your own lines, or import an SVG: its largest closed path is the boundary and the rest grow.</li>
      <li><b>File:</b> export SVG or DXF at real size for Illustrator, plotters and lasers, or a PNG.</li>
    </ol>
    <p>Hover over any control to see what it does.</p>
    <button type="button" className="primary" data-tip="Hide this guide. Reopen it from the ? button." onClick={onClose}>Got it</button>
  </section>
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Grow or pause'],
  ['S', 'Grow one step'],
  ['R', 'Reset to the start lines'],
  ['D  E  H', 'Draw, Erase and Pan tools'],
  ['Space + drag', 'Pan with any tool'],
  ['Scroll, pinch', 'Zoom'],
  ['+  −  F', 'Zoom in, out, fit'],
  ['1  2', 'Boundary, nodes'],
  ['⌘Z  ⇧⌘Z', 'Undo, redo'],
  ['⌘S  ⌘O', 'Save, open project'],
  ['Esc', 'Close, or back to Draw'],
  ['?', 'This list'],
]

export function HelpDialog({ onClose, onQuickStart }: { onClose: () => void; onQuickStart: () => void }) {
  return <Modal labelledBy="help-title" onClose={onClose}>
    <h2 id="help-title">Keyboard shortcuts</h2>
    <dl>{SHORTCUTS.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
    <p className="hint">On touch screens, one finger draws or erases and two fingers pan and zoom. On Windows, use Ctrl for ⌘.</p>
    <div className="confirm-actions">
      <button type="button" data-tip="Show the three-step guide again." onClick={onQuickStart}>Show quick start</button>
      <button type="button" className="primary" data-autofocus onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export type Pending = { title: string; body: string; confirm: string; run: () => void }

export function ConfirmDialog({ pending, onCancel }: { pending: Pending; onCancel: () => void }) {
  return <Modal role="alertdialog" labelledBy="confirm-title" describedBy="confirm-body" onClose={onCancel}>
    <h2 id="confirm-title">{pending.title}</h2>
    <p id="confirm-body" className="hint">{pending.body}</p>
    <div className="confirm-actions">
      <button type="button" data-autofocus data-tip="Keep the current design." onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" data-tip="Continue. Undo can bring the current lines back." onClick={() => { onCancel(); pending.run() }}>{pending.confirm}</button>
    </div>
  </Modal>
}
