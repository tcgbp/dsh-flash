# dsh-flash

> Quick Control panel **core** for the DSH web UI — the floating quick-control panel with an **extensible switch registry** other plugins register their own controls into, the skin system, zh/en i18n and the alert surfaces.

**[中文文档](./README.zh-CN.md)**

## Features

### Core capabilities

- 🧩 **Dynamic Discovery** — Other plugins register their own switches through the `quickControl` service; the panel auto-renders them
- 🌐 **Internationalization** — Full Chinese/English localization, following the DSH language setting through its official `locale` service
- 🎨 **Skin System** — Multi-layer discovery + categorized switching (CSS / Managed / Excluded)
- 🛡️ **Error Boundaries** — All panel components are wrapped so a render error cannot crash the host that mounted the panel
- 🔌 **Standalone Mode** — Works with no host at all: a ⚡ trigger injected into the configured conversation slot opens a floating popup panel
- 🩺 **Connection Diagnostics** — *(moved to the `dsh-flash-proxy` plugin)* — NO_PROXY policy, connection test, and diagnostics log
- 🧮 **Reorderable and hideable Panel** — A ⇅ icon in the Workbench and Extensions tab headers opens a reorder mode: ▲▼ move groups and switches, and the result is saved in your DSH profile, so it follows you to another browser or machine. Beside it, a ◉ icon opens a **visibility mode** with a ●/○ box on every row: untick a switch you never use and it disappears from the panel, while staying listed here so you can bring it back. **Both configuration pages list every registered control**, including any a plugin is standing down right now — those rows are dimmed with the reason on hover, so a control that does not apply at the moment can still be ordered or hidden. The two modes are mutually exclusive and each has its own ↺ reset. Switches that declare a `cluster` move as one unit with a fixed internal order and are drawn as one card whose members fold

## Development

```sh
pnpm install
pnpm run build      # tsc → dist/index.js
pnpm run typecheck  # type check only
pnpm run check:docs # instruction-file budget + link resolution
pnpm run check:overlay  # overlay trigger behavioural checks
```

For development rules, critical constraints, and testing conventions, see [AGENTS.md](./AGENTS.md). For what changed in each release and why, see [CHANGELOG.md](./CHANGELOG.md).

## Dependencies

| Dependency | Type | Description |
| --- | --- | --- |
| `@deepseek-ai/schemastery` | dependency | Settings schema for the host half |

## License

[Apache License 2.0](./LICENSE)
