# yAgents 👑🤖

A live pixel-art world for your Claude Code agents.

Every **folder** Claude Code is opened in is a **room**. Every **session** is a **work-zone**, themed at random as an **office**, a **mine**, or a **farm** 👑⛏️🌾. The crowned main agent works at the zone's station (a scribe's desk, an ore vein, a crop field); the **subagents** it spawns join the same job and help; and when an agent is **waiting for your input it wanders off to loaf** in the zone's lounge nook. They write, mine, and till with real animated sprites (CC0 [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) art), so you can watch your agent workflows come alive.

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

Adapters read Claude Code's JSONL transcripts (`~/.claude/projects/**/*.jsonl`) — via the File System Access API (hosted) or a chokidar→WebSocket watcher (local) — and feed a shared pipeline: parser → session state machine → office store → layout engine → canvas renderer. Original design: [`docs/superpowers/specs/2026-06-04-yagents-design.md`](docs/superpowers/specs/2026-06-04-yagents-design.md). The themed work-zones rework: [`docs/superpowers/specs/2026-06-11-yagents-v2-workzones-design.md`](docs/superpowers/specs/2026-06-11-yagents-v2-workzones-design.md).

Sprites are CC0 by [Kenney](https://kenney.nl). Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents) — rebuilt around hierarchy and themed work-zones: rooms per folder, a work-zone per session, subagents joining their main agent's job.
