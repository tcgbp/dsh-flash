# dsh-flash

> Quick Control panel **core** for the DSH web UI — the floating/docked quick-control panel with an **extensible switch registry** other plugins register their own controls into, the skin system, zh/en i18n and the alert surfaces. The DSH **Workbench** (dock-base) integration ships separately as the `dock-flash` adapter.

**[中文文档](./README.zh-CN.md)**

## Core + adapter

This package is the **panel** and nothing else. It owns the React panel, the `quickControl` switch registry, the skin system, the alert surfaces, the standalone floating ⚡ trigger, and the whole host half (`src/index.ts` → `dist/index.js`). It has **no dependency on dock-base at all**, so it runs on its own, and it *always* offers the panel and the ⚡ trigger. A dock host takes the panel by claiming the `dockFlashPanel` service; only then does the core stand its own ⚡ down.

The dock-base (Workbench) integration is a separate, thin **adapter** package — `dock-flash` v3 — that depends on this one and registers the panel, the plugin card, the activity-bar item, the editor view and the command through `ctx.workbench`.

| What you want | Install | You get |
| --- | --- | --- |
| Workbench (dock-base) integration | `dock-flash@^3`, which pulls this package in — plus `dock-base` | Sidebar/floating panel, plugin card, activity-bar ⚡, editor view, the `dock-flash:openQuickControl` command |
| Only the standalone floating ⚡ | `dsh-flash` alone | A ⚡ trigger in the configured conversation slot → floating panel |

### Upgrading from `dock-flash` v2

Nothing is required, and nothing breaks. Your `^2.x` dependency range keeps you on the **old single package**, which still exists under the same name — the split added a new major (`dock-flash@^3`) rather than replacing v2. To move to the split, install `dock-flash@^3`; it depends on `dsh-flash` and pulls it in.

> **The settings namespace does not change.** The profile patch **entry id** deliberately stays `dock-flash`, because that entry id *is* the settings namespace every already-published user preference lives under. The settings section, the persisted `dock-flash:…` keys and the `/plugins/dock-flash/…` host routes are all unchanged across the split, so there is nothing to migrate.

## Modes

| Mode | Condition | UI | Available switches |
| --- | --- | --- | --- |
| **Claimed** (Workbench) | the `dock-flash` adapter (and dock-base) installed | ⚡ in the activity bar → sidebar/floating panel; the core's standalone ⚡ is suppressed while the panel is claimed | Appearance + System |
| **Standalone** | `dsh-flash` installed alone | ⚡ trigger in the configured conversation slot → floating panel | Appearance + Layout + System |

## Features

### Built-in switches

Built-in switches are grouped into Appearance / Layout / System (compact two-column layout). The Layout group is offered in standalone mode only:

| Group | Switch | Type | Description | Standalone |
| --- | --- | --- | --- | --- |
| 🎨 Appearance | Theme | select | Lists what the theme service publishes, minus the dead options. While a theme publishes its **own palette** (Dream: Abyss / Aurora / …), those palettes are the list and Light / Dark / System are withheld — the palette paints over the base scheme and fixes its own colour scheme, so none of the three could do anything. With no palette published — no skin installed, **or a restyling skin such as Claude** — the list is Light / Dark / System, and Follow-system really does resolve against the OS | ✅ |
| 🎨 Appearance | Skin | select | Dynamically discovers installed skin plugins and switches between them, through DSH's **own plugin manager** — dsh-market is neither needed nor consulted. Every switch writes BOTH layers: the loader ENTRY row (what the running page acts on) and `dsh.profile.bundles` (what the next boot composes), because writing only one of them is how a skin came back after a reload, or could never be switched on again | ✅ |
| 🎨 Appearance | Turn Rail | toggle | Moves DSH's built-in turn navigator from the right gutter to the left. Hidden unless DSH's own rail is on screen and no other timeline plugin owns it | ✅ |
| 🎨 Appearance | Fullscreen | toggle | Browser Fullscreen API — enter/exit fullscreen | ✅ |
| 🎨 Appearance | Log Download | toggle | Show/hide the session log download button | ✅ |
| 📐 Layout | Close on Blur | buttongroup | Off / On — auto-close the panel when clicking outside. Also a toggle in the panel header (both modes) | ✅ |
| 📐 Layout | Trigger Position | select | Input Left / Input Right / Session Header / Header Utils — where the standalone ⚡ trigger goes — or **Conversation top-right**, a floating button inside the conversation you can drag anywhere within it | ✅ |
| 📐 Layout | Trigger Button Size | slider | 24–64 px — how big the standalone ⚡ entry point is drawn, glyph and corner radius included. The draggable **Conversation top-right** position allows the full range; the slot positions cap at **48px** so the button still fits the input row, and the row shows the size actually in force | ✅ |
| 🖱️ Right-click | *(the draggable ⚡ itself)* | menu | **Reset position** / current offset / version (click to copy a diagnostic) / **layer** and **rest opacity** presets. Not a switch in the panel: the layer and the opacity only apply to the floating button, and the menu deliberately does not repeat `trigger-size`, `trigger-position` or `close-on-blur` | ✅ |
| ⚙️ System | Language | buttongroup | 中文 / English — switches DSH global UI language | ✅ |
| ⚙️ System | Missing Companions | log | Names every companion plugin that is not **running**, splitting `installed, not running` from `not installed` — a package that is present but silent is a different problem from one that is absent. Read-only: it prints the `dsh plugin --profile <name> add …` command for the ones genuinely missing (and points at the DSH Plugins page on the reserved `desktop` profile, which the CLI refuses), plus a copy button. A ✕ hides both rows through the same visibility store the ◉ mode writes, so nothing is unregistered and ticking them again brings them back | ✅ |

