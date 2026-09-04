# 00 · 最小快速测试

安装并硬刷新后，把下面的围栏整段粘贴到任意 DSH 会话发送 —— 应看到一张融入对话流的卡片，行内/块级公式被 KaTeX 排版（看不到 `$` 源码）。

```dsh-html
<div style="font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:6px 0">
<div style="border-left:4px solid #3b82f6;border-radius:10px;padding:12px 14px;background:rgba(128,128,128,.08)">
<b>渲染成功 ✓</b> —— 这是沙箱 iframe 内的真 HTML，无边框融入对话流，深浅主题自适应。
</div>
<div style="border-left:4px solid #8b5cf6;border-radius:10px;padding:12px 14px;margin:8px 0;background:rgba(128,128,128,.08)">
<b>LaTeX 测试：</b>行内公式 $L_{10} = \left(\frac{C}{P}\right)^{\varepsilon}$，其中 $\varepsilon = 3$（球轴承）。
块级公式：
$$T = 9550 \times \frac{P}{n} = 9550 \times \frac{1.5}{1400} \approx 10.2\ \mathrm{N\cdot m}$$
符号表：$C$ = 额定动载荷（N），$P$ = 当量动载荷（N），$n$ = 转速（r/min）。
</div>
</div>
```

预期：两张圆角卡片紧贴对话流；公式有正确的分数、下标、希腊字母；卡片高度精确贴齐内容（无内部滚动条、无底部空白）。
