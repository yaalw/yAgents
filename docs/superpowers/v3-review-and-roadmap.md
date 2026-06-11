# yAgents v3 — Fresh-Eyes Review & Organic-World Roadmap

**Date:** 2026-06-11
**Author:** outside reviewer (senior, first contact with the codebase)
**Basis:** full read of `app/src/` + `server/src/` (~1.8k LOC), all specs and the v2/v3 build logs, the 57-test suite (green), headless screenshots of `?demo=3/8/14/22` and the live Pages deploy, and a structural audit of a real `~/.claude/projects` tree on this machine.

---

## TL;DR — top 5 things to do next, in order

1. **Your subagent data is dead in production — fix the data layer first.** Real Claude Code writes subagent transcripts to `~/.claude/projects/<dir>/<sessionId>/subagents/agent-*.jsonl`. Neither adapter reads that path (FolderPicker iterates one level deep; the server's chokidar `depth: 2` misses it and would compute `dirKey = "subagents"` anyway). Main transcripts on this machine contain **zero** `isSidechain` lines, so `SessionTracker`'s sidechain path (`app/src/parser/session.ts:33-38`) and `OfficeStore`'s `agent-` routing (`app/src/state/officeStore.ts:36-49`) never fire outside the demo. Subagent characters appear (Task/Agent `tool_use` spawns them) but their individual status never updates. The product's stated soul is "watching subagents work" — right now that's running on demo-only plumbing. Bonus: the sibling `agent-*.meta.json` carries `agentType`, `description`, and `toolUseId` (a perfect join key to the spawning tool call) — free, high-charm data.
2. **Fix the first-run dead end and the "needs you" signal.** The most common real first-run is: open the page, pick the folder, **no session is live right now** → a silent, pure-void black screen (no empty state exists anywhere). And the one alert that matters — *Claude is blocked waiting on you* — doesn't fire for permission prompts or `AskUserQuestion` (a dangling `tool_use` with no result renders as "running…" forever). These two kill the demo-to-retention funnel.
3. **Kill the stacked boxes: one organic room per folder.** Full design below. Recommendation: build (a) — one organic region per folder — but on primitives that are explicitly (b)-shaped (noise-thresholded blob regions, autotiled edges, scattered stations), then ship the **"archipelago"** milestone: all folder-islands on one shared ground plane with paths between them. That is 80% of the (b) wow for ~30% of its cost. Defer the fully woven continuous world.
4. **Legibility pass.** Per-subagent detail panel (it currently shows the *main* agent's status/tool for a clicked subagent — `app/src/ui/detailPanel.ts`), zoom-independent folder labels (7px canvas text at scale 1 is unreadable — `renderer.ts:170-175`), bigger crown/status affordances at fit zoom, hover tooltips. A visitor should answer "what are my agents doing, and do any need me?" in 3 seconds without clicking.
5. **Scale + perf hardening before the organic world lands:** offscreen-canvas chunk caching of terrain + viewport culling (today every tile of every zone is a `drawImage` per frame), allow auto-fit below scale 1 (`renderer.ts:80` clamps to ≥1, so ≥4 rooms overflow a laptop screen with no hint), incremental transcript parsing instead of full re-parse per change, and prune dead sessions from `OfficeStore.sessions` (it only ever grows).

---

## 1. Product & UX

### What genuinely works

- **The concept is excellent and the hierarchy mapping is right.** Folder→room, session→station, crowned main + helper subagents is instantly explainable in one sentence. That's rare.
- **The demo is a good salesman.** `?demo=14` opens populated, all three themes visible, motion everywhere. Pre-running N steps (`?demo=N`) was a smart call.
- **The terminal-flavored chrome obeys its own design language.** Start screen and panel are restrained, pixel-flat, monospace — on-brand per `DESIGN.md`, no SaaS slop.
- The **status→pose vocabulary** (`work/inspect/gesture/idle/loaf`) is a clean, total mapping (`render/theme.ts:24-41`) and the right abstraction.

### Where it falls down

- **Empty state: there is none.** If `view.rooms` is empty the canvas is a flat `#1d1830` void — no "no live sessions, start `claude` in a terminal and watch this fill up," no hint you picked the wrong folder (picking any random folder also silently shows void). For a tool whose hosted funnel is *visit → pick folder → see magic*, this is the single biggest UX bug. (`renderer.ts:72-84` early-returns the fit; nothing else draws.)
- **The "needs you" promise is broken in the two cases that matter most.** The v1 spec (§4) explicitly promised waiting detection "incl. permission prompts." Implementation reality: `waiting` only triggers on a trailing assistant *text* message (`session.ts:55-56`). A pending permission prompt or `AskUserQuestion` is a dangling `tool_use` → the agent shows as happily working until the 5-minute expiry removes it. The states users most want a second monitor for are invisible.
- **The detail panel lies about subagents.** Clicking a green helper shows the *table's* status, last tool, and model (`detailPanel.ts:6-31` strips the `#` suffix and renders table-level fields under a "🤖 subagent" header). `SubagentView.status` exists and is ignored. With meta.json ingestion (TL;DR #1) this panel could show `agentType` + task description — the real "wow, it's an army" moment.
- **No way to read the room without folklore.** Nothing on screen explains crown = main, z = waiting-for-you, dots = thinking. A tiny toggleable legend (or first-visit coach marks in chrome style) costs little and converts shared screenshots into understood screenshots.
- **Waiting ≠ loafing, emotionally.** "Agent needs your input" renders as the agent *napping under a tree with a z* — charming, but it reads as "done/idle," the opposite of "I'm blocked on you." The strongest at-a-glance product signal should be loud: a `?`/`!` speech bubble, a bounce, even a chrome-level badge ("2 agents waiting on you") that survives any zoom.
- **No history, no recency cue.** A session that went quiet 4 minutes ago looks identical to one that's mid-flow. A subtle fade-out over the expiry window would convey "going cold" for free.
- **Mobile/touch: nothing.** Only `mousedown/mousemove/wheel` (`main.ts:63-79`). A shared link opened on a phone (the most likely "show your friends" path!) can't even pan. Pointer events + pinch is a day of work.
- **Discoverability of the live URL's value:** the README has **no screenshot or GIF**. For a visual showpiece this is the cheapest possible win — the repo's own selling point is invisible on GitHub.

## 2. Visual design

Honest read of the screenshots (`?demo=3/8/14/22`, plus live):

### Delightful

- **The office/study zone is genuinely charming.** Book-stacked library table, banners, lamps, the woven rug, the quill-and-ink effect with crawling ink lines — it has density, warmth, and a focal point. This is the quality bar the other two themes should meet.
- **Character art and animation** (Ninja Adventure walk cycles, pickaxe swings with rotated held tools, the crowned mains) read as "real game," not programmer art. The deterministic effects (chips, +1, dirt puffs) sell the alive-ness exactly as the spec hoped.
- Ground scatter (papers, ore flecks, wildflowers — `effects.ts:61-144`) is a tasteful touch that survives close inspection.

### Off / amateur signals

- **Floating boxes in a void is the #1 "debug view" tell.** Rooms are hard-edged rectangles on flat darkness, separated by a 1-tile gap, each zone outlined with a dark stroke (`renderer.ts:106-108`). It reads as a layout-engine visualization, not a world. The author's instinct here is correct — this is the thing to fix.
- **Copy-paste repetition breaks the illusion.** Two sessions in one folder render two *identical* 13×9 stages stacked: the same library table, the same banners, the same tree+stump+crate (see `?demo=14`, `./api` and `./webshop` columns). Tiled-wallpaper repetition is the fastest way to look procedural in the bad sense. (Cause: `ninja.ts` draws a fixed prop list per theme with no per-zone variation seed.)
- **Density is wildly uneven across themes.** The study is busy and lovely; the farm is a big flat green sheet with one 2×2 orange plot (reads as a sticker), and the mine is a brown-on-gray expanse with a single boulder. 13×9 tiles is too much floor for one work object — empty zones look *abandoned*, not cozy.
- **Scale-dependent text.** Folder labels are 7px canvas-space text (`renderer.ts:170-175`); at fit zoom for 3+ folders they're barely legible, and the white-on-cream office wall has poor contrast. The `+N more` overflow tag has the same problem.
- **The crown — the core hierarchy marker — is a 6×4px doodle** that vanishes at scale ≤2. Gold rim-light on the main, a banner over the station, or a subtle gold ground-glow would survive zoom.
- **Fractional zoom betrays the pixel grid.** `camera.zoomAt` allows continuous scale 0.75–8 (`camera.ts:20-27`) with nearest-neighbor sampling → uneven pixel widths and shimmer while zooming. `DESIGN.md` says "integer-scaled, never blur a sprite"; snapping to integer (or half-integer) steps would honor it.
- **Zone seams within a folder** (dark strokes between stacked sessions of the same room) actively fight the "one room" mental model — even before the organic rework, deleting the inner strokes and sharing one floor would help.
- **No ambient life.** When nothing is working, the world is a still image. One cat, drifting clouds/light, the swaying plant being everywhere rather than only in offices — idle charm is what makes people leave it open on a second monitor.

## 3. Architecture & code

### The good — and it's genuinely good

- **The pipeline is exactly the right shape.** `adapters → parseLine → SessionTracker → OfficeStore → layout() → Renderer/Skin` with the UI never knowing the adapter. Small, typed, zero runtime deps. For 1.8k LOC this is a clean codebase with taste.
- **The Skin seam (`render/skins/skin.ts`) is the best architectural decision in the repo.** Renderer owns camera/loop/y-sort/hit-test; skins own every sprite decision; flat-color fallback keeps the app alive if sheets 404. The premium-pack-stays-local story falls out for free.
- **Determinism discipline** — no `Math.random` anywhere; effects/scatter/themes hash off (time, seed, coords) (`effects.ts:10-18`). Tests can pin exact outputs and do. This will pay off enormously in the procedural world (see §5).
- Sensible touches everywhere: 256KB tail reads, path-traversal guard in the static server, drag-vs-click suppression, camera auto-fit until `userMoved`.

### Weak points / fragility

- **Full re-parse on every change.** `OfficeStore.ingest` rebuilds a `SessionTracker` from the entire (≤256KB) snapshot on every poll tick / chokidar event (`officeStore.ts:51-57`), and `FolderPickerAdapter.pollOnce` re-reads every changed file fully each second. O(file) per second per active session; fine today, but it's the scaling cliff. Since snapshots are append-only, `if (next.startsWith(prev)) feed(next.slice(prev.length))` makes it incremental with the existing `feed()` API.
- **Unbounded growth:** `OfficeStore.sessions` and `dirOrder` are never pruned; a long-lived tab accumulates every session ever seen. Eviction at, say, 2× the waiting window is a 5-liner.
- **Renderer redraws the entire world per frame** — every tile, every scatter check, every prop `drawImage`, no viewport culling (`renderer.ts:101-131`, `ninja.ts:84-95`). ~10 zones ≈ thousands of draw calls/frame. Terrain is static per layout; render each zone (or 32×32-tile chunk) to an offscreen canvas once, invalidate on layout change, and blit. This is also the prerequisite for the organic world's bigger maps.
- **Auto-fit can't fit.** `maybeFit` clamps scale to ≥1 (`renderer.ts:80`), so a 4-folder office (4×14×16 = 896px… fine) — but 6+ folders or any 2-session folder on a small window overflows with no scrollbar hint or minimap. Allow fractional fit-out (render at integer scale into a downscaled blit, or accept 0.5 steps), or add a minimap/edge indicators.
- **Hit-testing picks the back character.** `hitTest` iterates map insertion order (`renderer.ts:61-69`) while drawing y-sorts — for overlapping characters the click selects the one *behind*. Iterate the y-sorted list in reverse.
- **XSS via transcripts.** `detailPanel.show` interpolates `lastToolTarget` (i.e. raw `command`/`file_path` strings from the JSONL) into `innerHTML` (`detailPanel.ts:16-30`). A Bash command containing `<img onerror=...>` executes in the page. Low stakes (local data, no secrets) but it's a public showpiece — use `textContent` or escape.
- **Dead/duplicated code paths:** `atlas.ts` + `THEME_TILES` kept in-tree but unused (acknowledged in the build log — fine, but it *will* rot); `drawToolOverlay` in `characters.ts:44-82` is only used by the fallback renderer; the office work pose never uses the Attack sheet (`ninja.ts:261` excludes office) so the keyboard-overlay concept silently vanished from the real skin.
- **`main.ts:56-58`** has a mis-indented first line in the click handler — harmless, but it's the kind of thing that signals "nobody re-read this file."
- **`ninja.ts` is a 372-line bag of magic coordinates.** It works, and skins are allowed to be concrete — but per-theme prop lists as *data* (`{sheet, sx, sy, w, h, dx, dy}[]`) would enable the per-zone variation the visual section begs for, with no new art.

### Test coverage

57 green tests, fast, and the pure logic (parser, store, layout, theme, effects, camera) is genuinely covered — good. Gaps, in priority order:

1. **No renderer smoke test** — the v1 spec (§7) promised "boots, draws a frame." `Renderer`+`NinjaSkin` have zero coverage; a jsdom/canvas-stub smoke test would catch wiring regressions.
2. **No adapter contract test** — also promised in the spec ("both adapters against the same fixtures must emit identical event streams"). Given the nested-subagent divergence found below, this test would have *failed usefully*.
3. **No real-transcript fixture.** Every fixture is hand-rolled. One anonymized real session file (with `isSidechain`, summary lines, compaction artifacts, an `agent-*.jsonl`) as a golden test would anchor the parser to reality.
4. `server/` has no tests at all (`npm test -w server --if-present` is a no-op), and `hitTest`/`DetailPanel` are untested.

## 4. Correctness vs. real transcripts

Verified against the actual `~/.claude/projects` tree on this machine (51 top-level session files, multiple `<sessionId>/subagents/` dirs):

1. **(Critical) Nested subagent transcripts are invisible.** Reality: `projects/<dir>/<sessionId>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json`. The FolderPicker iterates exactly `dir/file` (`folderPicker.ts:21-27` — directories at level 2 are skipped). The server watches `depth: 2` (`server/src/index.js:67`) which doesn't reach the files; if it did, `dirKey = basename(dirname(path))` (`index.js:41`) would yield `"subagents"` — pushing a phantom key into `dirOrder` and never matching a room. The `agent-` handling in `officeStore.ts:36-49` assumes sibling files that current Claude Code doesn't produce.
2. **(Critical) `isSidechain` lines no longer appear in main transcripts** (0 hits across this machine's files). So per-subagent statuses are *only* reachable via the nested files — i.e., today, never. Subagent characters all show the generic work pose forever; the demo is the only place individual statuses work.
3. **(High) The `meta.json` join is sitting right there.** `{"agentType": "general-purpose", "description": "…", "toolUseId": "toolu_…"}` — `toolUseId` matches the `tool_use.id` already stored in `SessionTracker.open`. Ingesting it gives: correct subagent attribution (no more "newest tracker with open subagents" heuristic), agent-type labels, and task descriptions for the panel. The attribution heuristics in `officeStore.ts:38-44` and `session.ts:35-37` (route to *last opened* subagent) actively misattribute under parallel fan-out — exactly the showpiece scenario.
4. **(High) Permission prompts / `AskUserQuestion` read as working.** A dangling `tool_use` with no `tool_result` keeps the last tool's status indefinitely (`session.ts:44-57`). Heuristic fix: pending tool older than ~45s → `waiting`-flavored "blocked?" state; `AskUserQuestion` by name → `waiting` immediately.
5. **(Medium) Subagent lifetime = dangling-id lifetime.** If a `Task` result lands beyond the 256KB tail, or compaction rewrites history, `open` leaks a phantom helper for the session's life (`session.ts:53`, filter at `:60`). Cheap guard: cap subagent display age, or expire opens not refreshed by sidechain/meta activity.
6. **(Medium) `labelFromDirKey` fails loud on real paths.** For `-Users-yassinealwahdani-ysolves-tools-naamloze-map` the "last single-char segment" heuristic (`officeStore.ts:17-24`) finds nothing and returns the entire dash-joined string as the room label. `cwd` usually rescues it, but the first render (before a `cwd` line is parsed) and any cwd-less file shows the monster string.
7. **(Low) Unknown/new event types are handled well** — `parseLine` ignores non-user/assistant lines, unknown tools map to `working`, malformed JSON is skipped (`transcript.ts:22-35`). Good defensive posture. `Skill`/`ToolSearch`/`Monitor` etc. all land on `working`; consider mapping a few new-generation tools (`Skill` → `working`, `WebSearch` variants) as charm allows.
8. **(Low) Multi-tool turns show only the last tool** (`session.ts:34-35, 46-49`) — acceptable display simplification, worth a comment in the README's "how it works."

---

## 5. HEADLINE — From stacked boxes to an organic world

### 5.1 The diagnosis

The current model hard-codes *zone = 13×9 rectangle* (`layoutEngine.ts:10-21`), *room = vertical stack of zones*, *building = horizontal row of rooms*. Three consequences: (1) a folder with 2 sessions reads as two unrelated boxes (the author's complaint — confirmed by every screenshot); (2) duplicate prop sets amplify the copy-paste feel; (3) the void between rooms makes the whole thing read as a diagram, not a place.

### 5.2 The reframe that unlocks everything: regions are terrain, themes are structures

Stop thinking "rooms with walls." A folder is a **biome patch** — an organic blob of themed ground — and the themed things (scribe's desk, ore face, crop plot, lounge) are **structures placed on it**. This one reframe solves the awkward cases:

- The office/study no longer needs interior-floor edges (which the Ninja interior tilesets can't blend into grass); it becomes a **scholar's camp** — a rug + desk + bookshelves *on* a clearing, or a small house footprint whose interior is visible (RPG-style cutaway). Mine = rocky outcrop with a cave mouth on a stone patch. Farm = fenced field on grass.
- Edges between a region and the world background are a solved pixel-art problem: **autotiling** (marching squares), and `TilesetField`/`TilesetNature` ship the needed grass/dirt/cliff transition tiles.
- Regions can then sit on a *shared* ground plane, which is the door to vision (b).

### 5.3 The model

Replace `FloorPlan` with a `WorldPlan`, and the pure `layout()` function with a **stateful, incremental `WorldEngine`** (layout must now have memory — stability is a feature, recomputation-from-scratch is not):

```ts
// world coordinates are tile coords on one shared grid
interface WorldPlan {
  regions: Region[]
  paths: PathSeg[]          // phase 2+
  seats: Seat[]             // same shape as today — renderer/characters untouched
  bounds: { tx: number; ty: number; tw: number; th: number }
}

interface Region {
  dirKey: string
  theme: Theme              // already per-folder (theme.ts THEME_SCOPE='room')
  anchor: TilePt            // assigned once, never moves
  radius: number            // grows with session count; monotonic per app run
  cells: CellSet            // derived blob mask (packed x,y → bitset/Set<number>)
  edge: EdgeRun[]           // autotile output: per border cell, a 4-bit mask
  stations: Map<string, Station>  // sessionKey → station, sticky once placed
  lounge: TilePt            // one per region (not per session!)
  gateway: TilePt           // border cell nearest the world spine; signpost lives here
  label: string
}

interface Station {
  anchor: TilePt            // work object top-left
  mainSpot: TilePt
  subSpots: TilePt[]        // ≥4, generated around anchor with clearance
  decor: number             // seed for per-station prop variation
}
```

### 5.4 The algorithms (all seeded, all deterministic, all stable)

**Region anchor placement — "first-seen spiral."** Maintain placement order = `dirOrder` (already stable). For each new dirKey, walk a fixed low-discrepancy spiral (golden-angle: `θ = k·2.39996, r = c·√k`) from world origin and take the first position where a maximal-radius disk (say R=24 tiles) doesn't intersect any existing region's *reserved* disk. Existing regions never move; new folders always find a slot ring-outward. Deterministic given arrival order; visually it produces a pleasing cluster, not a row.

**Region shape — noise-thresholded blob with monotonic growth.** A cell `(x,y)` belongs to the region iff

```
dist((x,y), anchor) < R · (0.72 + 0.55 · noise(x, y, hash(dirKey)))
```

where `noise` is value noise built on the existing `det()` hash (`effects.ts:11-18` — already pure and tested; bilinear-interpolate det at integer lattice points for smoothness). Properties: per-cell membership is a pure function of `(dirKey, R)`; because the noise field is fixed, **increasing R only adds cells** — the blob grows organically at its own coastline, interior never reshuffles. Target radius `R = R0 + k·√(sessionCount·A)` (area-proportional). Growth animates for free (lerp displayed R toward target ~1 tile/s — new ground "spreads"). On session decrease, **don't shrink** (stability beats tidiness); the region disappears entirely when the folder has zero live sessions, same as today.

**Station placement — greedy max-min-distance over hashed candidates.** Candidates = interior cells with ≥3 tiles clearance from the border (`distToEdge ≥ 3`, computable by erosion of the mask). Order candidates by `hash(dirKey, x, y)` for determinism. First station: highest-scoring candidate (score = distance to edge). Each subsequent session: candidate maximizing min-distance to existing stations and the lounge (Mitchell's best-candidate ≈ Poisson-disk). **Stickiness rule:** once a sessionKey has a station, it keeps it for the app's lifetime; new sessions never displace old ones; freed stations leave their ground (a nice touch: leave a "worked ground" decal — depleted rock, harvested field — so history shows). If the blob must grow before a candidate exists, bump R first. Lounge places once per region near the gateway by the same scoring. Reload determinism: identical live-session sets reproduce identical layouts; mid-run arrivals are deterministic *given arrival order*, which is the same guarantee the current row layout has.

**Edges — marching-squares autotile.** For each border cell compute the 4-bit (or 8-bit for corners) neighborhood mask → index into a transition-tile table per theme (grass→dark, stone→dark, field→grass). One new pure module (`layout/autotile.ts`), heavily unit-testable (mask → tile index), one screenshot-verified tile table per theme in the skin. This is the only genuinely new *rendering* primitive needed for (a).

**Seats** are derived exactly as today (main at station, subs at subSpots, loafers at the regional lounge) — `Seat`, `CharacterSet`, poses, effects, the entire skin character path **do not change**. That containment is what makes this rework tractable.

**Paths (phase 2).** Connect each new region's gateway to the nearest existing region's gateway (or to a central "spine" point) at placement time: Bresenham line, wobbled by ±1 the same value noise, stamped as dirt-path tiles on the shared ground. Stored once; never re-routed. A 16px signpost sprite at the gateway carries the folder label (replaces wall text — readable because it's chrome-anchored: draw label text in screen space above the signpost at min 10px).

**Walkability.** Keep straight-line lerp inside regions (stations have clearance; overlaps are rare and pixel-art-forgivable). Arrivals: spawn at the gateway and walk to the station (replaces today's drop-from-`ty=-2`, `characters.ts:146-149`). A* on the tile grid is a phase-3 nicety, not a prerequisite — don't build it before paths exist to walk on.

### 5.5 Rendering & performance plan

- **Chunked terrain cache:** render static terrain (ground, edges, structures, scatter) into 32×32-tile offscreen canvases keyed by chunk coords; invalidate a chunk when a region's R, stations, or membership intersecting it changes. Per frame: blit visible chunks (viewport cull via camera rect), then characters + effects live. This converts the current O(world) per-frame cost into O(visible), and animated tiles (plant frames, crops) just stay in the live layer.
- **Background:** the void becomes a *designed* backdrop — phase 1: keep dark but add faint scattered stars/grain so islands read as intentional; phase 2 (archipelago): dark water or night-forest tiles from `TilesetNature`, which instantly makes it "a world."
- **Camera:** auto-fit must handle worlds larger than the screen (fit below 1 by rendering at integer scale to an offscreen and downscaling, or accept 0.5 steps), plus an optional "follow activity" drift toward the most recent event — lovely for the second-monitor use case.
- **Readability guards:** cap region radius (overflow stations → densify spacing, then a `+N` signpost); per-station decor variation seeded by `hash(stationKey)` choosing from prop sub-lists (kills the copy-paste look with zero new art); keep one lounge per region so loafing reads as "the folder's porch," not per-session duplication.

### 5.6 Incremental path

- **Phase 0 — merge the boxes (1–2 days, app code only).** Keep rectangles but make *room = one continuous floor*: one shared back wall/floor per folder, stations packed in a 2-column grid inside it, **one** lounge per room, no inner strokes, per-station decor variation. This alone resolves the author's literal complaint and is shippable this week. It also forces the `Station`/`Region` data-shape refactor (zones→stations) that everything later builds on.
- **Phase 1 — organic islands ((a), 4–6 days).** `WorldEngine` (anchor spiral, blob mask, sticky stations, lounge, gateway) + `autotile.ts` + skin edge-tile tables + chunk cache. Regions float on the designed dark backdrop. Themes become terrain+structures (study = camp/cutaway house).
- **Phase 2 — archipelago ((b)-lite, +3–5 days).** Shared ground plane (water/night-forest), wobbled paths between gateways, signposts, gateway arrivals, camera follow-mode, ambient critters (birds over farm, bats by mine — the Ninja pack has them).
- **Phase 3 — woven world ((b)-full, optional, +1–2 weeks).** Biome blending at region borders, agents walking paths between regions (delegation visualized as a sub *traveling* to a neighbor region!), day/night tint, A* pathing. Only if the product earns it.

### 5.7 Risks & tradeoffs

- **Stateful layout is a real regression in testability** vs. today's pure `layout()`. Mitigate: `WorldEngine` stays pure-functional *per step* (`step(prevWorld, view) → world`), all randomness via `det`/`hashString`, and golden tests assert stability invariants ("adding session never moves existing stations," "R monotonic," "same input sequence ⇒ same world").
- **Autotile art coverage** is the riskiest visual bet (the build log's screenshot-verification loop is the right tool). Fallback: 1-tile soft shadow/dithered edge ramp drawn procedurally — uglier but shippable.
- **Stability vs. compactness:** spiral placement + no-shrink means a long session accumulates sparse layouts. Accepted: this is a live view, not a city-builder; regions vanish when folders go cold, and a page reload re-packs.
- **Scope gravity.** (b)-full is a game. The product is a *visualizer with game charm*. Phase 2 is where shareability peaks (one screenshot = "my codebase is a village"); phase 3's marginal wow is small relative to its cost. Hold the line there.

### 5.8 Recommendation

**Build (a) now, architected as (b)-primitives, and ship Phase 2 ("archipelago") as the headline release.** Discrete boxes are the product's biggest visual liability and the author knows it; but jumping straight to a woven continuous world risks months of layout/pathfinding yak-shaving on top of a data layer that (per §4) currently can't even see real subagents. Phase 0 this week, Phase 1–2 as the v4 arc — *with TL;DR #1 and #2 fixed first*, because an organic world full of agents with fake statuses is a prettier lie.

---

## 6. Prioritized roadmap

### Quick wins (hours each)

| # | What | Where | Effort |
|---|---|---|---|
| 1 | Empty state: "no live sessions — run `claude` and come back" + wrong-folder hint (`projects` dir heuristic: child dirs starting with `-`) | renderer/main/startScreen | 2–4h |
| 2 | README screenshot/GIF + OG meta tags on the hosted page | README, index.html | 1–2h |
| 3 | Detail panel: show clicked subagent's own status; escape HTML (XSS) | detailPanel.ts | 2h |
| 4 | `AskUserQuestion` → waiting; pending tool >45s → "blocked?" state + loud waiting affordance (bubble + chrome badge) | session.ts, theme.ts, skin | 4–8h |
| 5 | Hit-test front-most character; integer zoom snapping; fit-below-1 | renderer.ts, camera.ts | 2–4h |
| 6 | Per-zone decor variation from a seed (kill copy-paste rooms) | ninja.ts | 3–5h |
| 7 | Touch/pointer events for pan + pinch | main.ts | 3–5h |
| 8 | Prune dead sessions; incremental `feed` on append (`startsWith` diff) | officeStore.ts, adapters | 3–5h |

### Medium bets (days)

| # | What | Effort |
|---|---|---|
| 9 | **Nested subagent ingestion**: recurse `<dir>/<sessionId>/subagents/` in both adapters; join via `meta.json.toolUseId`; per-subagent status/agentType/description end-to-end; adapter contract test | 2–3 days |
| 10 | **Phase 0 organic-lite**: one continuous room per folder, stations not zones, single lounge, no seams | 1–2 days |
| 11 | Renderer smoke test + real-transcript golden fixture + server test | 1 day |
| 12 | Chunked terrain cache + viewport culling | 1–2 days |
| 13 | Legend/onboarding overlay + hover tooltips (name, tool, target) | 1 day |
| 14 | Recency fade for going-cold sessions; ambient idle life (cat, birds) | 1–2 days |

### Big bets (the v4 arc)

| # | What | Effort |
|---|---|---|
| 15 | **Phase 1 — organic folder-islands** (WorldEngine, blob+autotile, sticky stations) | 4–6 days |
| 16 | **Phase 2 — archipelago world** (shared ground, paths, signposts, gateway arrivals, camera follow) — *the shareability release* | 3–5 days |
| 17 | Phase 3 — woven world (biome blending, inter-region walking, day/night) | 1–2 wks, optional |
| 18 | npm publish of the server (`npx yagents`) — the README's clone-and-build local path is 5 commands too many for the audience | 1 day + upkeep |

---

*Bottom line: the bones are excellent — clean pipeline, real skin seam, deterministic discipline, and one theme (the study) already proves the charm ceiling is high. The product currently undersells itself twice: the data layer can't see real subagents, and the layout presents a charming world as a row of debug rectangles. Fix the truth, then build the island world on the primitives sketched above.*
