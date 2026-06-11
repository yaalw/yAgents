import { describe, it, expect } from 'vitest'
import { SessionTracker, statusForTool } from '../src/parser/session'
import { parseLine } from '../src/parser/transcript'

const feed = (t: SessionTracker, obj: object) => t.feed(parseLine(JSON.stringify(obj))!)
const asstTool = (id: string, name: string, input: object = {}) => ({
  type: 'assistant', timestamp: '2026-06-04T01:00:00Z', sessionId: 's1', cwd: '/Users/y/webshop',
  message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'tool_use', id, name, input }] },
})
const asstText = () => ({
  type: 'assistant', timestamp: '2026-06-04T01:00:05Z', sessionId: 's1',
  message: { role: 'assistant', content: [{ type: 'text', text: 'done!' }] },
})
const userResult = (id: string) => ({
  type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id }] },
})
const userText = () => ({ type: 'user', message: { role: 'user', content: 'please continue' } })

describe('statusForTool', () => {
  it('maps known tools', () => {
    expect(statusForTool('Write')).toBe('typing')
    expect(statusForTool('Edit')).toBe('typing')
    expect(statusForTool('Read')).toBe('reading')
    expect(statusForTool('Grep')).toBe('reading')
    expect(statusForTool('Bash')).toBe('running')
    expect(statusForTool('WebSearch')).toBe('browsing')
    expect(statusForTool('Task')).toBe('delegating')
    expect(statusForTool('Agent')).toBe('delegating')
  })
  it('maps unknown tools to working (never crash)', () => {
    expect(statusForTool('SomeFutureTool')).toBe('working')
  })
})

