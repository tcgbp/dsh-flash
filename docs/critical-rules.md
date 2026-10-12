# Critical Rules — in full

The long form of every rule summarised in [../AGENTS.md](../AGENTS.md) § *Critical Rules*: the
examples, the mechanism, and the defect each one came from. The root file carries the one line needed
to obey a rule; this file carries what you need to **change** one.

Rules are numbered, and the numbers are load-bearing — other sections and commit messages cite them
("Critical Rule 7"). **Never renumber.** A retired rule keeps its number and says where its subject
went, because the citations outlive the text.

---

## 1. Never Modify Layout State Synchronously in React Render Cycle

Calling `ctx.workbench.updateLayout()` or `ctx.workbench.openView()` synchronously during a React render causes the dock bar to vanish. Always defer:

```js
// ✅ Correct — defer to next tick
const handleClick = () => {
  setTimeout(() => ctx.workbench.openView('dock-flash:quickControl'), 0)
}

// ❌ Wrong — synchronous layout mutation in render path
return h('div', { onClick: () => ctx.workbench.openView('...') })
```
## 2. CSS Skin Deactivation Must Use `el.remove()`, Not `el.disabled = true`

Some skins (e.g. those using `exports.apply()`) check for `style[data-plugin-css]` tag existence before injecting. A disabled tag still exists in the DOM, causing the skin to skip re-injection on reactivation.

```js
// ✅ Correct — remove from DOM
el.remove()

// ❌ Wrong — tag still exists, blocks re-injection
el.disabled = true
```
## 3. `storage` Event Only Fires in Other Browsing Contexts

`window.addEventListener('storage', handler)` does NOT fire when `localStorage.setItem()` is called in the same window. This is a browser spec requirement.

**Workaround**: Create a same-origin `<iframe>` (`about:blank` inherits parent origin), write from `iframe.contentWindow.localStorage` → parent receives the `storage` event.

```js
// ✅ Correct — iframe trick triggers storage event in parent
function writeViaIframe(key, value) {
  try {
    const iframe = document.createElement('iframe')
    iframe.src = 'about:blank'
    document.body.appendChild(iframe)
    iframe.contentWindow.localStorage.setItem(key, value)
    iframe.remove()
  } catch (_) {
    // Fallback: direct write + DOM manipulation; next refresh reads correct state
    localStorage.setItem(key, value)
  }
}

// ❌ Wrong — storage event never fires in same window
localStorage.setItem(key, value)  // onStorage handler won't trigger
```
## 4. Plugins with MutationObservers or IIFE Injection Cannot Be Reliably Externally Toggled

Example: `@kubor/dsh-bloom-theme` — IIFE immediately injects CSS, MutationObservers auto-restore removed DOM, hot-reload `setInterval` re-checks every 3s. External deactivation is futile.

**Solution**: Exclude such plugins via `_skinExclude` instead of trying to handle them:

```js
const _skinExclude = /black-hole|theme-manager|dsh-bloom-theme/i
```

When adding new skin plugins that exhibit similar behavior (self-restoring observers, IIFE injection, hot-reload), add them to `_skinExclude` — do NOT attempt to write deactivation logic for them.
## 5. `mod.import()` May Fail for Plugins Not in the Module Graph

Some installed-but-deactivated plugins (like Mineradio) may not be resolvable via `ctx.get('modules').import(id)`. Always provide a fallback:

```js
// Dual-strategy reactivation
try {
  mod.import(skinId).then(exports => {
    ctx.plugin(exports.apply)  // Strategy 1: reuse module
  }).catch(() => {
    _reloadSkinScript(skinId)  // Strategy 2: <script> tag fallback
  })
} catch (_) {
  _reloadSkinScript(skinId)    // Strategy 2 immediately if mod unavailable
}
```

Script tag fallback: `<script src="/plugins/<id>/client.js">` — re-runs the entire IIFE which unconditionally injects CSS.
## 6. Theme Plugins with `theme/change` Listeners Need Retry Mechanism

`wxj-black-hole` listens for `theme/change` events and forcibly reverts theme changes. The theme switcher must retry:

```js
// Retry setTheme() every 150ms, up to 15 times
let retries = 0
const timer = setInterval(() => {
  ctx.workbench.setTheme(targetTheme)
  if (++retries >= 15) clearInterval(timer)
}, 150)
```
## 7. `setValue()` Should Only Update State — Panel Handles UI Refresh

