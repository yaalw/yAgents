export type AgentStatus =
  | 'typing' | 'reading' | 'running' | 'browsing'
  | 'thinking' | 'waiting' | 'delegating' | 'working' | 'idle'

/** Raw file snapshot from any adapter. content is the (tail of the) whole JSONL file. */
export interface FileEvent {
  dirKey: string      // encoded project dir name, e.g. "-Users-y-webshop"
  fileName: string    // e.g. "abc123.jsonl" or "agent-xyz.jsonl"
  content: string
  mtimeMs: number
}

export interface SubagentView { id: string; status: AgentStatus }

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
