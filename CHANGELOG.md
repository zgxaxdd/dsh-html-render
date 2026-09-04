# Changelog

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
