import type { DataAdapter, FileEvent } from '../types'

export class LocalServerAdapter implements DataAdapter {
  private ws: WebSocket | undefined
  private stopped = false
  private backoffMs = 1000

  async start(onFile: (e: FileEvent) => void): Promise<void> {
    const connect = () => {
      if (this.stopped) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      this.ws = new WebSocket(`${proto}://${location.host}/ws`)
      this.ws.onmessage = ev => {
        try {
          const e = JSON.parse(String(ev.data)) as FileEvent
          if (e && typeof e.content === 'string') { this.backoffMs = 1000; onFile(e) }
        } catch { /* skip malformed frame */ }
      }
      this.ws.onclose = () => {
        if (this.stopped) return
        setTimeout(connect, this.backoffMs)
        this.backoffMs = Math.min(30_000, this.backoffMs * 2)
      }
    }
    connect()
  }

  stop(): void { this.stopped = true; this.ws?.close() }
}
