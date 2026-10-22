# AGENTS.md — dsh-flash Development Rules

> This file documents known requirements, development constraints, testing conventions, and hard-won lessons for the `dsh-flash` core plugin. Read it before modifying `lib/client.js` or `src/index.ts`. The dock-base integration is a separate package — the `dock-flash` adapter — and is not in this repository.


## What belongs in this file, and what does not

`AGENTS.md` is injected into **every request**, so its length is a cost paid on every turn. It holds
the **rules** — contracts, invariants, and the traps that cost real defects. Everything else belongs
in `docs/` and is read when it is relevant:

| Content | Where | Why |
|---|---|---|
| Contracts, invariants, Critical Rules | here | needed while writing code |
| Procedures (release steps, the test checklist) | `docs/` | needed when performing that task |
| The full integration guide | `INTEGRATION.md` | already published — must not drift |
| The "why" behind a rule, and measurements | `docs/architecture-notes.md` | read when the rule is questioned |

**The budget is 65536 bytes, and it is not advisory.** `dsh-base` mounts
`@deepseek-ai/dsh-agent-instructions` with `maxBytes: 65536`, and the cap applies to the complete
rendered baseline. Exceeding it does not error — it **truncates this file mid-sentence**, so the
failure mode is silently losing rules. `pnpm run check:docs` reports the headroom and fails when the
budget is exceeded or a link here stops resolving.

**Splitting into another project file does not help.** Only `AGENTS.md`, `CLAUDE.md` and their
`.local` overlays are discovered as candidates, and every candidate shares the one budget — a second
file buys nothing. `docs/` is not a candidate name, which is why relocation works.

---

## Project Structure

```
src/index.ts      HOST half      → tsc → dist/index.js
lib/client.js     BROWSER half   → single file, NO build step, edited directly
dist/index.js     compiled host half — TRACKED on purpose (see Build & Install)
cordis.patch.yml  bundle layer: inserts this package's host row (id `dsh-flash`, name `dsh-flash`)
package.json      manifest + dsh.client.inject
docs/             long-form notes — NOT injected, read on demand
scripts/          repo tooling — NOT published (see `files` in package.json)
```

Docs: `README.md` / `README.zh-CN.md` (English is canonical), `INTEGRATION.md` /
`INTEGRATION.zh-CN.md` (third-party guide), `CHANGELOG.md` (history), `AGENTS.md` (this file).
`docs/`: `critical-rules.md` (the full text behind the numbered rules below), `switch-reference.md`
(every optional switch field), `architecture-notes.md` (the "why" and the measurements),
`testing-checklist.md`, `releasing.md`, `skin-system.md`, `panel-ordering.md`,
`refactor-coupling-map.md` (what has been extracted into which companion plugin). `scripts/`:
`check-docs-size.mjs` (`pnpm run check:docs`), `check-overlay-mount.mjs` (`pnpm run check:overlay`).

