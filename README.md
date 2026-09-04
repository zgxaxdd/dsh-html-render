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
| **高度精确自适应** | 按内容真实边界测高 + 字体就绪重测 + 轮询兜底 —— 无内部滚动条、无空白、无"越测越高" |
| **交互全支持** | 页签 / 折叠 / 滑杆 / 即时计算 / 本地判分 —— 脚本只在本围栏沙箱内运行 |
| **安全沙箱** | `sandbox="allow-scripts"` 不透明源 + 文档内 CSP：禁网络、禁 iframe、禁访问父页 |
| **零依赖** | 一个 ~28KB IIFE（除 KaTeX 外无任何依赖、无构建步骤、无框架） |
| **流式渲染** | 模型边写边渲染，不必等整条回复结束 |

## 🚀 Quick Start（3 步，约 1 分钟）

**前置**：本地/自托管的 DSH 部署（npx 安装或源码构建），Windows + PowerShell。

```powershell
# 1) 安装（幂等：自动探测 npx 缓存里的 dist；已装则全部 SKIP）
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1
#    源码构建请显式指定 dist：
#    powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Dist "C:\path\to\apps\web\dist"

# 2) 浏览器硬刷新（Ctrl+F5）—— 前端壳对静态资源不设 cache-control，普通刷新可能仍用旧缓存

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

- 浏览器控制台（F12）输入 `window.__dshHtmlRenderer` → 应显示 `{version: 3, …}`；
- 或运行安装状态检查：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Check
```

全部 `[OK]` 且 `HTTP: 200, served renderer version 3` 即安装完好。

## 📦 Examples

`examples/` 目录提供可直接粘贴到会话的压测围栏：

| 文件 | 覆盖能力 |
|---|---|
| `00-quick-test.md` | 最小卡片 + 行内/块级 LaTeX |
| `01-visual-effects.md` | 渐变动画、悬停浮起、流光进度条、SMIL 齿轮、流程图、时间线、表格高亮 |
| `02-interactive-widgets.md` | 页签、折叠、滑杆实时计算、开关、步进器、3 题本地判分 |
| `03-svg-and-latex.md` | SVG 受力图、齿轮啮合动画、对齐推导/分段函数/积分/矩阵公式全家桶 |

## 🔧 How it works

- **双通道**：通道一把 ```` ```dsh-html ````（及内容判定的 ```` ```html ````）代码块接管为沙箱 iframe；通道二把裸 `<div class="mdt">` 纯文本节点做 shadow DOM 静态渲染（旧协议兜底）。宿主没接管到的围栏保持原样 —— **零侵入**。
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

安装后，本 GUI 内**所有会话/工作区**自动获得渲染能力。但"模型何时主动输出 dsh-html"由行为层（skill）决定 —— 仓库附带通用模板 [`skills/dsh-html-usage/SKILL.md`](skills/dsh-html-usage/SKILL.md)：把它放进你的 Agent 预设 `skills/` 目录或工作区，模型就学会了"何时写围栏、怎么排版、限额多少"。

## 🗑️ 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install-dsh-html.ps1 -Uninstall
```

从备份还原 `index.html` 并删除 `dist\dsh-html\`。`npx` 升级覆盖补丁后，重跑安装脚本即可恢复。

## ❓ FAQ

- **围栏还是显示成代码块？** 先 Ctrl+F5 硬刷新；控制台查 `window.__dshHtmlRenderer` 是否存在；再跑 `-Check`。
- **公式显示为 `$…$` 源码？** KaTeX 缺失 —— 确认 `vendor\katex\` 与安装器在同目录并重跑安装；浏览器访问 `http://127.0.0.1:3080/dsh-html/katex/katex.min.js` 应返回 200。
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
