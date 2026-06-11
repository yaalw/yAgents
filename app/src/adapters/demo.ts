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

// The demo diorama. Themes are per FOLDER (see theme.ts), so the three dirKeys
// are chosen to hash to all three themes, and stacked sessions grow a bigger
// themed world inside their folder:
//   -demo-api/{s1,s5}.jsonl     → office (two stacked study zones; s1 spawns subagents)
//   -demo-webshop/{s3,s2}.jsonl → farm   (two stacked field zones; s2 loafs by the tree)
//   -demo-infra/s7.jsonl        → mine   (pickaxe swings at the ore)
const WEB = '-demo-webshop', API = '-demo-api', INF = '-demo-infra'
const CWD_WEB = '/demo/webshop', CWD_API = '/demo/api', CWD_INF = '/demo/infra'
// two late-arriving folders (steps 26+) grow the archipelago to five islands —
// dirKeys chosen to hash to farm and mine so every theme appears twice-ish
const CLI = '-demo-cli', DOC = '-demo-docs'
const CWD_CLI = '/demo/cli', CWD_DOC = '/demo/docs'

export const DEMO_SCRIPT: Step[] = [
  // open strong: all three themes working within the first few beats
  { atMs: T0, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('w1', 'Edit', { file_path: 'src/limiter.ts' })], T0) },
  { atMs: T0 + 1200, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('f1', 'Edit', { file_path: 'src/cart.ts' })], T0 + 1200) },
  { atMs: T0 + 2400, dirKey: INF, fileName: 's7.jsonl', appendLine: asst('s7', CWD_INF, [tool('m1', 'Bash', { command: 'npm test' })], T0 + 2400) },
  // second sessions stack into their folder: the study and the field grow
  { atMs: T0 + 3600, dirKey: API, fileName: 's5.jsonl', appendLine: asst('s5', CWD_API, [tool('w2', 'Write', { file_path: 'docs/rate-limits.md' })], T0 + 3600) },
  { atMs: T0 + 4800, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('task1', 'Task', { description: 'audit auth flow' })], T0 + 4800) },
  { atMs: T0 + 6000, dirKey: WEB, fileName: 's2.jsonl', appendLine: asst('s2', CWD_WEB, [tool('f2', 'Bash', { command: 'npm run build' })], T0 + 6000) },
  // helpers fan out across every theme
  { atMs: T0 + 7200, dirKey: INF, fileName: 's7.jsonl', appendLine: asst('s7', CWD_INF, [tool('task2', 'Task', { description: 'profile hot path' })], T0 + 7200) },
  { atMs: T0 + 8400, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('task3', 'Task', { description: 'sweep TODOs' })], T0 + 8400) },
  { atMs: T0 + 9600, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('task4', 'Task', { description: 'seed fixtures' })], T0 + 9600) },
  { atMs: T0 + 10800, dirKey: INF, fileName: 's7.jsonl', appendLine: { ...asst('s7', CWD_INF, [tool('st1', 'Grep', { pattern: 'alloc' })], T0 + 10800), isSidechain: true } },
  { atMs: T0 + 12000, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('task5', 'Task', { description: 'tighten types' })], T0 + 12000) },
  { atMs: T0 + 13200, dirKey: API, fileName: 's1.jsonl', appendLine: { ...asst('s1', CWD_API, [tool('st2', 'Grep', { pattern: 'authorize' })], T0 + 13200), isSidechain: true } },
  // the builder finishes a run and loafs under the shade tree
  { atMs: T0 + 14400, dirKey: WEB, fileName: 's2.jsonl', appendLine: asst('s2', CWD_WEB, [text('build green — ship it?')], T0 + 14400) },
  { atMs: T0 + 15600, dirKey: API, fileName: 's1.jsonl', appendLine: asst('s1', CWD_API, [tool('w3', 'Edit', { file_path: 'src/auth.ts' })], T0 + 15600) },
  { atMs: T0 + 16800, dirKey: INF, fileName: 's7.jsonl', appendLine: asst('s7', CWD_INF, [tool('m2', 'Bash', { command: 'git push' })], T0 + 16800) },
  { atMs: T0 + 18000, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('f3', 'Edit', { file_path: 'src/checkout.ts' })], T0 + 18000) },
  // the doc scribe waits on input → wanders to the lounge nook
  { atMs: T0 + 19200, dirKey: API, fileName: 's5.jsonl', appendLine: asst('s5', CWD_API, [text('docs drafted — want a review?')], T0 + 19200) },
  { atMs: T0 + 20400, dirKey: API, fileName: 's1.jsonl', appendLine: { ...asst('s1', CWD_API, [tool('st3', 'Read', { file_path: 'src/auth.ts' })], T0 + 20400), isSidechain: true } },
  { atMs: T0 + 21600, dirKey: INF, fileName: 's7.jsonl', appendLine: result('task2') },
  { atMs: T0 + 22800, dirKey: WEB, fileName: 's3.jsonl', appendLine: asst('s3', CWD_WEB, [tool('f4', 'Write', { file_path: 'test/cart.test.ts' })], T0 + 22800) },
  { atMs: T0 + 24000, dirKey: API, fileName: 's1.jsonl', appendLine: result('task1') },
  { atMs: T0 + 25200, dirKey: INF, fileName: 's7.jsonl', appendLine: asst('s7', CWD_INF, [tool('m3', 'Read', { file_path: 'test/flaky.test.ts' })], T0 + 25200) },
  // two new folders sail in: the archipelago grows to five islands
  { atMs: T0 + 26400, dirKey: CLI, fileName: 's8.jsonl', appendLine: asst('s8', CWD_CLI, [tool('c1', 'Edit', { file_path: 'src/args.ts' })], T0 + 26400) },
  { atMs: T0 + 27600, dirKey: DOC, fileName: 's9.jsonl', appendLine: asst('s9', CWD_DOC, [tool('d1', 'Write', { file_path: 'guide/intro.md' })], T0 + 27600) },
  { atMs: T0 + 28800, dirKey: CLI, fileName: 's8.jsonl', appendLine: asst('s8', CWD_CLI, [tool('task6', 'Task', { description: 'wire flag parser' })], T0 + 28800) },
  { atMs: T0 + 30000, dirKey: DOC, fileName: 's10.jsonl', appendLine: asst('s10', CWD_DOC, [tool('d2', 'Bash', { command: 'npm run docs:build' })], T0 + 30000) },
  { atMs: T0 + 31200, dirKey: CLI, fileName: 's8.jsonl', appendLine: { ...asst('s8', CWD_CLI, [tool('c2', 'Grep', { pattern: 'argv' })], T0 + 31200), isSidechain: true } },
  { atMs: T0 + 32400, dirKey: DOC, fileName: 's9.jsonl', appendLine: asst('s9', CWD_DOC, [text('outline ready — keep going?')], T0 + 32400) },
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
    for (let k = 0; k < Math.max(0, this.burst); k++) emit() // burst 0 = start empty
    this.timer = setInterval(emit, this.intervalMs)
  }

  stop(): void { if (this.timer) clearInterval(this.timer) }
}
