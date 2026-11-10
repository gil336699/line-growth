import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { withResolution } from './render'

// A PNG as the browser writes it, with no pHYs: the signature, a header for a 1 × 1 image, a data chunk and the end.
const chunk = (type: string, data: number[]) => {
  const body = Buffer.from([...Buffer.from(type, 'latin1'), ...data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  chunk('IDAT', [120, 156, 99, 96, 0, 0, 0, 2, 0, 1]),
  chunk('IEND', []),
])
const chunks = (bytes: Buffer) => {
  const out: { type: string; data: Buffer; crc: number }[] = []
  for (let at = 8; at < bytes.length;) {
    const n = bytes.readUInt32BE(at)
    out.push({ type: bytes.toString('latin1', at + 4, at + 8), data: bytes.subarray(at + 8, at + 8 + n), crc: bytes.readUInt32BE(at + 8 + n) })
    at += 12 + n
  }
  return out
}

describe('PNG export', () => {
  it('says its pixels per inch, so Illustrator and Photoshop place it at real size', async () => {
    const out = Buffer.from(await (await withResolution(new Blob([png]), 300)).arrayBuffer())
    const list = chunks(out)
    expect(list.map(c => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])
    const phys = list[1]
    // 300 pixels per inch is 11,811 pixels per metre, the unit PNG uses.
    expect([phys.data.readUInt32BE(0), phys.data.readUInt32BE(4), phys.data[8]]).toEqual([11811, 11811, 1])
    expect(phys.crc).toBe(crc32(Buffer.concat([Buffer.from('pHYs', 'latin1'), phys.data])))
    // Written again, it replaces the old one.
    const again = chunks(Buffer.from(await (await withResolution(new Blob([out]), 150)).arrayBuffer()))
    expect(again.filter(c => c.type === 'pHYs').map(c => c.data.readUInt32BE(0))).toEqual([5906])
  })
})
