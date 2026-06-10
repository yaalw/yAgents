import type { DataAdapter, OfficeView } from './types'
import { OfficeStore } from './state/officeStore'
import { layout, type FloorPlan } from './layout/layoutEngine'
import { Renderer } from './render/renderer'
import { Atlas } from './render/atlas'
import { DemoAdapter } from './adapters/demo'
import { FolderPickerAdapter } from './adapters/folderPicker'
import { LocalServerAdapter } from './adapters/localServer'
import { showStartScreen } from './ui/startScreen'
import { DetailPanel } from './ui/detailPanel'

const canvas = document.getElementById('office') as HTMLCanvasElement
const panel = new DetailPanel(document.getElementById('panel')!)
const startEl = document.getElementById('start')!

const store = new OfficeStore()
let view: OfficeView = { rooms: [] }
let plan: FloorPlan = layout(view)

const renderer = new Renderer(canvas, () => plan)
// sprites are progressive enhancement: flat-color rendering until loaded, forever if they 404
Atlas.load().then(a => renderer.setAtlas(a)).catch(() => {})

function refresh(): void {
  view = store.view()
  plan = layout(view)
}
setInterval(refresh, 1000) // also catches session expiry with no new events

async function hasLocalServer(): Promise<boolean> {
  return await new Promise(res => {
    try {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      const done = (v: boolean) => { try { ws.close() } catch { /* noop */ } res(v) }
      ws.onopen = () => done(true)
      ws.onerror = () => done(false)
      setTimeout(() => done(false), 1500)
    } catch { res(false) }
  })
}

async function pickAdapter(): Promise<DataAdapter> {
  if (new URLSearchParams(location.search).get('demo')) return new DemoAdapter()
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    if (await hasLocalServer()) return new LocalServerAdapter()
  }
  const supportsFS = 'showDirectoryPicker' in window
  const choice = await showStartScreen(startEl, supportsFS)
  if (choice.kind === 'demo') return new DemoAdapter()
  return new FolderPickerAdapter(choice.root)
}

canvas.addEventListener('click', ev => {
    if (moved > 4) { moved = 0; return } // this was a drag, not a click — don't toggle the panel
  const key = renderer.hitTest(ev.clientX, ev.clientY)
  if (key) panel.show(view, key)
  else panel.hide()
})

let dragging = false, lastX = 0, lastY = 0, moved = 0
canvas.addEventListener('mousedown', ev => { dragging = true; moved = 0; lastX = ev.clientX; lastY = ev.clientY; canvas.classList.add('dragging') })
window.addEventListener('mousemove', ev => {
  if (!dragging) return
  const dx = ev.clientX - lastX, dy = ev.clientY - lastY
  moved += Math.abs(dx) + Math.abs(dy)
  renderer.camera.panBy(dx, dy)
  lastX = ev.clientX; lastY = ev.clientY
})
window.addEventListener('mouseup', () => { dragging = false; canvas.classList.remove('dragging') })
canvas.addEventListener('wheel', ev => {
  ev.preventDefault()
  renderer.camera.zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1 : -1)
}, { passive: false })

const adapter = await pickAdapter()
await adapter.start(e => { store.ingest(e); refresh() })
renderer.start()
