import type { AgentStatus, SubagentView } from '../types'
import type { ParsedLine } from './transcript'

const TOOL_STATUS: Record<string, AgentStatus> = {
  Write: 'typing', Edit: 'typing', NotebookEdit: 'typing',
  Read: 'reading', Grep: 'reading', Glob: 'reading',
  Bash: 'running',
  WebSearch: 'browsing', WebFetch: 'browsing',
  Task: 'delegating', Agent: 'delegating',
}

// Tools that spawn a subagent. This Claude Code build names the tool `Agent`;
// older/other builds use `Task`. Exact match only — `TaskCreate`/`TaskUpdate` are
// todo-list tools, NOT subagents, and must never create seats.
const SPAWN_TOOLS = new Set(['Task', 'Agent'])

export function statusForTool(name: string): AgentStatus {
  return TOOL_STATUS[name] ?? 'working'
}

export class SessionTracker {
  sessionId?: string
  cwd?: string
  model?: string
  status: AgentStatus = 'idle'
  lastTool?: string
  lastToolTarget?: string
  lastActivityMs = 0
  private open: { id: string; status: AgentStatus }[] = []

  feed(line: ParsedLine): void {
    if (line.timestampMs) this.lastActivityMs = Math.max(this.lastActivityMs, line.timestampMs)
    if (line.isSidechain) {
      // last tool wins for display status; rare multi-tool turns (e.g. [Task, Bash]) show the latest
      const tu = line.toolUses[line.toolUses.length - 1]
      const sub = this.open[this.open.length - 1]
      if (tu && sub) sub.status = statusForTool(tu.name)
      return
    }
    if (line.sessionId) this.sessionId ??= line.sessionId
    if (line.cwd) this.cwd ??= line.cwd
    if (line.model) this.model = line.model

    if (line.role === 'assistant') {
      if (line.toolUses.length > 0) {
        // last tool wins for display status; rare multi-tool turns (e.g. [Task, Bash]) show the latest
        const tu = line.toolUses[line.toolUses.length - 1]!
        this.lastTool = tu.name
        this.lastToolTarget = tu.target
        this.status = statusForTool(tu.name)
        for (const t of line.toolUses) {
          // skip falsy ids: their tool_result could never match, leaking a phantom subagent
          if (SPAWN_TOOLS.has(t.name) && t.id) this.open.push({ id: t.id, status: 'working' })
        }
      } else if (line.hasText) {
        this.status = 'waiting'
      }
    } else {
      if (line.toolResultIds.length > 0) {
        this.open = this.open.filter(s => !line.toolResultIds.includes(s.id))
        // tool finished: agent is processing the result — unless subagents are still out working
        this.status = this.open.length > 0 ? 'delegating' : 'thinking'
      } else if (line.hasText) {
        this.status = 'thinking'
      }
    }
  }

  get subagents(): SubagentView[] {
    return this.open.map(s => ({ id: s.id, status: s.status }))
  }
}
