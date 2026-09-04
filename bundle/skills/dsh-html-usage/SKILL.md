---
name: dsh-html-usage
description: 当回复内容用纯文字难以表达时（结构图/流程图、多卡讲义、对照大表、计算卡、交互小部件、整页交付物），主动生成 ```dsh-html 围栏 —— 由渲染器在聊天窗口内直接渲染为真 HTML（样式/本地脚本/KaTeX 公式全支持，无边框融入对话流）。普通问答、短答、公式推导仍用正常 Markdown，避免滥用。
---

# dsh-html 内联 HTML 输出协议

本技能约定"何时输出 dsh-html 围栏、怎么写"。渲染能力由部署级的 dsh-html 渲染器提供（页面级全局，无需在本技能内配置）。

## 通道判定

1. **特殊回合分流**：问答卡/测验类回合优先用平台原生交互组件；短答/追问/过渡（≤10 行内容）→ 纯 Markdown；公式推导 → Markdown `$$…$$`。
2. **其余按内容形状触发，命中即用、无需犹豫**：

| 内容形状 | 通道 | 备注 |
|---|---|---|
| 小表 / 2~4 步流程 / 单卡 / 清单 | Markdown 或平台原生组件 | 简单结构的第一选择 |
| 多卡讲义（≥4 联彩卡）/ 复习总表 | **dsh-html 围栏** | 富样式讲义 |
| 流程图 / 结构图 / SVG 示意图 | **dsh-html 围栏**（CSS 色块或内联 SVG） | 禁 ASCII 字符画 |
| 对照大表（≥15 行、多级表头） | **dsh-html 围栏** | 同一数据不双通道 |
| 步骤编号计算卡 | **dsh-html 围栏**（步骤圆号 + `<mark>` 结论） | |
| 交互小部件（页签/折叠/滑杆/即时计算/本地判分） | **dsh-html 围栏**（内联 `<script>` 本地交互） | 脚本禁网络/禁 iframe/禁父页 |
| 整页交付物（报告/清单/方案） | **dsh-html 单围栏** ≤500 行 | |

## 渲染事实（按此书写，两端表现一致）

- 每个围栏 = 一个**独立渲染文档**：自带 `<style>`（精简到本围栏实际用到的类），围栏间互不污染；无需 `<!DOCTYPE html>`/`<html>` 骨架。
- **无痕外观**：不要写死背景色 —— 用**半透明中性底**（`rgba(128,128,128,.08)` 级）+ 半透明边框，深浅主题自动融合宿主；文字色继承宿主（不设 color 即可，主题强调色用中等明度值如 #3b82f6/#16a34a/#d97706）。
- **LaTeX**：围栏内直接写 `$…$`（行内）/ `$$…$$`（块级），由本地 KaTeX 渲染，**不要**把公式转成 HTML 实体或图片；超宽公式仅公式内部横向滚动。
- **脚本安全**：内联 `<script>` 仅做本围栏内 DOM 交互（事件集中 `addEventListener` 绑定，不撒行内 onclick）；**禁**网络请求、内嵌 iframe、访问 `parent`/`top`、外部 JS 库。
- **红字强调**：围栏内用 `<mark>`（`==…==` 只属于 Markdown 通道）。
- **图片**：外链 ≤3 张且必须带宽高 + `loading="lazy"`；优先内联 SVG。

## 风格库（按内容域大胆选视觉语言——严禁千篇一律灰卡片）

上方"半透明中性底"是风格 A（无痕融入，默认）。下列是**完整视觉语言**，按域选用、可与 A 混排；面板类（B/C/E）自带底色属"有意出跳"。

**B · 驾驶舱面板** —— 监控/仪表/实时数据/IoT 域：

```css
.cp{background:linear-gradient(160deg,#0b1220,#12203a);border:1px solid rgba(56,189,248,.3);border-radius:14px;padding:14px 16px;color:#d6e9ff;font:12.5px/1.6 ui-monospace,Consolas,monospace}
.cp h4{margin:0 0 10px;color:#7dd3fc;font-size:13px;letter-spacing:1px}
.cp .num{font-size:22px;font-weight:700;color:#38bdf8}
.cp .tile{background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.22);border-radius:10px;padding:10px}
.cp .led{display:inline-block;width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399}
.cp .warn{color:#fbbf24}.cp .crit{color:#fb7185}
.cp .bar{height:6px;border-radius:4px;background:rgba(56,189,248,.15)}.cp .bar>i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#0ea5e9,#34d399)}
```

**C · 工程蓝图** —— 制图/公差/机构简图/图纸交付域：

```css
.bp{background:linear-gradient(160deg,#0e2a4d,#0a1f3c);background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 24px);border:1px solid rgba(147,197,253,.4);border-radius:10px;padding:16px;color:#dbeafe}
.bp .tb{width:100%;border-collapse:collapse;font-size:11px}.bp .tb th,.bp .tb td{border:1px solid rgba(147,197,253,.5);padding:4px 8px}
.bp .tol{color:#fbbf24;font-family:Consolas,monospace}
.bp .stamp{display:inline-block;border:2px solid #f87171;color:#f87171;border-radius:6px;padding:2px 10px;font-weight:700;transform:rotate(-6deg)}
.bp svg text{fill:#dbeafe}.bp svg line,.bp svg polyline,.bp svg rect,.bp svg circle{stroke:#dbeafe}
```

**D · 杂志编辑** —— 深度讲义/复盘/叙事长文域：

```css
.ed{font:15px/1.9 Georgia,'Times New Roman','Songti SC',SimSun,serif}
.ed .hd{font-size:26px;line-height:1.3;font-weight:700;margin:2px 0 6px}
.ed .lead::first-letter{float:left;font-size:44px;line-height:1;padding:2px 8px 0 0;font-weight:700;color:#8b5cf6}
.ed .pull{border-left:3px solid rgba(139,92,246,.5);padding:4px 14px;font-size:16px;font-style:italic;opacity:.92;margin:12px 0}
.ed .bignum{font-size:42px;font-weight:700;color:#8b5cf6}
.ed .cols2{column-count:2;column-gap:26px}
.ed .rule{border:0;border-top:1px solid rgba(128,128,128,.35);margin:12px 0}
```

**E · 终端日志** —— 命令/日志/调试记录域：

```css
.tm{background:rgba(10,14,24,.94);border:1px solid rgba(52,211,153,.25);border-radius:10px;padding:12px 14px;color:#a7f3d0;font:12.5px/1.7 ui-monospace,Consolas,monospace}
.tm .p{color:#34d399}.tm .cm{color:#64748b}.tm .er{color:#fb7185}
```

选风格口诀：**数据看板 B、图纸公差 C、长文讲义 D、日志命令 E、其余 A**；一条回复可混排。

## 长度红线

- ≤3 个围栏/回合，每个 ≤250 行；整页交付物单围栏 ≤500 行。
- 同一条公式不在 Markdown 与 HTML 双通道重复；同一数据不 HTML+原生组件双呈现。

## 输出前自查

形状触发 ✓（未命中形状不硬上）/ 围栏数与行数 ✓ / 样式自足且半透明底 ✓ / 脚本纯净本地 ✓ / 公式走 LaTeX ✓ / `<mark>` 红字 ✓。
