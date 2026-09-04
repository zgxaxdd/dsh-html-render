# 02 · 本地交互部件压测

覆盖：页签、折叠、滑杆实时计算、开关、步进器、本地判分小测。全部脚本仅在本围栏沙箱内运行（禁网络/禁 iframe/禁父页）。**重点回归点：页签/折叠切换内容后，预览高度立即跟随收缩，无残留空白。**

```dsh-html
<div class="mdt">
<style>
.mdt{font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:6px 0;max-width:960px}
h3{margin:16px 0 6px;font-size:15px;border-bottom:1px solid rgba(128,128,128,.25);padding-bottom:4px}
.card{background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.22);border-radius:12px;padding:12px 14px;margin:10px 0}
.src{font-size:12px;opacity:.65;margin-top:8px}
mark{background:rgba(250,204,21,.35);padding:0 4px;border-radius:3px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.tb2{padding:5px 16px;border-radius:16px;border:1px solid rgba(128,128,128,.35);cursor:pointer;font-size:12.5px;background:rgba(128,128,128,.08);user-select:none}
.tb2.on{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border-color:transparent}
.pn2{display:none}.pn2.on{display:block}
table{border-collapse:collapse;width:100%;font-size:12.8px;margin:6px 0}
th,td{border:1px solid rgba(128,128,128,.28);padding:5px 9px;text-align:left}
th{background:rgba(128,128,128,.14)}
.acc{border:1px solid rgba(128,128,128,.28);border-radius:10px;margin:8px 0;overflow:hidden}
.acc-h{padding:9px 12px;cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;background:rgba(128,128,128,.07);font-weight:600;font-size:13px}
.acc-h .ar{transition:transform .2s;font-size:11px;opacity:.7}
.acc.open .ar{transform:rotate(90deg)}
.acc-b{display:none;padding:8px 12px;font-size:13px}
.acc.open .acc-b{display:block}
.sld{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:13px;flex-wrap:wrap}
.sld input[type=range]{flex:1;min-width:160px;accent-color:#6366f1}
.sld .out{font-weight:700;color:#3b82f6;min-width:110px}
.sw{display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer;user-select:none;font-size:13px}
.sw input{display:none}
.sw i{width:38px;height:20px;border-radius:12px;background:rgba(128,128,128,.4);position:relative;transition:background .2s;flex:0 0 38px}
.sw i::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s}
.sw input:checked+i{background:#22c55e}
.sw input:checked+i::after{left:20px}
.cnt{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px;flex-wrap:wrap}
.cnt button{width:30px;height:30px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:rgba(128,128,128,.08);font-size:16px;cursor:pointer;color:inherit}
.cnt .kv{font-size:18px;font-weight:700;color:#8b5cf6;min-width:44px;text-align:center}
.qz{border:1px solid rgba(128,128,128,.28);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13px}
.qz.ok{border-color:rgba(34,197,94,.7);background:rgba(34,197,94,.08)}
.qz.bad{border-color:rgba(239,68,68,.7);background:rgba(239,68,68,.08)}
.qz label{display:block;margin:3px 0;cursor:pointer}
.qz .qz-x{font-size:12px;margin-top:4px;min-height:14px}
.qz.ok .qz-x{color:#16a34a}.qz.bad .qz-x{color:#dc2626}
.go{padding:7px 18px;border-radius:10px;border:0;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:13px;cursor:pointer;margin-right:8px}
.gh{padding:7px 18px;border-radius:10px;border:1px solid rgba(128,128,128,.4);background:rgba(128,128,128,.08);color:inherit;font-size:13px;cursor:pointer}
.res{display:none;margin-top:8px;font-weight:700;color:#16a34a}
</style>
<h3>页签</h3>
<div class="card">
<div class="tabs">
<div class="tb2 on" data-g="a" data-t="p1">额定参数</div>
<div class="tb2" data-g="a" data-t="p2">安装尺寸</div>
<div class="tb2" data-g="a" data-t="p3">接线与保护</div>
</div>
<div class="pn2 on" data-g="a" data-p="p1"><table><thead><tr><th>项目</th><th>值</th></tr></thead><tbody><tr><td>额定功率</td><td>1.5 kW</td></tr><tr><td>额定转速</td><td>1400 r/min</td></tr><tr><td>额定转矩</td><td>10.2 N·m</td></tr></tbody></table></div>
<div class="pn2" data-g="a" data-p="p2">机座号 Y90L · 轴径 24 mm · 地脚孔距 140×100 mm · 轴伸长 50 mm。</div>
<div class="pn2" data-g="a" data-p="p3">△/Y 接法 380 V；热继电器整定 1.05×额定电流；重复启动间隔 ≥ 5 min。</div>
<p class="src">点页签切换内容 —— 高度变化后预览自动跟随。</p>
</div>
<h3>折叠面板</h3>
<div class="acc"><div class="acc-h">为什么功率够还要校核转矩？<span class="ar">▶</span></div><div class="acc-b">低速大转矩工况下 P = T·ω 可能满足而 T 超额定值 —— 电机发热与最大转矩受 T 限制，必须按 T 复核。</div></div>
<div class="acc"><div class="acc-h">减速比取整后要做什么？<span class="ar">▶</span></div><div class="acc-b">反算实际输出转速与带速，偏差超 ±5% 时调整带轮直径或级配。</div></div>
<div class="acc"><div class="acc-h">什么时候选 6 极电机？<span class="ar">▶</span></div><div class="acc-b">需要较低同步转速（960 r/min）以减小总减速比、简化传动链时。</div></div>
<h3>滑杆实时计算</h3>
<div class="card">
<div class="sld"><span>减速比 i</span><input id="rI" type="range" min="10" max="60" step="1" value="25"><span class="out" id="oI">56.0 r/min</span></div>
<div class="sld"><span>当量载荷 P (kN)</span><input id="rP" type="range" min="1" max="8" step="0.5" value="4"><span class="out" id="oP">--</span></div>
<p class="src">L10h = (C/P)^ε × 10⁶/(60n) · C = 35.1 kN（6208）· ε = 3（球轴承）· n = 1400 r/min。</p>
</div>
<h3>开关与步进器</h3>
<div class="card">
<label class="sw"><input id="sw1" type="checkbox"><i></i><span>显示启动校核细节</span></label>
<div id="swp" style="display:none;font-size:13px;padding:6px 10px;border-left:3px solid #f59e0b;margin:6px 0">重载启动需 T_start ≥ 1.5×T_L；Y 系列典型 T_start/T_N ≈ 2.2，<mark>满足</mark>。</div>
<div class="cnt"><span>工况系数 K</span><button id="kDn" type="button">−</button><span class="kv" id="kVal">1.3</span><button id="kUp" type="button">＋</button><span id="kTip" style="opacity:.8">合理：常规工况推荐区间</span></div>
</div>
<h3>本地判分小测（3 题）</h3>
<div class="card">
<div class="qz" data-q="q1" data-x="球轴承 ε=3，滚子 ε=10/3"><b>1.</b> 滚动轴承寿命指数 ε，球轴承取值是？
<label><input type="radio" name="q1" value="A"> ε = 10/3</label>
<label><input type="radio" name="q1" value="B"> ε = 3</label>
<label><input type="radio" name="q1" value="C"> ε = 2</label>
<div class="qz-x"></div></div>
<div class="qz" data-q="q2" data-x="9550 ≈ 60×1000/(2π)，P 用 kW、n 用 r/min"><b>2.</b> T(N·m) = 9550·P/n 中 P 与 n 的单位是？
<label><input type="radio" name="q2" value="A"> P: W · n: r/s</label>
<label><input type="radio" name="q2" value="B"> P: kW · n: r/s</label>
<label><input type="radio" name="q2" value="C"> P: kW · n: r/min</label>
<div class="qz-x"></div></div>
<div class="qz" data-q="q3" data-x="带速偏差超 ±5% 时应调带轮直径或级配"><b>3.</b> 减速比取整后的首要动作是？
<label><input type="radio" name="q3" value="A"> 反算输出转速并复核偏差</label>
<label><input type="radio" name="q3" value="B"> 直接加大电机功率</label>
<label><input type="radio" name="q3" value="C"> 忽略，偏差无所谓</label>
<div class="qz-x"></div></div>
<button class="go" id="quizGo" type="button">交卷判分</button><button class="gh" id="quizRe" type="button">重做</button>
<div class="res" id="quizRes"></div>
</div>
<script>
(function(){
var d=document;
function qa(s){return Array.prototype.slice.call(d.querySelectorAll(s))}
function q(s){return d.querySelector(s)}
qa('.tb2').forEach(function(t){t.addEventListener('click',function(){
var g=t.getAttribute('data-g');
qa('.tb2[data-g="'+g+'"]').forEach(function(x){x.classList.remove('on')});
t.classList.add('on');
qa('.pn2[data-g="'+g+'"]').forEach(function(p){p.classList.toggle('on',p.getAttribute('data-p')===t.getAttribute('data-t'))});
})});
qa('.acc-h').forEach(function(h){h.addEventListener('click',function(){h.parentElement.classList.toggle('open')})});
function bind(id,oid,fn){var e=q('#'+id),o=q('#'+oid);function u(){fn(parseFloat(e.value),o)}e.addEventListener('input',u);u()}
bind('rI','oI',function(v,o){o.textContent=(1400/v).toFixed(1)+' r/min'});
bind('rP','oP',function(v,o){var L=Math.pow(35.1/v,3)*1e6/(60*1400);o.textContent=Math.round(L).toLocaleString()+' h'});
q('#sw1').addEventListener('change',function(){q('#swp').style.display=this.checked?'block':'none'});
var kv=1.3;
function kUpd(){q('#kVal').textContent=kv.toFixed(1);q('#kTip').textContent=kv<1.2?'偏紧：冲击载荷下易过载':(kv<1.6?'合理：常规工况推荐区间':'保守：成本上升，用于重载冲击')}
q('#kUp').addEventListener('click',function(){kv=Math.min(2,Math.round((kv+0.1)*10)/10);kUpd()});
q('#kDn').addEventListener('click',function(){kv=Math.max(1,Math.round((kv-0.1)*10)/10);kUpd()});
var ANS={q1:'B',q2:'C',q3:'A'};
q('#quizGo').addEventListener('click',function(){
var right=0;
qa('.qz').forEach(function(z){
var id=z.getAttribute('data-q'),pick=z.querySelector('input:checked');
var ok=!!pick&&pick.value===ANS[id];
z.classList.toggle('ok',ok);z.classList.toggle('bad',!ok);
z.querySelector('.qz-x').textContent=ok?'✓ 正确':'✗ 错误 — '+z.getAttribute('data-x');
if(ok)right++;
});
var r=q('#quizRes');r.style.display='block';r.textContent='得分：'+right+' / 3'+(right===3?' — 全对 🎉':'');
});
q('#quizRe').addEventListener('click',function(){
qa('.qz').forEach(function(z){z.classList.remove('ok','bad');z.querySelector('.qz-x').textContent='';var i=z.querySelector('input:checked');if(i)i.checked=false});
q('#quizRes').style.display='none';
});
})();
</script>
</div>
```
