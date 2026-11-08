// Numbers for files: millimetres to a thousandth, without trailing zeros.
export function num(value: number, digits = 3): string {
  const text = value.toFixed(digits)
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text
  return trimmed === '-0' ? '0' : trimmed
}
