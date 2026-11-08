// Fixed colours shared by the preview and the exports.
export const BOUNDARY_COLOR = '#00b8a3' // the Illustrator panel's mint boundary guide, a shade deeper so it reads on white
export const HOVER_COLOR = '#ff3b30'
export const DRAFT_COLOR = '#0a84ff'

// The boundary line is a little thinner than the growing lines, as the panel drew it.
export const boundaryWidth = (lineWidth: number) => lineWidth * 0.75
// Node dots are just wider than the line, so they read on top of it.
export const nodeRadius = (lineWidth: number) => lineWidth * 0.9
