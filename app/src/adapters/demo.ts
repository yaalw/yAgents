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

// The demo diorama. Session keys are chosen so themeFor() lands all three themes:
//   -demo-webshop/s3.jsonl → office (typing at the terminal, subagents join)
//   -demo-webshop/s2.jsonl → mine   (pickaxe swings at the ore)
//   -demo-api/s1.jsonl     → farm   (hoeing the plot, crops grow)
//   -demo-api/s5.jsonl     → mine   (waits forever → loafs by the campfire)
const WEB = '-demo-webshop', API = '-demo-api'
const CWD_WEB = '/demo/webshop', CWD_API = '/demo/api'

export const DEMO_SCRIPT: Step[] = [
  // open strong: all three themes working within the first few beats
  { atMs: T0, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('w1', 'Edit', { file_path: 'src/cart.ts' })], T0) },
  { atMs: T0 + 1200, dirKey: WEB, fileName: 's2.jsonl', appendLine: asst('s2', CWD_WEB, [tool('m1', 'Bash', { command: 'npm test' })], T0 + 1200) },
  { atMs: T0 + 2400, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('f1', 'Write', { file_path: 'src/limiter.ts' })], T0 + 2400) },
  { atMs: T0 + 3600, dirKey: API, fileName: 's5.jsonl', appendLine: asst('s5', CWD_API, [text('ready when you are — what should I tackle?')], T0 + 3600) },
  // subagents spawn into the office zone and help at the same desk
  { atMs: T0 + 4800, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('task1', 'Task', { description: 'explore checkout flow' })], T0 + 4800) },
  { atMs: T0 + 6000, dirKey: WEB, fileName: 's3.jsonl', appendLine: { ...asst('s3', CWD_WEB, [tool('st1', 'Grep', { pattern: 'checkout' })], T0 + 6000), isSidechain: true } },
  // the miner finishes a run and loafs in the nook for a while
  { atMs: T0 + 7200, dirKey: WEB, fileName: 's2.jsonl', appendLine: asst('s2', CWD_WEB, [text('tests green — push it?')], T0 + 7200) },
  { atMs: T0 + 8400, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('f2', 'Bash', { command: 'npm run deploy' })], T0 + 8400) },
  { atMs: T0 + 9600, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('task2', 'Task', { description: 'audit cart math' })], T0 + 9600) },
  { atMs: T0 + 10800, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('w2', 'Edit', { file_path: 'src/checkout.ts' })], T0 + 10800) },
  // back to the rock
  { atMs: T0 + 12000, dirKey: WEB, fileName: 's2.jsonl', appendLine: asst('s2', CWD_WEB, [tool('m2', 'Bash', { command: 'git push' })], T0 + 12000) },
  // the farmer waits on input → walks to the hay nook
  { atMs: T0 + 13200, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [text('deployed! want a rate-limit dashboard too?')], T0 + 13200) },
  { atMs: T0 + 14400, dirKey: WEB, fileName: 's3.jsonl', appendLine: { ...asst('s3', CWD_WEB, [tool('st2', 'Read', { file_path: 'src/cart.ts' })], T0 + 14400), isSidechain: true } },
  { atMs: T0 + 15600, dirKey: WEB, fileName: 's3.jsonl', appendLine: result('task1') },
  { atMs: T0 + 16800, dirKey: WEB, fileName: 's2.jsonl', appendLine: asst('s2', CWD_WEB, [tool('m3', 'Read', { file_path: 'test/flaky.test.ts' })], T0 + 16800) },
  { atMs: T0 + 18000, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('f3', 'Edit', { file_path: 'src/limiter.ts' })], T0 + 18000) },
  { atMs: T0 + 19200, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('w3', 'Write', { file_path: 'test/cart.test.ts' })], T0 + 19200) },
]

export class DemoAdapter implements DataAdapter {
  private timer: ReturnType<typeof setInterval> | undefined
  private contents = new Map<string, string>() // "dirKey/fileName" → accumulated JSONL
  private i = 0

  /** burst: how many script steps to apply instantly on start (so the diorama
   *  opens populated); the rest tick in on the interval. */
  constructor(private intervalMs = 1200, private burst = 1) {}

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
    for (let k = 0; k < Math.max(1, this.burst); k++) emit()
    this.timer = setInterval(emit, this.intervalMs)
  }

  stop(): void { if (this.timer) clearInterval(this.timer) }
}
