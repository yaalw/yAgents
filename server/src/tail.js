import { openSync, fstatSync, readSync, closeSync } from 'node:fs'

const TAIL_BYTES = 256 * 1024

export function readTail(filePath) {
  let fd
  try {
    fd = openSync(filePath, 'r')
    const { size } = fstatSync(fd)
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
