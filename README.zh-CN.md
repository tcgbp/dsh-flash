# dsh-flash

> DSH Web 界面的快捷控制面板**核心** —— 悬浮/停靠的快捷控制面板，带一个**可扩展的开关注册表**（其他插件通过它注册自己的控件），外加皮肤系统、中英文国际化与告警表面。DSH **工作台**（dock-base）集成作为独立的 `dock-flash` 适配器另行发布。

**[English](./README.md)**

## 核心 + 适配器

本包就是**面板本身**，除此之外没有别的。它拥有 React 面板、`quickControl` 开关注册表、皮肤系统、告警表面、独立模式悬浮 ⚡ 触发按钮，以及整个 Host 半（`src/index.ts` → `dist/index.js`）。它**完全不依赖 dock-base**，因此可以单独运行，并且**始终**同时提供面板与 ⚡ 触发按钮。宿主通过认领 `dockFlashPanel` 服务来接管面板；只有在此之后，核心才会把自己的 ⚡ 收起。

dock-base（工作台）集成是一个独立的、很薄的**适配器**包 —— `dock-flash` v3 —— 它依赖本包，并通过 `ctx.workbench` 注册面板、插件卡片、活动栏图标、编辑器视图与命令。

```
dsh-flash ──提供 "dockFlashPanel" 服务──▶ dock-flash ──ctx.workbench──▶ dock-base 工作台
   本包：面板、开关注册表、                    适配器：5 处注册
   皮肤系统、i18n、告警面、                    + 认领/释放握手
   独立 ⚡、host 路由
```

依赖箭头是**单向**的：本包从不 import 也从不提及 `dock-flash`。它只发布服务，并在宿主认领后收起自己的 ⚡；认领它的是谁、它并不需要知道。这正是同一份构建既能独立运行、又能挂在 dock-base 下的原因，也是核心可以装在一个完全没有 dock-base 的 profile 上的原因。

| 你想要什么 | 安装 | 你得到什么 |
| --- | --- | --- |
| 工作台（dock-base）集成 | `dock-flash@^3`（会把本包一并拉入），外加 `dock-base` | 侧边栏/浮窗面板、插件卡片、活动栏 ⚡、编辑器视图、`dock-flash:openQuickControl` 命令 |
| 只要独立的悬浮 ⚡ | 单独安装 `dsh-flash` | 在所选会话槽位注入 ⚡ 触发按钮 → 浮动面板 |

### 从 `dock-flash` v2 升级

默认情况下不会有任何东西坏掉。你的 `^2.x` 依赖范围会让你继续留在**旧的一体包**上，它仍以同样的名字存在 —— 这次拆分新增了一个大版本（`dock-flash@^3`），而不是替换 v2。要迁移到拆分后的版本，安装 `dock-flash@^3`；它依赖本包并会把它拉入。

> **有一处 profile 改动是必须的，而且很容易漏掉。** profile 的 `cordis.patch.yml` 里承载你面板设置的那条写着 `- id: dock-flash` / `name: dock-flash`。那个 `name:` 是**对目标行当前 specifier 的断言**，不是重命名。拆分之后，`id: dock-flash` 解析到的是**本核心行**，它的 specifier 是 `dsh-flash`，于是断言不匹配，DSH 打印 ``patch: name mismatch for "dock-flash" (expected "dsh-flash", got "dock-flash"), skipping``，整块 `config:` 被**丢弃** —— 你的面板顺序、皮肤、触发按钮位置与尺寸会静默回落到默认值。把那条的 `name: dock-flash` 改成 `name: dsh-flash`，`id: dock-flash` 保持不动。

> **设置命名空间本身不会改变。** profile patch 的**条目 id** 有意保留为 `dock-flash`，因为这个条目 id **就是**所有已发布用户偏好所在的设置命名空间。设置页区块、持久化的 `dock-flash:…` 键以及 `/plugins/dock-flash/…` 的宿主路由在拆分前后都保持不变 —— 上面那处 `name:` 修正是升级唯一需要的改动。

## 运行模式

