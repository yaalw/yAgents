import { describe, it, expect } from 'vitest'
import { DemoAdapter, DEMO_SCRIPT } from '../src/adapters/demo'
import { OfficeStore } from '../src/state/officeStore'
import { themeFor } from '../src/render/theme'

describe('DemoAdapter', () => {
  it('script produces a populated office when fully applied', () => {
    const store = new OfficeStore(() => DEMO_SCRIPT[DEMO_SCRIPT.length - 1]!.atMs + 1000)
    const adapter = new DemoAdapter(0) // 0ms interval = synchronous drain on start
    const events: number[] = []
    return adapter.start(e => { store.ingest(e); events.push(e.mtimeMs) }).then(() => {
      adapter.stop()
      const v = store.view()
      expect(v.rooms.length).toBeGreaterThanOrEqual(3)
      const allTables = v.rooms.flatMap(r => r.tables)
      expect(allTables.length).toBeGreaterThanOrEqual(4)
      expect(allTables.some(t => t.subagents.length > 0)).toBe(true)
      expect(allTables.some(t => t.status === 'waiting')).toBe(true)
      // themes are per folder, and the three demo folders cover all of them
      const themes = new Set(v.rooms.flatMap(r => r.tables.map(t => themeFor(t.key, r.dirKey))))
      expect(themes).toEqual(new Set(['office', 'mine', 'farm']))
      // every folder is internally consistent, and one folder stacks 2+ sessions
      for (const r of v.rooms) {
        expect(new Set(r.tables.map(t => themeFor(t.key, r.dirKey))).size).toBe(1)
      }
      expect(v.rooms.some(r => r.tables.length >= 2)).toBe(true)
    })
  })
})
