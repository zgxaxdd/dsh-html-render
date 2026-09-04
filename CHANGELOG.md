# Changelog

## v3.4.0 — P0-1 插件化：out-of-tree profile bundle + 主题即时跟随（运行时标记 version: 7）

**P0-1 · 双形态发布（本次核心）**
- 新增 `tools/build-bundle.mjs`：从内核 + vendor + skill 组装 out-of-tree profile bundle（`bundle/`）。
- **Host 半边**（`bundle/lib/index.js`，参照 dsh-genui 模式）：
  - `webServer.register({kind:"prefix"})` 注册插件自有资产路由 `/plugins/dsh-html-render/assets/katex/*`（KaTeX 引擎/字体由插件目录托管，**DSH 升级不再使其失效**）；
  - `systemPrompt.section({name:"dsh-html:fence", order:106})` 向**所有会话**注入 dsh-html 围栏契约（全局行为，不再依赖分区 SKILL.md）；
  - `skills.registerProvider` 打包 `skills/dsh-html-usage/SKILL.md`（bundled skill）。
- **Client 半边**（`bundle/lib/client.js`）：`window.__ModuleLoader__.load` 包装渲染内核 + 预设 `window.__dshHtmlAssetsBase` 指向插件路由；`dsh.client: {inject: [], platform: "web"}`。
- 安装/卸载：`dsh plugin --profile web add dsh-html-render`（本地 `link:` 形态已在本机验证注册成功，`dsh plugin list` 可见）；与磁盘补丁形态由 `window.__dshHtmlRenderer` 版本守卫互斥（双形态并存安全）。
- 内核配套：`ASSETS_BASE = window.__dshHtmlAssetsBase || '/dsh-html/katex/'` —— 两种形态共用同一内核，资产来源按形态自动切换。

**P1-3 · 主题即时跟随（替代 10s TTL）**
- `matchMedia('(prefers-color-scheme: dark)')` change + `documentElement` 属性观察（class/style/data-theme）→ 立即失效调色板 → 全量重渲染已挂载围栏 + 按缓存原文重建通道二片段。深浅切换 0 延迟。

**其他**
- `package.json` 增加 `build:bundle` 脚本与 `bundle/` 产物；检查链覆盖 bundle 语法。
- 本机验证：`dsh plugin --profile web list` 可见 `dsh-html-render@link:...`；符号链接指向 bundle 目录。
- **待用户操作**：重启 DSH host（激活资产路由/systemPrompt/skill 三项 host 半边注册）+ 浏览器重载（boot 图谱带新 client bundle）。

## v3.3.0 — 审查修复 N1–N7：缓存击穿/泄漏/bfcache/工程护栏（运行时标记 version: 6）

**核心修复：缓存击穿（“功能无法使用”根治）**
- 注入标签携带 client 版本号：`<script src="/dsh-html/client.js?v=6" defer>` —— client.js 升级后浏览器强制拉新，杜绝旧版（含 A1/A2 致命 bug 的 v4）长期驻留缓存。安装器在 apply 时自动升级旧标签（无 ?v → 当前版本）；卸载用正则兼容两种形态。

**N1 · vendor 完整性（跨平台根治）**
- 新增 `.gitattributes`（`vendor/** -text`、文本统一 eol）—— 此前审查者机器上 SHA256SUMS 不匹配的根因是 git 行尾归一化（autocrlf），非文件被改。
- `SHA256SUMS` 改由 Node 同源脚本 `tools/gen-sha256sums.mjs` 生成（24 项，含 VERSION）。
- `verify-sha256sums.mjs` 升级为**双向校验**（清单内文件存在 + 目录内文件全在清单，防删除）+ 不匹配时打印期望/实际值。

**N2 · liveFrames 泄漏**
- 通道二片段 iframe 的 liveFrames 条目在孤儿清理时同步 `delete`（`wrap._dshFrameId` 关联）；新增 `liveFramesAdd()` 容量上限 200（先淘汰已断连，再兜底最旧），泄漏封顶。

**N3 · bfcache 回归**
- 移除 `pagehide` 全量 `disable()` —— 该监听命中前进/后退缓存恢复路径，导致“后退回来渲染器停摆、围栏永久退回代码块”。页面真销毁时浏览器自会回收。

**N4 · npm install 劫持**
- `package.json` 的 `install` 脚本改名 `setup / setup:check / setup:undo` —— 在仓库里 `npm install` 不再意外运行 DSH 安装器。

**N5 · 样式版本化**
- `STYLE_ID = 'dsh-html-style-v' + VERSION`，旧版残留时先移除再注入，避免新 CSS 规则（focus-visible/reduced-motion/disabled）缺失。