The panel automatically refreshes switch UI and records changelog on user interaction. `setValue()` should be a pure state setter:

```js
// ✅ Correct
setValue: (v) => { myState = v }

// ❌ Wrong — causes duplicate changelog entries
setValue: (v) => { myState = v; sw._notifyChange?.('old', 'new') }
```

`_notifyChange()` is for proactive state changes (timers, server push), NOT user-initiated changes.
## 8. `_skinExclude` Must Be Checked in ALL Scan Phases

Every skin discovery phase (1a, 1b, 2, 4, 5, 6) must filter excluded plugins. Missing a phase causes excluded skins to appear in the dropdown:

```js
// Every scan loop must include:
if (_skinExclude.test(id)) continue
```

**Exclude the market itself, and never narrow the `skin` token.** `dsh-skin-market` supplies the
installed-skin list and was also offered as one of the skins, labelled `Market` by `_labelFromId()`
(strip `dsh-`, strip trailing `-skin`). The bare `skin` token in `_skinHint` is what makes every
`<name>-skin` package discoverable, so the market is excluded **by name** — narrowing the token would
put every real skin at risk. A derived label makes such an entry look deliberate, so the list is
asserted rather than eyeballed: `check:overlay` section 15 drives the real scan and pins the dropdown.

**A candidate must pass the ONE name predicate — in EVERY phase.** `_skinAllowed(id)` is stated once
and called from **all seven** entry paths into `_scanInstalledSkins()`: managed (0),
`style[data-plugin]` (1a), `style[data-skin-chrome]` (1b), body attributes (2), boot manifest / graph
rows (4), live marks (5), the profile manifest (6). It is a **pure name predicate** now, and
**both halves are inside it** — `_skinHint.test(id) && !_skinExclude.test(id)`. The market's registry
classification it once consulted is gone, along with the `/use-skin` path; see the skin section's
note. Phases 0 and 4 call `_skinAllowed` ALONE (the redundant standalone `_skinExclude.test` above is
the shape of the other five, not of those two) — anything that narrows the exclusion must go inside
`_skinAllowed`, because an id that skips it is listed. **A package nothing recognises PASSES** (a
plugin-local CSS skin must stay; only a KNOWN non-skin is dropped).
`dsh-client-liang-intensity-skin` is the worked example —
[docs/architecture-notes.md](architecture-notes.md) has the measurements.

**ONE skin must yield ONE id, and that id is the PACKAGE name.** Filtering has one predicate;
identity had no single spelling, and that is the same defect twice: the dedup is exact string equality
while the phases and the plugin-manager merge each spell an id differently, so one skin enters the list
twice — and only ONE of those ids is addressable, so picking the other refuses silently. **The
canonicalization lives in phases 1a and 1b, because those are the two that read a RAW DOM string**:
`_canonicalSkinId()` strips a subpath and a scope, and 1b additionally strips a decorative suffix
(`-style`, `-chrome`, `-css`) **only when the stripped name is CONFIRMED by a known source, never
blindly** (a package may genuinely be called `foo-style`). The confirming set is the boot manifest /
graphRows, `_managedSkins`, **`_skinBodyAttrs`** — the strongest for a skin it lists, being this
plugin's own curated canonical-id table — and the ids earlier phases already saw. Phases 0, 2, 4, 5 and
6 need no canonicalization step: their ids come from a table or a manifest that already spells the
package name. **A new phase that reads a raw string must canonicalize before `seen.has()`/`seen.add()`**
— the plugin-manager path did not, which is how the 0.15.3 duplicate came back. The worked case and its
dump: [docs/skin-system.md](skin-system.md).

> **`check:overlay` is green — 0 FAIL.** (The count is deliberately not written down: it drifts on
> every assertion added, and a stale number reads as authority.) The ten market-era assertions this note
> used to excuse as a "known, accepted red" are realigned, so a red assertion is a REAL regression
> now, never a baseline. Do not restore the market to explain one away; read the assertion.
## 9. Never Use CSS `zoom` on `<html>` Element

Setting `style.zoom` on `document.documentElement` — even at 100% (`zoom: 1`) — distorts the browser coordinate system. `getBoundingClientRect()` and `clientX`/`clientY` in mouse events no longer map 1:1 to screen pixels, silently breaking DSH Web's sidebar sash drag and other pointer-based interactions.