Three further files under `docs/` are **history, not reference**, and are deliberately not linked from
here: `handoff-phase1.md` and `refactor-plan-core-adapter-split.md` (the core/adapter split, shipped and
released — the handoff names its own deletion condition) and `内存告警指标.md` (a design note for the
memory monitor's thresholds, which now lives in `dsh-flash-mem-mon`). Do not cite any of the three as
current behaviour of this package.

- **Host half** (`src/index.ts`): compiled via `pnpm run build` (tsc). Touch only this file for host-side changes.
- **Client half** (`lib/client.js`): single monolithic file, edited directly — no build, no bundler, no TypeScript. Changes take effect on page refresh (symlinked in profile).
- **`pnpm run check:docs`**: verifies this file still fits its budget and that every link below resolves. Run it before committing a change to `AGENTS.md` or `docs/`.

---

## Build & Install

```sh
pnpm install
pnpm run build          # tsc → dist/index.js (host half only)
pnpm run typecheck      # type check without emitting
```

- Install into profile: `dsh plugin --profile web add ./dsh-flash` (or `… add dsh-flash` from npm)
- dsh-flash is **symlinked** in the profile — edits to `lib/client.js` appear on refresh without reinstalling
- Host half changes require `pnpm run build` then restart DSH

**`dist/` is tracked on purpose — never add it back to `.gitignore`.** A git install fetches sources, not built artifacts: nothing runs the `build` script, so a repo without `dist/` arrives missing the host-half entry point (`package.json` `main` and `exports["."]` both point at `./dist/index.js`) and fails to load. Shipping the compiled file lets `dsh plugin --profile <p> add github:tcgbp/dsh-flash` work with no build step and **no `allowBuilds` permission**. Do **not** add a `prepare` script alongside it: declaring one makes pnpm ≥10 demand an explicit build allowance before the first `add` succeeds, which would defeat the purpose. Consequence: every `src/index.ts` change must be followed by `pnpm run build` and a commit of `dist/` in the same change.

---

## Publishing & Repository Sync

**Gitee is authoritative; GitHub is a mirror.** The full procedure — remotes, the mirror workflow,
and the API route that still works while `github.com` is unreachable — is in
**[docs/releasing.md](docs/releasing.md)**. Four things must not be got wrong, so they stay here:

- **Always commit and push to Gitee.** No `github` remote is configured, deliberately: github.com is
  intermittently unreachable, so a dual-push succeeds unpredictably and the two repositories then sit
  silently divergent. `.github/workflows/sync-from-gitee.yml` is what updates GitHub.
- **Do not re-enable Gitee's 仓库镜像管理 push mirror.** It was tried and never delivered a single
  commit; a second, unverified mirror racing the workflow is how the two drift apart again.
- **`github.com` being unreachable is not the mirror being broken.** Measured in one sitting: eight
  consecutive `git push` attempts to `github.com:443` failed while `api.github.com` answered HTTP 200
  in 0.55 s. Reach for the API, not `git`.
- **npm is a SECOND channel, and nothing keeps it in step.** dsh-market installs an entry's **npm
  name** when it has one (the Release tarball is only the fallback), so npm is usually the channel a
  user actually receives — and the registry resolves that mapping from the **published** package's own
  `repository`, so a missing or wrong one costs a release to fix. `npm publish` is as observable and as
  unrecallable as the tag — it sits behind gate 2, never "while I am here". npm 11.16 **stages** a
  bypass-2FA publish instead of publishing it, and its packument is CDN-cached, so both "it failed" and
  "it worked" are easy to misread: the staging symptoms, the accepted `add` specs, and the way to verify
  a publish actually landed are in [docs/releasing.md](docs/releasing.md). A companion's `dsh-flash`
  peer range is a hard **npm** gate, not documentation — a stale one makes `npm install` fail with
  `ERESOLVE`, while `dsh plugin add` only warns.


---

## Architecture

### Plugin Contract

The core has one hosting story: it always publishes a service and offers its own standalone ⚡.

**The `dockFlashPanel` service** — `ctx.provide('dockFlashPanel', …)` exposes the core's panel and its host-control handshake:

| Field | Value |
|---|---|
| `version` | `1` — the contract version; a consumer checks it before claiming |
| `Panel`, `ErrorBoundary` | the QuickControlPanel and its mandatory error boundary |
| `Header` | `({ wb }) => React element` — close-on-blur toggle + close button, painted imperatively |
| `icon` | `LIGHTNING_ICON` — a `{ path, stroke, size }` descriptor, **not** an SVG string; a consumer renders it through its own `path`-drawing element |
| `registry` | the QuickControlRegistry instance (also published as `quickControl`) |
| `i18n` | `{ t, L }` |
| `host` | `{ claim(), release(), releaseOne(), isClaimed() }` — the ownership handshake below |

**Standalone by default** — injects a ⚡ trigger button through `ctx.slots.inject(<slot>, ...)`, where the slot is chosen by the `trigger-position` switch (`dock-flash:trigger-position`, default `conversation.input.right`). Clicking the trigger toggles a floating QuickControlPanel anchored to the button. The floating panel has a drag-to-move title bar (⠿ grip + ⚡ + the localized `title` string + close-on-blur toggle + × close) and uses `react-dom/client`'s `createRoot`. That toggle and the outside-click handler read the same `localStorage` key, so close-on-blur here tracks the header toggle in a dock host too.

### The ownership handshake — the ONLY mode decision

The core **never** looks for `workbench` or dock-base. It always mounts its ⚡, and stands it down only while a HOST holds a CLAIM.

- `host.claim()` unmounts the standalone ⚡ and returns a lease; `lease.confirm()` says the host finished registering what it claimed; `host.release()` (or `lease.release()`, or the plugin's `ctx.on('dispose')`) brings the ⚡ back. `releaseOne()` drops one holder without releasing the others; `isClaimed()` reports whether a live claim exists.
- **A claim that is not `confirm()`ed within `CLAIM_WATCHDOG_MS` (2000 ms) is rolled back**: the core warns and re-mounts its ⚡, so a host that claims and then throws cannot leave the user with no panel at all. A lease is bound to the claimer's fiber and released on dispose, so an adapter that forgets `release()` cannot leak the claim.
- **The dock-base workbench registrations — sidebar panel, activity bar item, editor view, command, settings card — live in the separate `dock-flash` adapter package.** This core registers none of them; it supplies `Panel`, `Header`, `ErrorBoundary` and `icon` and nothing else about the dock.
- **`apply()` is idempotent.** Two patch layers may both insert this plugin's row (`insert` does not dedupe by id), so a second `apply()` returns immediately when `ctx.get('dockFlashPanel')` already exists. The guard is the SERVICE, never a module-level flag, so disable→enable still works.

**`sidebar.footer.action` is deliberately not offered as a trigger position.** It is a shared slot that CordisPanel and other plugins also occupy, and a second occupant produces visual conflicts with them. Do not re-add it to `TRIGGER_POSITIONS`, and keep the fallback in `loadTriggerPosition()` pointing at a conversation slot. Note the trade-off: every slot-based position lives inside the conversation UI, so with no session open the trigger is not rendered at all — that is accepted.

### The overlay trigger: the one position that is not a slot

`conversation.overlay` floats a draggable ⚡ inside the conversation's top-right corner. **Its
`TRIGGER_POSITIONS` entry carries no `slot`, and that absence is the mechanism** — `injectTrigger()`
takes the overlay path instead of registering into a slot. `conversation.session.header.corner` looks
right but is not usable: it is `kind: "single"` (the renderer keeps only `entriesOfSlot[0]`), so a
second occupant does not queue, it **disappears**, and `@deepseek-ai/dsh-client-ui-sidebar-right`
already ships there with its expand button.

The rules that must hold together — each one cost a defect:

- **The anchor is found structurally, never by class name.** `conversationViewport()` matches
  `div[class*="_scrollBody"]` whose computed `overflow-y` is auto/scroll, requires a non-zero box
  inside the viewport, and prefers the largest. The class is a CSS-module hash that changes on any DSH
  rebuild.
- **The scrollbar is cleared by arithmetic, not by a guessed width.** The element declares
  `scrollbar-gutter: stable`, so `rect.width - el.clientWidth` reads the reserved gutter exactly; a
  constant would be wrong on another platform and would make the button jump at the scroll threshold.
- **The turn rail is cleared through `turnRailProbe()`**, never by re-measuring
  `nav[class*="_frame"]` — that function already owns "is the rail visible", "has another plugin taken
  the surface", and "which candidate is the on-screen one". **Class tests use `*=` and never `$=`**,
  because DSH joins class lists; `_preview` is the one token that stays `$=`. Only a RIGHT-side rail
  competes with this corner, so `turn-rail-left` must not shift the button. **The left placement MIRRORS
  the rail's own `right`** (`_railNativeRight()`), never a formula of ours: that declaration encodes the
  slot geometry, which DSH restructured in 0.1.7, where the old `calc(12px - (clearance + 16px))` became
  a `-20px` offset that put the whole rail off the left edge.
- **The offset is `{dx, dy}` inward from the conversation corner, and the BUTTON is clamped, not the
  offset.** That is what makes it follow the corner when the right sidebar opens, the sash moves or the
  window resizes — which is why the observer is a `ResizeObserver` on the viewport and not a window
  `resize` listener (two of those three never fire one). A stored offset then survives a shrink that
  the position does not.
- **The button's size is `effectiveTriggerSize()`; no size literal may reappear in the positioning
  arithmetic.** The clamp, the scrollbar clearance and the rail give-way all measure the BUTTON, so a
  constant that disagrees with the drawn box parks the entry point over the rail or outside the
  conversation. `triggerIconSize()` (2/3) and `triggerRadius()` (1/4) derive from it. **The ceiling
  follows the selected position** — 48px in a slot, 64px at the overlay — and clamps what is DRAWN,
  never what is stored, so the host schema carries no min/max.
- **The glyph is real DOM, not a React element.** `LightningIcon()` returns a React element
  *descriptor* — a plain object — and `appendChild` needs a `Node`. Use `LightningIconNode()`, which
  builds the same `svg`/`path` via `createElementNS`.
- **Acquisition is retried, never attempted once.** `apply()` runs before any conversation exists. A
  subtree `MutationObserver` armed while no anchor is adopted — and **not** disconnected once one is
  found, because a new session builds a new scroller — plus a bounded retry for a viewport that exists
  but is not yet laid out. The mount is wrapped in a named, non-fatal catch.
- **Three user-settable properties, one writer each.** `triggerSize` (panel), `triggerLayer` and
  `overlayOpacity` (right-click menu). `panelLayer()` / `triggerLayerOfButton()` / `layerOfMenu()` are
  all DERIVED from the one setting, or the two drift and the size control looks inert. **Every
  host-owned numeric needs its own `adoptHost*` handler — subscribe AND call once**, because the host
  may answer before or after the mount; without it the value is read into `_hostPrefs` and never
  reaches anything.
- **Under the host means strictly below 1000.** DSH's modal is portaled to `document.body` at
  `z-index:1000`, so it compares as a plain SIBLING and its mask needs no z-index of its own; other
  overlays are 1100, host menus 1000. The "stay out of the way" preset is **9** and the default is
  **1150**. This affects the **standalone pair only** — the workbench panel's `z-index: 10` is bounded
  so dock-base's floating-above-docked precedence survives.
- **The menu holds ONLY what the panel cannot reach**, i.e. what this button alone can answer: reset
  position, offset, version, layer, opacity. **Never add `trigger-size`, `trigger-position` or
  `close-on-blur`** — a second control for a setting that already has one is how two surfaces start
  disagreeing (Critical Rule 7).
- **A preset list is read by TWO scopes, so it lives in the factory closure.** Declaring it beside the
  menu that renders it (inside the standalone closure) makes `_migrateLocalToHost` throw
  `ReferenceError`, and its own `.catch` swallows it — the entire host-preference load fails silently
  and every host setting reverts to a default.
- **"localStorage disagrees with the host" is NOT sufficient to migrate.** A removed preset's value and
  a user's own choice are both bare numbers, so the CURRENT preset list is what tells them apart, and
  the host is only overridden while it still sits at its default. Assert BOTH directions or the guard
  reads as a blanket refusal.

**Drag reuses the panel's machinery rather than adding a second one.** `beginOverlayDrag()` sets the
shared `dragging`/`dragSource`/`dragMoved` state, so `ensureGlobalListeners()`'s existing handlers
apply unchanged — including the ±3px threshold that `dragMoved` records, which the overlay's own click
handler reads to swallow the click ending a drag. Without that, releasing a drag would toggle the
panel. The offset is written on release, not per move: a drag is one intent, and a host round trip per
pixel is not.

**Swallowing the drag's click is the FIRST half of that handler, not the whole of it.** A hand-built
element has to call `openPanel()`/`closePanel()` itself; a handler that stopped at the swallow left a
button that mounted, positioned itself correctly and did nothing when pressed. `handleOutsideClick`
already exempts `[data-dsh-flash-trigger]`, and `dragMoved` is cleared by the next `mousedown` rather
than by the drag's own end — which is why a click straight after a drag still works.

> Every rule above is the residue of a defect. The defects in full, with the measurements and the
> harness that proves them: [docs/architecture-notes.md](docs/architecture-notes.md).

### Mode Detection: none, and that is deliberate

The old design chose between "workbench mode" and "standalone mode" by probing `ctx.get('workbench')`. That decision is **gone**. Probing the environment is what produced the worst failure: with dock-base installed and the adapter absent, the core saw a workbench, stood down, and nobody registered the panel — an empty UI with no error. The core now mounts its own ⚡ unconditionally and defers only to an explicit `claim()` (see "The ownership handshake" above). The core's own `inject` stays `inject: []`.

**Critical**: the `"dock-base"` load-order hint now belongs to the **ADAPTER's** `package.json`, not this one. The core's `dsh.client.inject` has no `dock-base` entry at all — it lists only DSH client packages. In the adapter it is NOT a hard dependency but a **load-order hint** for the DSH ModuleLoader: `arriveGraphRow()` loads the base before the plugin that calls `ctx.get('workbench')`, and an absent entry is silently skipped (`graphRows.get('dock-base')` returns `undefined`).

**Why the base name**: `arriveGraphRow()` looks up `inject` entries with
`graphRows.get(packageName)` and never strips the `/client` suffix, while graph-row keys are base
package names — so `graphRows.get("dock-base/client")` returns `undefined` and the hint is silently
ignored. (The `external` path *does* strip it first; `inject` does not.)

### Two-Half Model

`cordis.patch.yml` is the bundle layer that inserts the host rows into the profile.

- **HOST** (`src/index.ts` → `dist/index.js`; Node.js via Cordis) owns the `dsh-flash` settings
  namespace, panel/trigger/alert configuration, and the HTTP routes
  (`GET /host-alerts`, `POST /push-alert`, `POST /clear-alerts`, `GET /health`, etc.).
- **CLIENT** (`lib/client.js`; browser via `__ModuleLoader__`) owns the QuickControl registry
  (pub/sub), the React panel UI, the skin system, and i18n (zh/en).

> **All three monitors have been extracted** into companion plugins — the panel itself owns no
> monitor. `dsh-flash-ctx-mon` carries the context monitor (`SessionEventTokenSource`,
> `createSessionContextProvider`, the context thresholds and the model-window map),
> `dsh-flash-mem-mon` the memory/GC monitor, `dsh-flash-net-mon` the network audit. Each holds
> its own `settings` namespace, registers its provider through `ctx.get('dockFlashAlerts')` and
> its switch through `ctx.get('quickControl')`. dsh-flash keeps only the shared registries, the
> host-pushed queue provider, and the companion integration lists (`_COMPANION_PREFIXES`,
> `_PROVIDER_SWITCH_MAP`, `_PROVIDER_LABELS`, the cluster-expand and alerts-dependent id lists) —
> **a new monitor means an entry in each of those, or its alerts lose their source label and their
> config link.** The session-list-subscription rule that used to be Critical Rule 12 (subscribe
> unconditionally, or a conversation switch is invisible) moved with `SessionEventTokenSource`.
>
> **The system proxy subsystem (B) has been extracted** into the `dsh-flash-proxy` plugin.
> Proxy mode, `NO_PROXY` policy, `testUrl`, connection diagnostics, and the five
> `dsh-flash-proxy:*` QuickControl switches now live in that separate package.
> See [docs/refactor-coupling-map.md](docs/refactor-coupling-map.md) for the extraction status.

### Module Loading

Client plugin is loaded via `window.__ModuleLoader__.load({ id, factory })`. The factory receives `require` and must use `require('react')` (not import). All React usage goes through `h = React.createElement`.

### Close-on-blur: one key, one writer, two controls

Exposed twice — the panel-header toggle (workbench `headerComponent` and the standalone title bar)
and, in **standalone mode only**, a `buttongroup` switch in the Layout subgroup. Everything goes
through the module-level helpers next to `LIGHTNING_ICON`: `readCloseOnBlur()`, the single writer
`writeCloseOnBlur(on, registry)`, and `subscribeCloseOnBlur(fn)`. The writer repaints every
subscriber (that is how a switch change reaches the imperatively-painted header toggles) and calls
`registry.notifyChange` (that is how a header toggle reaches the switch — the registry `version` bump
is what re-renders the panel).

**Never write `localStorage` for this key directly, and never add a third control without routing it
through `writeCloseOnBlur`** — otherwise one of the others silently stops tracking. Workbench mode
registers no such switch, so it renders no Layout category at all; the workbench header button paints
its state imperatively rather than with `useState`, because dock-base may call `headerComponent` as a
plain render function, which would make hooks illegal. Do not "tidy this up" into a hook.

> The full linkage chain, and why the Layout group disappears in workbench mode:
> [docs/architecture-notes.md](docs/architecture-notes.md).

### Panel ordering and visibility: two modes, one writer

Users reorder the panel's groups and switches, and hide individual rows, from header icons on every
page that has something to rearrange (not the Changes page); each handler calls `stopPropagation()`,
because that header is itself the collapse control. **One key, one writer**: order and visibility both
live in the host namespace (`panelOrder` as `switches` and `hidden`), and every write goes through
`writePanelOrder()` / `clearPanelOrder()` / `clearPanelHidden()` → `savePrefs()`. **A cluster is one
card with its members FOLDED by default, never dropped**, and a `visible()` gate is never how it is
folded.

> The two modes and their mutual exclusion, the tab-opening rule, the unit model, the inline
> (fold-free) cluster form, the receipt rule and the two-bucket-split trade-off:
> **[docs/panel-ordering.md](docs/panel-ordering.md)**.

### Stacking

`S.root` sets `position: relative; z-index: 10` — chosen, not guessed: **> 2** so it beats
in-content escapees such as dock-git's `.dg-graph` (z-index 2), and **< 70** so dock-base's own
precedence (floating above docked) is preserved. Raising it further cannot help against elements
outside `.dsh-wb-root`'s stacking context, and ≥ 70 would invert dock-base's order. The standalone
panel is a separate case: appended to `<body>`, it sits at the user's `triggerLayer` (default 1150),
which is above the host's overlays; the low preset 9 sits far *under* them. **That value only reaches
the DOM because `adoptHostLayer()` runs after the async host reply** — see "The overlay trigger"
above for why a host-owned numeric needs both a subscribe and an immediate call.

**The three body-level alert surfaces derive from that same `triggerLayer`, one step above the
panel/button/menu trio** — `layerOfAlertDropdown()` / `layerOfToast()` / `layerOfAlertDetail()`,
written only by `applyTriggerLayer()` and floored at 1100, the band DSH's own Toast occupies to clear
the 1000 image-lightbox backdrop. A literal here is what let the shipped **2000 preset put the panel
over the toast** and over the dropdown anchored to the trigger. Never give these a fixed z-index;
extend the same derivation instead.

**The toast is anchored to the CONVERSATION's top-right, not the window's.** It is placed from
`conversationViewport()`'s content corner — inside the scrollbar gutter, giving way to a right-side
turn rail, exactly like the overlay trigger — and repositioned by a `ResizeObserver` on that viewport,
because opening the right sidebar or moving the sash changes the conversation's box without firing a
window `resize`. With no conversation on screen it falls back to the window corner: the overlay
BUTTON hides there, but a notification that is never shown is a lost alert. Do not "simplify" this
back to `right: 12px`.

> Why a static element loses to every positioned sibling:
> [docs/architecture-notes.md](docs/architecture-notes.md).

---

## Critical Rules (MUST follow)

Thirteen rules, one line each — enough to obey while writing code. Each rule's full text, with its
code examples and the failure it prevents, is in
**[docs/critical-rules.md](docs/critical-rules.md)**. Read that file before working on the area a rule
touches; do not shorten a rule here by dropping the clause that makes it enforceable.

**1. Never Modify Layout State Synchronously in React Render Cycle** — Never mutate dock layout (`ctx.workbench.updateLayout()` / `openView()`) during a React render — it blanks the dock bar. Defer with `setTimeout(…, 0)`. This path belongs to the **adapter**, which is the only half holding `ctx.workbench`.

**2. CSS Skin Deactivation Must Use `el.remove()`, Not `el.disabled = true`** — Deactivating a CSS skin means `el.remove()`, never `el.disabled = true` — a disabled tag still exists in the DOM, so the skin skips re-injection on reactivation.

**3. `storage` Event Only Fires in Other Browsing Contexts** — The `storage` event never fires in the window that wrote to `localStorage`. Cross-tab skin state needs the same-origin `about:blank` iframe write trick; fall back to a direct write, which the next refresh reads correctly.

**4. Plugins with MutationObservers or IIFE Injection Cannot Be Reliably Externally Toggled** — A plugin with self-restoring MutationObservers, IIFE injection or hot-reload cannot be reliably deactivated from outside. Add it to `_skinExclude` — do not write deactivation logic for it.

**5. `mod.import()` May Fail for Plugins Not in the Module Graph** — `mod.import(id)` can fail for an installed-but-deactivated plugin outside the module graph. Always keep the `<script src="/plugins/<id>/client.js">` fallback, which re-runs the skin's IIFE.

**6. Theme Plugins with `theme/change` Listeners Need Retry Mechanism** — A theme plugin holding a `theme/change` listener (`wxj-black-hole`) reverts your `setTheme()`. Retry every 150 ms, up to 15 times.

**7. `setValue()` Should Only Update State — Panel Handles UI Refresh** — `setValue()` is a pure state setter — the panel refreshes the row and records the changelog. `_notifyChange()` is for proactive changes only (timers, server push); calling it from `setValue()` duplicates every changelog entry.

**8. `_skinExclude` Must Be Checked in ALL Scan Phases** — One name predicate, `_skinAllowed(id)` — `_skinHint` AND `_skinExclude` — called from **all seven** scan phases; and one skin yields one id, the **package name**, canonicalized in the two phases that read a raw DOM string. See the Skin System section: the phases are restated there.

**9. Never Use CSS `zoom` on `<html>` Element** — Never set CSS `zoom` on `document.documentElement` — even `zoom: 1` distorts `getBoundingClientRect()` and `clientX`, breaking DSH Web's sash drag. Legacy state is cleaned with `removeProperty('zoom')` + `localStorage.removeItem('dsh-flash:zoom')`.

**10. Error Boundary Is Mandatory for Panel Components** — Wrap every panel component in `PanelErrorBoundary`: dock-base's `WorkbenchRoot` has no boundary, so one uncaught render error removes the activity bar and every panel.

**11. `require` Does Not Exist in the Host Half — It Is ESM** — The host half is ESM — `require` is a `ReferenceError` there. Import statically and declare the package in `package.json`. A `require` inside `try/catch` fails **silently**: that is how the `dock-flash` settings namespace stopped registering at all.

**12. (extracted) Session Event Token Source** — (extracted) `SessionEventTokenSource` and the rule it carried — subscribe to `sessions.list` unconditionally in `start()` — now live in `dsh-flash-ctx-mon`. This repo consumes no session events.

**13. Never Assume a Remote Method Returns a Promise** — Never assume a remote returns a Promise. `ctx.remote.<ns>.<method>()` and `settings.describe()` may return the value **synchronously** or **throw**, and a synchronous throw ahead of `.catch` aborts the rest of `apply()` — the plugin then reads as loaded with nothing on screen. Guard the CALL in `try/catch` and `Promise.resolve()` the result; `Promise.resolve()` alone does not catch a throwing argument.

---

## Skin System Architecture

**Seven entry paths, one predicate per filter.** A skin reaches the dropdown through phase 0
(managed), 1a (`style[data-plugin]`), 1b (`style[data-skin-chrome]`), 2 (body attributes), 4
(`__DSH_BOOT__` / `graphRows`), 5 (a live mark from `_skinLiveMarks`) or 6 (installed but switched
off, from the profile's own manifest — host route `/plugins/dock-flash/profile-packages`).
**`_skinAllowed(id)` states BOTH filters (`_skinHint` AND `_skinExclude`) and is called from all
seven** — see **Critical Rule 8**. Phases 5 and 6 exist because the usual sources can be blind: for a
handle-less skin that is still rendering, a mark in the document IS proof of installation; and on DSH
Desktop the plugin manager refuses the reserved profile while a switched-off handle-less skin has no
mark either, so the profile's `package.json`, read by the HOST, is the only proof left.

> **`__DSH_BOOT__.entries` is not a complete install list**, and **a REJECTED `listPlugins()` is not
> an empty one** — the cache keys on a read that CONCLUDED (`ok`), and `_refreshPluginEntries()`
> notifies only when rows arrived, which is what stops "do not cache a failure" from becoming a
> render → fetch → notify loop.

The rules, one line each. Phase tables, case histories and measurements are in
**[docs/skin-system.md](docs/skin-system.md)**:

- **Excluded, never listed**: bloom-theme, black-hole, theme-manager, `dsh-skin-market` (supplies the
  list and is not a skin) and any `timeline` plugin. `_skinExclude` protects THEM too — deactivation
  REMOVES a style element (Critical Rule 2), which would strip their own stylesheet.
- **One skin yields ONE id, and that id is the PACKAGE name.** Canonicalization lives in phases 1a/1b,
  the two that read a RAW DOM string, and a decorative suffix (`-style`/`-chrome`/`-css`) is stripped
  only when a known source CONFIRMS the stripped name. A new phase that reads a raw string must
  canonicalize before `seen.has()`/`seen.add()` — the plugin-manager path did not, which is how the
  0.15.3 duplicate came back.
- **Managed skins** (Mineradio) own a canvas/WebGL lifecycle, so `_toggleManagedSkin()` writes the
  plugin's private key and drives the cross-tab `storage` event (Critical Rule 3). Installation is
  proven by the boot manifest, the module graph or the plugin's own style tag — **never by
  `enabledKey` in localStorage**, which dsh-flash writes itself — and `_managedInstallReason()` is
  the ONE predicate for that, called by the scan AND the flag sync.
- **A handle-less skin is switched as a WHOLE PLUGIN** through `ctx.remote.pluginManager`;
  `_skinNotControllable()` is the ONE predicate for that shape. **Use the ENTRY switch, never the
  bundle one**: `setPluginEnabled(entryId, enabled)` is live AND symmetric, while `setBundleEnabled`
  only edits `dsh.profile.bundles` and is the fallback for a package with no addressable row — and
  that write is composed at the running host's own boot, so a reload cannot apply it. The entry id
  need not come from `listPlugins()`: take it from the BOOT MANIFEST when that yields no row.
  `application: "applied" | "restart-required"` is DSH's own live-vs-restart answer.
- **A remote resolves only for a plugin that DECLARES it — twice over.**
  `dsh.client.inject` must name `@deepseek-ai/dsh-api-remotes` AND the plugin's own `inject` must name
  the NAMESPACE SERVICE `"remote.pluginManager"` (`remoteServiceKey(ns)` is `remote.${ns}`). Either
  one missing makes every 默认 press a silent no-op that writes nothing. The state is read FIRST, so
  an already-satisfied press writes nothing and cannot reload in a loop.
- **Collect EVERY promise that represents a loader write, in BOTH directions.** `_applySkin()` pushes
  `_switchSkinBundle()` into `pending` for activation as well as deactivation, and reloads when any
  reports a real change: a write with no reload is a silent half-switch. When a press still does
  nothing, `window.__dockFlashSkinTrace()` — a 40-entry ring in `sessionStorage`, because the switches
  it records are the ones that reload — names the route, whether the manager wrote, and whether a
  reload was scheduled.
- **A handle-less skin that is still RENDERING must be reported**, or 默认 becomes unreachable: the
  rows say `disabled` while the theme is painted, and a `<select>` fires no event for the value it
  already shows. `_skinLiveMarks` + `_skinInEffect()` are **DETECTION ONLY — never removal**, and
  `_applySkin('default')` **reloads anyway** when its press wrote nothing, because in that state the
  reload IS the switch.
- **默认 is not a package name**: `_activateThemeViaPluginManager()` short-circuits it to
  `_applySkin('default')`, the only route that switches EVERY skin off.
- **A CSS skin is a WHOLE PLUGIN, and the switch has THREE call sites plus TWO halves — all five must
  agree**: the entry row (`setPluginEnabled`) AND `dsh.profile.bundles` (`byBundlePath()`). Nothing
  else is a switch — a UI control never edits the install layers, and a gate that can never
  pass is not a gate (the market-era one is gone).
- **The entry id is NOT derivable** — `_entryIdCandidates()` only guesses, and `dsh-dream-skin`'s real
  id is `dream-skin`. `POST /plugins/dock-flash/set-plugin-entry` is the authority because the HOST
  reads the package's own `cordis.patch.yml`. **Resolve the profile from `profileContext`, never
  `readdirSync` order**, and write the row with **no `name:`** — DSH skips a name mismatch, so the id
  alone addresses the entry. After the core/adapter split the core's specifier changed from
  `dock-flash` to `dsh-flash`, and every `^2` profile's panel-config entry still asserts the OLD name:
  it must be edited to `name: dsh-flash` (id unchanged) or DSH drops its whole `config:` block
  silently — measured on a real profile, 2026-10. An EMPTY candidate list is not "nothing to do": before
  `/profile-packages` answers `enabledNow` reads `false`, which for a disable equals the wanted value
  — that is the cold-load "需要切两次" first press, and that branch must drive the HOST route instead
  of falling through to `byBundlePath()`.
- **A CSS skin active under a non-CSS stored skin is a STRAY**, and the boot sweep switches it off as
  a PLUGIN (`_switchSkinBundle(s, false)` over the other active CSS skins) — deliberately NOT
  `_applySkin(storedSkin, true)`, which both CSS branches gate away.
- **The boot check is a LADDER plus an observer, never one pass.** `enforceBootSkin()` is a NAMED
  function at 0 / 1.2 / 3 / 6 / 10 s AND on a `MutationObserver` over documentElement + head, with a
  RECORD TEST because one enforcement is a full five-query scan. Every pass must be idempotent, the
  observer disconnects at 12 s, each pass re-reads `_hostPrefs.activeSkin`, and a skin that survives
  means a LONGER LADDER — never a bigger first delay.
- **`options()` and `_applySkin()` read ONE list** (`_knownSkins()`): a skin reachable only through
  the merge could otherwise be selected but not acted on — not activated, and not switched off by 默认.
- **The switcher no longer needs dsh-market.** Discovery and activation go through DSH's own plugin
  manager, `_skinAllowed()` is a PURE name heuristic, and `_registerSkinSwitch()` is called
  unconditionally rather than from a market callback.

> **Preferences and the `remote`/`inject` contract live in one place** —
> [docs/skin-system.md](docs/skin-system.md): the four-layer preference bridge, why localStorage is a
> cache and never the authority, the `describe()` nesting, the three-argument `settings.update`, the
> schemastery traps, and the migration rules. Read it before adding a preference. The one line that must
> stay in mind while editing: **a new preference means `SettingsSchema` + `loadHostPreferences()`'s
> mapping + a read from `_hostPrefs` + a write through `savePrefs()` — the mapping list IS the contract**
> (`triggerOverlayOffset` shipped declared-and-read but unmapped, so the host value was silently ignored).

---

## QuickControl Registry API

### Switch Types

| Type | Required Fields | Notes |
|---|---|---|
| `toggle` | `getValue()`, `setValue(boolean)` | Boolean switch |
| `slider` | `getValue()`, `setValue(number)`, `min`, `max`, `step` | Numeric slider |
| `number` | `getValue()`, `setValue(number)` | Numeric input field. Optional `min`, `max`, `step` (defaults `0`, `9999`, `1`), `unit`, `formatLabel(n)`, `placeholder`, `onCommit()` |
| `select` | `getValue()`, `setValue(any)`, `options` | Dropdown select |
| `buttongroup` | `getValue()`, `setValue(any)`, `options` | Button group |
| `action` | `run()` | Action button |
| `log` | `getLines()` | Read-only multi-line output block. Optional `hideWhenEmpty` (render nothing while there are no lines), `getMeta()` (right-aligned header status), `emptyText()`, `onClear()` + `clearTitle` (renders a ✕ button) |

### Optional switch fields

Common to every type: `icon`, `order`, `group`, `label` (string, or `() => string` for i18n),
`visible`, `cluster`, and `clusterInline` + `clusterLabel`. **Every field, its exact effect and the
trap attached to it, is in [docs/switch-reference.md](docs/switch-reference.md)** — read it before
adding one. The four that change a row's SHAPE are stated here because they are the four that get
wrong:

- **`cluster: '<label>'`** — switches sharing a label are **one unit**: one card, one ▲▼ pair while
  reordering, internal order from their `order`. Members stay registered and are only *folded*, never
  gated out by `visible` and never removed — a block that changes shape is what the fold exists to
  prevent. A cluster is never a grid item (`isGridToggle()`). Mechanics:
  [docs/panel-ordering.md](docs/panel-ordering.md).
- **`clusterInline: true` + `clusterLabel`** — the fold-free inline form, `select` members only: the
  cluster title on one row, the members' dropdowns right-aligned below it. Declare it on **every**
  member or the unit falls back to the card; declare the title once, on any member.
- **`visible: () => boolean`** — drops the **row** while the switch stays registered, so its state,
  its changelog entries and every other reader keep working. Normal view only: both editing modes list
  every registered control, because one that is not drawn cannot be ordered or hidden. **A
  `visible`-driven switch must `notifyChange` when its condition flips**, or it flips only on the next
  unrelated render.
- **`subtitleBlock`** — draws `subtitle` as its own full-width **wrapping** line below the row instead
  of inside the label column, where `nowrap` + ellipsis hide exactly the long value worth reading: a
  URL, a path, a command, a companion monitor's "precise · model · 42%" status.

Per-renderer fields, in full in the reference: `subtitle` (`toggle`, `select`) · `tooltip`
(`select`, `number`) · `actionLabel`, `hideLabel` (`action`) · `getMeta`, `hideWhenEmpty`,
`emptyText`, `onClear` + `clearTitle` (`log`).

### Registration Rules

- **id format**: `plugin:switch-name` (e.g. `dock-flash:theme`, `dock-git:show-stash`)
- **id prefix determines grouping**: `dock-flash:*` → the **Workbench** tab (`sliders`), others → the **Extensions** tab (`blocks`); the third page is the change log (`doc`). Tab glyphs come from `_ICON_PATHS` — **the ⚡ is the PRODUCT mark** (`LIGHTNING_ICON`: sidebar panel header, activity bar, Settings card, floating window) and is deliberately not a tab icon
- **order**: Built-in items use 10–60; third-party should start from 100
- **group field**: Only meaningful for built-in switches (`appearance`, `layout`, `system`); ignored for third-party

### Third-Party Plugin Integration

The integration guide is **[INTEGRATION.md](INTEGRATION.md)** (English) /
**[INTEGRATION.zh-CN.md](INTEGRATION.zh-CN.md)** (Chinese): both patterns, the dual-discovery
snippet, the full switch definition, cleanup, and the `setValue` rules. It is deliberately **not**
duplicated here — one copy that cannot drift beats two that can, and 2.2 KB of this section was
repeating that file almost verbatim.

The one thing to hold in mind while reading it: `dsh.client.inject` needs the **base** package name,
never `<pkg>/client` — see "Mode Detection" above for why.


---

## i18n Conventions

**DSH's `locale` service is the only language authority**; `t()` proxies `register('dsh-flash', { zh, en })`
+ `getSnapshot().active` + `subscribe`, read via `ctx.get('locale')`. Labels must be `() => t('xxx')` to
refresh on a language change; a static string does not.

- **Never touch `document.documentElement.lang`, no module-level current-language variable** — a second authority.
- **Claim the namespace once on the plugin fiber, release on dispose** (`bindLocaleService()` /
  `releaseLocaleBinding()`) — `register()` **throws** on a repeat locale. With no locale plugin the built-in
  tables (`navigator.languages`) still render and switch.
- **`setLocale()` throws on an unknown id** — check `getSnapshot().locales` first; guard the result with
  `typeof result.catch === 'function'` (Critical Rule 13).
- **`i18n: { t, L }` and `t.getLocale`/`setLocale`/`onLocaleChange` are frozen** — the `dock-flash` adapter
  patches its sidebar title through the last one.

---

## Testing Conventions

### Manual Testing Checklist

The per-change verification checklist is **[docs/testing-checklist.md](docs/testing-checklist.md)**.
It is a procedure rather than a rule, so it lives beside the long-form notes and is loaded when you
are verifying — **read it before claiming a change is tested**, because "it looks fine" is the check
that let three real defects ship. One item in it is a rule, not a step, so it stays here:

- **Layout overflow — measure it, do not eyeball it.** With the panel open, `__dockFlashOverflow()`
  reports dock-flash's own subtree (`true` scans the whole page, which is how "is this scrollbar even
  mine?" gets answered). **Measure at two widths, one of them narrow** — overflow is a function of
  container width, so one size proves nothing. **A flex item's default `min-width: auto` means
  "never narrower than my content"**, the single mechanism behind every overflow this plugin has
  had; `minWidth: 0` on the shrinking box is the fix, and `box-sizing: border-box` is required
  whenever a `minWidth` floor and padding are combined.

### `pnpm run check:overlay`

The **one committed check**: it evaluates the real `lib/client.js` in a V8 sandbox and asserts the
overlay trigger's **behaviour** — that it mounts with the `slots` service never arriving and the
conversation appearing only after the mount, and that the gestures work. **Assert the gesture, not
only the end state**: the first version checked the mount and the position arithmetic, both correct,
and passed on a button nobody could click. Full procedure:
[docs/testing-checklist.md](docs/testing-checklist.md).


### Key Observation Points

- **Browser DevTools console**: `[dsh-flash]` prefixed logs for client-side events
- **Host process console**: `[dsh-flash]` prefixed logs for host-side events
- **localStorage**: Check `dsh-flash:active-skin` key for skin persistence
- **DOM**: Inspect `<style data-plugin>`, `<style data-skin-chrome>`, and `data-dsh-*` attributes for skin state

---

## Common Pitfalls

Gotchas **not** already stated as a numbered Critical Rule. Those rules are the authoritative
form and each carries its own example, so they are not repeated here — check them first.

| Pitfall | Symptom | Fix |
|---|---|---|
| `React.createRoot` instead of `require('react-dom/client').createRoot` | Standalone panel renders nothing — no React root | `createRoot` is not on the `react` package; standalone mode must create its own |
| Standalone panel placed only above/below the ⚡ | Panel cut off when the ⚡ is mid-page: 70vh exceeds either side's room, so part of it lands outside the window — losing the HEADER, grip and × | `positionPanel()` falls back to placing the panel **beside** the button, clamped into the window. Never resize the panel to make it fit, and never assume either axis has room |
| `registerActivityBarItem()` without `pluginId` | Listed in Settings but no "Open" button | `pluginEntryItem()` matches `pluginId ?? id`, whose fallback never equals `'dock-flash'`. Add `pluginId: 'dock-flash'` |
| `L('key')` (a function) for `registerPlugin` title/description | Blank name and description on the plugin card | `createPluginCard` renders those as React children and never calls `resolveSettingText()`. `registerPlugin` needs **static strings** |
| `"<pkg>/client"` in `dsh.client.inject` | Load-order hint silently ignored; a third-party switch never appears | `arriveGraphRow()` does not strip `/client` for inject lookups. Use base names — `"dock-base"`, `"dsh-flash"` |
| `minWidth: 0` on a `flex: none` element | Looks like a shrink fix, is a no-op | `flex: none` is `flex-shrink: 0`, so there is nothing to act on. A no-op fix is worse than none — it reads as solved |
| A glyph wider than its font box | A 2-4px overflow that survives every structural fix | Size a pixel `inline-flex` box for the WIDEST glyph of any set that swaps, same box in both states, never derived from one font. See [notes](docs/architecture-notes.md) |
| An emoji-capable glyph as a small icon | A full-colour glyph beside monochrome `⇅`/`↺`/`▶` | `☑`/`☐` and an eye are emoji-presentation code points and render through the colour-emoji font on Windows. Prefer plain geometric shapes: `●`, `○`, `◉` |
| Diagnosing from the shape of the DOM tree | Fixing the wrong element confidently | The live element carries its own evidence — `__dockFlashOverflow()` prints each overflow's `text`. Read it before forming the hypothesis |
| Two style objects that SWAP on one element declare different keys (`{border, borderBottom:'none'}` ↔ `{border}`) | The edge named by the override vanishes — but only for an element that was rendered in the OTHER state first. A fresh render, the source, and a static screenshot all look correct | React diffs style objects **key by key**: an UNCHANGED key (`border` is byte-identical in both) is skipped, and a VANISHED key is written as `''`, which clears the longhands the shorthand had set — nothing puts the edge back. **Both objects must declare the same keys**; `S.tabPageHeaderClosed` re-asserts `borderBottom`, the hairline is one `TAB_HAIRLINE` constant, and `check:overlay` section 26 pins the key-set equality |
| A preference that restyles the panel, applied without checking WHICH surface is rendering | The **workbench panel looks broken** while the standalone panel looks right: dock-base's sidebar pane draws icon-only rows, no tab headers and no group titles, because a mode built to strip chrome from a floating strip was stripping it inside somebody else's window | The panel is mounted by two different parents. Gate such a mode on `props.standalone === true` (set by `renderPanel()`, absent from dock-base's props) — `_compactPanelForSurface()` states it once, and `window.__dockFlashCompactMode(true/false)` answers it without rendering. **A preference is not a licence to restyle a surface the plugin does not own** |
| A column that holds ONE glyph on `flex: 1` | In a tight row the glyph **overlaps the control beside it**, and adding a gap between them does not help — the gap IS honoured | `flex: 1` is `flex: 1 1 0%`: a basis of ZERO, so the column gives up all of its width before the control gives up any, and a `flex: none` child (the icon) cannot shrink, so it spills out of its 0-width parent. MEASURED at a 140px row: column 0px, icon drawn 4..16, control starting at 12 — 4px of overlap. An icon-only column is `flex: none` (it IS the glyph); a column that holds text keeps `flex: 1` plus a `minWidth` floor |
| Running the GraphFlow installer in this repo | `AGENTS.md` replaced by GraphFlow's own notes | It writes `AGENTS.md` unconditionally. `git checkout -- AGENTS.md`, keep those notes in `CLAUDE.md`, verify `grep -c dock-flash AGENTS.md` |

The rest — skin-scan duplicates, hardcoded endpoints, log-line injection, the diagnostic-target
mismatch, and the `_skinBodyAttrs` cases — are in **[docs/architecture-notes.md](docs/architecture-notes.md)**.

---

## Known Dependencies

| Package | Type | Purpose | Notes |
|---|---|---|---|
| ~~`dock-base`~~ | — | — | **Not a dependency of THIS package.** The dock-base peer, and the whole `ctx.workbench` contract, belong to the `dock-flash` adapter; the core names dock-base nowhere. Do not add it back here. |
| `@deepseek-ai/cordis` >=4.0.0-rc.1 <5.0.0-0 \|\| >=4.0.1-0 <5.0.0-0 | peer | Plugin framework | Required |
| `@deepseek-ai/dsh-settings` | devDep | Settings service types (host half) | |
| `@deepseek-ai/schemastery` | dep | Schema definition for settings | Required at runtime — the host half **statically imports** it (default export; there is no named `Schema`). It must stay a real dependency: an ESM import of a missing package fails at load, unlike the old silent `require` in a try/catch |

> **Peer ranges must carry an explicit prerelease branch — one per tuple whose prereleases must
> resolve**, or a range that merely looks broad silently excludes the harness's prerelease builds and
> users hit `ERESOLVE`; a branch written for one tuple never covers another. awesome-dsh-plugin's
> contributing guide requires it. **Any change here needs a probe matrix asserting BOTH directions.**
> The semver mechanics and the attempt that dropped `4.0.1-0`:
> [docs/architecture-notes.md](docs/architecture-notes.md).

---

## Version History Pattern

- Update version in **both** `package.json` (line 3) and the single `const CLIENT_VERSION` near the top of `lib/client.js`'s factory — the startup log and `__dockFlashOverlay()` both report it. One constant rather than a literal in the log line, because **a build that cannot name itself cannot be told apart from the previous one**. `pnpm run check:docs` asserts the two agree.
- Both READMEs must stay in sync — same structure, same content, different language
- No changelog in the READMEs — `CHANGELOG.md` and git log are the history records

### Releasing needs the maintainer's confirmation — twice

**Never cut a release on your own initiative.** Two gates, each the maintainer's decision:

1. **Before bumping the version** — stop and ask. A finished change, passing checks and a clean diff
   are **not** approval to version it. State the version you would choose and why, then wait.
2. **Before tagging, pushing, or publishing** — ask again. Gate 1's approval does not carry over.

Until gate 1 is answered, `package.json` and `CLIENT_VERSION` keep the **last released** version and
no new `CHANGELOG.md` row is written. **Never edit a version string opportunistically** — "I was in
the file anyway" is the exact move this rule exists to stop. The reason it is a rule: a published
version cannot be recalled, so revision is free before the number exists and impossible after.

> The rationale and the runbook step it gates: [docs/releasing.md](docs/releasing.md).

### Which number moves

Increment by what a third party can observe, not by how large the change felt: **patch** for a bug
fix, refactor, docs or metadata; **minor** for a new switch, a new field on `QuickSwitchDefinition`,
a new switch type, or a new service or event; **major** for removing or renaming anything published
(a field, a switch type, a switch id other plugins may read, a route's response shape). Additive is
what makes a minor safe to take. **Never renumber a released version** — a published tag and Release
cannot be recalled. The version is this package's own; what declares dock-base compatibility is the
`peerDependencies` range, not a major number. The full table, the prerelease reasoning and the
`1.0.x` history: **[docs/releasing.md](docs/releasing.md)**.

A change confined to files outside `files` in `package.json` — `AGENTS.md`, `CHANGELOG.md`,
`docs/` — is not a release, needs no bump, and commits as `docs:`.

### Commit as you go

**Commit each finished change on its own — never batch a verified change with the next one.** An
uncommitted change is one stray `git checkout` away from gone, and that has already cost this repo a
full re-derivation of the skin fix. Commits, not releases: the two gates above still stand.

### Where the history lives

The release-by-release narrative is in **`CHANGELOG.md`**. It used to live here as a
table, and by 1.0.10 of the predecessor `dock-flash` package — that numbering is not
this package's, see the note above the `Versions` table — the table was 18 KB, 28% of
this file, and past the point where it earned its place next to the rules. Add new
rows there, not here.
