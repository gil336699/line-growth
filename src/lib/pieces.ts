// Illustrator keeps a path's point count in 16 bits: a closed path of 32,767 points or more opens empty or cut to
// the count left over past each 32,768 (82,406 points opened as 16,870, an 80,000-point DXF polyline as 14,464),
// and Join refuses to make a path that long. Tested in Illustrator 2026: closed paths of 32,000 points open whole,
// in SVG and DXF. So a line of more than this many segments is written as pieces that meet end to end.
export const MAX_PATH_SEGMENTS = 32_000

// The segments [start, end) of each piece of a line with this many segments, as even as they can be.
export function pieceRanges(count: number, max = MAX_PATH_SEGMENTS): [number, number][] {
  if (count <= max) return [[0, count]]
  const pieces = Math.ceil(count / max), size = Math.ceil(count / pieces)
  const out: [number, number][] = []
  for (let start = 0; start < count; start += size) out.push([start, Math.min(count, start + size)])
  return out
}

// Segments in a line of n nodes: a closed line has one more, back to its start.
export const segmentCount = (n: number, closed: boolean) => (closed ? n : Math.max(0, n - 1))
