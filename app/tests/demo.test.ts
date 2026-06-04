import { describe, it, expect } from 'vitest'
import { DemoAdapter, DEMO_SCRIPT } from '../src/adapters/demo'
import { OfficeStore } from '../src/state/officeStore'

describe('DemoAdapter', () => {
  it('script produces a populated office when fully applied', () => {
    const store = new OfficeStore(() => DEMO_SCRIPT[DEMO_SCRIPT.length - 1]!.atMs + 1000)
    const adapter = new DemoAdapter(0) // 0ms interval = synchronous drain on start
    const events: number[] = []
    return adapter.start(e => { store.ingest(e); events.push(e.mtimeMs) }).then(() => {
      adapter.stop()
      const v = store.view()
      expect(v.rooms.length).toBeGreaterThanOrEqual(2)
      const allTables = v.rooms.flatMap(r => r.tables)
      expect(allTables.length).toBeGreaterThanOrEqual(3)
      expect(allTables.some(t => t.subagents.length > 0)).toBe(true)
      expect(allTables.some(t => t.status === 'waiting')).toBe(true)
    })
  })
})
