# dsh-html-render — DSH 聊天内联 HTML/LaTeX 渲染器

**让模型回复里的原始 HTML 直接"活"在聊天流里** —— 样式、本地交互脚本、KaTeX 数学公式完整渲染，无边框融入对话，深浅主题自适应，高度精确贴齐内容。

> 灵感与生态定位：[dsh-genui](https://github.com/omdsh-dev/dsh-genui) 把 `dsh-ui` 白名单组件渲染进聊天（"the model can't smuggle in HTML/scripts"）；本项目补上另一半——**渲染任意原始 HTML**（结构图 / 多卡讲义 / 计算卡 / 交互小部件 / 整页交付物），并原生支持 LaTeX 公式。两者栅栏语言不同（`dsh-ui` vs `dsh-html`），**可共存不冲突**。

---

## ✨ 特性

| 特性 | 说明 |
|---|---|
| **聊天内直渲** | 模型输出 ```` ```dsh-html ```` 围栏 → 聊天流内出现真 HTML（不是代码块、不是 Markdown 源码） |
| **LaTeX 公式** | `$…$`（行内）/ `$$…$$`（块级）/ `\(…\)` / `\[…\]` 由**本地 KaTeX** 预渲染 —— 零外网、绝不出现未渲染源码 |
| **无痕融入** | 无边框无底色；背景**实时采样宿主主题**（深色模式下就是深色），与对话流无缝 |
| **公式安全** | 公式替换前先摘除 HTML 标签与 script/style/pre/code 块 —— 公式绝不进代码；KaTeX 不可用时原文直出，**围栏永不卡死不渲染** |
| **高度精确自适应** | 按内容真实边界测高 + 字体就绪重测 + 轮询兜底（闲置自动降频）—— 无内部滚动条、无空白、无"越测越高"；超 12000px 上限时工具栏明示「高度已截断」 |
| **交互全支持** | 页签 / 折叠 / 滑杆 / 即时计算 / 本地判分 —— 脚本只在本围栏沙箱内运行 |
| **安全沙箱** | `sandbox="allow-scripts"` 不透明源 + 文档内 CSP：禁网络、禁 iframe、禁访问父页 |
| **零依赖** | 一个 ~30 KB IIFE（除 KaTeX 外无任何依赖、无构建步骤、无框架） |
| **流式渲染** | 模型边写边渲染，不必等整条回复结束 |

## 🚀 Quick Start（3 步，约 1 分钟）

**前置**：本地/自托管的 DSH 部署（npx 安装或源码构建）。

```powershell
# 1) 安装（幂等：自动探测 dist；已装则全部 SKIP）
#    Windows（PowerShell）：
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1
#    Windows / Linux / macOS（Node 18+，跨平台主安装器）：
node install.mjs
#    （npm 用户也可用脚本别名：npm run setup / setup:check / setup:undo）
#    源码构建请显式指定 dist：
#    node install.mjs --dist "C:\path\to\apps\web\dist"
#    多份 npx 部署共存时：加 --all 处理全部探测到的 dist

# 2) 浏览器硬刷新（Ctrl+F5）—— 前端壳对静态资源不设 cache-control，普通刷新可能仍用旧缓存。
#    注入标签携带版本号（client.js?v=N），client.js 升级后浏览器会自动拉新（缓存击穿）。

# 3) 在任意会话粘贴下面的测试围栏，看到卡片即成功
```

````markdown
```dsh-html
<div style="font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:6px 0">
<div style="border-left:4px solid #3b82f6;border-radius:10px;padding:12px 14px;background:rgba(128,128,128,.08)">
<b>渲染成功 ✓</b> —— 这是沙箱 iframe 内的真 HTML。
行内公式：$L_{10} = (C/P)^{\varepsilon}$；块级公式：
$$T = 9550 \times \frac{P}{n} \approx 10.2\ \mathrm{N\cdot m}$$
</div>
</div>
```
````

### ✅ Verify in 60 seconds

- 浏览器控制台（F12）输入 `window.__dshHtmlRenderer.stats()` → 应返回 `{version: <当前>，errors: 0, …}`（与 [CHANGELOG](CHANGELOG.md) 最新「运行时标记 version」一致）；
- 或运行安装状态检查：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Check
```

全部 `[OK]` 且 `HTTP: 200, served renderer version …` 与 [CHANGELOG](CHANGELOG.md) 最新版本一致，即安装完好。

## 📦 Examples

`examples/` 目录提供可直接粘贴到会话的压测围栏：

| 文件 | 覆盖能力 |
|---|---|
| `00-quick-test.md` | 最小卡片 + 行内/块级 LaTeX |
| `01-visual-effects.md` | 渐变动画、悬停浮起、流光进度条、SMIL 齿轮、流程图、时间线、表格高亮 |
| `02-interactive-widgets.md` | 页签、折叠、滑杆实时计算、开关、步进器、3 题本地判分 |
| `03-svg-and-latex.md` | SVG 受力图、齿轮啮合动画、对齐推导/分段函数/积分/矩阵公式全家桶 |

## 🔌 插件形态（P0-1，推荐）

v3.4.0 起提供 **out-of-tree profile bundle**（参照 dsh-genui 的官方插件机制）——一条命令安装，**DSH 升级（npx 覆盖 dist）后渲染不失效**，且向**所有会话**注入 dsh-html 围栏契约（systemPrompt 节）与打包 skill：

```sh
# 方式 A：npm 发布形态（仓库维护者先发布一次，见下；其他用户一条命令安装）
dsh plugin --profile web add dsh-html-render
# 方式 B：本地 link 形态（无需 npm，任何克隆/下载了仓库的用户都可用）
dsh plugin --profile web add link:<仓库绝对路径>/bundle
# 卸载
dsh plugin --profile web remove dsh-html-render
```

**发布（仅仓库维护者，一次性）**：`npm adduser` 登录后运行 `npm run publish:bundle`（发布前自动跑全套 check + 重建 bundle，再 `cd bundle && npm publish`；`dsh-html-render` 名称当前在 npm 上可用）。

- **Host 半边**：注册 `/plugins/dsh-html-render/assets/katex/*` 资产路由（引擎/字体插件自托管）+ systemPrompt 围栏契约节 + bundled skill；
- **Client 半边**：ModuleLoader 包装同一渲染内核，资产基座自动指向插件路由；
- 安装后需**重启 DSH host** 并刷新浏览器（boot 图谱带上新 client bundle）；
- 与磁盘补丁并存安全（`window.__dshHtmlRenderer` 版本守卫：同版本让位、仅升级替换，双形态任何加载顺序都恰好存活一个实例）；建议插件形态下执行 `node install.mjs --uninstall` 卸载磁盘补丁。

## 🔧 How it works

- **双通道**：通道一把 ```` ```dsh-html ````（及内容判定的 ```` ```html ````）代码块接管为沙箱 iframe；通道二把裸 `<div class="mdt">` 纯文本节点接管为**同一条沙箱 iframe 管线**（v5 起不再使用 innerHTML/shadow DOM 在父页面源解析）。宿主没接管到的围栏保持原样 —— **零侵入**。
- **为什么是磁盘补丁而不是动态插件**：DSH 部署中，承载 Web 壳（静态资源/3080 端口）的进程与承载会话/动态插件的进程不是同一个 —— 动态插件注册的 HTTP 路由对浏览器不可见（实测 404）。而 Web 壳每次请求从磁盘重读 `dist/index.html`，所以**改磁盘即热生效**。profile 插件化（`dsh plugin add` 形态）在 Roadmap 上。
- **KaTeX 父页预渲染**：公式在**父页面**用本地 KaTeX（`/dsh-html/katex/` 静态托管）转成数学 HTML，再连同内联 CSS（字体路径已改写为绝对路径）一次性注入 srcdoc —— 一次成型，测高准确；**iframe 内不执行任何 KaTeX 代码**。
- **测高策略**：`getBoundingClientRect().bottom` 内容边界（不受视口影响，杜绝 scrollHeight ≥ 视口导致的自激增长）+ `document.fonts.ready` 终态重测 + 400ms 轮询兜底（值不变不发包）。

## 🔒 安全模型

| 措施 | 效果 |
|---|---|
| `sandbox="allow-scripts"` + 不透明源 | 围栏脚本读不到父页 cookie/storage/DOM |
| 文档内 CSP meta | `default-src 'none'`；脚本仅 unsafe-inline 本地运行；**禁网络请求、禁内嵌 iframe、禁访问父页**；图片/字体可外链 |
| KaTeX 本地托管 | 引擎 + 字体全部同源静态文件，零外网；公式在父页预渲染 |
| 体积/高度上限 | 单围栏 ≤1MB；预览高度 ≤12000px |
| postMessage 白名单 | 仅高度测量消息（`kind:"dsh-html-height"`） |
| 渲染器自身 | 全 try/catch 不崩页面；`window.__dshHtmlRenderer` 守卫；控制台可 `__dshHtmlRenderer.disable()` 卸载 |

## 🧩 作用域：能力全局，行为随 skill

安装后，本 GUI 内**所有会话/工作区**自动获得渲染能力。但"模型何时主动输出 dsh-html"由行为层（skill）决定 —— 仓库附带通用模板 [`skills/dsh-html-usage/SKILL.md`](skills/dsh-html-usage/SKILL.md)（含 **5 种视觉风格库**：无痕卡 A / 驾驶舱 B / 工程蓝图 C / 杂志编辑 D / 终端 E）：把它放进你的 Agent 预设 `skills/` 目录或工作区，模型就学会了"何时写围栏、选哪种风格、限额多少"。

## 🗑️ 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Uninstall
```

从备份还原 `index.html` 并删除 `dist\dsh-html\`。`npx` 升级覆盖补丁后，重跑安装脚本即可恢复。

## ⚠️ 已知限制

- **沙箱能力白名单（内容侧）**：围栏脚本运行在不透明源 + CSP 中，可做 DOM/事件/计算等本地交互；**不可**发起网络请求、内嵌 iframe、访问 `parent`/`top`、`alert/confirm/prompt`、表单提交、`window.open`、`localStorage`、`download` 属性、弹窗与模态 —— 这些 API 会被静默阻断（模型写 `alert('正确！')` 不会弹窗，属预期）。
- **平台**：仅本地/自托管 DSH 部署（需要写 `dist` 的文件系统权限）；云端托管不可用。
- **升级**：`npx` 重装覆盖 dist 后渲染消失，重跑安装器即可恢复（备份机制保证可还原、可卸载）。
- **长会话**：每个渲染围栏是一个独立 iframe，历史消息较多时建议用 `__dshHtmlRenderer.disable()` 临时关闭渲染。
- **硬刷新**：前端壳对静态资源不设 cache-control，升级后必须 Ctrl+F5；注入标签带版本号（`client.js?v=N`），渲染器升级后浏览器自动拉新。
- **npm 脚本**：仓库内 `npm run setup / setup:check / setup:undo` 等价于 `node install.mjs [--check/--uninstall]`；`npm run check`（语法+版本+校验和+A1 守卫）、`npm run lint`（ESLint）、`npm test`（纯函数单测）。
- **浏览器支持矩阵**：Chromium 120+ / Firefox 121+ / Safari 17.5+（依赖 `light-dark()`、`backdrop-filter`、`ResizeObserver`、`:focus-within`）。
- **端口探测**：安装器的 HTTP 自检默认 `3080`，可用环境变量 `DSH_WEB_PORT` 覆盖，或 `install.mjs --port <n>`。

## ❓ FAQ

- **围栏还是显示成代码块？** 先 Ctrl+F5 硬刷新；控制台查 `window.__dshHtmlRenderer` 是否存在；再跑 `-Check`。
- **公式显示为 `$…$` 源码？** 其余内容仍会渲染（v3.1 起公式通道失败自动降级、围栏不卡死）。这是 KaTeX 缺失 —— 确认 `vendor\katex\` 与安装器在同目录并重跑安装；浏览器访问 `http://127.0.0.1:3080/dsh-html/katex/katex.min.js` 应返回 200。
- **DSH 升级后渲染没了？** npx 缓存被覆盖，属预期 —— 重跑安装脚本（备份机制保证 index.html 可还原）。
- **云端托管部署能用吗？** 不能。需要写 `dist` 目录的文件系统权限；仅限本地/自托管部署。
- **与 dsh-genui 冲突吗？** 不冲突：它接管 `dsh-ui` 栅栏，本项目接管 `dsh-html`/`html`，语言互斥，可同时安装。
- **深色模式出现白块/空白/越拉越长？** v3 已修复（主题采样 + 内容边界测高）；更新 client.js 并硬刷新。

## 🗺️ Roadmap

- [ ] profile 插件化（`dsh plugin --profile web add` 一条命令安装，升级免重装）
- [ ] MathJax 可选引擎 / 每围栏主题覆写
- [ ] 向上游 DSH 提交 fence-registry 提案，转正为官方能力

## 🙏 致谢 & License

- [dsh-genui](https://github.com/omdsh-dev/dsh-genui) —— 栅栏渲染生态的开创者与本项目的发布形态参考
- [KaTeX](https://github.com/KaTeX/KaTeX) —— 公式引擎（MIT，见 `vendor/katex/LICENSE`）

本项目以 **MIT** 许可发布（见 [LICENSE](LICENSE)）。

---

## English Quick Start

```powershell
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1   # auto-detects the npx-cache dist
# Ctrl+F5 the DSH web GUI, then paste a ```dsh-html fence in any chat — it renders inline.
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Check      # status
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Uninstall  # remove
```

Local/self-hosted DSH deployments only (needs write access to the web `dist`). The model writes ```dsh-html fences; styles, local scripts and KaTeX math render inline with no borders, correct height, and no network access from the sandbox. MIT licensed.
