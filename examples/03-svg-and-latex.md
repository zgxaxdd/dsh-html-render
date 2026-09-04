# 03 · SVG 图形 + KaTeX 公式全家桶

覆盖：SVG 受力简图（箭头 marker）、双齿轮 SMIL 反向旋转（速比 4:3）、对齐推导 / 分段函数 / 积分 / 矩阵 / 行内公式。公式由父页 KaTeX 预渲染 —— 显示为排版而非 `$` 源码即公式通道通过。

```dsh-html
<div class="mdt">
<style>
.mdt{font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:6px 0;max-width:960px}
h3{margin:18px 0 6px;font-size:15px;border-bottom:1px solid rgba(128,128,128,.25);padding-bottom:4px}
.card{background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.22);border-left:4px solid #8b5cf6;border-radius:12px;padding:12px 14px;margin:10px 0}
.card h4{margin:0 0 8px;font-size:14px}
.src{font-size:12px;opacity:.65;margin-top:8px}
.tex{background:rgba(128,128,128,.07);border-radius:10px;padding:10px 14px;margin:8px 0;overflow-x:auto}
.cap2{font-size:12px;opacity:.7;margin:2px 0 10px}
</style>
<h3>机构受力简图（SVG）</h3>
<svg viewBox="0 0 720 180" role="img" aria-label="简支梁受力图">
<defs>
<marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L9,3 L0,6 z" fill="#dc2626"/></marker>
<marker id="ag" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L9,3 L0,6 z" fill="#0284c7"/></marker>
</defs>
<rect x="70" y="84" width="580" height="12" rx="3" fill="rgba(128,128,128,.35)" stroke="#64748b"/>
<polygon points="120,96 104,128 136,128" fill="none" stroke="#64748b" stroke-width="2"/>
<line x1="96" y1="134" x2="144" y2="134" stroke="#64748b" stroke-width="2"/>
<polygon points="600,96 584,128 616,128" fill="none" stroke="#64748b" stroke-width="2"/>
<circle cx="592" cy="133" r="3" fill="none" stroke="#64748b"/><circle cx="608" cy="133" r="3" fill="none" stroke="#64748b"/>
<line x1="260" y1="28" x2="260" y2="80" stroke="#dc2626" stroke-width="3" marker-end="url(#ah)"/>
<text x="270" y="44" font-size="13" fill="#dc2626">F₁ = 2 kN</text>
<line x1="470" y1="28" x2="470" y2="80" stroke="#dc2626" stroke-width="3" marker-end="url(#ah)"/>
<text x="480" y="44" font-size="13" fill="#dc2626">F₂ = 1.5 kN</text>
<line x1="88" y1="152" x2="88" y2="104" stroke="#0284c7" stroke-width="3" marker-end="url(#ag)"/>
<text x="70" y="168" font-size="13" fill="#0284c7">R_A</text>
<line x1="634" y1="152" x2="634" y2="104" stroke="#0284c7" stroke-width="3" marker-end="url(#ag)"/>
<text x="628" y="168" font-size="13" fill="#0284c7">R_B</text>
<line x1="70" y1="158" x2="650" y2="158" stroke="#94a3b8" stroke-dasharray="4 4"/>
<text x="342" y="176" font-size="12" opacity=".7">L = 1200 mm</text>
</svg>
<div class="cap2">简支梁 · 集中载荷 · 支反力 R_A + R_B = F₁ + F₂（静力平衡）</div>
<h3>齿轮啮合（SMIL 反向旋转，速比 4:3）</h3>
<svg viewBox="0 0 380 160" width="400">
<g stroke="#6366f1" stroke-linecap="round">
<animateTransform attributeName="transform" type="rotate" from="0 120 80" to="360 120 80" dur="10s" repeatCount="indefinite"/>
<circle cx="120" cy="80" r="36" fill="rgba(99,102,241,.15)" stroke="#6366f1" stroke-width="3"/>
<g stroke-width="4">
<line x1="168" y1="80" x2="156" y2="80"/><line x1="120" y1="32" x2="120" y2="44"/>
<line x1="72" y1="80" x2="84" y2="80"/><line x1="120" y1="128" x2="120" y2="116"/>
<line x1="154" y1="46" x2="145" y2="54"/><line x1="154" y1="114" x2="145" y2="106"/>
<line x1="86" y1="46" x2="95" y2="54"/><line x1="86" y1="114" x2="95" y2="106"/>
</g></g>
<g stroke="#16a34a" stroke-linecap="round">
<animateTransform attributeName="transform" type="rotate" from="360 250 80" to="0 250 80" dur="7.5s" repeatCount="indefinite"/>
<circle cx="250" cy="80" r="26" fill="rgba(34,197,94,.15)" stroke="#16a34a" stroke-width="3"/>
<g stroke-width="4">
<line x1="286" y1="80" x2="276" y2="80"/><line x1="250" y1="44" x2="250" y2="54"/>
<line x1="214" y1="80" x2="224" y2="80"/><line x1="250" y1="116" x2="250" y2="106"/>
<line x1="268" y1="62" x2="259" y2="69"/><line x1="268" y1="98" x2="259" y2="91"/>
<line x1="232" y1="62" x2="241" y2="69"/><line x1="232" y1="98" x2="241" y2="91"/>
</g></g>
<circle cx="185" cy="80" r="4" fill="#f59e0b"/>
<text x="120" y="22" text-anchor="middle" font-size="12" fill="#6366f1">z₁（主动）</text>
<text x="250" y="22" text-anchor="middle" font-size="12" fill="#16a34a">z₂（从动）</text>
<line x1="120" y1="146" x2="250" y2="146" stroke="#94a3b8" stroke-dasharray="4 4"/>
<text x="172" y="158" font-size="11" opacity=".7">a = 120 mm</text>
</svg>
<h3>KaTeX 公式全家桶</h3>
<div class="card"><h4>块级公式（对齐推导 / 分段 / 积分 / 矩阵）</h4>
<div class="tex">$$L_{10h}=\frac{10^{6}}{60n}\left(\frac{C}{P}\right)^{\varepsilon}$$</div>
<div class="tex">$$\begin{aligned}T&=9550\,\frac{P}{n}\\[2pt]&=9550\times\frac{1.5}{1400}\\[2pt]&\approx 10.2\ \mathrm{N\cdot m}\end{aligned}$$</div>
<div class="tex">$$\sigma_{b}=\frac{M}{W}\le[\sigma_{-1}],\qquad\tau=\frac{T}{W_t}\le[\tau]$$</div>
<div class="tex">$$f(x)=\begin{cases}x^{2}, & x\ge 0\\ -x, & x<0\end{cases}\qquad\int_{0}^{\pi}\sin x\,dx=2\qquad\begin{pmatrix}a&b\\ c&d\end{pmatrix}$$</div>
<p>行内：当量动载荷 $P=X F_r+Y F_a$，寿命指数 $\varepsilon=3$（球）、$10/3$（滚子），摩擦系数 $\mu=0.1\sim0.2$，压力角 $\alpha=20^{\circ}$，安全系数 $S_0 \geq 2$。</p>
<p class="src">公式由父页 KaTeX 预渲染为数学排版后注入沙箱 —— 显示为排版（而非 $ 源码）即公式通道 ✓。</p>
</div>
</div>
```
