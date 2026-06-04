# yAgents 👑🤖

A live pixel-art office for your Claude Code agents.

Every **folder** Claude Code is opened in is a **room**. Every **session** is a **table** — the main agent sits at the head (gold, crowned), and the **subagents** it spawns take the seats around it. Agents type, read, run commands and think; when one is **waiting for your input it walks to the kitchen for a coffee** ☕.

## Use it

**Zero install (Chromium browsers):** open **https://yaalw.github.io/yAgents/** and pick your `~/.claude/projects` folder (press `Cmd+Shift+.` in the macOS picker to reveal `.claude`).

**Local (any browser, true file-watching):**
```bash
git clone https://github.com/yaalw/yAgents && cd yAgents
npm install && npm run build
node server/src/index.js   # → http://localhost:4017
```

**Demo office:** add `?demo=1` to either URL.

## How it works

Adapters read Claude Code's JSONL transcripts (`~/.claude/projects/**/*.jsonl`) — via the File System Access API (hosted) or a chokidar→WebSocket watcher (local) — and feed a shared pipeline: parser → session state machine → office store → layout engine → canvas renderer. Hierarchy, liveness rules and design: see [`docs/superpowers/specs/2026-06-04-yagents-design.md`](docs/superpowers/specs/2026-06-04-yagents-design.md).

Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents) — rebuilt around hierarchy: rooms per folder, a table per session, subagents reporting to their main agent.
