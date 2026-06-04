# yAgents — Design Spec

**Date:** 2026-06-04
**Status:** Approved (design validated interactively with user; user delegated final spec approval)
**Repo:** https://github.com/yaalw/yAgents
**Deploy target:** https://yaalw.github.io/yAgents/

## 1. What is it

yAgents is a standalone web app that visualizes Claude Code activity as a pixel-art office — inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents), but restructured around a clear spatial **hierarchy**:

- **Building** = the user's machine (all Claude Code activity)
- **Room** = a folder Claude Code is opened in; each newly seen folder renders an extra adjacent room
- **Table** = one session in that folder; multiple sessions → multiple tables in the room
- **Head of table** = the session's main agent (visually distinct: gold)
- **Seats around the table** = subagents spawned by that session (green); they appear when spawned, leave when done
- **Kitchen/lounge** = a common area; agents waiting for user input walk there for coffee

The office is **live only**: it shows currently-active sessions. No history browsing.

## 2. Delivery: one UI, two doors in

A single static SPA with a **data-source abstraction**. Two adapters implement the same interface:

1. **FolderPicker adapter** (GitHub Pages mode): user visits the hosted page and grants access to `~/.claude/projects` via the File System Access API. Polls files (~1s). Chromium-only.
2. **LocalServer adapter** (npx mode): `npx` package runs a tiny Node server that watches `~/.claude/projects` with chokidar and pushes parsed events over WebSocket. Works in every browser. The server also serves the same SPA build locally.

If `showDirectoryPicker` is unavailable (Firefox/Safari on the hosted page), show a friendly screen with the npx one-liner instead.

The npx package is built and committed in this repo but **not published to npm in v1**.

## 3. Architecture

```
~/.claude/projects/**/*.jsonl        (source of truth)
        │
        ├── FolderPicker adapter (FS Access API, polling)
        └── LocalServer adapter  (chokidar → WebSocket)
        │
        ▼
   OfficeState        rooms[] → tables[] → agents[] (+status)
        ▼
   Layout engine      state → floor plan (rooms, tables, seats, kitchen)
        ▼
   Canvas renderer    vanilla TS game loop: tilemap, sprites, animations
        ▼
   HTML overlay       click agent → detail panel (plain DOM over canvas)
```

- **Rendering approach:** hand-rolled Canvas 2D engine, vanilla TypeScript + Vite. Zero runtime dependencies. No framework; the detail panel and chrome are plain HTML.
- **Repo layout:** one repo — `app/` (static SPA, deployed to GitHub Pages via Actions) + `server/` (npx package; serves `app/` build + WebSocket).
- Adapters emit identical event streams: `session-started`, `tool-use`, `waiting-for-input`, `subagent-spawned`, `subagent-ended`, `session-ended`. The UI never knows which adapter feeds it.

## 4. Data model & state detection

Each session is one JSONL file under `~/.claude/projects/<encoded-folder-path>/`. Adapters tail new lines and map them to agent states:

| Transcript signal | Agent state | Animation |
|---|---|---|
| `tool_use: Write / Edit / NotebookEdit` | typing | hammering keyboard |
| `tool_use: Read / Grep / Glob` | reading | holding a document |
| `tool_use: Bash` | running | staring at a terminal |
| `tool_use: WebSearch / WebFetch` | browsing | looking at a screen/globe |
| `tool_use: Task` | delegating | subagent walks in, takes a seat |
| assistant text, no pending tool | thinking | thought bubble |
| turn ended, awaiting user (incl. permission prompts) | waiting | walks to kitchen, sips coffee |
| no file activity > 5 min (configurable; does not apply to `waiting` agents) | session over | packs up, leaves; table removed |
| unknown/future tool names | working | generic working animation (never crash) |

**Hierarchy mapping:** encoded folder path → room. Main-session JSONL → table with gold main agent at the head. Subagent activity (sidechain entries / `Task` lifecycles) → green subagent characters at that table, appearing on spawn and walking out on completion. A subagent's current tool drives its animation identically.

**Liveness rules:**
- Session alive = transcript modified within the last 5 minutes (configurable)
- Waiting agents stay alive indefinitely (they are in the kitchen, not gone)
- Folder with zero live sessions → room fades out; reappears when a session starts there
- On launch, scan for already-live transcripts so the office populates instantly

**Edge cases:** new folder mid-run → new adjacent room with a "door opens" treatment; corrupted/partial JSONL lines skipped silently; on first read, tail only the last 256 KB of large transcripts.

## 5. Layout & visuals

**Building layout.** Kitchen/lounge is the anchor room, always leftmost (coffee machine, couch, plant). Project rooms attach rightward in order of first appearance, connected by doorways so agents can physically walk to the kitchen. Rooms size themselves to their table count. The floor sits on a pannable/zoomable canvas (scroll to pan, wheel/pinch to zoom, crisp integer pixel scaling).

**Room templates.** A template = a tilemap arrangement (floor style, wall color, table/decor positions) with a list of table slots, defined as **data (JSON)**, not code. When a room first appears it randomly picks a template that fits its table count (seeded RNG for testability). v1 ships with **one** template; multiple random templates and user-defined templates are future work.

**Tables & seats.** Gold main agent at the head; up to 4 visible subagent seats. More than 4 concurrent subagents → a "+N" badge on the table.

**Art.** Top-down 3/4 pixel art, 16×16 base tiles, 3× default zoom. Character palette variations (shirt/hair) seeded by session ID so a session keeps its look. v1 animations: walk (4 directions), sit+type, sit+read, sit+terminal, think, coffee-sip, "zzz" (about to leave). Assets from CC0 packs (e.g., Kenney) adapted as needed; license files included.

**Detail panel (glanceable + click for detail).** Animations carry the at-a-glance story. Click an agent → slide-in HTML panel: folder path, session ID, model, current/last tool with target file, time since last activity, subagent count. Click elsewhere to dismiss.

## 6. Error handling

- **Unsupported browser (Pages mode):** detect missing `showDirectoryPicker`, show npx instructions
- **Permission lost/revoked:** pause with a "reconnect" overlay; re-pick folder to resume
- **WebSocket drop (npx mode):** auto-reconnect with backoff; agents hold pose rather than emptying the office
- **Malformed/huge transcripts:** skip bad lines; tail-read large files
- **Unknown tools:** generic "working" animation

## 7. Testing

- **Parser/state unit tests** (the heart): fixture JSONL files → expected `OfficeState`. Tool mapping, subagent lifecycles, waiting detection, session expiry
- **Layout engine unit tests:** N folders × M sessions → deterministic floor plan (seeded RNG)
- **Adapter contract test:** both adapters against the same fixtures must emit identical event streams
- **Renderer:** smoke test only (boots, draws a frame)
- **Demo mode:** scripted fake office for development, screenshots, README GIF. Activated via `?demo=1` URL param (works in both modes) or `--demo` server flag

## 8. v1 scope

**In:** both adapters; live office; rooms/tables/hierarchy; kitchen + waiting behavior; one room template; click-for-detail panel; pan/zoom; demo mode; GitHub Pages deploy (Actions) + npx package (unpublished).

**Out (future):** ambient office life (cat, coffee-machine steam, plants that grow); multiple/user-defined room templates; sound; history browsing; multiplayer/shared offices; VS Code webview wrapper; npm publish.