**The page zoom feature was removed in v0.15.2** because there is no safe way to use CSS `zoom` on `<html>` without breaking DSH Web's coordinate-dependent interactions. Even `removeProperty('zoom')` at 100% proved insufficient in practice.

```js
// ❌ NEVER do this — breaks coordinate system regardless of value
document.documentElement.style.zoom = '1'   // even 100% is harmful
document.documentElement.style.zoom = '0.9'  // any non-default value

// ✅ If cleanup is needed (legacy state from older versions):
document.documentElement.style.removeProperty('zoom')
localStorage.removeItem('dock-flash:zoom')
```

**Why it matters**: The CSS `zoom` property, even at its default visual value, changes how the browser reports element positions and event coordinates. DSH Web's sidebar sash relies on precise `clientX` deltas — a `zoom` property on `<html>` introduces a scaling factor that makes the drag calculation wrong.
## 10. Error Boundary Is Mandatory for Panel Components

dock-base's `WorkbenchRoot` has NO error boundary. An uncaught render error in any panel component crashes the entire dock (activity bar + all panels disappear). Wrap every dock-flash panel component in `PanelErrorBoundary`.
## 11. `require` Does Not Exist in the Host Half — It Is ESM

`src/index.ts` compiles to ESM (`"type": "module"`, tsc `module: "esnext"`), and DSH's own entry is ESM too (`dsh` is `type: module`, `lib/bin.js` uses `import`). So inside the host half:

```ts
// ❌ ReferenceError: require is not defined
const { Schema } = require('@deepseek-ai/schemastery')

// ✅ a declared dependency: import it
import Schema from '@deepseek-ai/schemastery'   // default export only
```

**The trap is that a `require` inside `try/catch` fails silently.** That is not hypothetical: `require('@deepseek-ai/schemastery')` sat in the `ctx.inject(['settings'], …)` callback, so the throw meant **`installSection` never ran and the `dock-flash` settings namespace was never registered at all** — every setting silently reverted to its composition default.

When adding a host-side dependency, import it statically and declare it in `package.json`. When the module is DSH's rather than yours (e.g. `@deepseek-ai/dsh-http-proxy` for the extracted `dsh-flash-proxy` plugin), resolve it through a dynamic-import helper that finds DSH's own copy — see [docs/architecture-notes.md](architecture-notes.md).
## 12. (extracted) Session Event Token Source

`SessionEventTokenSource` and the session-list-subscription rule it carried — subscribe to
`sessions.list` **unconditionally** in `start()`, or a switch from an already-active session is
invisible — now live in the `dsh-flash-ctx-mon` plugin, together with the rest of the context
monitor. Nothing in this repo consumes session events.
## 13. Never Assume a Remote Method Returns a Promise

`ctx.remote.<ns>.<method>()` is **not** guaranteed to be thenable, and `describe()` is the proof:
that one name has two implementations. The typert WIRE form returns a Promise; the DIRECT form —
`SettingsController.describe()` in `@deepseek-ai/dsh-api-settings-controller` — is **synchronous**
and returns the view object itself. And it can **throw** instead ("settings service is absent: mount
`@deepseek-ai/dsh-settings …`"). So `settings.describe().then(…)` dies with
`TypeError: settings.describe(...).then is not a function`, synchronously, AHEAD of any `.catch`
attached to the chain.

**The damage is not the log line.** A synchronous throw near the top of `apply()` aborts the REST of
it: `ctx.provide('quickControl', …)`, every switch registration and the panel mount sit downstream of
the preference load, so the plugin still reads as loaded while nothing of it is on screen. In a
companion plugin whose `apply` is `async` and unguarded the same throw rejects instead, the Cordis
fiber goes **FAILED**, and the plugin never activates at all. That is the reported "the plugin was
registered and then silently disappeared".

Normalize at every call site, and guard the CALL as well as the chain:

```js
function _describeAsync(settings) {
  try { return Promise.resolve(settings.describe()) }
  catch (err) { return Promise.reject(err) }
}
```

`Promise.resolve()` alone is not enough — its argument is evaluated first, so a throwing `describe()`
still escapes. `Promise.resolve(settings.describe())` is nevertheless the right normalization for the
sync form: the parser already accepts `{ ok, value }` and a bare view, so the direct answer is
UNDERSTOOD rather than merely tolerated. `check:overlay` section 23 exercises both shapes and asserts
that `apply()` still reaches `ctx.provide('quickControl', …)`.
