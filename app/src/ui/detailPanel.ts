import type { OfficeView, TableView } from '../types'

export class DetailPanel {
  constructor(private el: HTMLElement) {}

  show(view: OfficeView, agentKey: string): void {
    // agentKey = tableKey for mains, tableKey + '#' + subId for subagents
    const hashAt = agentKey.indexOf('#')
    const tableKey = hashAt === -1 ? agentKey : agentKey.slice(0, hashAt)
    const subId = hashAt === -1 ? undefined : agentKey.slice(hashAt + 1)

    let table: TableView | undefined, roomLabel = '', cwd = ''
    for (const r of view.rooms) {
      const t = r.tables.find(t => t.key === tableKey)
      if (t) { table = t; roomLabel = r.label; cwd = r.cwd ?? ''; break }
    }
    if (!table) { this.hide(); return }
    const sub = subId === undefined ? undefined : table.subagents.find(s => s.id === subId)
    if (subId !== undefined && !sub) { this.hide(); return } // subagent finished since the click

    const ago = Math.round((Date.now() - table.lastActivityMs) / 1000)
    const rows: [string, string][] = sub
      ? [
          ['folder', cwd || roomLabel],
          ['session', table.sessionId ?? '?'],
          ['agent type', sub.agentType ?? '?'],
          ['task', sub.description ?? '—'],
          ['status', sub.status],
          ['main agent', table.status],
          ['last activity', ago + 's ago'],
        ]
      : [
          ['folder', cwd || roomLabel],
          ['session', table.sessionId ?? '?'],
          ['model', table.model ?? '?'],
          ['status', table.status],
          ['last tool', (table.lastTool ?? '—') + (table.lastToolTarget ? ' · ' + table.lastToolTarget : '')],
          ['last activity', ago + 's ago'],
          ['subagents', String(table.subagents.length)],
        ]
    this.render((sub ? '🤖 subagent' : '👑 main agent') + ' — ' + roomLabel, rows)
    this.el.classList.add('open')
  }

  /** Safe DOM construction: every transcript-derived string (tool targets, file
   *  paths, task descriptions, labels) lands in textContent, never in markup —
   *  a Bash command like `<img onerror=…>` renders as literal text, not HTML. */
  private render(title: string, rows: [string, string][]): void {
    this.el.textContent = '' // drops all previous children
    const h2 = document.createElement('h2')
    h2.textContent = title
    const dl = document.createElement('dl')
    for (const [term, value] of rows) {
      const dt = document.createElement('dt')
      dt.textContent = term
      const dd = document.createElement('dd')
      dd.textContent = value
      dl.append(dt, dd)
    }
    this.el.append(h2, dl)
  }

  hide(): void { this.el.classList.remove('open') }
}
