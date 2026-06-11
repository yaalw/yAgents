export type AgentStatus =
  | 'typing' | 'reading' | 'running' | 'browsing'
  | 'thinking' | 'waiting' | 'delegating' | 'working' | 'idle'

/** Raw file snapshot from any adapter. content is the file's full text, or its last
 *  256 KB for large files (may start mid-line; the parser skips partial first lines). */
export interface FileEvent {
  dirKey: string      // encoded PROJECT dir name, e.g. "-Users-y-webshop" (also for nested subagent files)
  fileName: string    // e.g. "abc123.jsonl" or "agent-xyz.jsonl"
  content: string
  mtimeMs: number
  /** Real Claude Code writes each subagent's transcript to
   *  <projectDir>/<sessionId>/subagents/agent-*.jsonl with a sibling agent-*.meta.json.
   *  Adapters surface those nested files with kind:'subagent' plus the join keys below. */
  kind?: 'subagent'
  sessionId?: string  // parent session id (the <sessionId> path segment)
  toolUseId?: string  // the Agent tool_use id in the parent transcript (from agent-*.meta.json)
  agentType?: string  // from agent-*.meta.json
  description?: string// from agent-*.meta.json
}

export interface SubagentView { id: string; status: AgentStatus; description?: string; agentType?: string }

export interface TableView {
  key: string                 // dirKey + '/' + fileName
  sessionId?: string
  status: AgentStatus
  lastTool?: string
  lastToolTarget?: string
  model?: string
  lastActivityMs: number
  subagents: SubagentView[]
}

export interface RoomView { dirKey: string; label: string; cwd?: string; tables: TableView[] }
export interface OfficeView { rooms: RoomView[] }

export interface DataAdapter {
  start(onFile: (e: FileEvent) => void): Promise<void>
  stop(): void
}
