# Handoff — 核心/适配器拆分交接（Phase 1–4 已完成，发布门未过）

> 写于 2026-10（本次会话更新）。本文件是**交接文件**：供新会话接手，不必依赖上一会话的对话历史。
> 计划与决策全文在 [refactor-plan-core-adapter-split.md](refactor-plan-core-adapter-split.md)。
> 文件名沿用早期的 `handoff-phase1`，实为**拆分全程的单一交接入口**——待拆分全部发布尘埃落定后删除。

## 0. 一句话状态

core/adapter **反转拆分已完成代码与仓库层**：核心进 `tcgbp/dsh-flash`（v1.0.0），本仓库瘦身为 dock 适配器（dock-flash v3.0.0）。两个核心仓库已 `tag`、已推送 Gitee（`master` 与 `origin/master` 同 commit），四同伴 peer 已改指 `dsh-flash`。**所有待办都压在发布门之后**（npm、tag→GitHub、市场 PR），均需维护者确认。

## 1. 目标与已定方案（D1–D5，全部定案，勿重新推导）

**反转拆分**：核心 `dsh-flash`（对 dock 零依赖，永远提供独立 ⚡ 与面板）+ 适配器 `dock-flash`（依赖核心；`dock-base` 为**不可选 peer**）。

- **D1 = M1**：设置命名空间 = profile patch 的 **entry id** ⇒ 核心 entry 保留 `id: dock-flash`，零迁移；entry id **必须显式写死**（loader 省略时用 `Math.random().toString(16).slice(2,10)` 生成）。
- **D2 = L2**：核心进新仓库 `tcgbp/dsh-flash`，本仓库瘦身为适配器（注册表"一仓一条目"，npm 名→条目映射取自已发布包自己的 `repository` 字段）。
- **D3**：拆分过渡期照发 `dock-flash@2.3.0`（已完成）再进 split。
- **D4**：适配器对 `dock-base` 用**不可选 peer**。
- **D5 = 核心保留自己的 `dsh.bundle` + 两半侧幂等**（实测：`insert` 不按 id 去重；同一插件挂两次会 `apply` 两次，第二次 `ctx.provide` 抛 `service "…" has been registered at …`）。

## 2. 仓库现状（已核实，2026-10 本次会话实测）

同级 `C:\codes\ai-test\` 目录（**qc-demo 已删除，不再存在**）：

| 仓库 | 角色 | 版本 | 最新 tag | 推送 | 工作区 |
|---|---|---|---|---|---|
| `dsh-flash` | 面板核心（对 dock 零依赖） | 1.0.0 | v1.0.0 | Gitee ✓ 同 commit | clean |
| `dock-flash` | dock-base 适配器 | 3.0.0 | v3.0.0 | Gitee ✓ 同 commit | clean |
| `dsh-flash-ctx-mon` | 上下文监控 provider | 0.1.8 | v0.1.8 | 已 tag | clean |
| `dsh-flash-mem-mon` | 内存/GC 监控 | 0.1.5 | v0.1.5 | 已 tag | clean |
| `dsh-flash-net-mon` | 网络审计 provider | 0.2.0 | v0.2.0 | 已 tag | clean |
| `dsh-flash-proxy` | 系统代理 | 0.1.5 | v0.1.5 | 已 tag | clean |
| `scm-deck` | 服务治理平台（**无关**） | 1.0.0 | — | — | — |
| `dsh-0-tools` | DSH 工具套件（**无关**） | 1.13.0 | — | — | — |

> `scm-deck`、`dsh-0-tools` 与 dsh-flash 生态无关，只是同目录；注意 `dsh-0-tools` 的 `package.json` 是 GBK/emoji 编码，`ConvertFrom-Json` 会炸，读它要指定 UTF-8。
>
> 四同伴的 `remote` 有 Gitee/GitHub 混指（ctx-mon、proxy 指 GitHub，mem-mon、net-mon 指 Gitee）——发布流程会用到，重指 peer 前先核对`git remote -v`。

## 3. 已完成（Phase 1–4 全部代码 + 文档 + 推送）

**Phase 1（就地抽出，单包）**
- [x] `Header` 组件（`createPanelHeader`）封装 7 个核心内部符号，顺带修掉 header 把 workbench 服务当 registry 传、`notifyChange` 抛进 try/catch 的 wart
- [x] `ctx.provide('dockFlashPanel', …)` + 重复 apply 守卫（`ctx.get('dockFlashPanel')` 存在即 return）
- [x] 核心"默认挂载 ⚡ + `isClaimed()` 判断"；适配器 `claim()/release()`
- [x] `check:overlay` 第 28 节：真值表 5 行 + 契约字段 + 认领看门狗
- [x] `dock-flash@2.3.0` 发布（已完成，非本次现状）

**Phase 2（拆包 L2：核心进新仓库，本仓库瘦身为适配器）**
- [x] 新建 `tcgbp/dsh-flash`（Gitee + GitHub 镜像 + `sync-from-gitee.yml`），树复制并保留历史，`repository` 指新仓库
- [x] 核心侧 `cordis.patch.yml` 保留 `id: dock-flash`（D1=M1）
- [x] 适配器 `dependencies: { "dsh-flash": "^1.0.0" }`、peer `dock-base` 不可选、`dsh.client.inject` 加 `dsh-flash`、patch 插两行（见 §4）
- [x] 两包各自 `check` / `pack --dry-run` 通过，**互不包含对方代码**
- [ ] **发布顺序**（gate，等维护者）：`dsh-flash@1.0.0 --tag next` → `dock-flash@3.0.0 --tag next` → 验证 → `dist-tag` 提升 latest

**Phase 3（同伴重指）**
- [x] 四同伴 peer 由 `dock-flash` 改指 `dsh-flash`（**代码已改**，经实测 peer 已是 `dsh-flash ">=1.0.0-0 <2.0.0-0"`）
- [ ] 各自发布 + tag + Release + 市场条目（gate，等维护者）

**Phase 4（身份整理）**
- [x] 两个仓库 README（中英）架构图、"`^2` 用户怎么办"升级指引
- [x] 两个仓库的 `AGENTS.md` 各自重写为适配器/核心口径（核心 63699B / headroom 1837；适配器 274 行 / 15047B），`check:docs` 通过
- [x] 市场条目：核心 `tcgbp__dsh-flash.yml` 新增；适配器 `tcgbp__dock-flash.yml` 改"dock 适配器"措辞
- [ ] 市场条目**需要 registry PR 刷新合并描述**（需用户 GitHub 账号）

## 4. 关键技术约束（勿重新推导）

- **cordis 服务解析是异步的**：`ctx.provide('dockFlashPanel', …)` 后**同一同步调用栈**里 `ctx.get('dockFlashPanel')` 返回 `undefined`。因此服务必须**显式传参**：`mountDockPanelAdapter(ctx, panelArg)`。
- **客户端 bundle 的同步 `require` 不支持相对路径**（只认 seed 词/已 materialize 模块/已注册工厂，否则抛 `require("…") missed the module table`；只有 `require.async('./client.<name>.js')`）。
- **装载机制**：profile `node_modules` 是 `nodeLinker: hoisted`；只有 profile `dependencies` 里且自己声明 `dsh.bundle` 的包才进 `dsh.profile.bundles` 并贡献 patch 层；客户端半侧只挂在"说明符恰为裸包名"的那一行 entry 上 ⇒ 适配器的 patch 必须**同时插入核心那一行**，否则核心"装上但没被组合"→ 一片空白且无报错。拿不到服务时**必须大声报错**。
- **`autoInstallPeers: false`** ⇒ 核心不能走 peer，必须普通 `dependencies`。
- **`insert` 不按 id 去重**：两层 patch 若都插同一行会各插一条 ⇒ 核心保留自己的 `dsh.bundle` 且两半侧幂等。

适配器 `cordis.patch.yml`（正确形态，勿改）：
```yaml
- insert:
    - id: dock-flash          # 核心（包名 dsh-flash）；id 即设置命名空间，必须保留
      name: dsh-flash
    - id: dock-flash-adapter  # 本适配器（包名 dock-flash）
      name: dock-flash