> **The Layout group only renders in standalone mode.** When a host claims the panel, `close-on-blur` exists solely as the panel-header toggle, so no built-in switch carries `group: 'layout'` and the category is skipped entirely.

> **Dock layout is not configured here.** Dock edge, auto-hide, reserve space and icon scaling are dock-base's own settings — this package deliberately does not duplicate them. In the Layout group it owns only `trigger-position`, `trigger-size` and `close-on-blur`, all standalone-only.

> **Turn Rail only offers itself while DSH's own rail is what you see.** It stays hidden with no session open, in a session without turns, while DSH's own `@container (width<=900px)` rule hides the rail, and when another timeline plugin owns it — `dsh-codex-timeline` enhances the native rail in place, so the rail on screen is its surface and this plugin must not fight it for the same edge. Type `__dockFlashTurnRail()` in the browser console to print the decision and its reason.

### Core capabilities

- 🧩 **Dynamic Discovery** — Other plugins register their own switches through the `quickControl` service; the panel auto-renders them
- 🌐 **Internationalization** — Full Chinese/English localization, auto-follows the DSH language setting (via `<html lang>` MutationObserver)
- 🎨 **Skin System** — Multi-layer discovery + categorized switching (CSS / Managed / Excluded)
- 🛡️ **Error Boundaries** — All panel components are wrapped so a render error cannot crash the host that mounted the panel
- 🔌 **Standalone Mode** — Works with no host at all: a ⚡ trigger injected into the configured conversation slot opens a floating popup panel
- 📝 **Recent Changes** — Auto-records switch operations (30s TTL), displayed in "old value → new value" format
- 🩺 **Connection Diagnostics** — *(moved to the `dsh-flash-proxy` plugin)* — NO_PROXY policy, connection test, and diagnostics log
- 🧮 **Reorderable and hideable Panel** — A ⇅ icon in the Workbench and Extensions tab headers opens a reorder mode: ▲▼ move groups and switches, and the result is saved in your DSH profile, so it follows you to another browser or machine. Beside it, a ◉ icon opens a **visibility mode** with a ●/○ box on every row: untick a switch you never use and it disappears from the panel, while staying listed here so you can bring it back. **Both configuration pages list every registered control**, including any a plugin is standing down right now — those rows are dimmed with the reason on hover, so a control that does not apply at the moment can still be ordered or hidden. The two modes are mutually exclusive and each has its own ↺ reset. Switches that declare a `cluster` move as one unit with a fixed internal order and are drawn as one card whose members fold

### Host-side features

`src/index.ts` (host half) provides:

