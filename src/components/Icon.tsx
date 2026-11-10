// Small symbols for buttons, drawn on a 24-unit grid to sit with 12–13 px text.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const PATHS = {
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6Z" />,
  pause: <g><rect x="6.5" y="5" width="4" height="14" rx="1.4" /><rect x="13.5" y="5" width="4" height="14" rx="1.4" /></g>,
  dice: <g {...stroke}><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r=".9" fill="currentColor" /><circle cx="15" cy="15" r=".9" fill="currentColor" /><circle cx="15" cy="9" r=".9" fill="currentColor" /><circle cx="9" cy="15" r=".9" fill="currentColor" /></g>,
  step: <g><path d="M5 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L6.52 4.75A1 1 0 0 0 5 5.6Z" /><rect x="17" y="5" width="3" height="14" rx="1.2" /></g>,
  reset: <g {...stroke}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></g>,
  draw: <g {...stroke}><path d="M4 20c3-1 4.5-4 7-6.5L17.5 7a2.1 2.1 0 0 0-3-3L8 10.5C5.5 13 5 17 4 20Z" /><path d="m13 5.5 3 3" /></g>,
  undo: <g {...stroke}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></g>,
  redo: <g {...stroke}><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></g>,
  erase: <g {...stroke}><path d="m15 4 5 5-9.5 9.5H6L3.5 16a1.4 1.4 0 0 1 0-2Z" /><path d="M9.5 9.5l5 5M10.5 18.5H20" /></g>,
  pan: <g {...stroke}><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" /></g>,
  minus: <g {...stroke}><path d="M6 12h12" /></g>,
  plus: <g {...stroke}><path d="M12 6v12M6 12h12" /></g>,
  import: <g {...stroke}><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></g>,
  cells: <g {...stroke}><path d="M4 4h16v16H4Z" /><path d="M4 11l5-1 3-6M9 10l3 5 8-2M12 15l-2 5M12 15l8-2" /></g>,
  swap: <g {...stroke}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></g>,
}

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">{PATHS[name]}</svg>
}