```

## 5. 剩余待办（全部在发布门之后，需维护者批准）

1. **核心/适配器发布**：`dsh-flash@1.0.0 --tag next` → `dock-flash@3.0.0 --tag next` → 真机验证 → 各 `dist-tag` 提升 latest。npm 不可 unpublish（GAT 403，只能 `deprecate`）。
2. **同伴发布**：四仓库各自 `npm publish --tag next` + `dist-tag` + GitHub Release + 市场条目。
3. **市场条目 PR**：核心 `tcgbp__dsh-flash.yml` 新增、适配器描述刷新，都需 registry PR（用户 GitHub 账号）。
4. **npm `0.0.0-stage` 占位版本清理**：需用户在 npm 网页端操作（GAT 跑不了这个）。
5. **真实界面复验**：dock-base profile 硬刷新后确认面板出现、隐藏↔恢复循环、失焦关闭开关联动（agent 无浏览器截图通道，`/plugins/...` 只能 curl 比对内容，界面渲染需人眼）。

## 6. checked-in 的改进方向（待确认后处理，非本次改动）

- **companion peer 里 `dock-base` 疑似残留**：ctx/mem/net-mon 的 peerDependencies 仍带 `dock-base`，但新架构下它们只消费 dsh-flash 的 `quickControl`/`dockFlashAlerts`，不必然依赖 dock-base。改指 peer 时复核是否该去掉（注意不要破坏装载，见 §4 `autoInstallPeers: false`）。
- **版本口径不一致**：`dsh-flash-net-mon` 已是 0.2.0，但 plan Phase 3 记录 0.1.4；ctx-mon 0.1.8 vs 计划 0.1.7。版本推进与计划文档需对齐一次。
- **companion 无 CHANGELOG**：四个同伴都没有 `CHANGELOG.md`，版本记录只在 git tag。可考虑补齐以对齐 dsh-flash 的发布纪律。

## 7. 环境与工具配方

- 启动 profile：`node "C:/Users/ThinkPad/.dsh-versions/dsh-0.2.0-rc.2/node_modules/@deepseek-ai/dsh/lib/bin.js" <profile> --no-open --port <N>`。
- DSH web 需要 token：先 `curl -L -c jar "http://127.0.0.1:<port>/?token=<token>"`，再 `curl -b jar` 取 `/plugins/...`；HTML 里的 `&amp;` 要还原成 `&`。
- GitHub API 凭据：`git credential fill`（`protocol=https` / `host=github.com`）取 token，**勿回显**；镜像 dispatch 用 `api.github.com/repos/tcgbp/<repo>/actions/workflows/sync-from-gitee.yml/dispatches`（body `{"ref":"master"}`，期望 HTTP 204）。
- 校验镜像：比较 API `/repos/tcgbp/<repo>/commits/master` 的 `commit.tree.sha` 与本地 `git rev-parse master^{tree}`。
- Windows Python 读 curl 落的 JSON 必须 `encoding='utf-8'`（默认 GBK 会 `UnicodeDecodeError`）；MSYS 的 `/tmp` 不是 Windows 路径，落盘用仓库内 `_*.json`（已被 `.gitignore` 覆盖）。

Open objectives: 发布门全流程（§5 的 1–3）；`dock-flash-qc-demo` 已删除，不需要再处理；npm 清理与界面复验需用户。