| 模式 | 条件 | 界面 | 可用开关 |
| --- | --- | --- | --- |
| **被认领**（工作台） | 已安装 `dock-flash` 适配器（以及 dock-base） | ⚡ 图标在活动栏 → 侧边栏/浮窗面板；面板被认领期间，核心自己的独立 ⚡ 会被收起 | 外观 + 系统 |
| **独立模式** | 仅安装 `dsh-flash` | ⚡ 触发按钮注入到所选会话槽位 → 浮动面板 | 外观 + 布局 + 系统 |

## 功能

### 内置开关

内置开关按外观 / 布局 / 系统三组分类显示（紧凑双列布局）。其中「布局」组仅独立模式会出现：

| 分组 | 开关 | 类型 | 说明 | 独立模式 |
| --- | --- | --- | --- | --- |
| 🎨 外观 | 外观 | select | 列出主题服务发布的内容，去掉其中点了也没用的选项。当某个主题在发布**自己的调色板**时（Dream：Abyss / Aurora / …），列表就是那些调色板，不提供 浅色 / 深色 / 跟随系统——调色板盖掉了基础配色、且自带固定配色，这三项都起不了作用。没有调色板发布时——没装皮肤，**或像 Claude 这种只重新着色的皮肤**——列表就是 浅色 / 深色 / 跟随系统，跟随系统确实会按操作系统解析 | ✅ |
| 🎨 外观 | 皮肤 | select | 动态扫描已安装的皮肤插件并切换，走的是 **DSH 自己的插件管理器** —— 不需要、也不读取 dsh-market。每次切换都会同时写两层：loader 的 ENTRY 行（当前页面生效的那层）和 `dsh.profile.bundles`（下次启动组装的那层）；只写一层正是「刷新后皮肤又回来了」与「再也启用不了」的原因 | ✅ |
| 🎨 外观 | 时间线移到左侧 | toggle | 把 DSH 自带的轮次导航栏从右侧挪到左侧。仅当屏幕上显示的是 DSH 自己的轨、且没有别的 timeline 插件接管时才出现 | ✅ |
| 🎨 外观 | 全屏 | toggle | 浏览器 Fullscreen API，全屏/退出全屏 | ✅ |
| 🎨 外观 | 日志下载按钮 | toggle | 显示/隐藏会话日志下载按钮 | ✅ |
| 📐 布局 | 失焦关闭 | buttongroup | 关闭 / 开启，点击面板外部时自动关闭浮窗。标题栏上也有同一开关（两种模式） | ✅ |
| 📐 布局 | 触发位置 | select | 输入框左 / 输入框右 / 会话标题栏操作区 / 会话标题栏工具区 —— 独立模式 ⚡ 触发按钮的位置；或「**对话区右上角**」—— 浮在对话区内的按钮，可拖动到区内任意位置 | ✅ |
| 📐 布局 | 入口按钮大小 | slider | 24–64 px —— 独立模式 ⚡ 入口按钮画多大，图标与圆角按比例同步。可拖动的「**对话区右上角**」位置可用满整个区间；槽位位置上限 **48px**，以免撑坏输入框那一行，且滑块显示的是**实际生效值** | ✅ |
| 🖱️ 右键 | *（可拖动的 ⚡ 按钮本身）* | 菜单 | **重置位置** / 当前位置 / 版本（点击复制诊断信息）/ **层级** 与 **静止时深浅** 预设。它不是面板里的开关：层级与深浅只作用于这个悬浮按钮，且菜单有意不重复 `trigger-size`、`trigger-position`、`close-on-blur` | ✅ |
| ⚙️ 系统 | 语言 | buttongroup | 中文 / English，切换 DSH 全局 UI 语言 | ✅ |
| ⚙️ 系统 | 缺少的配套插件 | log | 列出所有**没有运行**的配套插件，并把「已安装，但未运行」与「未安装」分开 —— 装了却是哑的，和根本没装，是两个不同的问题。只读：对确实没装的打印 `dsh plugin --profile <名字> add …` 命令（在保留的 `desktop` profile 上则指向 DSH 的 Plugins 页面，因为 CLI 拒绝该 profile），并提供复制按钮。还有一个 ✕ 可以**让它闭嘴** —— 它走的是 ◉ 可见性模式那套存储，只把这两行**隐藏**，不注销、不删除，之后在 ◉ 里重新勾上就能找回 | ✅ |

