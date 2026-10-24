import { execFileSync } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Default export only (`export default Schema`); there is no named `Schema`.
import Schema from '@deepseek-ai/schemastery';
// Static, per Critical Rule 11: this half is ESM, so a `require('yaml')` here
// would be a ReferenceError — and one swallowed by a try/catch would leave the
// patch validator never importing, exactly how the old `dock-flash` namespace
// stopped registering. `yaml` is declared in `package.json` dependencies.
import { parse as yamlParse } from 'yaml';
export const name = 'dsh-flash';
// No host-side service dependencies; all services are injected lazily.
export const inject = [];
/** A cluster folded state is deliberately *not* here: it is a session toggle. */
const DEFAULT_PANEL_ORDER = { builtin: [], ext: [], switches: {}, hidden: {} };
const DEFAULT_ACTIVE_SKIN = '';
const DEFAULT_TRIGGER_POSITION = 'input.right';
/** Matches the client's OVERLAY_EDGE: 8px inside the conversation's corner. */
const DEFAULT_TRIGGER_OVERLAY_OFFSET = { dx: 8, dy: 8 };
/**
 * Matches the client's TRIGGER_SIZE_MIN — which is also its default and the
 * size every release up to 1.3.x shipped. The minimum and the default being the
 * same number is deliberate: the control can only make the button LARGER, so an
 * upgrade changes nothing until the user asks, and there is no way to shrink
 * the entry point down to something hard to hit.
 */
const DEFAULT_TRIGGER_SIZE = 24;
/**
 * Matches the client's DEFAULT_TRIGGER_LAYER.
 *
 * The client used to hardcode 99997-99999 for the standalone button and panel.
 * Measured against DSH's own client bundles, the HIGHEST z-index DSH uses
 * anywhere is 1100 (`dsh-client-ui-chat`, `dsh-client-ui-model-selection`), with
 * settings and attachment popovers at 1000 — so those values sat ~90x above the
 * host UI and covered every popover in it. 1150 clears DSH's ceiling while
 * staying in the same order of magnitude, which is the whole point.
 */
const DEFAULT_TRIGGER_LAYER = 1150;
/** Matches the client's DEFAULT_OVERLAY_OPACITY — what 0.55 always was. */
const DEFAULT_OVERLAY_OPACITY = 0.55;
// ── Alert threshold defaults ──────────────────────────────────────────────
// Per-monitor thresholds (memory/GC and context) have been extracted to their
// companion plugins — dsh-flash-mem-mon and dsh-flash-ctx-mon.
/** Host alert queue capacity (max entries). */
const DEFAULT_HOST_ALERT_QUEUE_CAP = 50;
/** Host alert maximum retention time (hours). */
const DEFAULT_HOST_ALERT_MAX_AGE = 24;
// ── ns migration: dock-flash → dsh-flash ─────────────────────────────────
// The plugin id (= the settings namespace the client writes through
// `settings.update(ns, …)`) is being renamed from `dock-flash` to `dsh-flash`
// to match the package name. Existing user preferences already live in
// settings.yaml under the OLD `dock-flash` namespace; MIGRATE_FIELDS is the
// field-by-field plan for copying them into the new namespace so no panel
// config is lost. Each entry names the Config field and a predicate for "this
// value is still the default", which the migration reads BOTH directions on:
// a field is copied only when the OLD ns holds a non-default value AND the NEW
// ns still reads as default/absent.
/** A `panelOrder` value that matches DEFAULT_PANEL_ORDER (all empty). */
function isDefaultPanelOrder(v) {
    if (!v || typeof v !== 'object') {
        // Absent / null reads as "never touched" — treated as default.
        return true;
    }
    const o = v;
    const e = (a) => Array.isArray(a) && a.length === 0;
    const oEm = (a) => !a || (typeof a === 'object' && Object.keys(a).length === 0);
    return e(o.builtin) && e(o.ext) && oEm(o.switches) && oEm(o.hidden);
}
/** A `triggerOverlayOffset` value that matches DEFAULT_TRIGGER_OVERLAY_OFFSET. */
function isDefaultOverlayOffset(v) {
    if (!v || typeof v !== 'object')
        return true;
    const o = v;
    return o.dx === DEFAULT_TRIGGER_OVERLAY_OFFSET.dx && o.dy === DEFAULT_TRIGGER_OVERLAY_OFFSET.dy;
}
const MIGRATE_FIELDS = [
    { key: 'panelOrder', isDefault: isDefaultPanelOrder },
    { key: 'activeSkin', isDefault: (v) => v == null || v === DEFAULT_ACTIVE_SKIN },
    { key: 'triggerPosition', isDefault: (v) => v == null || v === DEFAULT_TRIGGER_POSITION },
    { key: 'triggerOverlayOffset', isDefault: isDefaultOverlayOffset },
    { key: 'triggerSize', isDefault: (v) => v == null || v === DEFAULT_TRIGGER_SIZE },
    { key: 'triggerLayer', isDefault: (v) => v == null || v === DEFAULT_TRIGGER_LAYER },
    { key: 'overlayOpacity', isDefault: (v) => v == null || v === DEFAULT_OVERLAY_OPACITY },
    { key: 'compactPanel', isDefault: (v) => v == null || v === false },
    { key: 'hostAlertQueueCap', isDefault: (v) => v == null || v === DEFAULT_HOST_ALERT_QUEUE_CAP },
    { key: 'hostAlertMaxAge', isDefault: (v) => v == null || v === DEFAULT_HOST_ALERT_MAX_AGE },
];
/**
 * One-time, fail-open migration of persisted preferences from the legacy
 * `dock-flash` settings namespace to the new `dsh-flash` namespace (the
 * plugin id is being renamed to match the package name).
 *
 * Why this exists: prefs lived in settings.yaml under the OLD namespace; once
 * `name` flips to `dsh-flash`, the client reads and writes the NEW namespace,
 * so an untouched old section would be silently orphaned and the panel would
 * forget the user's layout, skin, trigger and alert preferences. This copies
 * them across so no config is lost.
 *
 * How it stays safe (a migration that breaks `apply()` is worse than none — a
 * synchronous throw ahead of any `.catch` would abort the rest of apply, and
 * the plugin would read as loaded with nothing on screen, Critical Rule 13):
 *   · FAIL-OPEN — every fallible step is guarded; any error is logged and the
 *     migration returns, leaving the old namespace intact for a later run.
 *   · IDEMPOTENT — a field is copied only while the NEW namespace still sits
 *     at a default AND the OLD namespace holds a non-default value. After a
 *     successful run each new field is no longer default, so a re-run copies
 *     nothing; a run that partially wrote is corrected by the next one.
 *   · NON-CLOBBERING — the guard is asserted on BOTH sides (the "localStorage
 *     disagrees with the host" lesson): a later deliberate choice in the new
 *     namespace is never overwritten by an older value from the old one.
 *
 * Safe to call on every apply(); it no-ops once the migration has landed.
 */
