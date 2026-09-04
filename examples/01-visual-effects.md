# 01 · 视觉与动画压测

覆盖：渐变动画、悬停浮起、流光进度条、SMIL 齿轮自转（无需脚本）、脉冲/加载指示、CSS 流程图、时间线、表格悬停高亮。配色全部使用半透明中性底 —— 深浅主题都与宿主背景融合。

```dsh-html
<div class="mdt">
<style>
.mdt{font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:6px 0;max-width:960px}
h3{margin:18px 0 6px;font-size:15px;border-bottom:1px solid rgba(128,128,128,.25);padding-bottom:4px}
.src{font-size:12px;opacity:.65;margin-top:8px}
mark{background:rgba(250,204,21,.35);padding:0 4px;border-radius:3px}
.hero{background:linear-gradient(270deg,#6366f1,#0ea5e9,#22c55e,#6366f1);background-size:600% 600%;animation:grad 8s ease infinite;border-radius:12px;padding:16px 18px;color:#fff;margin:6px 0 12px}
@keyframes grad{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.hero .t{font-size:17px;font-weight:700;letter-spacing:.5px}
.hero .s{font-size:12px;opacity:.85;margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0}
@media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}
.stat{background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.22);border-radius:12px;padding:12px;text-align:center;transition:transform .18s,box-shadow .18s;cursor:default}
.stat:hover{transform:translateY(-4px);box-shadow:0 8px 20px rgba(0,0,0,.18)}
.stat .v{font-size:22px;font-weight:700;color:#3b82f6}
.stat .l{font-size:12px;opacity:.75;margin-top:2px}
.pg{height:14px;border-radius:8px;background:rgba(128,128,128,.15);overflow:hidden;position:relative;margin:4px 0 10px}
.pg>i{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,#3b82f6,#22c55e);position:relative}
.pg>i::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);animation:shim 2.2s linear infinite}
@keyframes shim{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.cap{display:flex;justify-content:space-between;font-size:12px;opacity:.85}
.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:10px;margin:3px 6px 3px 0;border:1px solid}
.b-blue{color:#3b82f6;border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.12)}
.b-green{color:#16a34a;border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.12)}
.b-amber{color:#d97706;border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.12)}
.b-purple{color:#8b5cf6;border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.12)}
.b-red{color:#dc2626;border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.12)}
.demo-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:12px 0;font-size:13px}
.spin-txt{font-size:34px;display:inline-block;animation:rot 4s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
.pulse{width:12px;height:12px;border-radius:50%;background:#22c55e;display:inline-block;animation:pls 1.6s ease infinite}
@keyframes pls{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 12px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.sp{width:26px;height:26px;border-radius:50%;border:3px solid rgba(128,128,128,.25);border-top-color:#8b5cf6;animation:rot 1s linear infinite}
.flow{margin:12px 0}
.f-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.fb{flex:1;min-width:130px;padding:10px;border-radius:10px;text-align:center;font-size:12.5px;border:1px solid}
.fb b{display:block;font-size:13.5px;margin-bottom:2px}
.f-blue{background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.45);color:#3b82f6}
.f-green{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.45);color:#16a34a}
.f-amber{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.45);color:#d97706}
.f-purple{background:rgba(139,92,246,.14);border-color:rgba(139,92,246,.45);color:#8b5cf6}
.f-arr{text-align:center;opacity:.6;margin:4px 0;font-size:12px}
.tl{margin:8px 0}
.ts{display:flex;gap:10px;margin:8px 0;align-items:flex-start}
.tn{flex:0 0 24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-align:center;line-height:24px;font-size:12px;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}
th,td{border:1px solid rgba(128,128,128,.28);padding:6px 10px;text-align:left}
th{background:rgba(128,128,128,.14)}
tbody tr{transition:background .15s}
tbody tr:hover{background:rgba(59,130,246,.12)}
</style>
<div class="hero"><div class="t">视觉与动画效果测试</div><div class="s">渐变动画 · 悬停浮起 · 流光进度条 · SMIL 齿轮 · 流程 · 时间线 · 表格高亮</div></div>
<h3>统计卡（鼠标悬停浮起）</h3>
<div class="grid">
<div class="stat"><div class="v">1400</div><div class="l">额定转速 r/min</div></div>
<div class="stat"><div class="v">1.5 kW</div><div class="l">额定功率</div></div>
<div class="stat"><div class="v">10.2</div><div class="l">额定转矩 N·m</div></div>
<div class="stat"><div class="v">B 级</div><div class="l">绝缘等级</div></div>
</div>
<h3>进度条（流光扫过动画）</h3>
<div class="cap"><span>功率利用率</span><span>76%</span></div><div class="pg"><i style="width:76%"></i></div>
<div class="cap"><span>转矩裕量</span><span>54%</span></div><div class="pg"><i style="width:54%"></i></div>
<div class="cap"><span>温升估算</span><span>92%</span></div><div class="pg"><i style="width:92%"></i></div>
<h3>徽章 · 动态指示</h3>
<div><span class="badge b-blue">Y 系列</span><span class="badge b-green">IP55</span><span class="badge b-amber">S1 工作制</span><span class="badge b-purple">IE3 能效</span><span class="badge b-red">禁止堵转</span></div>
<div class="demo-row"><span class="pulse"></span><span>运行脉冲</span><span class="spin-txt">⚙️</span><span>CSS 旋转</span><span class="sp"></span><span>加载环</span></div>
<h3>SVG 齿轮（SMIL 自转，无需脚本）</h3>
<svg viewBox="0 0 140 128" width="150">
<circle cx="70" cy="56" r="26" fill="rgba(99,102,241,.2)" stroke="#6366f1" stroke-width="3"/>
<g stroke="#6366f1" stroke-width="5" stroke-linecap="round">
<animateTransform attributeName="transform" type="rotate" from="0 70 56" to="360 70 56" dur="8s" repeatCount="indefinite"/>
<line x1="70" y1="24" x2="70" y2="36"/><line x1="70" y1="76" x2="70" y2="88"/>
<line x1="38" y1="56" x2="50" y2="56"/><line x1="90" y1="56" x2="102" y2="56"/>
<line x1="47" y1="33" x2="56" y2="42"/><line x1="84" y1="70" x2="93" y2="79"/>
<line x1="93" y1="33" x2="84" y2="42"/><line x1="56" y1="70" x2="47" y2="79"/>
</g>
<text x="70" y="118" text-anchor="middle" font-size="11" opacity=".7">animateTransform 8s/圈</text>
</svg>
<h3>流程图（CSS 色块）</h3>
<div class="flow">
<div class="f-row">
<div class="fb f-blue"><b>工况分析</b>F · v · K</div>
<div class="fb f-green"><b>功率计算</b>P = F·v/η</div>
<div class="fb f-amber"><b>选型校核</b>T · n · 温升</div>
<div class="fb f-purple"><b>落定型号</b>Y90L-4</div>
</div>
<div class="f-arr">▼ 按序执行 · 任一步不过则回退重算 ▼</div>
</div>
<h3>时间线</h3>
<div class="tl">
<div class="ts"><div class="tn">1</div><div>明确负载谱与工况系数 K</div></div>
<div class="ts"><div class="tn">2</div><div>计算所需功率并预留裕量</div></div>
<div class="ts"><div class="tn">3</div><div>校核转矩、转速与启动能力</div></div>
<div class="ts"><div class="tn">4</div><div>核对安装尺寸与防护等级 → <mark>定型号</mark></div></div>
</div>
<h3>表格（悬停行高亮）</h3>
<table>
<thead><tr><th>型号</th><th>功率 kW</th><th>转速 r/min</th><th>效率</th></tr></thead>
<tbody>
<tr><td>Y802-4</td><td>0.75</td><td>1390</td><td>73%</td></tr>
<tr><td>Y90S-4</td><td>1.1</td><td>1400</td><td>76%</td></tr>
<tr><td>Y90L-4</td><td>1.5</td><td>1400</td><td>78%</td></tr>
<tr><td>Y100L-4</td><td>2.2</td><td>1430</td><td>81%</td></tr>
</tbody>
</table>
<p class="src">来源：数值为演示样例。</p>
</div>
```
