# QuickControl switch reference

The long form of [../AGENTS.md](../AGENTS.md) § *QuickControl Registry API* → *Optional switch
fields*. The root file states the four fields that change a row's shape; this file is the complete
contract, field by field, including why each one exists.

The types a switch can be — `toggle`, `slider`, `number`, `select`, `buttongroup`, `action`, `log` —
and the id/prefix/order conventions for registering one are in the root file and in
[INTEGRATION.md](../INTEGRATION.md); this file is only about the optional fields on a definition.

---

Common to every type: `icon`, `order`, `group`, `label` (string, or `() => string` for i18n),
`visible`, and `cluster`.

`cluster: '<label>'` makes switches sharing a label **one unit** — one card, one ▲▼ pair while
reordering, a fixed internal order (their `order`). Use it for controls whose meaning depends on
staying together; co-dependent selects are the case that motivated it. Its members stay
registered and are only *folded* — never gated out by `visible`, never removed — because a block that
changes shape is the problem the fold exists to solve. A cluster is never a grid item
(`isGridToggle()`). **The mechanics live in one place**:
[docs/panel-ordering.md](panel-ordering.md) — the fold's position, the label-keyed unit, the
default-folded rule and the editing-mode inventory.

`clusterInline: true` + `clusterLabel` turn a `select`-only cluster into the **inline form**: the
cluster's title on one row, the members' dropdowns right-aligned on the row below it, each naming
itself through its own `label`, and no fold. Declare `clusterInline` on **every** member or the unit
falls back to the card; declare the title once, on any member. A member that is not a `select` also
falls back — the inline row draws controls, not label columns.

`visible: () => boolean` drops the switch from the panel while it stays registered, so its state, its
changelog entries and every other reader keep working — no dispose/re-register dance. It applies at
the **row** level and **only in the normal view**; both editing modes list every registered control,
because one that is not drawn cannot be ordered or hidden. The normal view also drops a group that
would draw no rows, and `renderSwitch` re-checks unless passed `force` (what the editing modes do).
**A switch driven by `visible` must notify when its condition changes**, or it flips only on the next
unrelated render — `notifyChange` is the mechanism (e.g. a fetch completing, a timer firing).

Per renderer:

| Field | Types | Effect |
|---|---|---|
| `subtitle` | `toggle`, `select` | Secondary line in the label column |
| `subtitleBlock` | `select`, `toggle` | Render `subtitle` as its own full-width, **wrapping** line below the row instead of inside the label column. Use it whenever the value is long enough that the inline variant's ellipsis hides the point — a URL, a path, a command, or a companion monitor toggle's "precise · model · 42%" status line. `S.switchSubtitle` (inline) sets `nowrap` + `text-overflow: ellipsis` because it shares the row with the control; `S.switchSubtitleBlock` drops both and adds `word-break: break-all`. |
| `tooltip` | `select`, `number` | `ⓘ` icon carrying a native `title` attribute. On `number` switches the description belongs here rather than in `subtitle`: the inline subtitle shares the row with the input and ellipsizes the point, while the value is a bare digit that needs no accompanying line. The host-alert sliders (`host-alert-queue-cap`, `host-alert-max-age`) are the worked example |
| `actionLabel` | `action` | Button text (string, or `() => string`) |
| `hideLabel` | `action` | Drop the title column and let the button take the whole row. For an action whose button already carries its wording — Test Connection read "测试连接" twice, once as a title and once on the button. The definition keeps `label` either way: that is what the changelog and the panel name the entry with |
| `getMeta`, `hideWhenEmpty`, `emptyText`, `onClear`, `clearTitle` | `log` | See the `log` row above. `hideWhenEmpty` renders nothing at all while `getLines()` is empty, instead of an empty box; `emptyText` is the placeholder used when it is *not* set |

> **Don't hide a switch's own value behind `tooltip`.** A URL was once both a subtitle *and* a tooltip of the same string: the tooltip added a hover target and no information, while the subtitle truncated the URL at exactly the part worth reading. If a value matters, give it `subtitleBlock`. The `dsh-flash-proxy:test-url` switch (now in the extracted `dsh-flash-proxy` plugin) once dropped the line entirely — one step too far: with `custom` selected the select says only "Custom", so the address actually in force was the one thing the row did not show. It is back now (`subtitleBlock` + a resolver function), inside the proxy cluster's card.
