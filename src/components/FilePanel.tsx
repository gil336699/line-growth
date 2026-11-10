import { memo } from 'react'
import { listWords } from '../lib/listWords'
import { pngProblem } from '../lib/render'
import type { Settings } from '../lib/settings'
import { exportContents } from '../lib/svgExport'
import { MAX_PATH_SEGMENTS } from '../lib/pieces'
import { pixelSize } from '../lib/units'
import { Button, Section, SwitchField } from './Controls'
import type { Change } from './GrowPanel'

export type ExportKind = 'svg' | 'dxf' | 'png'

// Memoised: the panel only re-renders when its own props change, not on every growth frame.
export const FilePanel = memo(function FilePanel({ s, change, splitInto, unsaved, busy, fromFile, onNew, onOpen, onSave, onExport, openError }: {
  s: Settings; change: Change; splitInto: number; unsaved: boolean; busy: string | false; fromFile: boolean
  onNew: () => void; onOpen: () => void; onSave: () => void; onExport: (kind: ExportKind) => void; openError: string
}) {
  const [pw, ph] = pixelSize(s.width, s.height, s.dpi)
  const pngBlocked = pngProblem(pw, ph)
  const fileUnits = s.units === 'in' ? 'inches' : s.units === 'pt' ? 'points' : s.units === 'px' ? 'pixels' : 'millimetres'
  const contents = listWords(exportContents(s))
  return <>
    <Section title="Project">
      <p className="hint save-state">{unsaved ? <><span className="dot" aria-hidden="true" />Unsaved changes since the last save.</> : 'All changes saved.'}</p>
      <div className="button-row three">
        <Button tip="Start a new design with the default settings." onClick={onNew}>New</Button>
        <Button tip="Open a Line Growth project file (.linegrowth.json)." shortcut="⌘O" onClick={onOpen}>Open…</Button>
        <Button className="primary" tip="Save the settings, the start lines and every grown node as a project file you can reopen and keep growing." shortcut="⌘S" unavailable={busy} onClick={onSave}>Save</Button>
      </div>
      {openError && <p className="hint error" role="alert">{openError}</p>}
    </Section>

    <Section title="For Illustrator, plotters and lasers">
      <div className="button-row">
        <Button tip={`The lines as paths at real size, sized in ${fileUnits}, on a page the size of the sheet. Opens in Illustrator, Inkscape, Figma and laser software.`} unavailable={busy} onClick={() => onExport('svg')}>SVG</Button>
        <Button tip={`AutoCAD R12 DXF in ${s.units === 'in' ? 'inches' : 'millimetres'}, one polyline per line (past Illustrator’s limit, polylines that meet end to end), for CAD, plotters and CAM.`} unavailable={busy} onClick={() => onExport('dxf')}>DXF</Button>
      </div>
      <SwitchField label="Smooth curves" checked={s.smoothCurves}
        tip="Write SVG lines as smooth curves through every node, with fewer corners. Off writes straight segments between nodes, as the Illustrator panel did."
        onChange={smoothCurves => change({ smoothCurves }, 'smoothCurves')} />
      {splitInto > 1 && <p className="hint warning">Illustrator can’t hold a path of 32,767 points or more, so the longest line exports as {splitInto} paths that meet end to end, in SVG and DXF{s.fill ? ', and its fill as one shape that fills exactly' : ''}. For one closed path, keep each line at {MAX_PATH_SEGMENTS.toLocaleString()} nodes or fewer with Max nodes on the Grow tab.</p>}
      <p className="hint">Exports hold what the view shows: {contents}.{s.fill ? ' DXF holds no fill.' : ''}{fromFile ? ' The page matches the imported SVG: open the SVG in Illustrator, copy it all, and use Edit › Paste in Place in your file to line it up with your artwork.' : ''}</p>
    </Section>

    <Section title="For images">
      <div className="button-row">
        <Button tip={`A ${pw.toLocaleString()} × ${ph.toLocaleString()} px image at ${s.dpi} pixels per inch.`} unavailable={busy || (pngBlocked ?? false)} onClick={() => onExport('png')}>PNG</Button>
      </div>
      <SwitchField label="Transparent background" checked={s.transparentPng} tip="Leave the sheet colour out of the PNG." onChange={transparentPng => change({ transparentPng }, 'transparentPng')} />
      <p className="hint">{pngBlocked ?? `PNG: ${pw.toLocaleString()} × ${ph.toLocaleString()} px. Exports always show the whole sheet, whatever the zoom.`}</p>
    </Section>
  </>
})