async function migratePrefsFromDockFlash(settings, log) {
    // The namespace-string address is what matters, not which plugin registers
    // it: settings.describe() surfaces every persisted section of settings.yaml,
    // so the legacy `dock-flash` entry is still returned even though `name` is
    // now `dsh-flash`.
    let described;
    try {
        described = settings.describe();
    }
    catch (e) {
        log(`[dsh-flash] ns migration: describe() failed (${String(e)}) — leaving legacy dock-flash prefs in place`);
        return;
    }
    const oldEntry = described.find((d) => (d.ns ?? d.namespace) === 'dock-flash');
    const newEntry = described.find((d) => (d.ns ?? d.namespace) === 'dsh-flash');
    if (!oldEntry)
        return; // nothing persisted under the old name: nothing to migrate
    const oldValue = ((oldEntry.user ?? oldEntry.value) ?? {});
    const newValue = ((newEntry?.user ?? newEntry?.value) ?? {});
    const patch = {};
    for (const { key, isDefault } of MIGRATE_FIELDS) {
        const had = Object.prototype.hasOwnProperty.call(oldValue, key);
        const oldField = oldValue[key];
        const newField = newValue[key];
        // Copy only when the OLD ns holds a real (non-default) value and the NEW
        // ns still reads as default/absent — never clobber a deliberate choice.
        if (had && oldField !== undefined && !isDefault(oldField) && isDefault(newField)) {
            patch[key] = oldField;
        }
    }
    const keys = Object.keys(patch);
    if (keys.length === 0)
        return;
    try {
        const rev = newEntry && typeof newEntry.revision === 'number' ? newEntry.revision : undefined;
        const result = settings.update('dsh-flash', patch, rev);
        // Never assume it returns a Promise (Critical Rule 13): await the resolved
        // value, but release the fiber even if it throws.
        await Promise.resolve(result);
        log(`[dsh-flash] ns migration: copied ${keys.join(', ')} from dock-flash → dsh-flash`);
    }
    catch (e) {
        // SETTINGS_CONFLICT means the revision moved under us — the new namespace
        // now has user input, which is a valid outcome; just log and stop.
        log(`[dsh-flash] ns migration: update failed (${String(e)}) — leaving legacy dock-flash prefs in place`);
    }
}
/**
 * `dict`'s arguments are (value, key) — value schema first, contrary to how
 * the call reads. Nested objects need `.default()` at every level: a
 * property whose schema resolves to `undefined` fails the whole thing with
 * `unsupported type "undefined"`, which surfaced while building this.
 */
const PanelOrderSchema = Schema.object({
    builtin: Schema.array(Schema.string()).default([]),
    ext: Schema.array(Schema.string()).default([]),
    switches: Schema.dict(Schema.array(Schema.string()), Schema.string()).default({}),
    hidden: Schema.dict(Schema.array(Schema.string()), Schema.string()).default({}),
}).default(DEFAULT_PANEL_ORDER);
/**
 * The plugin's `Config` schema — the host's composition defaults, exported so
 * the Cordis loader publishes it as `runtime.Config`.
 *
 * This is not a cosmetic nicety. dsh-settings resolves a namespace's editable
 * form from `entry.fiber.runtime.Config` (its `schema(entry)` reads exactly
 * that), so a plugin without an exported `Config` is NOT configurable by the
 * native configuration editor — and a client preference write through
 * `settings.update('dock-flash', …)` is refused with `No configurable plugin
 * entry "dock-flash"`.
 *
 * Every field is marked `.volatile()`: live-editable without plugin restart.
 * The settings configuration editor only shows volatile fields; ordinary
 * (non-volatile) config requires a Cordis configuration file edit and a
 * restart. Since all dock-flash settings are user preferences the client
 * writes through `ctx.remote.settings`, they must all be volatile.
 */
export const Config = Schema.object({
    // ── A · QuickControl panel / preference bridge ────────────────────────
    // Client-owned preferences. The host stores them and never interprets
    // them, so they are typed loosely on purpose: `activeSkin` names a skin
    // that may not be installed on this machine, and `triggerPosition` names
    // a slot the client validates against its own TRIGGER_POSITIONS list.
    // Pinning either to an enum here would make a stored preference
    // un-writable the moment the client's lists change.
    panelOrder: PanelOrderSchema.volatile(),
    activeSkin: Schema.string().default(DEFAULT_ACTIVE_SKIN).volatile(),
    triggerPosition: Schema.string().default(DEFAULT_TRIGGER_POSITION).volatile(),
    // Every level of a nested object needs `.default()`, or the whole resolve
    // fails with `unsupported type "undefined"` — both the object and each
    // number, which is the trap that cost a round in 1.1.0.
    triggerOverlayOffset: Schema.object({
        dx: Schema.number().default(DEFAULT_TRIGGER_OVERLAY_OFFSET.dx),
        dy: Schema.number().default(DEFAULT_TRIGGER_OVERLAY_OFFSET.dy),
    }).default(DEFAULT_TRIGGER_OVERLAY_OFFSET).volatile(),
    // No min/max on purpose — see the field's comment: the range belongs to
    // the client, and it moves with the selected trigger position.
    triggerSize: Schema.number().default(DEFAULT_TRIGGER_SIZE).volatile(),
    // Both are client-owned presets the host never interprets: the sensible
    // range depends on the host UI they sit among, and clamping them here
    // would make a stored value un-writable the moment the client's preset
    // list changes (the 1.1.0 lesson this namespace already records).
    triggerLayer: Schema.number().default(DEFAULT_TRIGGER_LAYER).volatile(),
    overlayOpacity: Schema.number().default(DEFAULT_OVERLAY_OPACITY).volatile(),
    // The standalone panel's header button shows a narrower, chrome-free panel: icons and the
    // controls themselves, nothing to read and nothing to reorder. A preference rather than a
    // per-session state because it is a way of working, and that button is its switch.
    compactPanel: Schema.boolean().default(false).volatile(),
    // ── D · System alerts (merged with A per §7 decision) ────────────────
    // Per-monitor thresholds extracted to companion plugins
    // (dsh-flash-ctx-mon / dsh-flash-mem-mon); only the host alert queue
    // settings remain in this namespace.
    hostAlertQueueCap: Schema.number().default(DEFAULT_HOST_ALERT_QUEUE_CAP).volatile(),
    hostAlertMaxAge: Schema.number().default(DEFAULT_HOST_ALERT_MAX_AGE).volatile(),
    // ── E · Patch document editor (QuickControl "edit patch document") ─────
    // Host preference, client-owned: whether saving a patch edit from the panel
    // additionally runs an LLM deep review (semantic content-safety check) over
    // the new text. Opaque to the host — it is a boolean gate the client reads
    // and acts on; a missing/unsupported remote degrades to "no review" and
    // never blocks a save (see the client's `_requestPatchReview`).
    patchLlmReview: Schema.boolean().default(false).volatile(),
});
/**
 * The ctx service DSH publishes with the launch-environment snapshot it
 * resolved at boot time. That snapshot merges three layers
 * (`process` | `project-env` | `user-env`); `readLaunchEnv` reads it to find
 * DSH_PROFILE_DIR / DSH_HOME / DSH_PROFILE for profile detection.
 */
