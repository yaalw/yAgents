import type { DataAdapter, FileEvent } from '../types'

interface Step { atMs: number; dirKey: string; fileName: string; appendLine: object }
const T0 = 1_000_000

const asst = (sessionId: string, cwd: string, content: object[], atMs: number) => ({
  type: 'assistant', timestamp: new Date(atMs).toISOString(), sessionId, cwd,
  message: { role: 'assistant', model: 'claude-opus-4-8', content },
})
const tool = (id: string, name: string, input: object = {}) => ({ type: 'tool_use', id, name, input })
const text = (s: string) => ({ type: 'text', text: s })
const result = (id: string) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id }] } })

export const DEMO_SCRIPT: Step[] = [
  { atMs: T0, dirKey: '-demo-webshop', fileName: 's1.jsonl', appendLine: asst('s1', '/demo/webshop', [tool('w1', 'Read', { file_path: 'src/cart.ts' })], T0) },
  { atMs: T0 + 1500, dirKey: '-demo-webshop', fileName: 's1.jsonl', appendLine: asst('s1', '/demo/webshop', [tool('w2', 'Write', { file_path: 'src/cart.ts' })], T0 + 1500) },
  { atMs: T0 + 3000, dirKey: '-demo-webshop', fileName: 's1.jsonl', appendLine: asst('s1', '/demo/webshop', [tool('task1', 'Task', { description: 'explore checkout flow' })], T0 + 3000) },
  { atMs: T0 + 4000, dirKey: '-demo-webshop', fileName: 's1.jsonl', appendLine: { ...asst('s1', '/demo/webshop', [tool('st1', 'Grep', { pattern: 'checkout' })], T0 + 4000), isSidechain: true } },
  { atMs: T0 + 4500, dirKey: '-demo-webshop', fileName: 's2.jsonl', appendLine: asst('s2', '/demo/webshop', [tool('x1', 'Bash', { command: 'npm test' })], T0 + 4500) },
  { atMs: T0 + 6000, dirKey: '-demo-api', fileName: 's3.jsonl', appendLine: asst('s3', '/demo/api', [tool('a1', 'WebSearch', { query: 'rate limiting' })], T0 + 6000) },
  { atMs: T0 + 7500, dirKey: '-demo-api', fileName: 's3.jsonl', appendLine: asst('s3', '/demo/api', [text('Found it — what would you like me to do?')], T0 + 7500) },
  { atMs: T0 + 9000, dirKey: '-demo-webshop', fileName: 's1.jsonl', appendLine: result('task1') },
  { atMs: T0 + 9500, dirKey: '-demo-webshop', fileName: 's1.jsonl', appendLine: asst('s1', '/demo/webshop', [tool('w3', 'Edit', { file_path: 'src/checkout.ts' })], T0 + 9500) },
  { atMs: T0 + 11000, dirKey: '-demo-webshop', fileName: 's2.jsonl', appendLine: asst('s2', '/demo/webshop', [tool('task2', 'Task', { description: 'fix flaky test' })], T0 + 11000) },
  { atMs: T0 + 12500, dirKey: '-demo-api', fileName: 's3.jsonl', appendLine: { ...result('none'), message: { role: 'user', content: 'ship it' } } },
  { atMs: T0 + 13000, dirKey: '-demo-api', fileName: 's3.jsonl', appendLine: asst('s3', '/demo/api', [tool('a2', 'Write', { file_path: 'src/limiter.ts' })], T0 + 13000) },
  { atMs: T0 + 13500, dirKey: '-demo-webshop', fileName: 's2.jsonl', appendLine: asst('s2', '/demo/webshop', [text('Ready for your input!')], T0 + 13500) },
]

export class DemoAdapter implements DataAdapter {
  private timer: ReturnType<typeof setInterval> | undefined
  private contents = new Map<string, string>() // "dirKey/fileName" → accumulated JSONL
  private i = 0

  constructor(private intervalMs = 1200) {}

  async start(onFile: (e: FileEvent) => void): Promise<void> {
    const emit = () => {
      const step = DEMO_SCRIPT[this.i % DEMO_SCRIPT.length]!
      const loop = Math.floor(this.i / DEMO_SCRIPT.length)
      this.i++
      const key = step.dirKey + '/' + step.fileName
      const prev = this.contents.get(key) ?? ''
      const next = prev + JSON.stringify(step.appendLine) + '\n'
      this.contents.set(key, next)
      onFile({ dirKey: step.dirKey, fileName: step.fileName, content: next, mtimeMs: Date.now() + loop })
    }
    if (this.intervalMs === 0) {
      for (let k = 0; k < DEMO_SCRIPT.length; k++) emit()
      return
    }
    emit()
    this.timer = setInterval(emit, this.intervalMs)
  }

  stop(): void { if (this.timer) clearInterval(this.timer) }
}
