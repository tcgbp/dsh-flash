# dsh-flash

> Quick Control panel **core** for the DSH web UI — the floating quick-control panel with an **extensible switch registry** other plugins register their own controls into, the skin system, zh/en i18n and the alert surfaces.

**[中文文档](./README.zh-CN.md)**

## Features

### Built-in switches

Built-in switches are grouped into Appearance / Layout / System (compact two-column layout). The Layout group is offered in standalone mode only:

| Group | Switch | Type | Description | Standalone |
| --- | --- | --- | --- | --- |
| 🎨 Appearance | Theme | select | Lists what the theme service publishes, minus the dead options. While a theme publishes its **own palette** (Dream: Abyss / Aurora / …), those palettes are the list and Light / Dark / System are withheld — the palette paints over the base scheme and fixes its own colour scheme, so none of the three could do anything. With no palette published — no skin installed, **or a restyling skin such as Claude** — the list is Light / Dark / System, and Follow-system really does resolve against the OS | ✅ |
| 🎨 Appearance | Skin | select | Dynamically discovers installed skin plugins and switches between them, through DSH's **own plugin manager** — dsh-market is neither needed nor consulted. Every switch writes BOTH layers: the loader ENTRY row (what the running page acts on) and `dsh.profile.bundles` (what the next boot composes), because writing only one of them is how a skin came back after a reload, or could never be switched on again | ✅ |
| 🎨 Appearance | Turn Rail | toggle | Moves DSH's built-in turn navigator from the right gutter to the left. Hidden unless DSH's own rail is on screen and no other timeline plugin owns it | ✅ |
| 🎨 Appearance | Language | buttongroup | 中文 / English — switches DSH global UI language | ✅ |
| 🎨 Appearance | Fullscreen | toggle | Browser Fullscreen API — enter/exit fullscreen | ✅ |
| 🎨 Appearance | Log Download | toggle | Show/hide the session log download button | ✅ |
| 📐 Layout | Close on Blur | buttongroup | Off / On — auto-close the panel when clicking outside. Also a toggle in the panel header (both modes) | ✅ |
| 📐 Layout | Trigger Position | select | Input Left / Input Right / Session Header / Header Utils — where the standalone ⚡ trigger goes — or **Conversation top-right**, a floating button inside the conversation you can drag anywhere within it | ✅ |
| 📐 Layout | Trigger Button Size | slider | 24–64 px — how big the standalone ⚡ entry point is drawn, glyph and corner radius included. The draggable **Conversation top-right** position allows the full range; the slot positions cap at **48px** so the button still fits the input row, and the row shows the size actually in force | ✅ |
| 🖱️ Right-click | *(the draggable ⚡ itself)* | menu | **Reset position** / current offset / version (click to copy a diagnostic) / **layer** and **rest opacity** presets. Not a switch in the panel: the layer and the opacity only apply to the floating button, and the menu deliberately does not repeat `trigger-size`, `trigger-position` or `close-on-blur` | ✅ |
| ⚙️ System | System Alerts | toggle | The bell switch — master on/off for the alert registry. Turning it off also stops the polling and clears every alert queue it feeds (host provider, the toast surface, dismissed state and the host-side alert buffer); turning it back on restarts polling and the display modes | ✅ |
| ⚙️ System | Alert Toast | toggle | Shows alerts as a toast at the conversation's top-right. A member of the `system-alerts` cluster, so it only appears while System Alerts is on; it runs in both docked and standalone modes (it mounts on `document.body`) and only disappears from the panel while alerts are off | ✅ |
| ⚙️ System | Host Alert Queue Cap | number | 10–200 — how many host-pushed alerts the queue holds, a direct member of the `system-alerts` cluster (same level as the master toggle, not nested). Hidden in compact mode | ✅ |
| ⚙️ System | Host Alert Max Age | number | 1–168 h — how long a host-pushed alert is kept before it ages out, the sibling of Queue Cap in the `system-alerts` cluster. Hidden in compact mode | ✅ |
| ⚙️ System | Missing Companions | log | Names every companion plugin that is not **running**, splitting `installed, not running` from `not installed` — a package that is present but silent is a different problem from one that is absent. Read-only: it prints the `dsh plugin --profile <name> add …` command for the ones genuinely missing (and points at the DSH Plugins page on the reserved `desktop` profile, which the CLI refuses). A ✕ hides the rows through the same visibility store the ◉ mode writes, so nothing is unregistered and ticking them again brings them back | ✅ |
| ⚙️ System | Copy Install Command | action | The copy button beside Missing Companions — writes the install command for the genuinely missing companions to the clipboard ("Copied" feedback for 2 s). Drawn without a label (icon-only) and only shown while there are pending companions that have an install command | ✅ |
| ⚙️ System | Edit Patch Document | action | "Edit patch document" — opens the patch-document editor (loading state while a previous open is still in flight; rapid re-clicks do not stack a second fetch+remount). Icon-only row | ✅ |
| ⚙️ System | Content-Safety Review | toggle | The optional LLM-style deep review, "Run content-safety review on save" — OFF by default, stored as a host preference through the same schema field + mapping layer as every other host setting, so it survives reloads. A member of the `patch-document` cluster alongside Edit Patch Document | ✅ |