const LAUNCH_ENVIRONMENT_SERVICE = 'launchEnvironment';
/**
 * The ctx service DSH's profile launcher publishes with the facts of the profile
 * it booted: `{ name, dir, patchPath, installAnchor, startedBundles, cwd, home }`
 * (`@deepseek-ai/dsh-app-boot` → `ProfileContext`). It is provided from the boot
 * callback in `dsh`'s `runProfile()` *before* any profile plugin is mounted, so a
 * host plugin sees it during `apply()` — DSH's own `dsh-app-boot`,
 * `dsh-shell-env`, `dsh-plugin-manager`, `dsh-settings` and `dsh-config-editor`
 * all read it. DSH Desktop ships the identical `runProfile()` and provides the
 * same service, so this is the one profile signal correct in BOTH environments.
 *
 * `dsh-shell-env` builds `DSH_PROFILE` / `DSH_PROFILE_DIR` from this context per
 * shell execution — which is why those variables reach a model shell call and
 * never this process, and why they cannot be used to find the profile from here.
 */
const PROFILE_CONTEXT_SERVICE = 'profileContext';
/** Send a JSON response with no-store cache control. */
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
}
/**
 * Read an optional JSON request body, bounded so a client cannot feed the
 * host an unbounded buffer. Returns null for an empty, oversized, or
 * unparseable body — callers treat that as "no override supplied".
 */
