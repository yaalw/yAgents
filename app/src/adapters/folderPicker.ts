import type { DataAdapter, FileEvent } from '../types'

const TAIL_BYTES = 256 * 1024
/** Subagent transcripts accumulate forever (dozens per session); only surface ones
 *  touched within the store's longest liveness window. Sessions are never filtered
 *  here — expiry policy for them lives in OfficeStore. */
const SUBAGENT_FRESH_MS = 30 * 60_000

interface SubagentMeta { toolUseId?: string; agentType?: string; description?: string }

export class FolderPickerAdapter implements DataAdapter {
  private timer: ReturnType<typeof setInterval> | undefined
  private seen = new Map<string, number>() // "dir/.../file" → lastModified

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
          if (fh.kind === 'file') {
            if (!fh.name.endsWith('.jsonl')) continue
            const e = await this.readIfChanged(dir.name + '/' + fh.name, fh)
            if (e) onFile({ dirKey: dir.name, fileName: fh.name, ...e })
          } else if (fh.kind === 'directory') {
            // Real Claude Code nests per-subagent transcripts at
            // <projectDir>/<sessionId>/subagents/agent-*.jsonl (+ sibling agent-*.meta.json)
            await this.pollSubagents(dir.name, fh, onFile)
          }
        }
      }
    } catch {
      // permission revoked or transient FS error — skip this cycle; UI shows stale state
    }
  }

  private async pollSubagents(dirKey: string, sessionDir: any, onFile: (e: FileEvent) => void): Promise<void> {
    let subDir: any
    try { subDir = await sessionDir.getDirectoryHandle('subagents') } catch { return } // no subagents (e.g. memory/)
    for await (const fh of subDir.values()) {
      if (fh.kind !== 'file' || !fh.name.startsWith('agent-') || !fh.name.endsWith('.jsonl')) continue
      const e = await this.readIfChanged(dirKey + '/' + sessionDir.name + '/subagents/' + fh.name, fh, SUBAGENT_FRESH_MS)
      if (!e) continue
      const meta = await this.readMeta(subDir, fh.name)
      onFile({
        dirKey, fileName: fh.name, kind: 'subagent', sessionId: sessionDir.name,
        toolUseId: meta.toolUseId, agentType: meta.agentType, description: meta.description,
        ...e,
      })
    }
  }

  /** Sibling agent-*.meta.json: { agentType, description, toolUseId } — the join key
   *  back to the Agent tool_use in the parent transcript. Missing/corrupt → empty. */
  private async readMeta(subDir: any, jsonlName: string): Promise<SubagentMeta> {
    try {
      const fh = await subDir.getFileHandle(jsonlName.replace(/\.jsonl$/, '.meta.json'))
      const parsed = JSON.parse(await (await fh.getFile()).text())
      return {
        toolUseId: typeof parsed?.toolUseId === 'string' ? parsed.toolUseId : undefined,
        agentType: typeof parsed?.agentType === 'string' ? parsed.agentType : undefined,
        description: typeof parsed?.description === 'string' ? parsed.description : undefined,
      }
    } catch { return {} }
  }

  private async readIfChanged(key: string, fh: any, freshMs?: number): Promise<{ content: string; mtimeMs: number } | undefined> {
    const file = await fh.getFile()
    if (freshMs !== undefined && Date.now() - file.lastModified > freshMs) return undefined
    if (this.seen.get(key) === file.lastModified) return undefined
    this.seen.set(key, file.lastModified)
    const content: string = file.size > TAIL_BYTES
      ? await file.slice(file.size - TAIL_BYTES).text()
      : await file.text()
    return { content, mtimeMs: file.lastModified }
  }
}
