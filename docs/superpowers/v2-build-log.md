# yAgents v2 — Overnight Build Log

Living document. Records what's being built, the choices made, and why — so the work survives a context compaction. Started 2026-06-11, overnight autonomous run.

## Mandate (from the user)

Build the v2 "work zones" vision autonomously overnight. Repivoting is cheap, so make educated guesses and ship a great product. Use **Fable 5 subagents** for the build (Fable is stronger at sprite/visual work). The orchestrator (me) locks architecture, verifies with screenshots, integrates, deploys. If a subagent's content trips the safety classifier and bounces to Opus, let it finish on Opus and resume Fable for the next piece.

**Why this product matters to the user:**
1. A genuinely cool tool to **share publicly with the vibe/AI-coder community** — PR for their software company.
2. They love **watching subagents work** and showing it to friends/family/colleagues — a fun way to visualize agent-driven workflows.

So the bar is: shareable, delightful, "show your friends" quality. Charm and motion over realism.

## Source of truth

Design spec: `docs/superpowers/specs/2026-06-11-yagents-v2-workzones-design.md`.

## Orchestration strategy

Sequential phases, each implemented by a Fable subagent, verified by the orchestrator (headless Chrome screenshots of `?demo=1` + the test suite) before moving on. v1 stays deployed until v2 is screenshot-verified.

- **Phase 1 — Assets + atlas:** fetch CC0 Kenney farm/mine tile packs, pick tiles, expand `atlas.ts` with verified coords, update LICENSE. (Fable; visual.)
- **Phase 2 — Theme + layout logic:** `theme.ts` (seeded per-zone assignment, theme→tiles/poses tables, status→pose map) + rewrite `layoutEngine.ts` to emit work zones + lounges, drop kitchen. Pure logic, unit-tested. (Fable.)
- **Phase 3 — Renderer + effects:** themed zone/lounge drawing, pose-based 2-frame characters, `effects.ts` work-target flair (chips, crop growth, screen flicker), lounge routing in `characters.ts`. (Fable; visual.)
- **Phase 4 — Demo + visual iteration:** extend demo to show all three themes + subagents joining a job + idle loafing; orchestrator screenshots and feeds tuning back to Fable.
- **Phase 5 — Ship:** full suite green, build, deploy to Pages, verify live, final log update.

## Key locked decisions

- **Theme scope = per zone** (`THEME_SCOPE = 'zone'`), seeded by session key; one constant flips it to per-room. (User's call: "one theme per zone.")
- **No central kitchen**; each room has its own lounge corner. Idle/waiting agents loaf in their own room.
- **2-frame animation** for v1 of motion; work-target effects do the heavy lifting. Escalate to richer cycles later.
- **Themes are cosmetic/random** (office/mine/farm); no effect on logic.
- Data layer (adapters/parser/SessionTracker/OfficeStore) untouched — blast radius is `layout/` + `render/` only.
- Sprites remain progressive enhancement (flat-color fallback if a sheet 404s).

## Progress

- [x] Spec written + committed (`5a3d085`).
- [x] Phase 1 — assets + atlas (`02d5c6e`)
- [x] Phase 2+3 — theme + layout + renderer + effects (`191f54e`)
- [x] Phase 4 — polish pass: connected mine cluster, ground scatter, tighter sub clustering (`7a70174`)
- [x] Phase 5 — shipped to Pages (see below)

## Outcome

v2 is live. Orchestrator-verified by headless-Chrome screenshots at each phase. Three themed work-zones (office/mine/farm) render cohesively: crowned main agent at a shared work object (CRT desk / ore face + cart / tilled crop plot), subagents huddle at the same job, idle agents loaf in a themed nook, deterministic effects (screen flicker + code lines, rock chips + gold "+1", dirt puffs + crop growth) and ground scatter make each zone cozy. 55 tests green, tsc strict green. Built entirely by Fable 5 subagents; orchestrator owned the contracts (`theme.ts` poses, `THEME_TILES`, FloorPlan shape) and visual verification.

Known soft edges to revisit with the user (none blocking): zones are roomy (intentional — leaves space for subagents to join); a stray gray rock can read slightly odd in a farm nook; new agents walk in from the top of their column (no doorway pathing yet); individual subagent animation from nested `subagents/*.jsonl` is still the separately-scoped future task (subagents currently show the generic work pose).

## Decision journal

- **2026-06-11 — Lounge is per-zone, not per-room.** Theme is per-zone (user's call), which conflicts with a single per-room lounge (what theme would a mixed-theme room's lounge be?). Resolved by giving **each work-zone its own small themed lounge nook**. This is *more* decentralized (the whole point of killing the central kitchen) and keeps every zone a coherent self-contained themed stage. Reinterprets "each room has its own lounging area" → "each zone has its own loaf nook." Easy to revisit.
- **2026-06-11 — Phase 1 assets (Fable, commit 02d5c6e).** Surveyed existing `rpg.png` (rich in outdoor/mine/farm tiles) + `indoor.png`; added one new CC0 sheet `city.png` (Kenney Roguelike Modern City) purely for a green-phosphor CRT terminal (office work object). `THEME_TILES` in `atlas.ts` is the visual vocabulary contract. Orchestrator verified all 28 tiles via a montage screenshot — cohesive and correct. No wheat/hay in the Kenney roguelike family, so farm crop stages are sprout→tuft→berry-bush and the "hay" prop is a grain sack.
- **2026-06-11 — Pose vocabulary locked** (`render/theme.ts`, orchestrator-owned): `work | inspect | gesture | idle | loaf`. Status→pose: typing/running/browsing/working→work, reading→inspect, delegating→gesture, thinking→idle, waiting/idle→loaf. Walk is movement-driven, overlaid by the character layer. This is the stable contract the renderer builds against.
- **2026-06-11 — Phase 2+3 combined** into one Fable "renderer rewrite" task (layout + renderer + characters + effects land together to keep the build green and be screenshot-verifiable as a unit), against the locked `theme.ts` + `THEME_TILES` contracts.
- **2026-06-11 — Renderer rewrite landed (Fable).** Work-zone layout (13×9 zones, work anchor (5,2), main (5,4), sub cluster (3,3)/(8,3)/(3,5)/(8,5), loaf nook (1,6)-(4,8)), themed zone rendering, pose-driven 2-frame animation with per-theme tool overlays (pickaxe/hoe/keyboard), and a deterministic effects layer (screen flicker + code lines, rock chips + "+1", dirt puffs + crop cycle). Three supporting decisions: (1) **first sync spawns characters in place** — an already-running office shouldn't have everyone walk in from off-screen (also makes headless screenshots reliable); later arrivals still walk in. (2) **`?demo=N` pre-runs N script steps** so the diorama opens populated (`?demo=12` is the screenshot state); plain `?demo=1` unchanged. (3) **camera auto-fits** the floor plan until the user pans/zooms (`Camera.userMoved`). Tile fixes over the phase-1 set after screenshot review: boulder→brown rock pile (contrast on gray floor), farm plot→solid soil + procedural furrows, lantern→stump-with-axe, pump→fruit tree, plus 2 ambient deco props per theme.
