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
- [ ] Phase 1 — assets + atlas
- [ ] Phase 2 — theme + layout
- [ ] Phase 3 — renderer + effects
- [ ] Phase 4 — demo + visual iteration
- [ ] Phase 5 — ship

## Decision journal

(Appended as decisions are made during the build.)
