import { describe, it, expect, beforeEach } from 'vitest'
import { DetailPanel } from '../src/ui/detailPanel'
import type { OfficeView } from '../src/types'

/** Minimal DOM stand-in (no jsdom dep). Crucially it does NOT implement
 *  innerHTML: structure can only be built via createElement + textContent +
 *  append — exactly the safe path the panel must use. If the panel ever
 *  regressed to innerHTML, no children would be created and every structural
 *  assertion below would fail. */
class FakeEl {
  children: FakeEl[] = []
  classes = new Set<string>()
  classList = { add: (c: string) => { this.classes.add(c) }, remove: (c: string) => { this.classes.delete(c) } }
  private text = ''
  constructor(public tagName: string) {}
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join('') }
  set textContent(v: string) { this.text = v; this.children = [] }
  append(...nodes: FakeEl[]): void { this.children.push(...nodes) }
  /** depth-first search */
  find(pred: (el: FakeEl) => boolean): FakeEl | undefined {
    for (const c of this.children) {
      if (pred(c)) return c
      const hit = c.find(pred)
      if (hit) return hit
    }
    return undefined
  }
}

function fields(root: FakeEl): Record<string, string> {
  const dl = root.find(el => el.tagName === 'dl')!
  const out: Record<string, string> = {}
  for (let i = 0; i < dl.children.length; i += 2) {
    out[dl.children[i]!.textContent] = dl.children[i + 1]!.textContent
  }
  return out
}

const XSS = '<img src=x onerror="alert(1)"> && rm -rf <b>'

const view: OfficeView = {
  rooms: [{
    dirKey: '-d-api', label: 'api', cwd: '/d/api',
    tables: [{
      key: '-d-api/s1.jsonl', sessionId: 's1', status: 'typing',
      lastTool: 'Bash', lastToolTarget: XSS, model: 'claude-opus-4-8',
      lastActivityMs: Date.now() - 5000,
      subagents: [
        { id: 'toolu_A', status: 'running', description: 'audit auth flow', agentType: 'Explore' },
        { id: 'toolu_B', status: 'reading', description: XSS },
      ],
    }],
  }],
}

describe('DetailPanel', () => {
  let root: FakeEl
  let panel: DetailPanel

  beforeEach(() => {
    ;(globalThis as { document?: unknown }).document = { createElement: (tag: string) => new FakeEl(tag) }
    root = new FakeEl('aside')
    panel = new DetailPanel(root as unknown as HTMLElement)
  })

  it('main agent click shows the table-level info', () => {
    panel.show(view, '-d-api/s1.jsonl')
    expect(root.classes.has('open')).toBe(true)
    const h2 = root.find(el => el.tagName === 'h2')!
    expect(h2.textContent).toContain('main agent')
    const f = fields(root)
    expect(f['status']).toBe('typing')
    expect(f['model']).toBe('claude-opus-4-8')
    expect(f['subagents']).toBe('2')
  })

  it("subagent click shows THAT subagent's own status/type/description, not the main's", () => {
    panel.show(view, '-d-api/s1.jsonl#toolu_A')
    const h2 = root.find(el => el.tagName === 'h2')!
    expect(h2.textContent).toContain('subagent')
    const f = fields(root)
    expect(f['status']).toBe('running')        // the sub's own status — NOT 'typing'
    expect(f['agent type']).toBe('Explore')
    expect(f['task']).toBe('audit auth flow')
    expect(f['main agent']).toBe('typing')     // main shown as context, clearly labeled
    expect(f['model']).toBeUndefined()         // table-only fields stay off the sub view
  })

  it('hides instead of showing stale data when the clicked subagent is gone', () => {
    root.classes.add('open')
    panel.show(view, '-d-api/s1.jsonl#toolu_GONE')
    expect(root.classes.has('open')).toBe(false)
  })

  it('renders transcript-derived strings as text, never as markup (XSS)', () => {
    panel.show(view, '-d-api/s1.jsonl')
    const f = fields(root)
    expect(f['last tool']).toBe('Bash · ' + XSS)            // verbatim text…
    expect(root.find(el => el.tagName === 'img')).toBeUndefined() // …no injected elements
    panel.show(view, '-d-api/s1.jsonl#toolu_B')
    expect(fields(root)['task']).toBe(XSS)
    expect(root.find(el => el.tagName === 'img')).toBeUndefined()
  })
})
