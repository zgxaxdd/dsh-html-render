/* dsh-html renderer — 在 DSH 会话消息流中内联渲染 HTML
 * dsh-html-renderer version: 5
 *
 * 通道一（fence 通道）：接管 ```dsh-html（及内容判定的 ```html）代码块，
 *  在原始代码块旁挂载 iframe(srcdoc)，sandbox="allow-scripts"（不透明源），
 *  文档内置 CSP meta，脚本/样式/交互完整运行；流式输出时渐进渲染。
 * 通道二（裸片段通道）：宿主把裸 HTML（<div class="mdt">…）渲染为纯文本，
 *  本脚本在 assistant 消息行内把这类文本节点接管为【同样受沙箱保护的
 *  iframe】——不再使用 innerHTML/shadow DOM 在父页面源解析（v5，安全统一）。
 *
 * 由页面级注入（<script src="/dsh-html/client.js">）随 Web 应用壳加载，
 * 对当前 DSH 部署下的所有会话/工作区生效（能力全局，skill 本身分区生效）。
 * 外观无痕：无边框无底色，直接融入对话流；工具栏仅悬停浮现在右上角。
 *
 * 公式通道（v5）：$...$（行内）/ $$...$$（块级）/ \(...\) / \[...\]
 *  LaTeX 由父页 KaTeX（本地 /dsh-html/katex/ 静态托管，零外网）预渲染为
 *  数学 HTML 后整体注入 srcdoc —— 一次成型、高度测量准确、不出现未渲染源码；
 *  KaTeX 不可用时原文直出（围栏永不卡死）；失败有指数退避重试。
 *
 * v5 变更（对照 2026-09 审查）：
 *  - 修 A1：挂载对象统一命名 mount（此前 源码/复制/重载 三按钮引用未定义变量）
 *  - 修 A2+B1：通道二弃用 shadow DOM + innerHTML（父源解析=沙箱绕过），
 *    改走与通道一相同的沙箱 iframe 管线
 *  - 修 B2：新标签打开文档使用含 sandbox 指令的专属 CSP（顶层也变不透明源）
 *  - 修 B3：高度消息带 mount id，O(1) 定位 + ev.source 校验
 *  - 修 B4：KaTeX 显式 maxExpand/maxSize + 公式长度/数量上限 + 结果缓存
 *  - 修 A4/A5/A6/A7、D1/D2/D4/D5/D6/D7/D8/D9/D10/D11、C2/C3/C5/C7、F2
 * 无框架、除本地 KaTeX 外无网络请求；所有异常统一记入 stats().errors。
 */
