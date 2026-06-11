export interface ParsedLine {
  role: 'user' | 'assistant'
  toolUses: { id: string; name: string; target?: string; subagentType?: string }[]
  toolResultIds: string[]
  hasText: boolean
  isSidechain: boolean
  timestampMs?: number
  sessionId?: string
  cwd?: string
  model?: string
}

function targetOf(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined
  for (const k of ['file_path', 'command', 'pattern', 'url', 'path', 'query', 'description']) {
    const v = input[k]
    if (typeof v === 'string' && v) return v.length > 120 ? v.slice(0, 117) + '...' : v
  }
  return undefined
}

export function parseLine(line: string): ParsedLine | null {
  if (!line.trim()) return null
  let e: any
  try { e = JSON.parse(line) } catch { return null }
  if (e?.type !== 'user' && e?.type !== 'assistant') return null
  const msg = e.message ?? {}
  const raw = msg.content
  const content: any[] = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [{ type: 'text', text: raw }] : []
  const toolUses = content.filter(c => c?.type === 'tool_use')
    .map(c => ({
      id: String(c.id ?? ''), name: String(c.name ?? ''), target: targetOf(c.input),
      subagentType: typeof c.input?.subagent_type === 'string' ? c.input.subagent_type : undefined,
    }))
  const toolResultIds = content.filter(c => c?.type === 'tool_result' && c.tool_use_id)
    .map(c => String(c.tool_use_id))
  const hasText = content.some(c => c?.type === 'text' && typeof c.text === 'string' && c.text.trim().length > 0)
  const ts = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
  return {
    role: e.type,
    toolUses, toolResultIds, hasText,
    isSidechain: e.isSidechain === true,
    timestampMs: Number.isFinite(ts) ? ts : undefined,
    sessionId: typeof e.sessionId === 'string' ? e.sessionId : undefined,
    cwd: typeof e.cwd === 'string' ? e.cwd : undefined,
    model: typeof msg.model === 'string' ? msg.model : undefined,
  }
}
