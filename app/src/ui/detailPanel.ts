import type { OfficeView, TableView } from '../types'

export class DetailPanel {
  constructor(private el: HTMLElement) {}

  show(view: OfficeView, agentKey: string): void {
    const tableKey = agentKey.split('#')[0]!
    let table: TableView | undefined, roomLabel = '', cwd = ''
    for (const r of view.rooms) {
      const t = r.tables.find(t => t.key === tableKey)
      if (t) { table = t; roomLabel = r.label; cwd = r.cwd ?? ''; break }
    }
    if (!table) { this.hide(); return }
    const isSub = agentKey.includes('#')
    const ago = Math.round((Date.now() - table.lastActivityMs) / 1000)
    this.el.innerHTML = `
      <h2>${isSub ? '🤖 subagent' : '👑 main agent'} — ${roomLabel}</h2>
      <dl>
        <dt>folder</dt><dd>${cwd || roomLabel}</dd>
        <dt>session</dt><dd>${table.sessionId ?? '?'}</dd>
        <dt>model</dt><dd>${table.model ?? '?'}</dd>
        <dt>status</dt><dd>${table.status}</dd>
        <dt>last tool</dt><dd>${table.lastTool ?? '—'}${table.lastToolTarget ? ' · ' + table.lastToolTarget : ''}</dd>
        <dt>last activity</dt><dd>${ago}s ago</dd>
        <dt>subagents</dt><dd>${table.subagents.length}</dd>
      </dl>`
    this.el.classList.add('open')
  }

  hide(): void { this.el.classList.remove('open') }
}