> **The Layout group only renders in standalone mode.** When a host claims the panel, `close-on-blur` exists solely as the panel-header toggle, so no built-in switch carries `group: 'layout'` and the category is skipped entirely.

> **Dock layout is not configured here.** Dock edge, auto-hide, reserve space and icon scaling are dock-base's own settings — this package deliberately does not duplicate them. In the Layout group it owns only `trigger-position`, `trigger-size` and `close-on-blur`, all standalone-only.

> **Turn Rail only offers itself while DSH's own rail is what you see.** It stays hidden with no session open, in a session without turns, while DSH's own `@container (width<=900px)` rule hides the rail, and when another timeline plugin owns it — `dsh-codex-timeline` enhances the native rail in place, so the rail on screen is its surface and this plugin must not fight it for the same edge. Type `__dockFlashTurnRail()` in the browser console to print the decision and its reason.

### Core capabilities

- 🧩 **Dynamic Discovery** — Other plugins register their own switches through the `quickControl` service; the panel auto-renders them
- 🌐 **Internationalization** — Full Chinese/English localization, following the DSH language setting through its official `locale` service
- 🎨 **Skin System** — Multi-layer discovery + categorized switching (CSS / Managed / Excluded)
- 🛡️ **Error Boundaries** — All panel components are wrapped so a render error cannot crash the host that mounted the panel
- 🔌 **Standalone Mode** — Works with no host at all: a ⚡ trigger injected into the configured conversation slot opens a floating popup panel
- 🩺 **Connection Diagnostics** — *(moved to the `dsh-flash-proxy` plugin)* — NO_PROXY policy, connection test, and diagnostics log
- 🧮 **Reorderable and hideable Panel** — A ⇅ icon in the Workbench and Extensions tab headers opens a reorder mode: ▲▼ move groups and switches, and the result is saved in your DSH profile, so it follows you to another browser or machine. Beside it, a ◉ icon opens a **visibility mode** with a ●/○ box on every row: untick a switch you never use and it disappears from the panel, while staying listed here so you can bring it back. **Both configuration pages list every registered control**, including any a plugin is standing down right now — those rows are dimmed with the reason on hover, so a control that does not apply at the moment can still be ordered or hidden. The two modes are mutually exclusive and each has its own ↺ reset. Switches that declare a `cluster` move as one unit with a fixed internal order and are drawn as one card whose members fold

### Host-side features

`src/index.ts` (host half) provides:

- Registers the `dock-flash` settings namespace (panel preferences, trigger preferences, host alert queue settings)
- Exposes HTTP routes:
  - `GET /plugins/dsh-flash/host-alerts` — drains the server-push alert queue
  - `POST /plugins/dsh-flash/push-alert` — pushes an alert into the queue
  - `POST /plugins/dsh-flash/clear-alerts` — clears the alert queue
  - `GET /plugins/dsh-flash/health` — lightweight heartbeat + Node.js memory stats
  - `GET /plugins/dsh-flash/profile-packages` — profile inventory for skin discovery
  - `POST /plugins/dsh-flash/set-plugin-entry` — live plugin enable/disable via patch edit

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

## Core contract

`lib/client.js` publishes two services:

| Published | API | Purpose |
| --- | --- | --- |
| **Panel service** | `ctx.provide('dockFlashPanel', { version: 1, Panel, ErrorBoundary, Header, icon, registry, i18n, host })` | Everything a dock host needs to claim and mount the panel. A host that finds no service, or one whose `version` it does not speak, leaves the standalone ⚡ in place rather than drawing half a panel |
| **Switch registry** | `ctx.provide('quickControl', registry)` | Other plugins register their own switches |

The panel service exposes `host.claim()` / `confirm()` / `release()`: an unconfirmed claim is undone by a watchdog, so a host that dies mid-mount cannot leave the ⚡ suppressed.

### What the adapter adds

The dock-base (Workbench) integration is implemented by the separate `dock-flash` v3 adapter package, not by this core. That adapter claims the `dockFlashPanel` service and registers the panel, the plugin card, the activity-bar item, the editor view and the command through `ctx.workbench`. See the `dock-flash` package for its details.

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

### Compact panel — the button in the panel header

**Standalone only, and the header button is the only way in.** In compact mode the panel **drops its title** while the grip and the close/close-on-blur buttons stay, and it caps its own width so it stays a narrow column. It is a narrower strip with no borders and no scrollbar, showing only each switch's icon and its control — no labels, no descriptions, no group or tab text, and no reordering or visibility buttons. **Two consecutive toggle-only rows share one line**; a lone one keeps its half-row. It is a preference (`compactPanel`), so it follows your profile rather than the session, and pressing the same button again brings the full panel back.

The button sits at the right end of the floating panel's header, beside the close-on-blur toggle, and names the mode it will switch to. The ⚡ trigger keeps exactly one meaning — open, or close. It used to switch this mode on a **double-click**, and that entry point is gone: a `detail >= 2` test is invisible until someone happens to try it, and re-reading one press as two different intents means a deliberate second click silently changes something else.

Four rules are worth knowing, all deliberate:

- **No page draws a tab header inside the panel.** The remaining tabs become **one fixed icon row pinned above the list** — a tab bar, not a row that scrolls away. Only that row can reach the Extensions page in this mode, since the change log is left out and the Workbench page is pinned open, so it stays where it cannot be scrolled out of reach. The Workbench page gets no chip there: its controls are drawn directly, always, and a chip that could not unfold them would be a dead tab.
- **Each icon carries its row's name as a tooltip**, the chips included. **Language is the one row drawn without a glyph**: its control already reads 中文 / English.
- **A cluster whose master switch is OFF is not shown at all**, head included; the full panel still lists it.
- **`log` switches are left out** and an `action` becomes an icon-only button whose wording moves into its tooltip.

`window.__dockFlashPanelOrder().compact` reports the mode, which clusters it is hiding, and which pages the pinned icon row carries (`tabStripPages`).

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

The panel is localized in Chinese and English, and it does not decide which of the two to draw. Its
zh/en tables are handed to DSH's own `@deepseek-ai/dsh-client-locale` registry under the `dsh-flash`
namespace, so the global language setting — the one in DSH's Settings, the one that also drives
`<html lang>` and is persisted to the Host — is the only authority, and the panel re-renders when that
service reports a change. Compose no locale plugin and the panel still renders every string, falling
back to the browser's language.

Third-party switches get this for free through the same lookup: declare a functional label
(`label: () => t('xxx')`) and the row re-renders on a language change. A plain string label does not.

---

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

## License

[Apache License 2.0](./LICENSE)