- Registers the `dock-flash` settings namespace (panel preferences, trigger preferences, host alert queue settings)
- Exposes HTTP routes:
  - `GET /plugins/dock-flash/host-alerts` — drains the server-push alert queue
  - `POST /plugins/dock-flash/push-alert` — pushes an alert into the queue
  - `POST /plugins/dock-flash/clear-alerts` — clears the alert queue
  - `GET /plugins/dock-flash/health` — lightweight heartbeat + Node.js memory stats
  - `GET /plugins/dock-flash/profile-packages` — profile inventory for skin discovery
  - `POST /plugins/dock-flash/set-plugin-entry` — live plugin enable/disable via patch edit

> **System proxy features have moved** to the [`dsh-flash-proxy`](https://github.com/tcgbp/dsh-flash-proxy) plugin — proxy mode, NO_PROXY policy, `testUrl`, connection diagnostics, and the five `dsh-flash-proxy:*` QuickControl switches now live there.

> **The monitors are companion plugins.** This package owns no monitor of its own: the context monitor
> lives in `dsh-flash-ctx-mon`, the memory/GC monitor in `dsh-flash-mem-mon`, and the network audit in
> `dsh-flash-net-mon`. Each keeps its own settings namespace, registers its alert provider through the
> `dockFlashAlerts` service and its switch through `quickControl`, so it appears in this panel with its
> own ⚙ config page. This package keeps the shared alert registry, the host-pushed alert queue, and the
> label/link mappings that surface those companion alerts. **They are separate installs — see
> [Installation](#installation).**

## Structure

```
src/index.ts      HOST half — settings namespace + alert routes + profile inventory (tsc → dist/)
lib/client.js     BROWSER half — quickControl registry + dynamic panel + skin system + i18n
cordis.patch.yml  bundle layer — inserts host rows into the profile
```

> The `cordis.patch.yml` row keeps the entry id `dock-flash` while the package is named `dsh-flash`: the entry id is the settings namespace, so keeping it is what makes the split migration-free.

## Core contract

`lib/client.js` publishes two services:

| Published | API | Purpose |
| --- | --- | --- |
| **Panel service** | `ctx.provide('dockFlashPanel', { version: 1, Panel, ErrorBoundary, Header, icon, registry, i18n, host })` | Everything a dock host needs to claim and mount the panel. A host that finds no service, or one whose `version` it does not speak, leaves the standalone ⚡ in place rather than drawing half a panel |
| **Switch registry** | `ctx.provide('quickControl', registry)` | Other plugins register their own switches |

The panel service exposes `host.claim()` / `confirm()` / `release()`: an unconfirmed claim is undone by a watchdog, so a host that dies mid-mount cannot leave the ⚡ suppressed.

### What the adapter adds

The dock-base (Workbench) integration lives in the separate `dock-flash` v3 adapter, which interacts through `ctx.workbench`:

| Registration | API | Description |
| --- | --- | --- |
| Sidebar Panel | `ctx.workbench.registerPanel()` | Quick control panel (sideBar area) |
| Plugin Entry | `ctx.workbench.registerPlugin()` | Settings panel card |
| Activity Bar Item | `ctx.workbench.registerActivityBarItem()` | Lightning icon ⚡, click to open sidebar |
| Editor View | `ctx.workbench.registerEditorView()` | Quick control panel (draggable to floating window) |
| Command | `ctx.workbench.registerCommand()` | `dock-flash:openQuickControl` command |

When no host claims the panel, this package runs standalone: it mounts a floating ⚡ trigger button and popup panel directly in the DOM, providing access to all non-layout switches.

---

## 🧩 Dynamic Discovery API

This plugin publishes the `quickControl` service. Other plugins obtain the registry via `ctx.get('quickControl')` and register their own switches.

### Switch Types

| Type | Description | Required Fields |
| --- | --- | --- |
| `toggle` | Boolean switch | `getValue()`, `setValue(boolean)` |
| `slider` | Numeric slider | `getValue()`, `setValue(number)`, `min`, `max`, `step` |
| `select` | Dropdown select | `getValue()`, `setValue(any)`, `options` |
| `buttongroup` | Button group | `getValue()`, `setValue(any)`, `options` |
| `action` | Action button | `run()` |
| `log` | Read-only multi-line block | `getLines()` |

### QuickSwitchDefinition

```ts
interface QuickSwitchOption {
  label: string | (() => string)
  value: any
}

interface QuickSwitchDefinition {
  /** Globally unique id; use "plugin:switch" format, e.g. "dock-git:show-stash" */
  id: string
  /** Display label (supports functional i18n) */
  label: string | (() => string)
  /** Icon (emoji or text) */
  icon?: string
  /** Switch type */
  type: 'toggle' | 'slider' | 'select' | 'buttongroup' | 'action' | 'log'
  /** Sort weight (ascending); built-in items use 10-60, start from 100 */
  order?: number
  /** Built-in group: 'appearance' | 'layout' | 'system' (only for dock-flash:* items; ignored by third-party switches) */
  group?: string
  /**
   * Optional cluster label. Switches sharing a label are drawn as ONE card and
   * reordered as one unit (a single ▲▼ pair), keeping a fixed internal order —
   * their `order` field. The card opens folded to its head row and its members
   * can be revealed behind a centred ▼/▲ toggle on the card's bottom edge.
   */
  cluster?: string

  // ── Common to toggle / slider / select / buttongroup ──
  getValue?: () => any
  setValue?: (value: any) => void

  // ── Slider-specific ──
  min?: number
  max?: number
  step?: number
  formatLabel?: (value: number) => string

  // ── Select / buttongroup-specific ──
  options?: QuickSwitchOption[] | (() => QuickSwitchOption[])

  // ── Action-specific ──
  run?: () => void | Promise<void>
  actionLabel?: string
  /** Drop the title column and let the button fill the row (button carries the wording) */
  hideLabel?: boolean
}
```

### Registration Example

```js
// In another plugin's client.js factory:
exports.inject = ['quickControl']   // ← declare service dependency

exports.apply = function (ctx) {
  const registry = ctx.get('quickControl')

  ctx.effect(() => {
    const dispose = registry.registerSwitch({
      id: 'dock-git:show-stash',
      label: 'Show Stash',
      icon: '📦',
      type: 'toggle',
      order: 100,
      getValue: () => myGitState.showStash,
      setValue: (v) => { myGitState.showStash = v },  // only update state; panel handles UI
    })
    return dispose  // auto-unregister on dispose
  }, 'dock-git: quick-control switch')
}
```

### Service Dependency Declaration

Third-party plugins must declare a dependency on the `quickControl` service so this plugin finishes registration before `apply()` is called. Add `exports.inject` in the client half:

```js
// client.js — inside factory
exports.inject = ['quickControl']   // ← must declare, otherwise service may not be ready
exports.apply = function (ctx) {
  const registry = ctx.get('quickControl')  // service is ready, no null check needed
  // …
}
```

Also declare the module-level dependency in `package.json`'s `dsh.client.inject` to ensure this plugin's client script loads before yours:

```json
{
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime", "dsh-flash"]
    }
  }
}
```

> Use the **package name** here (`dsh-flash`), not a `/client` subpath — inject lookups do not strip that suffix, so the hint would be ignored silently.

### Dynamic Value Updates

If a switch's value changes outside the panel (e.g. timers, server push, other UI actions), call `registry.notifyChange(id)` to trigger a panel refresh:

```js
const registry = ctx.get('quickControl')
// Some async event changed the value
myGitState.showStash = true
registry?.notifyChange('dock-git:show-stash')
```

> **Note**: When the user operates a switch in the panel, the plugin automatically refreshes that switch's UI — no need to call `notifyChange` manually. Only use this method for value changes that the panel cannot detect.

### Changelog

The panel automatically logs every user interaction (toggle click, slider drag, option select, buttongroup/action click) in the "Recent Changes" tab (auto-expires after 30s).

**Plugins should NOT manually call `_notifyChange`**. The panel injects `_notifyChange` into each switch during rendering and calls it automatically on user interaction. `setValue()` only needs to update internal state:

```js
// ✅ Correct: setValue only updates state
setValue: (v) => { myState = v }

// ❌ Wrong: don't call _notifyChange in setValue (causes duplicate entries)
setValue: (v) => { myState = v; sw._notifyChange?.('old', 'new') }
```

`_notifyChange(oldDisplay, newDisplay)` should only be used when a plugin **proactively** changes state (not from user panel interaction) and needs to record it in the changelog, e.g.:

```js
// Timer auto-switches to dark mode
setTimeout(() => {
  state.darkMode = true
  const sw = registry.getSwitches().find(s => s.id === 'my-plugin:auto-dark')
  sw?._notifyChange('Light', 'Dark')
}, 3600000)
```

### Grouping Rules

The panel uses a collapsible tab layout:

- **Workbench** *(sliders icon)* — Built-in switches (ids starting with `dock-flash:`), grouped by `group` field into Appearance / Layout / System subgroups. In claimed mode the Layout subgroup is empty and is not rendered, because dock-base's own settings already own every dock layout property.
- **Extensions** *(blocks icon)* — Third-party switches (ids not starting with `dock-flash:`), automatically grouped by id colon prefix (plugin name)
- **Recent Changes** *(document icon)* — Switch change records from the last 30 seconds

Rule: `id.startsWith('dock-flash:')` is built-in, otherwise third-party. The `group` field on third-party switches is currently ignored; they are all placed in the Extensions tab grouped by source plugin.

The three tab glyphs are `sliders` / `blocks` / `doc` from the panel's own `_ICON_PATHS`. **The ⚡ lightning bolt is not a tab icon — it is the product mark** (`LIGHTNING_ICON`), shared by the panel header, the activity bar, the Settings card and the floating window.

Within the same group, switches are sorted by `order` ascending.

### Compact panel — double-click the ⚡

**Standalone only, and the double-click is the only way in.** In compact mode the panel **drops its title** while the grip and the close/close-on-blur buttons stay, and it caps its own width so it stays a narrow column. It is a narrower strip with no borders and no scrollbar, showing only each switch's icon and its control — no labels, no descriptions, no group or tab text, and no reordering or visibility buttons. **Two consecutive toggle-only rows share one line**; a lone one keeps its half-row. It is a preference (`compactPanel`), so it follows your profile rather than the session, and double-clicking again brings the full panel back. A single click keeps its meaning — open or close — because the **second** press of a double-click is what switches the mode.

Four rules are worth knowing, all deliberate:

- **The Workbench page has no header at all** — its controls are drawn directly, always; with no header it also cannot be collapsed, since a page that folds with no way to unfold would hide its rows for good.
- **Each icon carries its row's name as a tooltip.** **Language is the one row drawn without a glyph**: its control already reads 中文 / English.
- **A cluster whose master switch is OFF is not shown at all**, head included; the full panel still lists it.
- **`log` switches are left out** and an `action` becomes an icon-only button whose wording moves into its tooltip.

`window.__dockFlashPanelOrder().compact` reports the mode and which clusters it is hiding.

### quickControl Service API

| Method | Description |
| --- | --- |
| `registerSwitch(def)` | Register a switch, returns a dispose function |
| `unregisterSwitch(id)` | Unregister by id |
| `getSwitches()` | Get all switches (sorted by order ascending) |
| `notifyChange(id)` | Notify that a switch's value changed, triggers panel refresh |
| `recordChange(entry)` | Record a changelog entry `{ id, label, icon, oldDisplay, newDisplay }` |
| `getChangelog()` | Get change records from the last 30 seconds |
| `subscribe(fn)` | Subscribe to registry/value changes, returns a dispose function |
| `version` | Current registry version number (incremented on every change) |

---

## 🎨 Skin System

Skin discovery and switching go through DSH's **own plugin manager** — dsh-market is neither needed nor consulted.

### Skin Categories

| Category | Description | Examples |
| --- | --- | --- |
| **CSS** | Activated via `<style>` / `<link>` tags + body attributes | maid-atelier, official-homepage |
| **Managed** | Own lifecycle with canvas/WebGL/particles; toggled through `mount()` / `unmount()` | Mineradio |
| **Excluded** | Matched by discovery but hidden from the dropdown (conflicting or unreliable for external control), along with any timeline plugin | bloom-theme, black-hole, theme-manager |

### Preference Persistence

Skin selection, panel order, the standalone trigger position, the trigger button size and the dragged overlay position are saved to the **host settings namespace** (`dock-flash` in your profile's `settings.yaml`), and restored on load. `localStorage` is kept only as a cache, so these preferences follow you to another browser or machine rather than staying behind with the browser profile. Values that predate this (still in `localStorage` only) are migrated into the profile once, on first load.

> For implementation details, switching mechanisms, exclusion rationale, and technical constraints, see [AGENTS.md](./AGENTS.md).

---

## 🌐 Internationalization

The panel includes built-in Chinese/English localization that auto-follows the DSH language setting. Third-party switches can use functional labels (`label: () => t('xxx')`) for dynamic refresh on language change.

---

## Installation

Requires a DSH Web environment. The packages are on npm, so the **package name is the whole spec** — no checkout needed:

```sh
# Standalone: the panel core on its own
dsh plugin --profile my-profile add dsh-flash

# Workbench: the adapter, which pulls dsh-flash in — plus dock-base
dsh plugin --profile my-profile add dock-flash dock-base

# Start — or restart, after installing anything new
dsh --profile my-profile
```

**Without a host**: this package runs standalone — a ⚡ trigger button is injected into the conversation slot picked by the `trigger-position` switch (default: input right), drawn at the size set by `trigger-size` (default 24px, up to 48px in a slot or 64px at the draggable **Conversation top-right** position). Click it to open the quick control popup panel (Appearance, Layout — trigger position and size — and System switches). The shared `sidebar.footer.action` slot is deliberately not offered, because other plugins occupy it too.

**With the adapter**: `dock-flash@^3` claims the panel through `dockFlashPanel` and integrates it into the workbench — the ⚡ icon appears in the activity bar, and the panel can be opened as a sidebar or floating window with the Appearance and System switches. Dock layout properties (dock edge, auto-hide, reserve space, icon scaling) are configured in dock-base's own settings, not here.

### Companion plugins

This package owns **no monitor at all**. The context, memory and network monitors and the
system-proxy controls each live in their own package:

```sh
dsh plugin --profile my-profile add \
  dsh-flash-ctx-mon dsh-flash-mem-mon dsh-flash-net-mon dsh-flash-proxy
```

| Package | What it adds |
|---|---|
| `dsh-flash-ctx-mon` | **Context monitor** — precise token usage read from DSH session events, with three rising thresholds and the model-window map, plus the session skills chip |
| `dsh-flash-mem-mon` | **Memory / GC monitor** — RSS, growth rate and Major GC frequency |
| `dsh-flash-net-mon` | **Network monitor and outbound audit** — a connectivity heartbeat, plus an opt-in fetch tracer with a per-request risk score |
| `dsh-flash-proxy` | **System proxy control** — proxy mode, `NO_PROXY` policy, `testUrl` and connection diagnostics |

Each registers its own switch through this panel's services and keeps its own settings namespace, so
they show up as ordinary rows — the three monitors in the **System Alerts** cluster, proxy as its own
cluster. Install them alongside whichever of the two packages you use; without them the panel simply
has no such rows.

**Other ways to install**, if npm is not what you want: a GitHub Release tarball
(`… add https://github.com/tcgbp/dsh-flash/releases/latest/download/dsh-flash.tgz`), git
(`… add github:tcgbp/dsh-flash`), or a local checkout (`… add ./dsh-flash` — for development, where
`lib/client.js` is live on refresh). The DSH **Plugins** page accepts the same package name and adds
one step: press **Enable now** after installing.

## Development

```sh
pnpm install
pnpm run build      # tsc → dist/index.js
pnpm run typecheck  # type check only
pnpm run check:docs # instruction-file budget + link resolution
pnpm run check:overlay  # overlay trigger behavioural checks
```

For development rules, critical constraints, and testing conventions, see [AGENTS.md](./AGENTS.md). For what changed in each release and why, see [CHANGELOG.md](./CHANGELOG.md).

## Style Contract

This plugin follows the DSH Web style contract: all colors reference `--dsw-alias-*` design tokens (literals only as fallback), no theme-branching CSS selectors.

## Dependencies

| Dependency | Type | Description |
| --- | --- | --- |
| `@deepseek-ai/schemastery` | dependency | Settings schema for the host half |
| `@deepseek-ai/cordis` >=4.0.0-rc.1 <5.0.0-0 \|\| >=4.0.1-0 <5.0.0-0 | peer | Plugin framework (bundled with DSH) |

> This core package has **no dock-base dependency**. The Workbench integration and its `dock-base` peer live in the separate `dock-flash` adapter.

## License

[Apache License 2.0](./LICENSE)
