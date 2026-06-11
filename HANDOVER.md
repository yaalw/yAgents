# yAgents — HANDOVER (single source of truth for continuing this work)

If you are a fresh Claude session or a post-compaction continuation, **read this first**, then `docs/superpowers/v3-review-and-roadmap.md` (the roadmap you're executing) and `docs/superpowers/v2-build-log.md` (full decision history). This file is kept current as work proceeds — update its "Status board" after every phase.

## What yAgents is
A free, open-source, public tool that visualizes Claude Code AI agents as a live pixel-art world. It reads Claude Code's JSONL transcripts (`~/.claude/projects/**/*.jsonl`) and renders, on an HTML canvas: each project folder = a room; each session = a themed "work-zone" (office/mine/farm, **theme per folder**); the crowned main agent works at a station (scribe desk / ore vein / crop field); subagents join the same job; idle agents loaf in a lounge nook.

- **Live:** https://yaalw.github.io/yAgents/ (Pages, auto-deploys on push to `main`). Demo: append `?demo=12` (or `?demo=N` to pre-run N script steps).
- **Repo:** https://github.com/yaalw/yAgents (PUBLIC). Local: `/Users/yassinealwahdani/ysolves-tools/naamloze map/yAgents` (note the space in the path — always quote it).
- **Owner:** y@ssine (yaalw). Wants a shareable showpiece for the AI-coder community; loves watching agents work. Aesthetic: retro pixel-game / nerdy, NOT modern SaaS (see `DESIGN.md`). Use the **impeccable** skill + a taste skill for visual polish, NOT `frontend-design`.

## Current state (v3 shipped)
- **Art:** CC0 **Ninja Adventure** pack (animated 4-dir characters, themed tilesets, held tools, particle FX), behind a swappable **Skin seam** (`app/src/render/skins/{skin.ts,ninja.ts}`). The raw 94 MB pack sits at repo root `Ninja Adventure - Asset Pack/` and is **gitignored**; only the ~600 KB of sheets we use live in `app/public/sprites/ninja/`. Old Kenney art (`atlas.ts`/`THEME_TILES`) stays in-tree unused for a future `KenneySkin`.
- **Theme is per folder** (`THEME_SCOPE='room'` in `render/theme.ts`) — all of a folder's zones share one theme; stacking sessions grows "a bigger study/mine/farm".
- **Zoom** is fine-grained multiplicative toward the cursor (`camera.ts` `zoomAt(sx,sy,factor)`, range 0.75–8, nearest-neighbour).
- **Farm crops** are tidy procedural rows; office is a cozy scribe's study; 20-character roster cast by theme.
- 57 tests green; `tsc` strict + vite build green.

## Architecture (pipeline)
`adapters` (FolderPicker / LocalServer / Demo) → `parser/transcript.ts` (parseLine) → `parser/session.ts` (SessionTracker state machine) → `state/officeStore.ts` (live OfficeView, 5-min expiry / 30-min waiting window) → `layout/layoutEngine.ts` (FloorPlan: rooms→zones→seats) → `render/renderer.ts` (delegates drawZone/drawCharacter/drawEffects to the active `Skin`) + `ui/detailPanel.ts` overlay. Pure, deterministic, **no `Math.random`** (seed from time/hash — required for the procedural world).

Key contracts: `render/theme.ts` (`themeFor`, `poseFor`, `Pose`), `render/atlas.ts` (`Theme`, `THEME_TILES`), `layout/layoutEngine.ts` (`ZoneBox`/`RoomBox`/`Seat`/`FloorPlan`). `agentKey` = `tableKey` for mains, `tableKey + '#' + subId` for subs (detail panel splits on `#`).

## How to build / test / deploy / screenshot (exact commands)
From the repo (quote the path — it has a space):
- Test: `cd "/Users/yassinealwahdani/ysolves-tools/naamloze map/yAgents/app" && npm test`
- Build: `… && npm run build` (runs `tsc --noEmit` strict + vite; output `app/dist`)
- Local server (serves `app/dist`, live file-watch): `node "…/yAgents/server/src/index.js"` → http://localhost:4017 (one is usually already running in the session)
- Screenshot (verify visuals — Chrome is installed): `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --screenshot=/tmp/s.png --window-size=1280,800 --virtual-time-budget=6000 "http://localhost:4017/?demo=12"` then Read /tmp/s.png. (Headless rAF freezes at one timestamp; try a few `--virtual-time-budget` values to catch animation frames. `?demo=14` shows all 3 themes across 3 folders.)
- Deploy: `git push` to `main` → GitHub Actions builds + deploys to Pages (~1 min). Verify: `gh run list --limit 1 --json conclusion`, then confirm `curl -s https://yaalw.github.io/yAgents/ | grep -o 'index-[A-Za-z0-9_]*\.js'` matches `ls app/dist/assets/`.

## How this work is being executed
Orchestrator (main loop) **dispatches Fable subagents** (`Agent` tool, `model: 'fable'`) to do the building (esp. visual), owns the integration contracts, verifies each phase with headless screenshots + the test suite, and ships (push→deploy→verify-live). Build entirely on `main`; commit per phase; keep tests green. Update this HANDOVER's status board + `v2-build-log.md` decision journal after each phase.

## The roadmap being executed (from the review doc)
Authoritative detail + the organic-world algorithm: `docs/superpowers/v3-review-and-roadmap.md`. Recommendation: fix correctness first, then organic room, then archipelago (defer fully-woven world).

### Status board
- [ ] **Phase 1 — correctness/data.** Real subagents live in `<projectDir>/<sessionId>/subagents/agent-*.jsonl` with sibling `agent-*.meta.json` (`toolUseId`, `agentType`, `description`) — neither adapter reads that path today, so subagent statuses are currently generic/fiction in prod. Read them; join by `toolUseId`; animate real subagent activity. Also fix waiting/"needs you" detection (permission prompts / AskUserQuestion currently render as "working", not waiting).
- [ ] **Phase 2 — UX/robustness.** First-run empty state (no live session → friendly screen, not black void); detail panel shows the *main's* status when a subagent is clicked (fix) + replace `innerHTML` with `textContent` (XSS); prune `OfficeStore.sessions` (never pruned → leak); make labels/crown readable at fit zoom.
- [ ] **Phase 3 — organic room per folder.** Merge a folder's stacked discrete 13×9 zones into ONE continuous organic room with stations placed inside it (kills the "two boxes per folder" look). Reviewer's "Phase 0" of the organic design.
- [ ] **Phase 4 — archipelago / organic world.** Procedural terrain regions per folder (seeded noise-blobs, monotonic growth so stable), themes as structures on terrain, golden-angle spiral region placement, marching-squares autotiling, paths + gateways, pan-around world. See review doc for the full algorithm + incremental sub-phases. Biggest bet; watch scope (it's a visualizer, not a game).

When all four are done, this sequence is complete. Re-read the review doc for "quick wins" not yet picked up (legend, touch support, etc.).

## Conventions / gotchas
- Always quote paths (space in "naamloze map").
- Never commit the raw `Ninja Adventure - Asset Pack/` (gitignored) — copy only needed sheets into `app/public/sprites/ninja/`.
- Deterministic only (no `Math.random`, no argless `Date.now()` in pure render/layout logic — seed from passed time/hash).
- Repo is public + CC0 art only committed. Premium packs (Sunnyside/LimeZu) are local-only via the Skin seam, never committed.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