> **「布局」分组只在独立模式出现。** 面板被宿主认领后，`close-on-blur` 只以面板标题栏按钮的形式存在，因此没有任何内置开关带 `group: 'layout'`，该分类会被整体跳过。

> **停靠布局不在这里配置。** 停靠边、自动隐藏、保留空间、图标缩放都是 dock-base 自己的设置项 —— 本包有意不重复提供。布局分组里本包只拥有 `trigger-position`、`trigger-size` 与 `close-on-blur`，三者都仅独立模式存在。

> **「时间线移到左侧」只在屏幕上显示的是 DSH 自带那条轨时才出现。** 没有会话、会话还没有轮次、被 DSH 自己的 `@container (width<=900px)` 规则隐藏、或已被别的 timeline 插件接管时都不显示 —— `dsh-codex-timeline` 是原地增强原生轨，屏幕上那条属于它，本插件不与它争同一个位置。浏览器控制台执行 `__dockFlashTurnRail()` 可打印判定结果与原因。

### 核心能力

- 🧩 **动态发现** — 其他插件通过 `quickControl` 服务注册自己的快捷开关，面板自动渲染
- 🌐 **国际化** — 完整的中英文本地化，自动跟随 DSH 语言设置（通过 `<html lang>` MutationObserver 实时同步）
- 🎨 **皮肤系统** — 多层发现 + 分类切换（CSS / 托管 / 排除）
- 🛡️ **错误边界** — 所有面板组件都被包裹，渲染错误不会拖垮挂载它的宿主
- 🔌 **独立运行** — 完全没有宿主也能运行：⚡ 触发按钮注入到所选会话槽位，点击展开悬浮面板
- 📝 **最近修改** — 自动记录开关操作（30 秒 TTL），以 "旧值 → 新值" 格式展示
- 🩺 **连接诊断** — *（已迁至 `dsh-flash-proxy` 插件）* — NO_PROXY 策略、连接测试、诊断日志
- 🧮 **面板排序与隐藏** — 工作台与扩展页签头部的 ⇅ 图标进入排序模式：用 ▲▼ 调整分组与开关的先后，结果保存在 DSH 配置里，换浏览器或换机器都会跟着走。旁边的 ◉ 图标进入**显示/隐藏模式**：每一行都有一个 ●/○ 勾选框，取消勾选就把不用的开关从面板上收起，但它仍列在这里，随时可以放回来。**两个配置页都会列出全部已注册控件**，包括插件当前自行停用的那些 —— 这些行会灰显并在悬停时说明原因，所以一时用不上的控件同样可以排序或隐藏。两个模式互斥，且各自有独立的 ↺ 重置。声明了 `cluster` 的开关整簇作为一个单位移动、簇内顺序固定，并渲染成一张卡片、成员可折叠

### Host 端功能

`src/index.ts`（Host 半）提供：

- 注册 `dock-flash` 设置命名空间（面板偏好、触发器偏好、宿主告警队列设置）
- 提供 HTTP 路由：
  - `GET /plugins/dock-flash/host-alerts` — 排空服务端推送告警队列
  - `POST /plugins/dock-flash/push-alert` — 向队列推送一条告警
  - `POST /plugins/dock-flash/clear-alerts` — 清空告警队列
  - `GET /plugins/dock-flash/health` — 轻量心跳 + Node.js 内存统计
  - `GET /plugins/dock-flash/profile-packages` — 配置清单，用于皮肤发现
  - `POST /plugins/dock-flash/set-plugin-entry` — 通过 patch 编辑实时启用/禁用插件