describe('SessionTracker', () => {
  it('tracks tool activity and metadata', () => {
    const t = new SessionTracker()
    feed(t, asstTool('t1', 'Write', { file_path: 'a.ts' }))
    expect(t.status).toBe('typing')
    expect(t.lastTool).toBe('Write')
    expect(t.lastToolTarget).toBe('a.ts')
    expect(t.sessionId).toBe('s1')
    expect(t.cwd).toBe('/Users/y/webshop')
    expect(t.model).toBe('claude-opus-4-8')
  })
  it('assistant text at end of turn → waiting; user reply → thinking', () => {
    const t = new SessionTracker()
    feed(t, asstTool('t1', 'Bash', { command: 'ls' }))
    feed(t, userResult('t1'))
    feed(t, asstText())
    expect(t.status).toBe('waiting')
    feed(t, userText())
    expect(t.status).toBe('thinking')
  })
  it('Task spawns subagent; tool_result removes it', () => {
    const t = new SessionTracker()
    feed(t, asstTool('task1', 'Task', { description: 'explore' }))
    expect(t.status).toBe('delegating')
    expect(t.subagents).toHaveLength(1)
    feed(t, asstTool('task2', 'Task', { description: 'more' }))
    expect(t.subagents).toHaveLength(2)
    feed(t, userResult('task1'))
    expect(t.subagents).toHaveLength(1)
    expect(t.subagents[0]!.id).toBe('task2')
  })
  it('sidechain tool activity animates newest open subagent', () => {
    const t = new SessionTracker()
    feed(t, asstTool('task1', 'Task'))
    feed(t, { ...asstTool('st1', 'Read', { file_path: 'x.ts' }), isSidechain: true })
    expect(t.subagents[0]!.status).toBe('reading')
    expect(t.status).toBe('delegating') // main agent unaffected
  })
  it('tracks lastActivityMs from timestamps', () => {
    const t = new SessionTracker()
    feed(t, asstTool('t1', 'Write'))
    expect(t.lastActivityMs).toBe(Date.parse('2026-06-04T01:00:00Z'))
  })
  it('tool_result transitions main agent to thinking (or delegating if subagents remain)', () => {
    const t = new SessionTracker()
    feed(t, asstTool('b1', 'Bash', { command: 'ls' }))
    expect(t.status).toBe('running')
    feed(t, userResult('b1'))
    expect(t.status).toBe('thinking')
    feed(t, asstTool('task1', 'Task'))
    feed(t, asstTool('b2', 'Bash'))
    feed(t, userResult('b2'))
    expect(t.status).toBe('delegating') // task1 still open
  })
  it('ignores Task tool_use with missing id (no phantom subagent)', () => {
    const t = new SessionTracker()
    feed(t, {
      type: 'assistant', timestamp: '2026-06-04T01:00:00Z', sessionId: 's1',
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Task', input: {} }] },
    })
    expect(t.subagents).toHaveLength(0)
  })
  it('recognizes the Agent tool as a subagent spawn (this Claude Code build names it Agent, not Task)', () => {
    const t = new SessionTracker()
    feed(t, asstTool('ag1', 'Agent', { description: 'explore' }))
    expect(t.status).toBe('delegating')
    expect(t.subagents).toHaveLength(1)
    feed(t, userResult('ag1'))
    expect(t.subagents).toHaveLength(0)
  })
  it('does NOT treat TaskCreate/TaskUpdate (todo tools) as subagent spawns', () => {
    const t = new SessionTracker()
    feed(t, asstTool('tc1', 'TaskCreate'))
    feed(t, asstTool('tu1', 'TaskUpdate'))
    expect(t.subagents).toHaveLength(0)
  })

  // --- waiting / "needs you" detection ---
  it('pending AskUserQuestion → waiting; answered → thinking', () => {
    const t = new SessionTracker()
    feed(t, asstTool('q1', 'AskUserQuestion', { questions: [] }))
    expect(t.status).toBe('waiting')          // prompt is on screen, blocked on the user
    feed(t, userResult('q1'))
    expect(t.status).toBe('thinking')         // user answered → back to work
  })
  it('pending ExitPlanMode (plan approval prompt) → waiting', () => {
    const t = new SessionTracker()
    feed(t, asstTool('p1', 'ExitPlanMode', { plan: 'do things' }))
    expect(t.status).toBe('waiting')
    feed(t, userResult('p1'))
    expect(t.status).toBe('thinking')
  })
  it('a normal pending tool (Bash) stays running, not waiting', () => {
    const t = new SessionTracker()
    feed(t, asstTool('b1', 'Bash', { command: 'npm run build' }))
    expect(t.status).toBe('running')
  })

  // --- real subagent metadata + toolUseId routing ---
  it('Agent spawn captures description + subagent_type from the tool_use input', () => {
    const t = new SessionTracker()
    feed(t, asstTool('toolu_01abc', 'Agent', { subagent_type: 'Explore', model: 'fable', description: 'Scope doorway pathing', prompt: '...' }))
    expect(t.subagents).toHaveLength(1)
    expect(t.subagents[0]!.id).toBe('toolu_01abc')
    expect(t.subagents[0]!.description).toBe('Scope doorway pathing')
    expect(t.subagents[0]!.agentType).toBe('Explore')
  })
  it('updateSubagent routes by toolUseId and patches status/meta', () => {
    const t = new SessionTracker()
    feed(t, asstTool('toolu_A', 'Agent', { description: 'first' }))
    feed(t, asstTool('toolu_B', 'Agent', { description: 'second' }))
    expect(t.updateSubagent('toolu_A', { status: 'running', agentType: 'general-purpose' })).toBe(true)
    expect(t.subagents.find(s => s.id === 'toolu_A')!.status).toBe('running')
    expect(t.subagents.find(s => s.id === 'toolu_A')!.agentType).toBe('general-purpose')
    expect(t.subagents.find(s => s.id === 'toolu_B')!.status).toBe('working') // untouched
    expect(t.updateSubagent('toolu_NOPE', { status: 'running' })).toBe(false)
  })
  it('updateSubagent without toolUseId falls back to newest open subagent (demo/legacy)', () => {
    const t = new SessionTracker()
    feed(t, asstTool('toolu_A', 'Agent', {}))
    feed(t, asstTool('toolu_B', 'Agent', {}))
    expect(t.updateSubagent(undefined, { status: 'reading' })).toBe(true)
    expect(t.subagents.find(s => s.id === 'toolu_B')!.status).toBe('reading')
  })
})