**N6 · 通道二语义**
- iframe title 改为「dsh-html 卡片」，注释说明允许脚本的兼容性考量（仍受不透明源 + CSP 约束）。

**N7 · install.mjs 细节**
- `--dist` 指向无 index.html 的目录时显式报错（不再静默“未定位”）；候选路径去重；补 `pnpm root -g` 探测；`--port` 参数校验；UTF-16LE 无 BOM 启发式识别；`atomicWrite` 短重试循环。

**G3 · 工程护栏（防 A1 类回归）**
- 引入 ESLint 9 flat config（`no-undef` 直接拦 A1 类作用域误用、`no-unused-vars`、`no-empty` 允许有意空 catch）—— CI + `npm run lint`。
- 纯函数单测 `tools/test-unit.mjs`（node:test + 从源码提取函数体执行，零依赖）：hasLatex / A3 结构化判定 / safeColor 白名单 / helperScript 常量注入 —— CI `npm test`。
- `tools/check-mount-refs.mjs`：A1 静态守卫（无 `mountObj`、`var mount = {` 存在、三个按钮模式在位）—— CI + `npm run check`。
- 修复 ESLint 捕获的真实问题：`install.mjs` 未用 import `statSync`。

**部署**：client.js v6（35773 字节）已同步，index.html 标签升级为 `?v=6`，HTTP 探测 renderer v6。

## v3.2.0 — 审查修复：工具栏按钮/通道二沙箱/安全加固/性能（运行时标记 version: 5）

对照 2026-09 深度审查（A/B/C/D/E/F/G 清单）修复：

**功能与正确性**
- 修 **A1（严重）**：工具栏「源码 / 复制 / 重载」三个按钮引用未定义变量 `mount`（此前仅「新标签打开」正确）—— 挂载对象统一命名，三按钮恢复正常。
- 修 **A2（严重）+ B1（安全）**：通道二（裸 mdt 片段）弃用 shadow DOM + `innerHTML`（在父页面源解析 = 沙箱完全绕过），改为**与通道一相同的沙箱 iframe 管线**。
- 修 **A4**：`_enriching` 期间被吞的更新登记 `_pending` 并补渲染，不再丢帧。
- 修 **A5**：流式异常中断（宿主不移除 `data-streaming`）超 30s 强制视为 settled；重载按钮不再永久 disabled。
- 修 **A6**：公式渲染失败时保留完整 `$…$` 定界符（不再裸文本）。
- 修 **A7**：超 1MB 围栏的仅源码容器纳入 `mounts` 生命周期（可被重钉/清理）。
- 删 **A8** 死代码：`hasLabel`、`rowOf`、空 if 分支、未用形参。

**安全**
- 修 **B2**：「新标签打开」使用含 `sandbox allow-scripts` 指令的专属 CSP —— 顶层文档也变不透明源（blob URL 不再继承父源）。
- 修 **B3**：postMessage 带 mount id，O(1) 定位 + `ev.source` 校验。
- 修 **B4**：KaTeX 显式 `maxExpand/maxSize` + 单条公式长度/单围栏数量上限 + 结果缓存。
- 修 **B5**：注入 iframe 的主题色经 `safeColor` 白名单校验。
- **B6**：`vendor/katex/VERSION` + `SHA256SUMS`，CI 校验供应链完整性。

**性能**
- **C2**：iframe 内测高轮询自适应 —— 10s 无变化后 400ms → 2000ms 降频，变化即恢复。
- **C3**：KaTeX 结果 LRU 缓存（流式重复渲染直接命中）。
- **C5**：去掉 `Array.from(mounts.entries())` 拷贝。
- **C7**：主题采样 TTL 2s → 10s。

**健壮性**
- **D1**：KaTeX/CSS 加载失败指数退避重试（≤3 次）+ `resetKatex()` 手动复位，不再页面级永久降级。
- **D2**：公式占位符改用 U+E000 私有区 + 随机前缀，还原带越界校验。
- **D4**：片段孤儿清理简化。**D5**：iframe error 监听提前注册 + 可见提示。**D6**：blob 回收 60s → 5min。**D7**：异常计入 `stats().errors`，可开 `debug`。**D8**：单一 `VERSION` 常量 + 旧版自动 disable 替换。**D9**：pagehide 统一清理。**D10**：aria-label / focus-visible / prefers-reduced-motion。**D11**：复制失败反馈 + `execCommand` 兜底。

