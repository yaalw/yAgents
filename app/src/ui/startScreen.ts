export type StartChoice = { kind: 'picker'; root: FileSystemDirectoryHandle } | { kind: 'demo' }

export function showStartScreen(container: HTMLElement, supportsFS: boolean): Promise<StartChoice> {
  return new Promise(resolve => {
    const box = document.createElement('div')
    box.className = 'overlay'
    box.innerHTML = supportsFS
      ? `<div class="box">
          <h1>yAgents — your pixel office</h1>
          <p>Pick your <code>~/.claude/projects</code> folder to watch your live Claude Code sessions.<br>
          (On macOS press <code>Cmd+Shift+.</code> in the picker to reveal the hidden <code>.claude</code> folder.)</p>
          <button id="pick">Open the office</button>
          <span class="alt" id="demo">…or watch the demo office</span>
        </div>`
      : `<div class="box">
          <h1>yAgents — your pixel office</h1>
          <p>This browser can't read local folders (File System Access API missing).<br><br>
          Run it locally instead — works in every browser:<br>
          <code>git clone https://github.com/yaalw/yAgents && cd yAgents && npm i && npm run build && node server/src/index.js</code></p>
          <span class="alt" id="demo">…or watch the demo office</span>
        </div>`
    container.appendChild(box)
    box.querySelector('#demo')!.addEventListener('click', () => { box.remove(); resolve({ kind: 'demo' }) })
    box.querySelector('#pick')?.addEventListener('click', async () => {
      try {
        const root = await (window as any).showDirectoryPicker({ id: 'claude-projects' })
        box.remove()
        resolve({ kind: 'picker', root })
      } catch { /* user cancelled — stay on start screen */ }
    })
  })
}