> **系统代理功能已迁至** [`dsh-flash-proxy`](https://github.com/tcgbp/dsh-flash-proxy) 插件 —— 代理模式、NO_PROXY 策略、`testUrl`、连接诊断及五个 `dsh-flash-proxy:*` QuickControl 开关现已在该插件中。

> **各监控项均为伴随插件。** 本包自身不包含任何监控：上下文监控在 `dsh-flash-ctx-mon`，
> 内存/GC 监控在 `dsh-flash-mem-mon`，网络审计在 `dsh-flash-net-mon`。每个插件拥有自己的设置命名空间，
> 通过 `dockFlashAlerts` 服务注册告警 provider、通过 `quickControl` 注册开关，因此会带着各自的 ⚙ 配置页
> 出现在本面板中。本包只保留共享告警注册表、宿主推送告警队列，以及让这些伴随插件告警显示
> 来源标签与配置链接的映射表。**它们是独立的安装项 —— 见 [安装](#安装)。**

## 结构

```
src/index.ts      HOST 半 — 设置命名空间 + 告警路由 + 配置清单（tsc → dist/）
lib/client.js     BROWSER 半 — quickControl 注册表 + 动态面板 + 皮肤系统 + i18n
cordis.patch.yml  bundle layer — 将宿主行插入 profile
```

> `cordis.patch.yml` 里的条目 id 保留为 `dock-flash`，而包名是 `dsh-flash`：条目 id 就是设置命名空间，保留它正是这次拆分无需迁移的原因。

## 核心契约

`lib/client.js` 发布两个服务：

| 发布项 | API | 用途 |
| --- | --- | --- |
| **面板服务** | `ctx.provide('dockFlashPanel', { version: 1, Panel, ErrorBoundary, Header, icon, registry, i18n, host })` | 宿主认领并挂载面板所需的全部内容。宿主找不到该服务、或其 `version` 不被识别时，会保留独立 ⚡，而不是画出半个面板 |
| **开关注册表** | `ctx.provide('quickControl', registry)` | 供其他插件注册自己的开关 |

面板服务暴露 `host.claim()` / `confirm()` / `release()`：未被确认的认领会被看门狗撤销，因此挂载中途死掉的宿主不会让 ⚡ 一直被抑制。

### 适配器额外提供了什么

dock-base（工作台）集成位于独立的 `dock-flash` v3 适配器中，通过 `ctx.workbench` 协作：

| 注册项 | API | 说明 |
| --- | --- | --- |
| 侧边栏面板 | `ctx.workbench.registerPanel()` | 快捷控制面板（sideBar 区域） |
| 插件入口 | `ctx.workbench.registerPlugin()` | 设置页卡片 |
| 活动栏图标 | `ctx.workbench.registerActivityBarItem()` | 闪电图标⚡，点击打开侧边栏 |
| 编辑器视图 | `ctx.workbench.registerEditorView()` | 快捷控制面板（可拖出为浮动窗口） |
| 命令 | `ctx.workbench.registerCommand()` | `dock-flash:openQuickControl` 命令 |

没有宿主认领面板时，本包进入独立模式：直接在 DOM 中注入悬浮⚡触发按钮和弹出面板，提供所有非布局类开关。

---

## 🧩 动态发现 API

本插件发布 `quickControl` 服务。其他插件通过 `ctx.get('quickControl')` 获取注册表并注册自己的快捷开关。

### 开关类型

| 类型 | 说明 | 必需字段 |
| --- | --- | --- |
| `toggle` | 布尔开关 | `getValue()`, `setValue(boolean)` |
| `slider` | 数值滑块 | `getValue()`, `setValue(number)`, `min`, `max`, `step` |
| `select` | 下拉选择 | `getValue()`, `setValue(any)`, `options` |
| `buttongroup` | 按钮组 | `getValue()`, `setValue(any)`, `options` |
| `action` | 操作按钮 | `run()` |
| `log` | 只读多行文本块 | `getLines()` |

### QuickSwitchDefinition

```ts
interface QuickSwitchOption {
  label: string | (() => string)
  value: any
}

interface QuickSwitchDefinition {
  /** 全局唯一 id，建议用 "插件名:开关名" 格式，如 "dock-git:show-stash" */
  id: string
  /** 显示标签（支持函数式 i18n） */
  label: string | (() => string)
  /** 图标（emoji 或文字） */
  icon?: string
  /** 开关类型 */
  type: 'toggle' | 'slider' | 'select' | 'buttongroup' | 'action' | 'log'
  /** 排序权重（升序），内置项用 10-60，建议从 100 开始 */
  order?: number
  /** 内置分组：'appearance' | 'layout' | 'system'（仅 dock-flash:* 内置项有效，第三方开关忽略此字段） */
  group?: string
  /**
   * 可选的簇标签。共享同一标签的开关会被画成一张卡片，并作为一个单位排序
   * （共用一组 ▲▼），簇内顺序固定为各自的 `order` 值。卡片默认只显示首行、
   * 处于折叠状态，成员可由用户用卡片底部居中的 ▼/▲ 展开。
   */
  cluster?: string

  // ── toggle / slider / select / buttongroup 通用 ──
  getValue?: () => any
  setValue?: (value: any) => void

  // ── slider 专用 ──
  min?: number
  max?: number
  step?: number
  formatLabel?: (value: number) => string

  // ── select / buttongroup 专用 ──
  options?: QuickSwitchOption[] | (() => QuickSwitchOption[])

  // ── action 专用 ──
  run?: () => void | Promise<void>
  actionLabel?: string
  /** 去掉标题列、按钮占满整行（按钮自带文案时用） */
  hideLabel?: boolean
}
```

### 注册示例

```js
// 在其他插件的 client.js factory 中：
exports.inject = ['quickControl']   // ← 声明服务依赖

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
      setValue: (v) => { myGitState.showStash = v },  // 只更新状态，面板自动处理 UI
    })
    return dispose  // 卸载时自动反注册
  }, 'dock-git: quick-control switch')
}
```

### 服务依赖声明

第三方插件必须声明对 `quickControl` 服务的依赖，确保本插件先完成注册再调用 `apply()`。在 client half 中添加 `exports.inject`：

```js
// client.js — factory 内
exports.inject = ['quickControl']   // ← 必须声明，否则服务可能尚未就绪
exports.apply = function (ctx) {
  const registry = ctx.get('quickControl')  // 服务已就绪，无需 null 检查
  // …
}
```

同时在 `package.json` 的 `dsh.client.inject` 中声明模块级依赖，确保本插件的 client 脚本先于你的插件加载：

```json
{
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime", "dsh-flash"]
    }
  }
}
```

> 这里要用**包名**（`dsh-flash`），而不是 `/client` 子路径 —— inject 查找不会去掉该后缀，写了也会被静默忽略。

### 动态值更新

如果开关的值在面板外部发生变化（如定时器、服务器推送、其他 UI 操作），调用 `registry.notifyChange(id)` 触发面板刷新：

```js
const registry = ctx.get('quickControl')
// 某个异步事件导致值变了
myGitState.showStash = true
registry?.notifyChange('dock-git:show-stash')
```

> **注意**：用户在面板中操作开关时，本插件会自动刷新该开关的 UI，无需手动调用 `notifyChange`。此方法仅在面板感知不到的外部值变化时使用。

### 变更日志

面板自动为每次用户交互（点击 toggle、拖动 slider、选择 option、点击 buttongroup / action 按钮）记录变更日志，在"最近修改"选项卡中展示（30 秒自动过期）。

**插件不需要手动调用 `_notifyChange`**。面板在渲染每个开关时已注入 `_notifyChange` 方法并在用户交互时自动调用。`setValue()` 只需更新内部状态：

```js
// ✅ 正确：setValue 只更新状态
setValue: (v) => { myState = v }

// ❌ 错误：不要在 setValue 中调用 _notifyChange（会产生重复记录）
setValue: (v) => { myState = v; sw._notifyChange?.('旧', '新') }
```

`_notifyChange(oldDisplay, newDisplay)` 仅在插件**主动**改变状态（非用户面板操作）且需要记录变更日志时使用，例如：

```js
// 定时器自动切换深色模式
setTimeout(() => {
  state.darkMode = true
  const sw = registry.getSwitches().find(s => s.id === 'my-plugin:auto-dark')
  sw?._notifyChange('浅色', '深色')
}, 3600000)
```

### 分组规则

面板采用可折叠选项卡布局：

- **工作台** *（滑杆图标）* — 内置开关（id 以 `dock-flash:` 开头），按 `group` 字段分为外观 / 布局 / 系统三个子组。被认领模式下「布局」子组为空、不渲染 —— 停靠布局属性全部由 dock-base 自己的设置负责。
- **扩展** *（方块图标）* — 第三方开关（id 不以 `dock-flash:` 开头），按 id 冒号前缀（即插件名）自动分子组
- **最近修改** *（文档图标）* — 最近 30 秒内的开关变更记录

判定规则：`id.startsWith('dock-flash:')` 为内置，否则为第三方。第三方开关的 `group` 字段在当前版本中被忽略，统一归入扩展标签页按来源插件分组。

三个标签的图形分别是面板自己的 `_ICON_PATHS` 里的 `sliders` / `blocks` / `doc`。**⚡ 闪电不是标签图标，而是产品标记**（`LIGHTNING_ICON`），由面板标题、活动栏、Settings 卡片与浮动窗口共用。

同组内按 `order` 升序排列。

### 精简面板 —— 双击 ⚡

**仅独立模式生效，而且只有双击这一个入口。** 精简模式下**会去掉面板标题**，而拖动手柄、关闭与失焦关闭按钮都保留，并自行限制宽度以保持窄列。它是**更窄、无边框、无滚动条，每行只留该开关的图标和它的控件本身** —— 没有标签文字、没有说明文字、没有分组与标签页文字，也不提供排序和可见性按钮。**两个连续的纯 toggle 项合占一行**；落单的那个仍占半行。它是一个偏好（`compactPanel`），跟随你的 profile 而不是本次会话，再双击一次即可恢复完整面板。单击的含义不变（开/关）—— 因为切换模式的是双击的**第二次**按下。

四条规则是有意为之，值得先知道：

- **工作台这一页完全不画标签头** —— 它的控件直接常显；因为没有头部，它也就不再可折叠（一个能折叠却没有地方展开的页，会把它的行永久藏起来）。
- **每个图标都会在自己身上带出这一行的名称**（tooltip）。**语言是唯一不画图标的一行**：它的控件本身写着「中文 / English」。
- **簇的主开关处于关闭状态时，整个簇都不显示**，连主开关自己也不显示；完整面板仍会列出它。
- **`log` 开关不画**；`action` 变成纯图标按钮，原有文字移入 tooltip。

`window.__dockFlashPanelOrder().compact` 会报告当前模式以及它隐藏了哪些簇。

### quickControl 服务 API

| 方法 | 说明 |
| --- | --- |
| `registerSwitch(def)` | 注册开关，返回 dispose 函数 |
| `unregisterSwitch(id)` | 按 id 反注册 |
| `getSwitches()` | 获取所有开关（按 order 升序） |
| `notifyChange(id)` | 通知开关值已变化，触发面板刷新 |
| `recordChange(entry)` | 记录一条变更日志 `{ id, label, icon, oldDisplay, newDisplay }` |
| `getChangelog()` | 获取最近 30 秒内的变更记录 |
| `subscribe(fn)` | 订阅注册表/值变化，返回 dispose 函数 |
| `version` | 当前注册表版本号（每次变更递增） |

---

## 🎨 皮肤系统

皮肤的发现与切换走 DSH **自己的插件管理器** —— 不需要、也不读取 dsh-market。

### 皮肤分类

| 分类 | 说明 | 示例 |
| --- | --- | --- |
| **CSS 皮肤** | 通过 `<style>` / `<link>` 标签 + body 属性激活 | maid-atelier、official-homepage |
| **托管皮肤** | 自带 canvas/WebGL/粒子等生命周期，通过 `mount()` / `unmount()` 切换 | Mineradio |
| **排除项** | 匹配发现规则但从下拉菜单中隐藏（冲突或外部控制不可靠），以及所有 timeline 插件 | bloom-theme、black-hole、theme-manager |

### 偏好持久化

皮肤选择、面板排序、独立模式的触发位置、入口按钮大小以及拖动后的悬浮位置都保存在**宿主设置命名空间**（配置目录 `settings.yaml` 里的 `dock-flash`），加载后自动恢复。`localStorage` 只作为缓存，因此这些偏好会跟着你换浏览器、换机器，而不是留在浏览器里。升级前只存在于 `localStorage` 的旧值，会在首次加载时一次性迁移进配置。

> 切换机制、排除原因、技术约束等实现细节见 [AGENTS.md](./AGENTS.md)。

---

## 🌐 国际化

面板内置中英文本地化，自动跟随 DSH 语言设置。第三方开关可使用函数式标签（`label: () => t('xxx')`）实现语言切换时动态刷新。

---

## 安装

需要 DSH Web 环境。这些包已发布在 npm 上，所以**包名本身就是完整的安装参数**，不需要先克隆仓库：

```sh
# 独立模式：只要面板核心
dsh plugin --profile my-profile add dsh-flash

# 工作台：适配器（会把 dsh-flash 一并拉入），外加 dock-base
dsh plugin --profile my-profile add dock-flash dock-base

# 启动 —— 或在安装任何新插件之后重启
dsh --profile my-profile
```

**没有宿主时**：本包以独立模式运行 —— ⚡ 触发按钮注入到 `trigger-position` 开关所选中的会话槽位（默认：输入框右侧），大小由 `trigger-size` 决定（默认 24px；槽位位置最大 48px，可拖动的「对话区右上角」位置最大 64px）。点击展开快捷控制浮动面板（外观、布局（触发位置与大小）、系统开关）。共享槽位 `sidebar.footer.action` 有意不提供，因为其他插件也占用它。

**安装适配器后**：`dock-flash@^3` 通过 `dockFlashPanel` 认领面板并集成到工作台 —— ⚡图标出现在活动栏，面板可作为侧边栏或浮动窗口打开，包含外观与系统开关。停靠布局属性（停靠边、自动隐藏、保留空间、图标缩放）在 dock-base 自己的设置里配置，不在这里。

### 配套插件

本包自身**不含任何监控**。上下文、内存、网络监控与系统代理控制各自拆成了独立包：

```sh
dsh plugin --profile my-profile add \
  dsh-flash-ctx-mon dsh-flash-mem-mon dsh-flash-net-mon dsh-flash-proxy
```

| 包 | 提供什么 |
|---|---|
| `dsh-flash-ctx-mon` | **上下文监控** —— 从 DSH 会话事件读取精确 token 用量，三档递进阈值与模型窗口映射，外加会话技能芯片 |
| `dsh-flash-mem-mon` | **内存 / GC 监控** —— RSS、增长率与 Major GC 频率 |
| `dsh-flash-net-mon` | **网络监控与出站审计** —— 连通性心跳，以及可选的 fetch 追踪（逐请求风险评分） |
| `dsh-flash-proxy` | **系统代理控制** —— 代理模式、`NO_PROXY` 策略、`testUrl` 与连接诊断 |

它们各自通过本面板的服务注册自己的开关、各自持有独立的设置命名空间，所以都以普通行的形式出现
—— 三个监控在**系统告警**簇里，代理是独立的一簇。请把它们与你所用的两个包之一一起安装；没装的
话面板里干脆没有那些行。

**其它安装方式**（如果不想走 npm）：GitHub Release 的 tarball
（`… add https://github.com/tcgbp/dsh-flash/releases/latest/download/dsh-flash.tgz`）、git
（`… add github:tcgbp/dsh-flash`）、或本地目录（`… add ./dsh-flash`，用于开发：`lib/client.js`
的改动能直接刷新生效）。DSH 的 **Plugins** 页面接受同样的包名，只是多一步：安装后按下
**立即启用**。

## 开发

```sh
pnpm install
pnpm run build      # tsc → dist/index.js
pnpm run typecheck  # 仅类型检查
pnpm run check:docs # 指令文件体积预算 + 链接解析
pnpm run check:overlay  # 浮层触发按钮行为检查
```

开发规则、关键约束与测试规范见 [AGENTS.md](./AGENTS.md)；各版本的改动内容与原因见 [CHANGELOG.md](./CHANGELOG.md)。

## 样式契约

本插件遵循 DSH Web 样式契约：全部颜色经 `--dsw-alias-*` 设计令牌引用（字面量仅作兜底），无按主题分支的 CSS 选择器。

## 依赖

| 依赖 | 类型 | 说明 |
| --- | --- | --- |
| `@deepseek-ai/schemastery` | dependency | Host 半的设置 schema |
| `@deepseek-ai/cordis` >=4.0.0-rc.1 <5.0.0-0 \|\| >=4.0.1-0 <5.0.0-0 | peer | 插件框架（DSH 自带） |

> 本核心包**不依赖 dock-base**。工作台集成及其 `dock-base` peer 位于独立的 `dock-flash` 适配器中。

## 许可证

[Apache License 2.0](./LICENSE)