**工程化**
- **E1**：新增跨平台 Node 安装器 `install.mjs`（Windows/Linux/macOS，npm/pnpm/bun/全局路径探测，`--dist/--check/--uninstall/--all/--port`）；PowerShell 脚本保留为 Windows 封装。
- **E3/E4**：PS 注入改为定位**最后一个** `</body>`（大小写不敏感）+ 临时文件原子替换。
- **E5**：卸载时若 dist 已被升级重部署，丢弃过期备份防降级。
- **F2**：`MAX/PAD` 常量注入 iframe 脚本，消除魔法数字双写。**F3/G2**：`tools/check-version.mjs` CI 强制 client ↔ CHANGELOG ↔ README 版本一致。**F6**：移除含本机绝对路径的 `archive/host-plugin.js`。
- **G1**：README 特性表损坏行修复。**G4**：新增 SECURITY.md / CONTRIBUTING.md / .gitignore / package.json。**G5/G6**：README 补充沙箱能力白名单 + 已知限制 + 浏览器矩阵 + 端口说明。

**本轮未做（诚实记录，留待后续）**：C1/C4 增量扫描、C6 CSS 外链化、D3 DOM 手术绝对定位、G3 完整测试套件（ESLint/单测/e2e）、E7 `-WhatIf`。

## v3.1.0 — 公式安全 + 降级兜底 + 截断指示（运行时标记 version: 4）

- **修复严重 bug**：KaTeX 加载失败（vendor 缺失/404）时原失败路径不回调 → `enrichRaw` 永久挂起 → **整个围栏永远不渲染**。现在失败走降级回调：原文直出，围栏永不卡死。
- **公式安全**：替换前把 HTML 标签与 `script`/`style`/`pre`/`code` 块摘成占位符 —— 公式绝不进标签内部、属性值与代码（此前用户脚本里的 `$…$` 字符串会被改写成 KaTeX HTML 而损坏脚本）；行内 `$` 内容含 CJK 视为普通文本（防"价格$5(约$720)"误判）。
- **截断指示**：内容超 12000px 上限不再静默 —— helper 上报完整高度，工具栏显示「高度已截断」。
- **安全**：「新标签打开」改用 `noopener`（新页拿不到 `window.opener`）+ 60s 延迟回收 blob。
- 安装器 v2：`-All` 处理全部探测到的 dist；**升级安全的备份** —— dist 被重新部署后（index.html 换新且无注入）自动刷新备份，`-Uninstall` 永不降级。
- a11y：iframe 补 `title`；新增 `__dshHtmlRenderer.stats()` 运行时诊断。
- CI：GitHub Actions（renderer 语法 + 安装器解析 + vendor 完整性）。

## v3.0.0 — KaTeX 公式 + 真无痕 + 测高修复

- **公式通道**：围栏内 `$…$`（行内）/ `$$…$$`（块级）/ `\(…\)` / `\[…\]` 由**父页 KaTeX**（本地 `vendor/katex/`，零外网）预渲染为数学 HTML 后整体注入沙箱 —— 一次成型、高度准确、绝不出现未渲染源码；KaTeX 就绪前暂缓挂载。
- **真无痕**：iframe 背景不再写死，改为**采样宿主对话区实际背景色/文字色**注入（每 2s 重采样，深浅主题自动跟随），深色模式不再露白底。
- **测高修复**：高度测量从 `scrollHeight`（会被视口撑大 → 自激增长）改为**内容边界** `getBoundingClientRect().bottom` —— 内容 300px 永远 ~308px，杜绝"窗口不断向下延深"。
- iframe 内测高脚本：`document.fonts.ready` 终态重测 + 400ms 轮询兜底（高度不变不发包）。
- 修复「新标签打开」按钮的隐藏 bug（未定义变量引用被 catch 吞掉）。
- CSP：`font-src` 放宽到 `http/https`（KaTeX 字体同源加载所需）。

## v2.0.0 — 无痕融入 + 全局化

- 无边框、无底色，直接融入对话流；工具栏（源码/新标签/复制/重载）仅悬停浮现。
- 从会话级动态插件改为**页面级磁盘注入**（dist/index.html + 静态资源），对本部署 GUI 内所有会话/工作区生效。
- 幂等安装脚本（自动探测 npx 缓存 dist、一次性备份、注入标签防重）。

## v1.0.0 — 初始双通道渲染器

- 通道一：```dsh-html 围栏（及内容判定的 ```html）→ 沙箱 iframe（srcdoc + `sandbox="allow-scripts"` + 文档内 CSP），样式/脚本/交互完整运行。
- 通道二：裸 `<div class="mdt">` 文本节点 → shadow DOM 静态渲染（旧协议兜底）。
- postMessage 高度自适应、1MB/12000px 上限、零依赖 IIFE、全 try/catch。
