import type { DataAdapter, FileEvent } from '../types'

const TAIL_BYTES = 256 * 1024

export class FolderPickerAdapter implements DataAdapter {
  private timer: ReturnType<typeof setInterval> | undefined
  private seen = new Map<string, number>() // "dir/file" → lastModified

  constructor(private root: FileSystemDirectoryHandle, private pollMs = 1000) {}

  async start(onFile: (e: FileEvent) => void): Promise<void> {
    await this.pollOnce(onFile)
    if (this.pollMs > 0) {
      this.timer = setInterval(() => { void this.pollOnce(onFile) }, this.pollMs)
    }
  }

  stop(): void { if (this.timer) clearInterval(this.timer) }

  async pollOnce(onFile: (e: FileEvent) => void): Promise<void> {
    try {
      for await (const dir of (this.root as any).values()) {
        if (dir.kind !== 'directory') continue
        for await (const fh of dir.values()) {
          if (fh.kind !== 'file' || !fh.name.endsWith('.jsonl')) continue
          const file = await fh.getFile()
          const key = dir.name + '/' + fh.name
          if (this.seen.get(key) === file.lastModified) continue
          this.seen.set(key, file.lastModified)
          const content: string = file.size > TAIL_BYTES
            ? await file.slice(file.size - TAIL_BYTES).text()
            : await file.text()
          onFile({ dirKey: dir.name, fileName: fh.name, content, mtimeMs: file.lastModified })
        }
      }
    } catch {
      // permission revoked or transient FS error — skip this cycle; UI shows stale state
    }
  }
}