async function readJsonBody(req, limit = 4096) {
    try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            if (size > limit)
                return null;
            chunks.push(chunk);
        }
        if (chunks.length === 0)
            return null;
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch (_) {
        return null;
    }
}
// ───────────────────────────────────────────────────────────────────────────
// Memory trend collector — extracted to dsh-flash-mem-mon.
// ───────────────────────────────────────────────────────────────────────────
export function apply(ctx, config) {
    /**
     * The package names that mean "this plugin is installed in that profile". A
     * profile's `package.json` lists what was installed in it, so the profile
     * whose dependencies name us is the one we are running in — see
     * `readProfilePackages()`.
     *
     * TWO names, because the panel and its dock integration are two packages
     * after docs/refactor-plan-core-adapter-split.md: a user installs the ADAPTER
     * (`dock-flash`), which pulls the core in as an ordinary dependency, so the
     * profile's manifest may name `dock-flash` (the adapter) and NOT `dsh-flash`,
     * depending on which half is installed. Matching only our own package name
     * would decline to claim a profile we are plainly running in, and
     * `readProfilePackages()` would fall back to directory order — the measured
     * desktop/web bug the search order above exists to prevent. We deliberately
     * list BOTH names here, independent of `name` (which is the settings
     * namespace, now `dsh-flash`).
     */
    const PLUGIN_NAMES = ['dsh-flash', 'dock-flash'];
    // ── Memory trend collector — extracted to dsh-flash-mem-mon ──────────
    /**
     * The profile's PATCH document — the `disabled:` row DSH's own plugin manager
     * writes, and the LIVE switch. `@deepseek-ai/dsh-plugin-manager`'s patch module
     * sets `disabled: !enabled` on the matching item and writes the file atomically;
     * the loader watches that document, which is why its `setPluginEnabled()` can
     * answer `applied` instead of `restart-required`.
     *
     * A plugin cannot reach that call on DSH Desktop: the client remote answers
     * `unknown-plugin` for EVERY id, because its inventory does not manage this
     * reserved profile (`listPlugins()` is empty there). That left the bundle layer
     * as the only lever — and that one shapes the NEXT boot only, which is exactly
     * why every handle-less-skin switch demanded a DSH restart. The HOST half needs
     * no remote: it has the profile directory and the filesystem.
     *
     * Edits are textual and targeted rather than a YAML round trip, so the rest of
     * the document keeps its formatting, ordering and comments.
     */
    const PATCH_FILENAME = 'cordis.patch.yml';
    /** Same-directory temp + rename, so a reader never sees a partial document. */
    async function writePatchDocument(file, dir, text) {
        const temp = join(dir, '.' + PATCH_FILENAME + '.dsh-flash-' + String(process.pid) + '.tmp');
        try {
            await writeFile(temp, text, { mode: 0o600 });
            await rename(temp, file);
            return {};
        }
        catch (error) {
            try {
                await unlink(temp);
            }
            catch (_) { /* nothing to clean up */ }
            return { error: String(error.message || error) };
        }
    }
    /**
     * One log line for a patch edit that actually CHANGED the document: which file,
     * what changed, and when. This is the host's `[dsh-flash]` console, which is
     * where a DSH plugin's host half can report at all — there is no log surface in
     * the panel for it (the panel's `log` switches are client-side).
     *
     * A no-op call is deliberately NOT logged: an entry that reports "I wrote this"
     * when the document is byte-identical turns a change history into a click
     * history, and the two are read for different questions.
     *
     * The stamp is local time with its UTC offset (`…+08:00`), because the reader is
     * a person looking at a clock, and the ISO form is what makes a pasted line
     * unambiguous. Nothing here may carry a newline: a path — or a diff summary —
     * with an embedded line break would split one record into two.
     */
    function logPatchWrite(file, id, disabled, summary) {
        const at = new Date();
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        const local = at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate()) +
            ' ' + pad(at.getHours()) + ':' + pad(at.getMinutes()) + ':' + pad(at.getSeconds());
        const offsetMin = -at.getTimezoneOffset();
        const sign = offsetMin < 0 ? '-' : '+';
        const abs = Math.abs(offsetMin);
        const zone = sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
        const oneLine = (v) => v.replace(/[\r\n]+/g, ' ');
        console.log('[dsh-flash] patch ' + at.toISOString() + ' (' + local + ' ' + zone + ') ' +
            (disabled ? 'disable' : 'enable') + ' entry=' + id + ' file=' + oneLine(file));
        for (const line of summary)
            console.log('[dsh-flash] patch   ' + oneLine(line));
    }
    /**
     * The two-layer validation the panel's "edit patch document" flush runs before
     * a save is allowed: (1) real syntax-level YAML parsing (yaml@^2, same parser
     * everywhere else), and (2) content-safety checks over the parsed structure.
     *
     * The parse layer is BLOCKING — a YAML type error means the document could not
     * be read at all, so a save that produced one is refused (the error is
     * presented, nothing is written). Everything the structure layer reports as a
     * hard `error` also blocks the save; `warning`s never do — they are "double
     * check this" markers (an empty result, an unmapped entry), not "this is
     * broken".
     *
     * What the structure layer enforces, each once:
     *   - The document must parse to a top-level LIST (a patch document is a list
     *     of entries; a bare mapping would never load as one).
     *   - Every list element should be a mapping; anything else is a `warning`
     *     (a scalar comment-like row is suspicious but the loader is lenient).
     *   - An entry needs a string `id`; a missing/blank one is a `warning` (the
     *     loader skips such rows but it is almost never what the user meant).
     *   - NO duplicate ids — two rows claiming the same entry is how the Dream
     *     double-row defect started, and it is a hard `error`.
     *   - `disabled`, when present, must be the boolean true/false — a string
     *     "true" silently fails to switch, so it is a hard `error`.
     *   - Unknown fields outside the known patch-entry set are `warning`s, not
     *     errors: a newer loader may add fields this validated set does not know.
     *   - `config` is left untrusted but flagged: the entry edits CONFIG, which is
     *     the most sensitive thing a patch row can touch, so it is worth a second
     *     look (warning, not a block).
     *
     * Returns `{ ok, errors, warnings }`; `ok` is `errors.length === 0`. The raw
     * error text from the parser is preserved verbatim so a malformed document
     * shows the line the user must fix.
     */
    function validatePatchText(text) {
        const errors = [];
        const warnings = [];
        let root;
        try {
            root = yamlParse(text);
        }
        catch (e) {
            const msg = e.message || String(e);
            // yaml@^2 error messages already carry the offending line/column.
            errors.push('YAML parse error: ' + String(msg).replace(/\s+/g, ' ').trim());
            return { ok: false, errors, warnings };
        }
        // Empty document — patch badly broken, do not persist it.
        if (root === null || root === undefined) {
            errors.push('The patch document is empty.');
            return { ok: false, errors, warnings };
        }
        if (!Array.isArray(root)) {
            errors.push('The patch document must be a top-level list of entries.');
            return { ok: false, errors, warnings };
        }
        // Fields a patch entry may legitimately carry. Anything else is suspicious
        // enough to warn about, but never blocking.
        const KNOWN_FIELDS = new Set(['id', 'name', 'disabled', 'config', 'active', 'inject']);
        const seenIds = new Set();
        root.forEach((entry, i) => {
            const line = 'entry #' + (i + 1);
            if (entry === null || entry === undefined) {
                // The user's document had a bare `-` (empty list item); lenient but worth a note.
                warnings.push(line + ': an empty list item — the loader will skip it.');
                return;
            }
            if (typeof entry !== 'object' || Array.isArray(entry)) {
                warnings.push(line + ': not a mapping — patch entries should be `- id: …` mappings.');
                return;
            }
            const map = entry;
            const id = map.id;
            if (typeof id !== 'string' || id.trim() === '') {
                warnings.push(line + ': missing a string `id`.');
                return;
            }
            if (seenIds.has(id))
                errors.push('Duplicate entry id "' + id + '" (' + line + ')');
            seenIds.add(id);
            if (map.disabled !== undefined && typeof map.disabled !== 'boolean') {
                errors.push(line + ' (' + id + '): `disabled` must be true or false, got ' +
                    JSON.stringify(map.disabled));
            }
            if (map.name !== undefined && typeof map.name !== 'string') {
                warnings.push(line + ' (' + id + '): `name` should be a string.');
            }
            for (const key of Object.keys(map)) {
                if (KNOWN_FIELDS.has(key))
                    continue;
                warnings.push(line + ' (' + id + '): unknown field "' + key + '".');
            }
            if (map.config !== undefined && map.config !== null) {
                warnings.push(line + ' (' + id + '): this entry carries a `config` — a save will write it verbatim.');
            }
        });
        if (root.length === 0) {
            warnings.push('The patch document has no entries — saving an empty list.');
        }
        return { ok: errors.length === 0, errors, warnings };
    }
    /**
     * The LOADER ENTRY ID for a package — which is what a patch row must key on, and it is
     * NOT the package name. MEASURED, and it cost the whole feature: the profile's patch
     * carried `- id: dream-skin / disabled: false` (written by DSH's OWN plugin page) beside
     * my `- id: dsh-dream-skin / name: dsh-dream-skin / disabled: true`, and Dream kept
     * running — two different entries, and only the first is the loaded plugin. The remote
     * answered `unknown-plugin` for the package name for exactly the same reason.
     *
     * The package's OWN patch layer declares the id it inserts, so read
     * `node_modules/<pkg>/cordis.patch.yml` and take the `- id:` of the row whose
     * `name:` is this package (the indent matters: a plugin CONFIG may carry a
     * nested `name:` too). Falls back to the package name, which is only right when
     * a plugin's entry id happens to equal it.
     */
    async function entryIdFor(dir, pkg) {
        try {
            // The package's OWN patch layer declares the entry id it inserts, and that is the id
            // DSH's own plugin page switches. MEASURED on `dsh-dream-skin`: its cordis.patch.yml
            // carries `- insert: [ - id: dream-skin / name: 'dsh-dream-skin' ]`, which is also why
            // the plugin detail lists TWO rows — the package/bundle row and this loader entry — and
            // why addressing the PACKAGE name switched nothing. The profile's own layer is only a
            // fallback: the composed graph does not even carry a row for such a plugin.
            const text = await readFile(join(dir, 'node_modules', pkg, 'cordis.patch.yml'), 'utf8');
            const lines = text.split(/\r?\n/);
            const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, '');
            let id = null;
            for (let i = 0; i < lines.length; i++) {
                const mi = /^\s*-?\s*id:\s*(.*)$/.exec(lines[i]);
                if (mi) {
                    id = unquote(mi[1]);
                    continue;
                }
                const mn = /^\s*name:\s*(.*)$/.exec(lines[i]);
                if (mn && id && unquote(mn[1]) === pkg)
                    return id;
            }
        }
        catch (_) { /* no graph on disk — the caller keeps the package name */ }
        return pkg;
    }
    /**
     * Set or clear one plugin's `disabled:` row. Mirrors the plugin manager's own
     * behaviour, including its two short-circuits: an item already in the wanted
     * state is left alone, and clearing a row that does not exist changes nothing.
     */
    async function setPatchDisabled(dir, id, disabled) {
        const file = join(dir, PATCH_FILENAME);
        let text;
        try {
            text = await readFile(file, 'utf8');
        }
        catch (error) {
            return { changed: false, error: PATCH_FILENAME + ' unreadable: ' + String(error.message || error) };
        }
        const eol = text.indexOf('\r\n') === -1 ? '\n' : '\r\n';
        const lines = text.split(/\r?\n/);
        const wanted = disabled ? 'true' : 'false';
        // Item boundaries: a top-level sequence entry begins at column 0 with `- `.
        const starts = [];
        for (let i = 0; i < lines.length; i++)
            if (/^-(\s|$)/.test(lines[i]))
                starts.push(i);
        const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, '');
        // `-?\s*` is REQUIRED: a top-level item's id sits on its own `- id: X` line, so
        // a pattern demanding leading whitespace before `id:` matches NOTHING and every
        // call treats the plugin as absent. MEASURED: three identical
        // `- id: dsh-dream-skin` rows accumulated that way, and the duplicate rows then
        // left the disable ineffectual.
        const idOf = (line) => {
            const m = /^\s*-?\s*id:\s*(.*)$/.exec(line);
            return m ? unquote(m[1]) : null;
        };
        const found = starts.find((start, k) => {
            const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
            for (let i = start; i < end; i++) {
                if (idOf(lines[i]) === id)
                    return true;
            }
            return false;
        });
        if (found === undefined) {
            if (!disabled)
                return { changed: false }; // no row, and nothing to clear
            const body = lines.length > 0 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
            // NO `name:`. MEASURED against DSH's own writer (`dsh-plugin-manager`'s
            // `writePluginEnabled`): when it has to append a row it writes exactly
            // `{ id, disabled }`. `dsh-app-boot`'s `applyEntryPatches` — the one algorithm that
            // composes this layer, the live loader included — SKIPS a row whose `name` differs
            // from the target entry's own name:
            //   warn("patch: name mismatch for %C (expected %C, got %C), skipping")
            // An earlier version of this writer echoed the ENTRY ID into `name:`, which could
            // never switch a skin whose entry id differs from its package name: `dsh-dream-skin`
            // inserts `- id: dream-skin / name: 'dsh-dream-skin'`, so every row written as
            // `id: dream-skin / name: dream-skin` was a name mismatch and was ignored. The
            // opposite mistake is just as fatal: keying the row by the PACKAGE name
            // (`- id: dsh-dream-skin`) matches no entry at all and is dropped with
            // "patch: entry … not found" — which is how three duplicate rows accumulated in a
            // profile before this was understood. `name` is optional here; the id is not.
            const next = body.concat(['- id: ' + id, '  disabled: ' + wanted, '']).join(eol);
            const wrote = await writePatchDocument(file, dir, next);
            if (wrote.error)
                return { changed: false, error: wrote.error };
            logPatchWrite(file, id, disabled, [
                '  reason: no row for this entry — appended one',
                '  added: "- id: ' + id + '" / "disabled: ' + wanted + '"',
            ]);
            return { changed: true };
        }
        const k = starts.indexOf(found);
        const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
        let at = -1;
        let indent = '  ';
        let before = null;
        for (let i = found + 1; i < end; i++) {
            const m = /^(\s+)disabled:\s*(.*)$/.exec(lines[i]);
            if (m) {
                at = i;
                indent = m[1];
                before = m[2].trim();
                break;
            }
        }
        // The change records WHICH row was edited and WHAT changed, not only the wanted
        // value: a log that says "disabled: true" cannot tell an appended row from a
        // flipped one, and that is the first thing the reader of this log asks.
        let summary;
        if (at >= 0) {
            if (lines[at] === indent + 'disabled: ' + wanted)
                return { changed: false };
            summary = [
                '  reason: existing row updated',
                '  line ' + (at + 1) + ': "disabled: ' + before + '" -> "disabled: ' + wanted + '"',
            ];
            lines[at] = indent + 'disabled: ' + wanted;
        }
        else {
            if (!disabled)
                return { changed: false };
            summary = [
                '  reason: row had no disabled field — inserted one',
                '  line ' + (found + 2) + ': added "disabled: ' + wanted + '"',
            ];
            lines.splice(found + 1, 0, '  disabled: ' + wanted);
        }
        const wrote = await writePatchDocument(file, dir, lines.join(eol));
        if (wrote.error)
            return { changed: false, error: wrote.error };
        logPatchWrite(file, id, disabled, summary);
        return { changed: true };
    }
    /**
     * Reconcile a package's membership in the profile's `dsh.profile.bundles`
     * roster — the layer the running loader actually composes at boot. This is the
     * SECOND half of a skin switch, kept on the HOST so a press is self-sufficient.
     * DSH's own plugin page reaches both layers through its remote, but on DSH
     * Desktop that remote refuses this reserved profile (`listBundles()` is empty
     * there), so the bundle layer is only ever written from here. An OFF that only
     * flips the entry row is not durable: a package still listed in `bundles` is
     * recomposed at the next boot, and one dropped from `bundles` without its row
     * un-flipped can never come back. Write both and the two layers always agree.
     *
     * Read-modify-write is atomic (same-directory temp + rename, the same writer
     * as the patch document), so a reader never sees a half-written manifest. The
     * roster keeps its existing order and formatting; only membership changes.
     */
    async function setProfileBundle(dir, target, enabled) {
        const file = join(dir, 'package.json');
        let pkg;
        try {
            pkg = JSON.parse(await readFile(file, 'utf8'));
        }
        catch (error) {
            return {
                changed: false,
                error: 'profile package.json unreadable: ' + String(error.message || error),
            };
        }
        const raw = pkg && pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles;
        if (!Array.isArray(raw)) {
            return { changed: false, error: 'profile package.json carries no dsh.profile.bundles roster' };
        }
        const has = raw.indexOf(target) !== -1;
        if (enabled === has)
            return { changed: false };
        const next = enabled ? raw.slice().concat(target) : raw.filter((n) => n !== target);
        pkg.dsh.profile.bundles = next;
        const text = JSON.stringify(pkg, null, 2) + '\n';
        const wrote = await writePatchDocument(file, dir, text);
        if (wrote.error)
            return { changed: false, error: wrote.error };
        logPatchWrite(file, target, !enabled, [
            '  reason: bundle roster changed on the ' + (enabled ? 'ON' : 'OFF') + ' side',
            '  ' + (enabled ? 'added ' : 'removed ') + target +
                (enabled ? ' to dsh.profile.bundles' : ' from dsh.profile.bundles'),
        ]);
        return { changed: true };
    }
    /** The launch-environment snapshot DSH resolved the boot-time policy from. */
    function launchEnvironment() {
        try {
            const svc = ctx.get ? ctx.get(LAUNCH_ENVIRONMENT_SERVICE) : undefined;
            return svc && typeof svc.get === 'function' ? svc : null;
        }
        catch (_) {
            return null;
        }
    }
    /**
     * Read a launch-environment variable the way the policy resolved it: the
     * launch snapshot first (it merges process / project-env / user-env),
     * process.env as fallback. The profile inventory reads DSH_PROFILE_DIR /
     * DSH_HOME through it too.
     */
    function readLaunchEnv(names) {
        const snapshot = launchEnvironment();
        for (const name of names) {
            const fromSnapshot = snapshot ? snapshot.get(name) : undefined;
            if (fromSnapshot && fromSnapshot.value)
                return fromSnapshot.value;
            const raw = process.env[name];
            if (raw)
                return raw;
        }
        return null;
    }
    /**
     * The profile facts the launcher published for THIS process, when there are
     * any. This is the only signal that NAMES the running profile; everything else
     * in `profileDirCandidates()` is inference. Absent when DSH was booted without
     * a profile launcher (an explicit `--config`, a test harness).
     */
    function profileContext() {
        try {
            const svc = ctx.get ? ctx.get(PROFILE_CONTEXT_SERVICE) : undefined;
            return svc && typeof svc === 'object'
                ? svc
                : null;
        }
        catch (_) {
            return null;
        }
    }
    /** The config directory cordis booted from — the profile dir in a profile boot. */
    function bootBaseDir() {
        try {
            const base = ctx.baseUrl;
            return typeof base === 'string' && base.startsWith('file:') ? dirname(fileURLToPath(base)) : null;
        }
        catch (_) {
            return null;
        }
    }
    /**
     * Candidate directories for the profile this host boots plugins for, best
     * first.
     *
     * **Do not assume `DSH_PROFILE_DIR` is set here.** MEASURED: the harness
     * exports `DSH_PROFILE` / `DSH_PROFILE_DIR` into every *model shell call* of a
     * profile-launched session and omits both when it was booted without a
     * profile — they are shell facts, not facts of the Electron host process, so a
     * host plugin sees neither. The first version of this function trusted them and
     * answered "the launch environment names no profile directory" from the
     * running Desktop app.
     *
     * The launcher does publish the answer, though: every profile boot provides
     * `profileContext` (`name`, `dir`, `patchPath`, …) before any plugin mounts, so
     * that is the first candidate, with `ctx.baseUrl` (the boot config's directory)
     * behind it as an independent second.
     *
     * The rest is a FOUND profile rather than a declared one, kept for a boot with
     * no profile launcher behind it. The old best signal — "a profile's
     * `package.json` lists the plugins installed in it, so the profile that lists
     * THIS plugin is the one we are running in" — is NOT sufficient:
     * MEASURED, `~/.dsh/profiles` held BOTH `desktop` and `web`, both installed
     * dock-flash, `readdirSync` returns `desktop` first, and a `dsh web` process
     * therefore resolved the DESKTOP profile: `/plugins/dsh-flash/profile-packages`
     * answered `dir: …\profiles\desktop` and every skin toggle wrote
     * `profiles/desktop/cordis.patch.yml` while the running loader watched
     * `profiles/web/cordis.patch.yml`. Each write honestly reported
     * `application: "applied"`, the page reloaded, and no skin ever came up —
     * because the document being edited was not the one being watched.
     */
    function profileDirCandidates() {
        const out = [];
        const push = (dir) => {
            if (dir && out.indexOf(dir) === -1)
                out.push(dir);
        };
        const facts = profileContext();
        if (facts) {
            push(facts.dir);
            // `patchPath` is the document the running loader actually watches, so its
            // directory is the profile even if `dir` were missing or ever renamed.
            if (facts.patchPath)
                push(dirname(facts.patchPath));
        }
        push(bootBaseDir());
        push(readLaunchEnv(['DSH_PROFILE_DIR']));
        const home = readLaunchEnv(['DSH_HOME']) || join(homedir(), '.dsh');
        const named = readLaunchEnv(['DSH_PROFILE']) || (facts && facts.name);
        if (named)
            push(join(home, 'profiles', named));
        const argv = process.argv;
        for (let i = 0; i < argv.length - 1; i++) {
            if (argv[i] === '--profile')
                push(join(home, 'profiles', argv[i + 1]));
            else if (argv[i] === '--profile-dir')
                push(argv[i + 1]);
        }
        try {
            for (const entry of readdirSync(join(home, 'profiles')))
                push(join(home, 'profiles', entry));
        }
        catch (_) { /* no profiles directory — the other candidates still stand */ }
        push(process.cwd());
        return out;
    }
    /**
     * What the profile's OWN manifest says: `dependencies` is what is installed,
     * `dsh.profile.bundles` is what this DSH actually composes at boot. The gap
     * between the two is "installed but switched off" — and on DSH Desktop that
     * gap is the only place the fact exists at all: the plugin manager refuses
     * the reserved desktop profile (`manageDesktopProfile` / `rejectElectronProfile`),
     * so its `listPlugins()` / `listBundles()` answer nothing there, and a skin
     * that is switched off becomes invisible (listed nowhere, so it can never be
     * switched back on).
     *
     * Failures are returned as data, never thrown — this route cannot 500.
     */
    async function readProfilePackages() {
        const candidates = profileDirCandidates();
        const tried = [];
        let fallback = null;
        for (const dir of candidates) {
            tried.push(dir);
            try {
                const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
                const raw = pkg && pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles;
                if (!Array.isArray(raw))
                    continue; // not a profile manifest
                const installed = Object.keys((pkg && pkg.dependencies) || {}).sort();
                // A package can sit in `bundles` and still be switched OFF at the ENTRY level:
                // DSH's own switch writes `- id: <entry>` + `disabled: true` into the profile patch,
                // and that entry id comes from the PACKAGE's own patch layer (`dsh-dream-skin`
                // declares `dream-skin`). Reporting such a package as ACTIVE is what made it vanish
                // from the skin list: it is neither an active skin (no marks, not loaded) nor
                // "installed but off" (`installed - active` was empty), so no discovery phase could
                // see it. Excluding it here fixes BOTH readers at once — phase 6 lists it again, and
                // `_switchSkinBundle()` reads its state as off.
                const disabledByEntry = await (async () => {
                    const off = new Set();
                    const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, '');
                    try {
                        const ids = new Set();
                        const patch = await readFile(join(dir, 'cordis.patch.yml'), 'utf8');
                        let pending = null;
                        for (const line of patch.split(/\r?\n/)) {
                            const mi = /^\s*-?\s*id:\s*(.*)$/.exec(line);
                            if (mi) {
                                pending = unquote(mi[1]);
                                continue;
                            }
                            if (pending && /^\s*disabled:\s*true\s*$/.test(line))
                                ids.add(pending);
                        }
                        for (const name of installed) {
                            try {
                                const own = await readFile(join(dir, 'node_modules', name, 'cordis.patch.yml'), 'utf8');
                                for (const line of own.split(/\r?\n/)) {
                                    const mi = /^\s*-?\s*id:\s*(.*)$/.exec(line);
                                    if (mi && ids.has(unquote(mi[1]))) {
                                        off.add(name);
                                        break;
                                    }
                                }
                            }
                            catch (_) { /* this package ships no patch layer of its own */ }
                        }
                    }
                    catch (_) { /* no profile patch — nothing is switched off there */ }
                    return off;
                })();
                let active = raw
                    .filter((name) => typeof name === 'string')
                    .sort();
                active = active.filter((name) => !disabledByEntry.has(name));
                const claimsUs = installed.some((pkg) => PLUGIN_NAMES.some((n) => pkg === n || pkg.endsWith('/' + n)));
                // The profile that lists this plugin is the one we run in; a profile
                // that merely looks like one is only kept in case nothing claims us.
                if (claimsUs)
                    return { dir, installed, active, tried };
                if (!fallback)
                    fallback = { dir, installed, active };
            }
            catch (_) { /* not a readable profile manifest — try the next candidate */ }
        }
        if (fallback)
            return { ...fallback, tried };
        return {
            dir: null,
            installed: [],
            active: [],
            tried,
            error: 'no profile manifest found (none of these had a readable package.json ' +
                'with dsh.profile.bundles): ' + tried.join(', '),
        };
    }
    // When the settings service is available, register the dsh-flash
    // namespace's page policy. Volatile fields in the exported `Config` schema
    // are what make this plugin's settings editable without restart —
    // `settings.configure` tells the settings UI to show a form for this
    // instance; it does not register a schema (that is `Config`'s job).
    ctx.inject(['settings'], (settingsCtx) => {
        settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
        // One-time dock-flash → dsh-flash namespace migration (id = settings
        // namespace). Fail-open: any error is logged and never aborts apply().
        // No-op after the first successful run (see migratePrefsFromDockFlash).
        const target = settingsCtx.settings;
        void migratePrefsFromDockFlash(target, (msg) => ctx.logger.warn(msg)).then(() => { }, (e) => ctx.logger.warn(`[dsh-flash] ns migration: unexpected error (${String(e)})`));
    });
    // React to volatile config updates in-place. The loader's `_commitVolatile()`
    // updates the `Volatile<T>` references in `config` and then emits
    // `loader/volatile-update` with the paths that changed. Each subsystem
    // subscribes to ITS OWN paths only, so a change in one never walks another's
    // code path — proxy (B) has been extracted to `dsh-flash-proxy`, so
    // only alerts (D) remain here.
    // D · System alerts — no reconfigure needed. Alert routes read
    // config.hostAlertQueueCap / hostAlertMaxAge via .get() at request time,
    // and client-side alert providers read _alertPref() at poll time, so a
    // volatile-update on these paths needs no host-side action.
    // ── HTTP API routes for client-side features ──────────────────────────
    // The webServer type augmentation lives in @deepseek-ai/dsh-host-webserver
    // which is not a direct dependency; cast through `any` for the register calls.
    ctx.inject(['webServer'], (wsCtx) => {
        // D · System alerts ─────────────────────────────────────────────────
        // Host-side alert queue for server-push alerts. External tools or the host
        // process itself can push alerts that the client will pick up on the next
        // poll. The queue is in-memory only (lost on restart), capped and pruned
        // from settings the sliders control.
        const _alertQueue = [];
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/push-alert',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.setHeader('allow', 'POST');
                    res.end();
                    return;
                }
                const body = await readJsonBody(req);
                if (!body || !body.id || !body.title) {
                    sendJson(res, 400, { error: 'Missing required fields: id, title' });
                    return;
                }
                const cap = config.hostAlertQueueCap.get() || DEFAULT_HOST_ALERT_QUEUE_CAP;
                const maxAgeHours = config.hostAlertMaxAge.get() ?? DEFAULT_HOST_ALERT_MAX_AGE;
                const maxAgeMs = (maxAgeHours > 0 ? maxAgeHours : DEFAULT_HOST_ALERT_MAX_AGE) * 3600_000;
                const cutoff = Date.now() - maxAgeMs;
                // Prune expired entries first, then cap the queue
                for (let i = _alertQueue.length - 1; i >= 0; i--) {
                    if (_alertQueue[i].timestamp && _alertQueue[i].timestamp < cutoff) {
                        _alertQueue.splice(i, 1);
                    }
                }
                const alert = {
                    id: String(body.id),
                    severity: body.severity || 'info',
                    title: String(body.title),
                    message: body.message ? String(body.message) : '',
                    icon: body.icon || '🔔',
                    timestamp: Date.now(),
                    dismissible: body.dismissible !== false,
                    source: 'host',
                };
                _alertQueue.push(alert);
                // Cap the queue — drop the oldest entries
                while (_alertQueue.length > cap)
                    _alertQueue.shift();
                sendJson(res, 200, { ok: true, queued: _alertQueue.length });
            },
        }), 'dsh-flash: POST /plugins/dsh-flash/push-alert');
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/host-alerts',
            handler: async (req, res) => {
                if (req.method !== 'GET') {
                    res.statusCode = 405;
                    res.setHeader('allow', 'GET');
                    res.end();
                    return;
                }
                const maxAgeHours = config.hostAlertMaxAge.get() ?? DEFAULT_HOST_ALERT_MAX_AGE;
                const maxAgeMs = (maxAgeHours > 0 ? maxAgeHours : DEFAULT_HOST_ALERT_MAX_AGE) * 3600_000;
                const cutoff = Date.now() - maxAgeMs;
                // Prune expired entries before draining
                for (let i = _alertQueue.length - 1; i >= 0; i--) {
                    if (_alertQueue[i].timestamp && _alertQueue[i].timestamp < cutoff) {
                        _alertQueue.splice(i, 1);
                    }
                }
                // Drain the queue — splice out everything and return it
                const alerts = _alertQueue.splice(0, _alertQueue.length);
                sendJson(res, 200, { alerts });
            },
        }), 'dsh-flash: GET /plugins/dsh-flash/host-alerts');
        // Clear the host-side alert queue — called when the client's master
        // system-alerts toggle is switched OFF so no stale data survives.
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/clear-alerts',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.setHeader('allow', 'POST');
                    res.end();
                    return;
                }
                const count = _alertQueue.length;
                _alertQueue.splice(0, _alertQueue.length);
                sendJson(res, 200, { ok: true, cleared: count });
            },
        }), 'dsh-flash: POST /plugins/dsh-flash/clear-alerts');
        // D-owned connectivity heartbeat — the client's network-alert provider
        // polls THIS route to gauge latency (proxy status is in `dsh-flash-proxy`).
        // A probe that answers quickly regardless of proxy state is exactly what a
        // latency alarm wants: it isolates the local host reachability signal from
        // proxy configuration, so the two subsystems share no route.
        // Also returns Node.js process.memoryUsage() so the client's memory config
        // popup can display host-side memory metrics.
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/health',
            handler: async (_req, res) => {
                const mem = process.memoryUsage();
                sendJson(res, 200, {
                    ok: true,
                    ts: Date.now(),
                    memory: {
                        rss: mem.rss,
                        heapTotal: mem.heapTotal,
                        heapUsed: mem.heapUsed,
                        external: mem.external,
                        arrayBuffers: mem.arrayBuffers,
                    },
                });
            },
        }), 'dsh-flash: GET /plugins/dsh-flash/health');
        // E · Profile inventory — the profile's own manifest, which on DSH Desktop
        // is the ONLY source that can see an INSTALLED-BUT-SWITCHED-OFF plugin: the
        // plugin manager refuses the reserved desktop profile, so the client's
        // `listPlugins()` / `listBundles()` answer nothing there. Without this the
        // skin switcher could turn such a skin OFF but never back ON, because a
        // switched-off handle-less skin has no DOM mark either — nothing could prove
        // it was installed, so it was listed nowhere.
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/profile-packages',
            handler: async (req, res) => {
                if (req.method !== 'GET') {
                    res.statusCode = 405;
                    res.setHeader('allow', 'GET');
                    res.end();
                    return;
                }
                sendJson(res, 200, await readProfilePackages());
            },
        }), 'dsh-flash: GET /plugins/dsh-flash/profile-packages');
        // F · The LIVE plugin switch. The client remote cannot address anything on DSH
        // Desktop — `unknown-plugin` for every id, because its inventory does not
        // manage this reserved profile. So this route performs the edit DSH's OWN
        // plugin manager performs, on both layers together: set/clear `disabled:` in
        // the profile's patch document (atomically — the loader watches that
        // document, which is what makes the change land on the RUNNING page at once)
        // AND reconcile the package's membership in `dsh.profile.bundles` (so the
        // next boot does not recompose it, and re-enabling a dropped bundle actually
        // restores it). Writing only the entry row used to leave a bundle-listed
        // plugin running across a restart, which is the case the official manager's
        // own switch handles and a row-only write does not.
        //
        // The reply deliberately mirrors the remote's `ChangeResult` shape
        // (`{ ok, value: { stage, target, enabled, changed, application, error } }`)
        // so the client can drive both levers through one code path.
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/set-plugin-entry',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.setHeader('allow', 'POST');
                    res.end();
                    return;
                }
                const body = await readJsonBody(req);
                const target = body && typeof body.name === 'string' ? body.name : '';
                const enabled = !!(body && body.enabled);
                const value = { stage: 'enable', target, enabled };
                const fail = (code, message) => {
                    value.application = 'failed';
                    value.error = { code, message };
                    sendJson(res, 200, { ok: false, value });
                };
                if (!target)
                    return fail('invalid-spec', 'name is required');
                if (!/^[@a-z0-9][\w@./-]*$/i.test(target))
                    return fail('invalid-spec', 'name is not a package id');
                const dir = (await readProfilePackages()).dir;
                if (!dir)
                    return fail('unaddressable', 'the profile directory could not be resolved');
                const entryId = await entryIdFor(dir, target);
                const outcome = await setPatchDisabled(dir, entryId, !enabled);
                if (outcome.error)
                    return fail('operation-error', outcome.error);
                const roster = await setProfileBundle(dir, target, enabled);
                if (roster.error)
                    return fail('operation-error', roster.error);
                value.changed = outcome.changed || roster.changed;
                // `applied` — the two layers above are the SAME two DSH's own plugin page
                // writes on the web profile: the entry row (keyed by the ENTRY id, with
                // `name:` deliberately omitted — `applyEntryPatches` skips a row whose
                // `name` differs, and echoing the entry id into `name:` is exactly the
                // mismatch that made an earlier version of this route's rows inert) and the
                // `dsh.profile.bundles` roster that shapes the next boot. Meeting both is
                // what lets the running loader drop the plugin at once with no restart, and
                // is why the official manager's own switch succeeds where a row-only write
                // did not.
                value.application = 'applied';
                sendJson(res, 200, { ok: true, value });
            },
        }), 'dsh-flash: POST /plugins/dsh-flash/set-plugin-entry');
        // F2 · The patch DOCUMENT editor ("edit patch document" in the panel). The
        // client reads the whole profile patch here and writes it back, verbatim —
        // no YAML round trip, so comments, ordering and formatting survive. The
        // HOST owns this because, like the live switch above, a browser plugin has
        // no other way to address the reserved profile.
        //
        // GET  → `{ ok, dir, exists, text, error }` — the current document text, or
        //        an empty string with `exists: false` when the profile has no patch
        //        yet (the panel then starts from a fresh document).
        // POST → `{ text }`; validated with validatePatchText() and written
        //        atomically iff it passes. Reply `{ ok, validation, dir }` where
        //        `validation = { ok, errors, warnings }`; `ok:false` means nothing
        //        was written and `errors` says why.
        wsCtx.effect(() => wsCtx.webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-flash/patch-document',
            handler: async (req, res) => {
                if (req.method === 'GET') {
                    const dir = (await readProfilePackages()).dir;
                    if (!dir) {
                        sendJson(res, 200, {
                            ok: true, dir: null, exists: false, text: '',
                            error: 'the profile directory could not be resolved',
                        });
                        return;
                    }
                    let text = '';
                    let exists = false;
                    let error;
                    try {
                        text = await readFile(join(dir, PATCH_FILENAME), 'utf8');
                        exists = true;
                    }
                    catch (e) {
                        const code = e.code;
                        if (code === 'ENOENT') {
                            // No patch document yet — a fresh start, not a fault.
                        }
                        else {
                            error = String(e.message || e);
                        }
                    }
                    sendJson(res, 200, { ok: true, dir, exists, text, error });
                    return;
                }
                if (req.method === 'POST') {
                    const body = await readJsonBody(req, 256 * 1024);
                    const text = body && typeof body.text === 'string' ? body.text : '';
                    const fail = (code, message) => {
                        sendJson(res, 200, { ok: false, error: { code, message } });
                    };
                    const dir = (await readProfilePackages()).dir;
                    if (!dir)
                        return fail('unaddressable', 'the profile directory could not be resolved');
                    const validation = validatePatchText(text);
                    if (!validation.ok) {
                        // Refused BEFORE any write — the caller's document is the problem,
                        // and nothing on disk changes.
                        sendJson(res, 200, { ok: false, validation, dir });
                        return;
                    }
                    const outcome = await writePatchDocument(join(dir, PATCH_FILENAME), dir, text);
                    if (outcome.error)
                        return fail('operation-error', outcome.error);
                    logPatchWrite(join(dir, PATCH_FILENAME), 'whole-document', false, ['saved via patch document editor']);
                    sendJson(res, 200, { ok: true, validation, dir });
                    return;
                }
                res.statusCode = 405;
                res.setHeader('allow', 'GET, POST');
                res.end();
            },
        }), 'dsh-flash: GET+POST /plugins/dsh-flash/patch-document');
        // G · Memory trend — extracted to dsh-flash-mem-mon.
        //    Route: /plugins/dsh-flash-mem-mon/memory-trend
    });
}