(function () {
  'use strict'
  var VERSION = 5
  if (window.__dshHtmlRenderer) {
    try {
      if (typeof window.__dshHtmlRenderer.disable === 'function') window.__dshHtmlRenderer.disable()
    } catch (e) {}
    if ((window.__dshHtmlRenderer.version || 0) >= VERSION) return
    try {
      console.warn('[dsh-html] replacing older renderer v' + window.__dshHtmlRenderer.version + ' with v' + VERSION + ' — hard-refresh recommended')
    } catch (e) {}
  }
  window.__dshHtmlRenderer = { version: VERSION, startedAt: Date.now(), debug: false }

  /* ------------------------------------------------------------------ *
   * 常量
   * ------------------------------------------------------------------ */
  var PROCESSED = 'data-dsh-html-rendered'
  var FRAG_MARK = 'data-dsh-html-frag'
  var CODE_SELECTORS = '.md-code-block, .code-block, .code-block-small'
  var STREAMING = '[data-streaming]'
  var SWEEP_MS = 1000
  var SETTLE_TIMEOUT_MS = 30000 // 流式异常中断 30s 后强制视为 settled
  var SURFACE_HOPS = 4
  var BLOCK_CONTENT_SELECTOR =
    'p, ul, ol, dl, table, h1, h2, h3, h4, h5, h6, blockquote, hr, img, figure'
  var MAX_BYTES = 1024 * 1024 // 围栏内容上限 1MB
  var MAX_FRAG_BYTES = 200 * 1024 // 裸片段上限
  var MAX_HEIGHT = 12000 // iframe 高度上限 px
  var HEIGHT_PAD = 8
  var SWAP_MIN_MS = 450 // 流式渲染的最小换帧间隔
  var TEX_MAX_LEN = 2000 // 单条公式源码上限（字符）
  var TEX_MAX_COUNT = 200 // 单围栏公式数量上限
  var TEX_CACHE_MAX = 300 // KaTeX 结果缓存条目上限

  /* ------------------------------------------------------------------ *
   * 异常记录（D7：不静默吞错，可经 __dshHtmlRenderer.debug 查看）
   * ------------------------------------------------------------------ */
  var errCount = 0
  function dbg(e) {
    errCount++
    try {
      if (window.__dshHtmlRenderer && window.__dshHtmlRenderer.debug) console.debug('[dsh-html]', e)
    } catch (x) {}
  }

  /* ------------------------------------------------------------------ *
   * KaTeX 公式通道（本地静态托管 /dsh-html/katex/，父页预渲染）
   * ------------------------------------------------------------------ */
  var katexState = null // null | 'loading' | 'ok' | 'fail'
  var katexAttempts = 0
  var katexQueue = null
  var katexFailQueue = null
  var katexCssCache = null // 内联 CSS 字符串（含字体路径改写）
  var katexCssPromise = null
  var texCache = new Map() // key: 'D:'/'I:' + 源码 → KaTeX HTML

  /* 内容是否包含可渲染的 LaTeX 标记（$$ / \[ \] / \( \) / 成对 $）。 */
  function hasLatex(raw) {
    if (raw.indexOf('$$') !== -1) return true
    if (/\\[\(\[][\s\S]*?\\[\)\]]/.test(raw)) return true
    var n = 0
    for (var i = 0; i < raw.length; i++) {
      if (raw.charCodeAt(i) === 36 && ++n >= 2) return true
    }
    return false
  }

  /* KaTeX 加载：失败指数退避重试（≤3 次），仍失败则页面级降级并可由
   * __dshHtmlRenderer.resetKatex() 手动复位（D1）。 */
  function ensureKatex(cb, onFail) {
    if (katexState === 'ok') { cb(); return }
    if (katexState === 'loading') { katexQueue.push(cb); if (onFail) katexFailQueue.push(onFail); return }
    if (katexState === 'fail') { if (onFail) onFail(); return }
    katexState = 'loading'
    katexQueue = [cb]
    katexFailQueue = onFail ? [onFail] : []
    var sc = document.createElement('script')
    sc.src = '/dsh-html/katex/katex.min.js'
    sc.async = true
    sc.onload = function () {
      katexState = 'ok'
      katexAttempts = 0
      var q = katexQueue
      katexQueue = null
      katexFailQueue = null
      for (var i = 0; i < q.length; i++) { try { q[i]() } catch (e) { dbg(e) } }
    }
    sc.onerror = function () {
      katexAttempts++
      katexState = 'fail'
      var qf = katexFailQueue
      katexQueue = null
      katexFailQueue = null
      for (var j = 0; qf && j < qf.length; j++) { try { qf[j]() } catch (e) { dbg(e) } }
      if (katexAttempts < 3) {
        var wait = 1000 * katexAttempts * katexAttempts
        setTimeout(function () { if (katexState === 'fail') katexState = null }, wait)
      }
    }
    document.head.appendChild(sc)
  }

  /* 拉取 katex.min.css 并改写字体相对路径为绝对路径；失败可重试（D1）。 */
  function ensureKatexCss(cb) {
    if (typeof katexCssCache === 'string') { cb(katexCssCache); return }
    if (katexCssPromise) { katexCssPromise.then(cb); return }
    katexCssPromise = fetch('/dsh-html/katex/katex.min.css')
      .then(function (r) { return r.ok ? r.text() : null })
      .then(function (txt) {
        if (!txt) { katexCssPromise = null; return null }
        var out = txt.replace(
          /url\(["']?fonts\/([^)"']+)["']?\)/g,
          'url(/dsh-html/katex/fonts/$1)'
        )
        /* 超宽公式允许其内部横向滚动，正文绝不滚动。 */
        out += '.katex-display{overflow-x:auto;overflow-y:hidden;padding:2px 0}'
        katexCssCache = out
        return out
      })
      .catch(function () { katexCssCache = null; katexCssPromise = null; return null })
    katexCssPromise.then(cb)
  }

  /* 单条公式渲染：带结果缓存 + DoS 防护（B4）；失败保留完整匹配（A6）。 */
  function renderTex(src, display, fallback) {
    try {
      if (!window.katex) return fallback
      if (src.length > TEX_MAX_LEN) return fallback
      var key = (display ? 'D:' : 'I:') + src
      if (texCache.has(key)) return texCache.get(key)
      var out = window.katex.renderToString(src, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        trust: false,
        output: 'html',
        maxExpand: 1000,
        maxSize: 50,
      })
      if (texCache.size >= TEX_CACHE_MAX) texCache.clear()
      texCache.set(key, out)
      return out
    } catch (e) { dbg(e); return fallback }
  }

  /* 按 $$ → \[ \] → \( \) → $ $ 顺序替换。
   * 替换前把 HTML 标签与 script/style/pre/code 块摘成私有区占位符（D2：
   * U+E000 + 随机前缀，还原带越界校验）—— 公式绝不进标签/属性/代码；
   * 行内 $ 内容含 CJK 视为普通文本；单围栏公式数与单条长度受限。 */
  var PH = '\uE000' + Math.random().toString(36).slice(2, 8) + '-'
  function replaceLatex(raw) {
    var tokens = []
    var kept = raw.replace(
      /<script[\s\S]*?<\/script\s*>|<style[\s\S]*?<\/style\s*>|<pre[\s\S]*?<\/pre\s*>|<code[\s\S]*?<\/code\s*>|<[^>]*>/gi,
      function (m) { tokens.push(m); return PH + (tokens.length - 1) + PH }
    )
    var texCount = 0
    function tex(s, display, full) {
      if (++texCount > TEX_MAX_COUNT) return full
      return renderTex(s, display, full)
    }
    kept = kept
      .replace(/\$\$([\s\S]+?)\$\$/g, function (m, s) { return tex(s, true, m) })
      .replace(/\\\[([\s\S]+?)\\\]/g, function (m, s) { return tex(s, true, m) })
      .replace(/\\\(([\s\S]+?)\\\)/g, function (m, s) { return tex(s, false, m) })
      .replace(/\$([^\s$\uE000\n][^$\uE000\n]*?[^\s$\uE000\n])\$/g, function (m, s) {
        if (/[\u4e00-\u9fff]/.test(s)) return m
        return tex(s, false, m)
      })
    var re = new RegExp(PH + '(\\d+)' + PH, 'g')
    return kept.replace(re, function (m, i) {
      var idx = +i
      return idx >= 0 && idx < tokens.length ? tokens[idx] : m
    })
  }

  /* 富化原始围栏内容：无公式同步返回；有公式时等 KaTeX/CSS 就绪后
   * 返回「公式已渲染的 HTML + 内联 KaTeX CSS」。KaTeX 不可用时走降级
   * 回调 —— 原文直出，围栏永不卡死不渲染。 */
  function enrichRaw(raw, cb) {
    if (!hasLatex(raw)) { cb(raw, null); return }
    ensureKatex(function () {
      ensureKatexCss(function (css) { cb(replaceLatex(raw), css) })
    }, function () { cb(raw, null) })
  }

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */
  function rawOf(block) {
    var pre = block.querySelector('pre')
    if (!pre) return ''
    var text = ''
    for (var i = 0; i < pre.childNodes.length; i++) {
      text += pre.childNodes[i].textContent || ''
    }
    return text
  }

  /* 横幅语言标签：代码体外第一个叶子元素文本（流式中为空串）。 */
  function labelTextOf(block) {
    var pre = block.querySelector('pre')
    var els = block.querySelectorAll('*')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (el.childElementCount !== 0) continue
      if (pre && pre.contains(el)) continue
      return el.textContent || ''
    }
    return ''
  }

  function isSettled(block) {
    return block.closest ? !block.closest(STREAMING) : true
  }

  /* 只含「横幅 + 一个代码体」的才是围栏表面；含段落/多代码体的整行容器
   * 绝不接管（否则会隐藏整条回复）。 */
  function isPlausibleFenceSurface(candidate) {
    var pres = candidate.querySelectorAll('pre')
    if (pres.length > 1) return false
    var pre = pres[0] || null
    var els = candidate.querySelectorAll(BLOCK_CONTENT_SELECTOR)
    for (var i = 0; i < els.length; i++) {
      if (pre && pre.contains(els[i])) continue
      return false
    }
    return true
  }

  /* ```html 内容的文档/卡片形态判定。 */
  function looksLikeHtmlFragment(raw) {
    var t = raw.replace(/^\s+/, '')
    if (/^<(!doctype|html\b|div class="mdt")/i.test(t)) return true
    if (/<style[\s>]/i.test(raw) && /class="mdt"/.test(raw)) return true
    return false
  }

  function findFenceCandidates() {
    var seen = new Set()
    var out = []
    var els = document.querySelectorAll(CODE_SELECTORS)
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (
        el.parentElement &&
        el.parentElement.closest &&
        el.parentElement.closest(CODE_SELECTORS)
      ) continue
      if (seen.has(el)) continue
      if (!isPlausibleFenceSurface(el)) continue
      out.push(el)
      seen.add(el)
    }
    /* 结构性兜底：任何「pre + 标签为 dsh-html/html 的祖先」也可被识别。 */
    var pres = document.querySelectorAll('pre')
    for (var j = 0; j < pres.length; j++) {
      var pre = pres[j]
      if (pre.closest && pre.closest(CODE_SELECTORS)) continue
      var el2 = pre.parentElement
      for (var hops = 0; el2 && hops < SURFACE_HOPS; hops++, el2 = el2.parentElement) {
        if (!isPlausibleFenceSurface(el2)) break
        var lbl = labelTextOf(el2)
        if (lbl !== 'dsh-html' && lbl !== 'html') continue
        if (seen.has(el2)) continue
        seen.add(el2)
        out.push(el2)
        break
      }
    }
    return out
  }

  /* 是否应该接管该围栏：settled 时看标签；流式中按内容起始判定。 */
  function wantsTakeover(block, label) {
    var raw = rawOf(block)
    if (label === 'dsh-html' && raw.trim() !== '') return true
    if (label === 'html') return looksLikeHtmlFragment(raw)
    if (label === '' && raw.replace(/^\s+/, '').length > 0) {
      /* 流式中标签尚未渲染：仅当内容以 HTML 形态起始时渐进接管。 */
      return /^<(!doctype|html\b|div class="mdt")/i.test(raw.replace(/^\s+/, ''))
    }
    return false
  }

  /* ------------------------------------------------------------------ *
   * 文档包装（srcdoc + CSP + 高度上报）
   * ------------------------------------------------------------------ */
  /* iframe 内高度上报脚本。id 注入 + MAX/PAD 常量注入（F2），轮询自适应：
   * 400ms 快扫 → 10s 无变化后降为 2000ms 兜底，变化即刻恢复快扫（C2）。 */
  function helperScript(mid) {
    return '<script>(function(){' +
      'var MID=' + (mid | 0) + ',MAX=' + MAX_HEIGHT + ',PAD=' + HEIGHT_PAD + ',last=0,same=0,fast=true,timer=null;' +
      'function contentH(){var b=document.body,h=document.documentElement;' +
      'var y1=b?b.getBoundingClientRect().bottom:0;' +
      'var y2=h?h.getBoundingClientRect().bottom:0;' +
      'return Math.ceil(Math.max(y1,y2));}' +
      'function report(){var full=contentH()+PAD;var h=Math.min(full,MAX);' +
      'if(h===last){same++;if(fast&&same>25){fast=false;clearInterval(timer);timer=setInterval(report,2000);}return;}' +
      'if(!fast){fast=true;clearInterval(timer);timer=setInterval(report,400);}' +
      'same=0;last=h;' +
      'try{parent.postMessage({kind:"dsh-html-height",id:MID,h:h,full:full},"*")}catch(e){}}' +
      'window.addEventListener("load",report);' +
      'if(document.readyState!=="loading")report();' +
      'if(window.ResizeObserver){' +
      'try{new ResizeObserver(report).observe(document.documentElement)}catch(e){}' +
      '}' +
      'if(document.fonts&&document.fonts.ready){' +
      'try{document.fonts.ready.then(function(){report()})}catch(e){}' +
      '}' +
      'timer=setInterval(report,400);' +
      '})()<\/script>'
  }

  var CSP_META =
    '<meta http-equiv="Content-Security-Policy" content="' +
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
    "img-src https: http: data:; media-src https: http: data:; " +
    "font-src data: https: http:; " +
    "frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'" +
    '">'

  /* 新标签打开专用：追加 sandbox 指令，顶层文档也变成不透明源（B2）。 */
  var CSP_META_TAB =
    '<meta http-equiv="Content-Security-Policy" content="' +
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
    "img-src https: http: data:; media-src https: http: data:; " +
    "font-src data: https: http:; " +
    "frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; " +
    'sandbox allow-scripts' +
    '">'

  /* ------------------------------------------------------------------ *
   * 宿主主题采样：取对话区实际背景/文字色注入 iframe（真无痕）。
   * 值经 safeColor 白名单校验后才拼进 style（B5）。
   * ------------------------------------------------------------------ */
  var paletteCache = { t: 0, bg: null, fg: null }

  function safeColor(c, fb) {
    if (typeof c !== 'string') return fb
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c
    if (/^rgba?\([\d\s.,%]+\)$/.test(c)) return c
    if (/^[a-z]+$/i.test(c)) return c
    return fb
  }

  function hostPalette() {
    var now = Date.now()
    if (now - paletteCache.t < 10000) return paletteCache
    var bg = null
    var fg = null
    function scan(start) {
      var el = start
      for (var n = 0; el && n < 12; n++, el = el.parentElement) {
        if (!el || el === document.documentElement) break
        var cs = window.getComputedStyle(el)
        if (!bg) {
          var b = cs.backgroundColor
          if (b && b !== 'transparent' &&
              b.indexOf('rgba(0, 0, 0, 0)') !== 0 && b.indexOf('rgba(0,0,0,0)') !== 0) bg = b
        }
        if (!fg) {
          var c = cs.color
          if (c && c !== 'transparent' &&
              c.indexOf('rgba(0, 0, 0, 0)') !== 0 && c.indexOf('rgba(0,0,0,0)') !== 0) fg = c
        }
        if (bg && fg) break
      }
    }
    scan(document.querySelector('[data-chat-anchor-key]'))
    scan(document.body)
    paletteCache = {
      t: now,
      bg: safeColor(bg, 'Canvas'),
      fg: safeColor(fg, 'CanvasText'),
    }
    return paletteCache
  }

  function wrapDocument(raw, katexCss, mid, tab) {
    var headExtra = katexCss ? '<style>' + katexCss + '</style>' : ''
    var pal = hostPalette()
    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      (tab ? CSP_META_TAB : CSP_META) +
      headExtra +
      '</head><body style="margin:4px 6px;color-scheme:light dark;' +
      'background:' + pal.bg + ';color:' + pal.fg + ';">' +
      raw +
      helperScript(mid == null ? 0 : mid) +
      '</body></html>'
    )
  }

  /* ------------------------------------------------------------------ *
   * 样式
   * ------------------------------------------------------------------ */
  function injectStyle() {
    if (document.getElementById('dsh-html-style')) return
    var style = document.createElement('style')
    style.id = 'dsh-html-style'
    style.textContent =
      '' +
      /* 无痕融入对话流：无边框、无底色、无内阴影；工具栏仅悬停浮现。 */
      '.dsh-html-wrap{position:relative;margin:6px 0}' +
      '.dsh-html-frame{width:100%;border:0;display:block}' +
      '.dsh-html-toolbar{position:absolute;top:6px;right:8px;z-index:5;display:flex;' +
      'align-items:center;gap:4px;padding:3px 8px;border:1px solid rgba(128,128,128,.3);' +
      'border-radius:8px;background:rgba(255,255,255,.92);' +
      'background:light-dark(rgba(255,255,255,.92),rgba(28,32,46,.86));' +
      'color:#555;color:light-dark(#444,#e6e9f2);box-shadow:0 2px 10px rgba(0,0,0,.16);' +
      'backdrop-filter:blur(6px);opacity:0;pointer-events:none;' +
      'transition:opacity .15s ease;font:11px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'white-space:nowrap}' +
      '.dsh-html-wrap:hover .dsh-html-toolbar,.dsh-html-toolbar:focus-within' +
      '{opacity:1;pointer-events:auto}' +
      '@media(hover:none){.dsh-html-toolbar{opacity:1;pointer-events:auto}}' +
      '.dsh-html-toolbar button:focus-visible{outline:2px solid #38bdf8;outline-offset:1px}' +
      '@media (prefers-reduced-motion: reduce){.dsh-html-toolbar{transition:none}}' +
      '.dsh-html-toolbar .lbl{font-weight:600}' +
      '.dsh-html-toolbar .st{color:#b58900}' +
      '.dsh-html-toolbar button{border:1px solid rgba(128,128,128,.45);background:transparent;' +
      'border-radius:6px;padding:1px 7px;font:inherit;color:inherit;cursor:pointer}' +
      '.dsh-html-toolbar button:hover{background:rgba(128,128,128,.16)}' +
      '.dsh-html-toolbar button:disabled{opacity:.45;cursor:default}' +
      '.dsh-html-src{max-height:420px;overflow:auto;padding:8px;' +
      'font:12px/1.6 ui-monospace,Consolas,"SF Mono",monospace;white-space:pre;' +
      'background:rgba(128,128,128,.08);color:#333}' +
      '.dsh-html-warn{padding:6px 8px;color:#b58900;font:12px/1.6 system-ui,sans-serif}' +
      '.dsh-html-fragment{position:relative;margin:6px 0}' +
      '.dsh-html-frag-badge{display:none}'
    document.head.appendChild(style)
  }

  /* ------------------------------------------------------------------ *
   * fence 通道
   * ------------------------------------------------------------------ */
  var mounts = new Map() // block -> mount
  var liveFrames = new Map() // id -> { iframe, onHeight }（fence + 片段共用）
  var mountSeq = 0

  function makeToolbar() {
    var bar = document.createElement('div')
    bar.className = 'dsh-html-toolbar'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'dsh-html 预览工具栏')
    var lbl = document.createElement('span')
    lbl.className = 'lbl'
    lbl.textContent = 'HTML'
    var st = document.createElement('span')
    st.className = 'st'
    st.textContent = ''
    var bSrc = document.createElement('button')
    bSrc.textContent = '源码'
    bSrc.setAttribute('aria-label', '切换源码与预览')
    var bTab = document.createElement('button')
    bTab.textContent = '新标签打开'
    bTab.setAttribute('aria-label', '在新标签页打开预览')
    var bCopy = document.createElement('button')
    bCopy.textContent = '复制'
    bCopy.setAttribute('aria-label', '复制 HTML 源码')
    var bReload = document.createElement('button')
    bReload.textContent = '重载'
    bReload.setAttribute('aria-label', '重新渲染预览')
    bar.appendChild(lbl)
    bar.appendChild(st)
    bar.appendChild(bSrc)
    bar.appendChild(bTab)
    bar.appendChild(bCopy)
    bar.appendChild(bReload)
    return { bar: bar, lbl: lbl, st: st, bSrc: bSrc, bTab: bTab, bCopy: bCopy, bReload: bReload }
  }

  function makeSourceView(raw) {
    var pre = document.createElement('pre')
    pre.className = 'dsh-html-src'
    pre.textContent = raw
    return pre
  }

  function renderFrame(mount) {
    if (!mount.iframe) return
    if (mount._enriching) { mount._pending = true; return } // A4：登记待补帧
    var wantRaw = mount.raw
    mount._enriching = true
    enrichRaw(wantRaw, function (html, css) {
      mount._enriching = false
      if (mount._detached) return
      if (wantRaw !== mount.raw || mount._pending) {
        mount._pending = false
        renderFrame(mount)
        return
      }
      var doc = wrapDocument(html, css, mount.id, false)
      mount.lastHtml = html
      mount.lastCss = css
      if (mount.iframe.srcdoc !== doc) mount.iframe.srcdoc = doc
      mount.lastSwapped = Date.now()
    })
  }

  function mountBlock(block, raw) {
    var container = document.createElement('div')
    container.className = 'dsh-html-wrap'
    var ui = makeToolbar()
    var view = document.createElement('div')
    var frame = document.createElement('iframe')
    frame.className = 'dsh-html-frame'
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('loading', 'eager')
    frame.setAttribute('title', 'dsh-html 预览')
    frame.style.height = '180px'
    view.appendChild(frame)
    container.appendChild(ui.bar)
    container.appendChild(view)
    block.after(container)

    var mount = {
      id: ++mountSeq,
      block: block, container: container, iframe: frame, ui: ui, view: view,
      raw: raw, lastRaw: raw, lastSwapped: 0, settled: false,
      lastChangeAt: Date.now(), truncated: false,
      _detached: false, _enriching: false, _pending: false,
      unmount: function () {
        mount._detached = true
        liveFrames.delete(mount.id)
        container.remove()
        block.style.display = ''
        block.removeAttribute(PROCESSED)
      },
    }
    mounts.set(block, mount)
    liveFrames.set(mount.id, {
      iframe: frame,
      onHeight: function (trunc) {
        if (mount.truncated !== trunc) {
          mount.truncated = trunc
          if (mount.ui) mount.ui.st.textContent = trunc ? '高度已截断' : (mount.settled ? '' : '渲染中…')
        }
      },
    })

    var sourceView = false
    ui.bSrc.addEventListener('click', function () {
      try {
        sourceView = !sourceView
        view.textContent = ''
        if (sourceView) {
          view.appendChild(makeSourceView(mount.raw))
          ui.bSrc.textContent = '预览'
          frame.style.display = 'none'
        } else {
          view.appendChild(frame)
          ui.bSrc.textContent = '源码'
          frame.style.display = 'block'
          renderFrame(mount)
        }
      } catch (e) { dbg(e) }
    })
    ui.bTab.addEventListener('click', function () {
      try {
        var doc = wrapDocument(mount.lastHtml || raw, mount.lastCss || null, mount.id, true)
        var url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }))
        /* noopener + 顶层 sandbox CSP（B2）；5 分钟后回收（D6）。 */
        window.open(url, '_blank', 'noopener')
        setTimeout(function () { try { URL.revokeObjectURL(url) } catch (e) { dbg(e) } }, 300000)
      } catch (e) { dbg(e) }
    })
    ui.bCopy.addEventListener('click', function () {
      var done = function () {
        ui.bCopy.textContent = '已复制'
        setTimeout(function () { ui.bCopy.textContent = '复制' }, 900)
      }
      var fail = function () {
        ui.bCopy.textContent = '复制失败'
        setTimeout(function () { ui.bCopy.textContent = '复制' }, 1200)
      }
      function legacy() {
        try {
          var ta = document.createElement('textarea')
          ta.value = mount.raw
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          var ok = document.execCommand('copy')
          document.body.removeChild(ta)
          ok ? done() : fail()
        } catch (e) { dbg(e); fail() }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(mount.raw).then(done, legacy)
        } else legacy()
      } catch (e) { dbg(e); try { legacy() } catch (x) { dbg(x) } }
    })
    ui.bReload.addEventListener('click', function () {
      try { renderFrame(mount) } catch (e) { dbg(e) }
    })

    /* D5：错误监听先于首次渲染注册，失败给可见提示。 */
    frame.addEventListener('error', function () {
      errCount++
      try {
        view.textContent = ''
        var warn = document.createElement('div')
        warn.className = 'dsh-html-warn'
        warn.textContent = '预览加载失败，已回退为源码视图。'
        view.appendChild(warn)
        view.appendChild(makeSourceView(mount.raw))
        frame.style.display = 'none'
      } catch (e) { dbg(e) }
    })

    try {
      renderFrame(mount)
    } catch (e) {
      dbg(e)
      mount.unmount()
      mounts.delete(block)
      return
    }

    block.style.display = 'none'
    block.setAttribute(PROCESSED, '')
  }

  /* 流式/结束后的内容更新。 */
  function updateMount(mount, raw, settled) {
    mount.raw = raw
    mount.settled = settled
    mount.lastChangeAt = Date.now()
    if (mount.oversized) return
    if (mount.ui) mount.ui.st.textContent = mount.truncated ? '高度已截断' : (settled ? '' : '渲染中…')
    var now = Date.now()
    /* settled 一定立即换帧；流式中按最小间隔节流。 */
    if (settled || now - mount.lastSwapped >= SWAP_MIN_MS) {
      try { renderFrame(mount) } catch (e) { dbg(e) }
    }
  }

  function sweepFences() {
    for (var entry of mounts) {
      var block = entry[0]
      var mount = entry[1]
      if (!block.isConnected) {
        /* 宿主重渲染移除了原块：卸载我们挂载的容器。 */
        if (mount.container && mount.container.isConnected) mount.container.remove()
        block.style.display = ''
        block.removeAttribute(PROCESSED)
        liveFrames.delete(mount.id)
        mounts.delete(block)
        continue
      }
      var raw = mount.oversized ? mount.raw : rawOf(block)
      var settled = isSettled(block)
      /* A5：流式异常中断（宿主不移除 data-streaming）超过 30s 强制视为 settled。 */
      if (!settled && !mount.oversized && mount.lastChangeAt &&
          Date.now() - mount.lastChangeAt > SETTLE_TIMEOUT_MS) settled = true
      /* settle 标签复核：流式中曾按内容接管的围栏，结束时若标签不是
       * dsh-html / html(内容判定)，还原为原生代码块。 */
      if (!mount.oversized && settled && !mount.settled) {
        var label = labelTextOf(block)
        var keep = label === 'dsh-html' ||
          (label === 'html' && looksLikeHtmlFragment(raw)) ||
          (label === '' && looksLikeHtmlFragment(raw))
        if (!keep) {
          mount.unmount()
          mounts.delete(block)
          continue
        }
      }
      if (mount.container.parentElement !== block.parentElement ||
          mount.container.previousElementSibling !== block) {
        /* 修复手术：在宿主重渲染后把容器重新钉回原位再隐藏原块。 */
        block.after(mount.container)
      }
      if (mount.container.isConnected) {
        if (block.style.display !== 'none') block.style.display = 'none'
        if (!block.hasAttribute(PROCESSED)) block.setAttribute(PROCESSED, '')
      } else {
        mount.unmount()
        mounts.delete(block)
        continue
      }
      if (!mount.oversized && (mount.lastRaw !== raw || mount.settled !== settled)) {
        updateMount(mount, raw, settled)
        mount.lastRaw = raw
      }
    }

    /* 发现新围栏。sweep 幂等：已接管的块带 PROCESSED 标记。 */
    var candidates = findFenceCandidates()
    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i]
      if (cand.hasAttribute(PROCESSED)) continue
      var cLabel = labelTextOf(cand)
      if (!wantsTakeover(cand, cLabel)) continue
      var cRaw = rawOf(cand)
      if (cRaw.trim() === '') continue
      /* 超限：仅源码视图，但仍注册轻量 mount 纳入生命周期（A7）。 */
      if (cRaw.length > MAX_BYTES) {
        var c = document.createElement('div')
        c.className = 'dsh-html-wrap'
        var ui = makeToolbar()
        ui.lbl.textContent = 'HTML（超出大小上限，仅源码）'
        var warn = document.createElement('div')
        warn.className = 'dsh-html-warn'
        warn.textContent = '内容超过 1MB 上限，未渲染预览。'
        c.appendChild(ui.bar)
        c.appendChild(warn)
        c.appendChild(makeSourceView(cRaw))
        cand.after(c)
        cand.style.display = 'none'
        cand.setAttribute(PROCESSED, '')
        mounts.set(cand, {
          id: ++mountSeq,
          block: cand, container: c, iframe: null, ui: ui, view: null,
          raw: cRaw, lastRaw: cRaw, lastSwapped: Date.now(), settled: true,
          lastChangeAt: Date.now(), truncated: false, oversized: true,
          _detached: false, _enriching: false, _pending: false,
          unmount: function () {
            c.remove()
            cand.style.display = ''
            cand.removeAttribute(PROCESSED)
          },
        })
        continue
      }
      mountBlock(cand, cRaw)
    }
  }

  /* ------------------------------------------------------------------ *
   * 裸片段通道（A2+B1：同走沙箱 iframe 管线，不再用 shadow DOM + innerHTML）
   * ------------------------------------------------------------------ */
  function looksLikeFragmentText(text) {
    var t = text.replace(/^\s+/, '')
    return /^<div class="mdt"/i.test(t) || /^<!doctype/i.test(t) || /^<html\b/i.test(t)
  }

  function sweepFragments() {
    var rows = document.querySelectorAll('[data-chat-anchor-key]')
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r]
      var anchor = row.getAttribute('data-chat-anchor-key') || ''
      if (anchor.indexOf('assistant') === -1) continue
      /* 先丢弃已断开的旧包装（D4 简化）。 */
      var olds = row.querySelectorAll('[' + FRAG_MARK + ']')
      for (var o = 0; o < olds.length; o++) {
        if (!olds[o].isConnected) olds[o].remove()
      }
      /* 文本节点走查：找以 HTML 形态开头的纯文本段落。 */
      var walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null)
      var nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n]
        var parent = node.parentElement
        if (!parent || parent.childElementCount !== 0) continue
        if (parent.closest('[' + FRAG_MARK + ']')) continue
        var text = node.textContent || ''
        if (!looksLikeFragmentText(text)) continue
        if (text.length > MAX_FRAG_BYTES) continue
        if (parent.querySelector('iframe, script')) continue
        wrapFragment(parent, text)
      }
    }
  }

  /* 裸片段 → 最简沙箱 iframe（sandbox 语义与通道一相同；脚本不在父源运行）。 */
  function wrapFragment(parent, text) {
    var wrap = document.createElement('div')
    wrap.className = 'dsh-html-fragment'
    wrap.setAttribute(FRAG_MARK, '')
    var frame = document.createElement('iframe')
    frame.className = 'dsh-html-frame'
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('loading', 'eager')
    frame.setAttribute('title', 'dsh-html 静态卡片')
    frame.style.height = '120px'
    wrap.appendChild(frame)
    parent.replaceWith(wrap)
    var id = ++mountSeq
    liveFrames.set(id, { iframe: frame, onHeight: function () {} })
    try {
      frame.srcdoc = wrapDocument(text, null, id, false)
    } catch (e) { dbg(e) }
  }

  /* ------------------------------------------------------------------ *
   * 调度：MutationObserver + rAF + 1s 兜底扫描（页面隐藏时暂停）
   * ------------------------------------------------------------------ */
  injectStyle()

  var disposed = false
  var rafId = null

  function sweep() {
    if (disposed) return
    if (document.visibilityState === 'hidden') return
    try { sweepFences() } catch (e) { dbg(e) }
    try { sweepFragments() } catch (e) { dbg(e) }
  }

  function schedule() {
    if (disposed || rafId !== null) return
    rafId = window.requestAnimationFrame(function () {
      rafId = null
      if (disposed) return
      sweep()
    })
  }

  function onBodyReady() {
    if (disposed) return
    var observer = new MutationObserver(function () {
      schedule()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-streaming'],
      characterData: true,
    })
    window.__dshHtmlRenderer.observer = observer
    var interval = window.setInterval(sweep, SWEEP_MS)
    window.__dshHtmlRenderer.interval = interval
    sweep()
  }

  /* iframe 高度上报：id 定位 O(1) + ev.source 校验（B3）。 */
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data
    if (!d || d.kind !== 'dsh-html-height') return
    if (typeof d.h !== 'number' || typeof d.id !== 'number' || !ev.source) return
    var rec = liveFrames.get(d.id)
    if (!rec || rec.iframe.contentWindow !== ev.source) return
    var h = Math.max(40, Math.min(d.h, MAX_HEIGHT))
    rec.iframe.style.height = h + 'px'
    var trunc = typeof d.full === 'number' ? d.full > MAX_HEIGHT : false
    if (rec.onHeight) rec.onHeight(trunc)
  })

  /* 运行时诊断（控制台：__dshHtmlRenderer.stats()） */
  window.__dshHtmlRenderer.stats = function () {
    var trunc = 0
    for (var m of mounts.values()) { if (m.truncated) trunc++ }
    return {
      version: VERSION,
      startedAt: window.__dshHtmlRenderer.startedAt,
      mounts: mounts.size,
      liveFrames: liveFrames.size,
      truncated: trunc,
      katex: katexState,
      katexAttempts: katexAttempts,
      texCache: texCache.size,
      errors: errCount,
      palette: { bg: paletteCache.bg, fg: paletteCache.fg },
    }
  }

  /* D1：手动复位 KaTeX 状态（用于修复页面级永久降级）。 */
  window.__dshHtmlRenderer.resetKatex = function () {
    katexState = null
    katexAttempts = 0
    katexCssCache = null
    katexCssPromise = null
    texCache.clear()
  }

  /* 卸载开关。 */
  window.__dshHtmlRenderer.disable = function () {
    if (disposed) return
    disposed = true
    if (window.__dshHtmlRenderer.observer) window.__dshHtmlRenderer.observer.disconnect()
    if (window.__dshHtmlRenderer.interval) window.clearInterval(window.__dshHtmlRenderer.interval)
    if (rafId !== null) window.cancelAnimationFrame(rafId)
    for (var entry of mounts.values()) {
      try { entry.unmount() } catch (e) { dbg(e) }
    }
    mounts.clear()
    liveFrames.clear()
  }

  /* D9：页面卸载时统一清理（定时器/observer/iframe）。 */
  window.addEventListener('pagehide', function () {
    try { if (!disposed) window.__dshHtmlRenderer.disable() } catch (e) {}
  })

  if (document.body) onBodyReady()
  else window.addEventListener('DOMContentLoaded', onBodyReady)
})()
