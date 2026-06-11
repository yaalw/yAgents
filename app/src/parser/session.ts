import type { AgentStatus, SubagentView } from '../types'
import type { ParsedLine } from './transcript'

const TOOL_STATUS: Record<string, AgentStatus> = {
  Write: 'typing', Edit: 'typing', NotebookEdit: 'typing',
  Read: 'reading', Grep: 'reading', Glob: 'reading',
  Bash: 'running',
  WebSearch: 'browsing', WebFetch: 'browsing',
  Task: 'delegating', Agent: 'delegating',
  // These tools put a prompt on the user's screen and block until answered: the
  // moment their tool_use is written, the session is waiting on YOU. Their
  // tool_result (the answer) flips the status back via the normal result path.
  AskUserQuestion: 'waiting', ExitPlanMode: 'waiting',
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
  private open: { id: string; status: AgentStatus; description?: string; agentType?: string }[] = []

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
          // (targetOf picks `description` for Agent/Task inputs — it's the human-readable label)
          if (SPAWN_TOOLS.has(t.name) && t.id) {
            this.open.push({ id: t.id, status: 'working', description: t.target, agentType: t.subagentType })
          }
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
    return this.open.map(s => ({ id: s.id, status: s.status, description: s.description, agentType: s.agentType }))
  }

  /** Drive one open subagent from its OWN transcript (nested agent-*.jsonl).
   *  toolUseId is the Agent tool_use id that spawned it (join key from agent-*.meta.json);
   *  undefined falls back to the newest open subagent (demo / legacy top-level agent files).
   *  Returns false when no matching subagent is open (e.g. stale file → caller drops it). */
  updateSubagent(toolUseId: string | undefined, patch: { status?: AgentStatus; description?: string; agentType?: string }): boolean {
    const sub = toolUseId ? this.open.find(s => s.id === toolUseId) : this.open[this.open.length - 1]
    if (!sub) return false
    if (patch.status) sub.status = patch.status
    if (patch.description) sub.description = patch.description
    if (patch.agentType) sub.agentType = patch.agentType
    return true
  }

  /** Carry live subagent state across a from-scratch rebuild of the main transcript.
   *  The main file contains no per-subagent activity (that lives in nested agent files),
   *  so a rebuild resets every open subagent to the spawn default 'working'. Re-adopt the
   *  old tracker's richer state — but never clobber a status the rebuild itself derived
   *  (demo sessions carry isSidechain lines in-file, and those are fresher). */
  adoptSubagentState(prev: SessionTracker): void {
    for (const sub of this.open) {
      const old = prev.open.find(o => o.id === sub.id)
      if (!old) continue
      if (sub.status === 'working' && old.status !== 'working') sub.status = old.status
      sub.description ??= old.description
      sub.agentType ??= old.agentType
    }
  }
}
