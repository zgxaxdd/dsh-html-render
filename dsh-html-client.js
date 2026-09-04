/* dsh-html renderer — 在 DSH 会话消息流中内联渲染 HTML
 *
 * 通道一（fence 通道）：接管 ```dsh-html（及内容判定的 ```html）代码块，
 *  在原始代码块旁挂载 iframe(srcdoc)，sandbox="allow-scripts"（不透明源），
 *  文档内置 CSP meta，脚本/样式/交互完整运行；流式输出时渐进渲染，
 *  结束后做最终渲染；失败自动回退为源码代码块。
 * 通道二（裸片段通道）：宿主把裸 HTML（<div class="mdt">…）渲染为纯文本，
 *  本脚本在 assistant 消息行内把这类文本节点包裹进 shadow DOM 静态渲
 *  染（按 skill 协议裸片段不含脚本）。
 *
 * 由页面级注入（<script src="/dsh-html/client.js">）随 Web 应用壳加载，
 * 对当前 DSH 部署下的所有会话/工作区生效（能力全局，skill 本身分区生效）。
 * 外观无痕：无边框无底色，直接融入对话流；工具栏仅悬停浮现在右上角。
 * 公式通道（v3）：围栏内 $...$（行内）/ $$...$$（块级）/ \(...\) / \[...\]
 *   LaTeX 由父页 KaTeX（本地 /dsh-html/katex/ 静态托管，零外网）预渲染为
 *   数学 HTML 后整体注入 srcdoc —— 一次成型、高度测量准确、不出现未渲染源码；
 *   KaTeX 就绪前暂不挂内容（绝不显示公式源码）。
 * 无框架、除本地 KaTeX 外无网络请求；所有操作均 try/catch，绝不让页面崩溃。
 */
(function () {
  'use strict'
  if (window.__dshHtmlRenderer) return
  window.__dshHtmlRenderer = { version: 3, startedAt: Date.now() }

  /* ------------------------------------------------------------------ *
   * 常量
   * ------------------------------------------------------------------ */
  var PROCESSED = 'data-dsh-html-rendered'
  var FRAG_MARK = 'data-dsh-html-frag'
  var CODE_SELECTORS = '.md-code-block, .code-block, .code-block-small'
  var STREAMING = '[data-streaming]'
  var SWEEP_MS = 1000
  var SURFACE_HOPS = 4
  var BLOCK_CONTENT_SELECTOR =
    'p, ul, ol, dl, table, h1, h2, h3, h4, h5, h6, blockquote, hr, img, figure'
  var MAX_BYTES = 1024 * 1024 // 围栏内容上限 1MB
  var MAX_FRAG_BYTES = 200 * 1024 // 裸片段上限
  var MAX_HEIGHT = 12000 // iframe 高度上限 px
  var SWAP_MIN_MS = 450 // 流式渲染的最小换帧间隔

  /* ------------------------------------------------------------------ *
   * KaTeX 公式通道（本地静态托管 /dsh-html/katex/，父页预渲染）
   *  ------------------------------------------------------------------ */
  var katexState = null // null | 'loading' | 'ok' | 'fail'
  var katexQueue = null
  var katexCssCache = null // 内联 CSS 字符串（含字体路径改写）
  var katexCssPromise = null

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

  function ensureKatex(cb) {
    if (katexState === 'ok') { cb(); return }
    if (katexState === 'loading') { katexQueue.push(cb); return }
    if (katexState === 'fail') return // 加载失败：保留原文，不再尝试
    katexState = 'loading'
    katexQueue = [cb]
    var sc = document.createElement('script')
    sc.src = '/dsh-html/katex/katex.min.js'
    sc.async = true
    sc.onload = function () {
      katexState = 'ok'
      var q = katexQueue
      katexQueue = null
      for (var i = 0; i < q.length; i++) { try { q[i]() } catch (e) {} }
    }
    sc.onerror = function () { katexState = 'fail'; katexQueue = null }
    document.head.appendChild(sc)
  }

  /* 拉取 katex.min.css 并改写字体相对路径为绝对路径，缓存一次。 */
  function ensureKatexCss(cb) {
    if (typeof katexCssCache === 'string') { cb(katexCssCache); return }
    if (katexCssPromise) { katexCssPromise.then(cb); return }
    katexCssPromise = fetch('/dsh-html/katex/katex.min.css')
      .then(function (r) { return r.ok ? r.text() : null })
      .then(function (txt) {
        if (!txt) return null
        var out = txt.replace(
          /url\(["']?fonts\/([^)"']+)["']?\)/g,
          'url(/dsh-html/katex/fonts/$1)'
        )
        /* 超宽公式允许其内部横向滚动，正文绝不滚动。 */
        out += '.katex-display{overflow-x:auto;overflow-y:hidden;padding:2px 0}'
        katexCssCache = out
        return out
      })
      .catch(function () { katexCssCache = null; return null })
    katexCssPromise.then(cb)
  }

  function renderTex(src, display) {
    try {
      if (!window.katex) return src
      return window.katex.renderToString(src, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        trust: false,
        output: 'html',
      })
    } catch (e) { return src }
  }

  /* 按 $$$$ → \[ \] → \( \) → $ $ 顺序替换；渲染失败保留原文。 */
  function replaceLatex(raw) {
    var out = raw
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, function (_, s) { return renderTex(s, true) })
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, function (_, s) { return renderTex(s, true) })
    out = out.replace(/\\\(([\s\S]+?)\\\)/g, function (_, s) { return renderTex(s, false) })
    out = out.replace(/\$([^\s$][\s\S]*?[^\s$])\$/g, function (_, s) { return renderTex(s, false) })
    return out
  }

  /* 富化原始围栏内容：无公式同步返回；有公式时等 KaTeX/CSS 就绪后
   * 返回「公式已渲染的 HTML + 内联 KaTeX CSS」（首次可能异步）。 */
  function enrichRaw(raw, cb) {
    if (!hasLatex(raw)) { cb(raw, null); return }
    ensureKatex(function () {
      ensureKatexCss(function (css) { cb(replaceLatex(raw), css) })
    })
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

  /* 是否为带指定标签的围栏表面（标签叶子在代码体外，且属于本表面）。 */
  function hasLabel(block, lang) {
    var pre = block.querySelector('pre')
    var els = block.querySelectorAll('*')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (el.childElementCount !== 0) continue
      if (el.textContent !== lang) continue
      if (pre && pre.contains(el)) continue
      if (el.closest && el.closest(CODE_SELECTORS) !== block) continue
      return true
    }
    return false
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

  function rowOf(block) {
    if (!block.closest) return block
    return (
      block.closest('[data-chat-anchor-key]') ||
      block.closest('[data-chat-flow-key], [data-chat-flow-kind]') ||
      block
    )
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
  var HELPER_SCRIPT =
    '<script>' +
    '(function(){' +
    'var last=0;' +
    'function contentH(){' +
    'var b=document.body,h=document.documentElement;' +
    'var y1=b?b.getBoundingClientRect().bottom:0;' +
    'var y2=h?h.getBoundingClientRect().bottom:0;' +
    'return Math.ceil(Math.max(y1,y2))+8;' +
    '}' +
    'function report(){' +
    'var h=contentH();' +
    'h=Math.min(h,12000);' +
    'if(h===last)return;' +
    'last=h;' +
    'try{parent.postMessage({kind:"dsh-html-height",h:h},"*")}catch(e){}' +
    '}' +
    'window.addEventListener("load",report);' +
    'if(document.readyState!=="loading")report();' +
    'if(window.ResizeObserver){' +
    'try{new ResizeObserver(report).observe(document.documentElement)}catch(e){}' +
    '}' +
    'if(document.fonts&&document.fonts.ready){' +
    'try{document.fonts.ready.then(function(){report()})}catch(e){}' +
    '}' +
    'window.setInterval(report,400);' +
    '})()' +
    '<\/script>'

  var CSP_META =
    '<meta http-equiv="Content-Security-Policy" content="' +
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
    "img-src https: http: data:; media-src https: http: data:; " +
    "font-src data: https: http:; " +
    "frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'" +
    '">'

  /* ------------------------------------------------------------------ *
   * 宿主主题采样：取对话区的实际背景/文字色注入 iframe，实现真无痕
   * （iframe 文档 canvas 默认白色，透明背景在深色模式下会露大片白）。
   *  ------------------------------------------------------------------ */
  var paletteCache = { t: 0, bg: null, fg: null }

  function hostPalette() {
    var now = Date.now()
    if (now - paletteCache.t < 2000) return paletteCache
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
    if (!bg) bg = 'Canvas'
    if (!fg) fg = 'CanvasText'
    paletteCache = { t: now, bg: bg, fg: fg }
    return paletteCache
  }

  function wrapDocument(raw, katexCss) {
    var headExtra = katexCss ? '<style>' + katexCss + '</style>' : ''
    var pal = hostPalette()
    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      CSP_META +
      headExtra +
      '</head><body style="margin:4px 6px;color-scheme:light dark;' +
      'background:' + pal.bg + ';color:' + pal.fg + ';">' +
      raw +
      HELPER_SCRIPT +
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
      '.dsh-html-toolbar .lbl{font-weight:600}' +
      '.dsh-html-toolbar .st{color:#b58900}' +
      '.dsh-html-toolbar button{border:1px solid rgba(128,128,128,.45);background:transparent;' +
      'border-radius:6px;padding:1px 7px;font:inherit;color:inherit;cursor:pointer}' +
      '.dsh-html-toolbar button:hover{background:rgba(128,128,128,.16)}' +
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

  function makeToolbar(rawRef) {
    var bar = document.createElement('div')
    bar.className = 'dsh-html-toolbar'
    var lbl = document.createElement('span')
    lbl.className = 'lbl'
    lbl.textContent = 'HTML'
    var st = document.createElement('span')
    st.className = 'st'
    st.textContent = ''
    var bSrc = document.createElement('button')
    bSrc.textContent = '源码'
    var bTab = document.createElement('button')
    bTab.textContent = '新标签打开'
    var bCopy = document.createElement('button')
    bCopy.textContent = '复制'
    var bReload = document.createElement('button')
    bReload.textContent = '重载'
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
    var iframe = mount.iframe
    if (mount._enriching) return
    var wantRaw = mount.raw
    mount._enriching = true
    enrichRaw(wantRaw, function (html, css) {
      mount._enriching = false
      if (mount._detached) return
      if (wantRaw !== mount.raw) { renderFrame(mount); return }
      var doc = wrapDocument(html, css)
      mount.lastHtml = html
      mount.lastCss = css
      if (iframe.srcdoc !== doc) iframe.srcdoc = doc
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
    frame.style.height = '180px'
    view.appendChild(frame)
    container.appendChild(ui.bar)
    container.appendChild(view)
    block.after(container)

    var sourceView = false
    ui.bSrc.addEventListener('click', function () {
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
    })
    ui.bTab.addEventListener('click', function () {
      try {
        var doc = wrapDocument(mountObj.lastHtml || raw, mountObj.lastCss || null)
        var url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }))
        var w = window.open(url, '_blank')
        if (w) w.addEventListener('unload', function () { URL.revokeObjectURL(url) })
        else URL.revokeObjectURL(url)
      } catch (e) {}
    })
    ui.bCopy.addEventListener('click', function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(mount.raw).then(function () {
            ui.bCopy.textContent = '已复制'
            setTimeout(function () { ui.bCopy.textContent = '复制' }, 900)
          }).catch(function () {})
        }
      } catch (e) {}
    })
    ui.bReload.addEventListener('click', function () { renderFrame(mount) })

    var mountObj = {
      block: block, container: container, iframe: frame, ui: ui, view: view,
      raw: raw, lastSwapped: 0, settled: false, _detached: false,
      unmount: function () {
        mountObj._detached = true
        container.remove()
        block.style.display = ''
        block.removeAttribute(PROCESSED)
      },
    }
    mounts.set(block, mountObj)

    try {
      renderFrame(mountObj)
      frame.addEventListener('error', function () {
        /* 加载失败：回退为源码视图，绝不空白。 */
        view.textContent = ''
        view.appendChild(makeSourceView(mountObj.raw))
      })
    } catch (e) {
      mountObj.unmount()
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
    if (mount.ui) {
      mount.ui.st.textContent = settled ? '' : '渲染中…'
      mount.ui.bReload.disabled = settled ? false : true
    }
    var now = Date.now()
    /* settled 一定立即换帧；流式中按最小间隔节流。 */
    if (settled || now - mount.lastSwapped >= SWAP_MIN_MS) {
      try { renderFrame(mount) } catch (e) {}
    }
  }

  function sweepFences() {
    for (var entry of Array.from(mounts.entries())) {
      var block = entry[0]
      var mount = entry[1]
      if (!block.isConnected) {
        // 宿主重渲染移除了原块：卸载我们挂载的容器。
        if (mount.container.isConnected) {
          mount.container.remove()
          block.style.display = ''
          block.removeAttribute(PROCESSED)
        }
        mounts.delete(block)
        continue
      }
      var raw = rawOf(block)
      var settled = isSettled(block)
      /* settle 标签复核：流式中曾按内容接管的围栏，结束时若标签不是
       * dsh-html / html(内容判定)，还原为原生代码块。 */
      if (settled && !mount.settled) {
        var label = labelTextOf(block)
        var keep = label === 'dsh-html' ||
          (label === 'html' && looksLikeHtmlFragment(raw)) ||
          (label === '' && looksLikeHtmlFragment(raw)) /* 极少数无标签但内容明确 */
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
        /* 无法重挂：放弃接管，保留原生代码块。 */
        mount.unmount()
        mounts.delete(block)
        continue
      }
      if (mount.lastRaw !== raw || mount.settled !== settled) {
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
      /* 超限：直接回退为源码代码块（不渲染 iframe）。 */
      if (cRaw.length > MAX_BYTES) {
        var c = document.createElement('div')
        c.className = 'dsh-html-wrap'
        var ui = makeToolbar()
        ui.lbl.textContent = 'HTML（超出大小上限，仅源码）'
        var warn = document.createElement('div')
        warn.className = 'dsh-html-warn'
        warn.textContent = '内容超过 1MB 上限，未渲染预览。'
        var src = makeSourceView(cRaw)
        c.appendChild(ui.bar)
        c.appendChild(warn)
        c.appendChild(src)
        cand.after(c)
        cand.style.display = 'none'
        cand.setAttribute(PROCESSED, '')
        continue
      }
      mountBlock(cand, cRaw)
    }
  }

  /* ------------------------------------------------------------------ *
   * 裸片段通道（shadow DOM 静态渲染，无脚本）
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
      /* 先丢弃已断开的旧包装。 */
      var olds = row.querySelectorAll('[' + FRAG_MARK + ']')
      for (var o = 0; o < olds.length; o++) {
        var old = olds[o]
        if (!old.isConnected || old.parentElement !== row) {
          // 注意：宿主重建行时旧包装随行消失；这里只清理孤儿。
        }
        if (!old.parentElement) {
          old.remove()
        }
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

  function wrapFragment(parent, text) {
    var wrap = document.createElement('div')
    wrap.className = 'dsh-html-fragment'
    wrap.setAttribute(FRAG_MARK, '')
    try {
      if (parent.attachShadow) {
        var shadow = parent.attachShadow({ mode: 'open' })
        var badge = document.createElement('div')
        badge.className = 'dsh-html-frag-badge'
        badge.textContent = 'HTML 卡片 · 静态渲染'
        var host = document.createElement('div')
        host.innerHTML = text
        shadow.appendChild(badge)
        shadow.appendChild(host)
      } else {
        wrap.innerHTML = text
      }
    } catch (e) {
      return
    }
    parent.replaceWith(wrap)
  }

  /* ------------------------------------------------------------------ *
   * 调度：MutationObserver + rAF + 1s 兜底扫描
   * ------------------------------------------------------------------ */
  injectStyle()

  var disposed = false
  var rafId = null

  function sweep() {
    if (disposed) return
    try { sweepFences() } catch (e) {}
    try { sweepFragments() } catch (e) {}
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

  /* iframe 高度上报 */
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data
    if (!d || d.kind !== 'dsh-html-height') return
    var h = typeof d.h === 'number' ? Math.max(40, Math.min(d.h, MAX_HEIGHT)) : null
    if (h === null) return
    for (var entry of mounts.values()) {
      if (entry.iframe.contentWindow === ev.source) {
        entry.iframe.style.height = h + 'px'
      }
    }
  })

  /* 卸载开关（便于宿主 stop 后由刷新清理；此时调用可立即还原）。 */
  window.__dshHtmlRenderer.disable = function () {
    if (disposed) return
    disposed = true
    if (window.__dshHtmlRenderer.observer) window.__dshHtmlRenderer.observer.disconnect()
    if (window.__dshHtmlRenderer.interval) window.clearInterval(window.__dshHtmlRenderer.interval)
    if (rafId !== null) window.cancelAnimationFrame(rafId)
    for (var entry of Array.from(mounts.values())) {
      try { entry.unmount() } catch (e) {}
    }
    mounts.clear()
  }

  if (document.body) onBodyReady()
  else window.addEventListener('DOMContentLoaded', onBodyReady)
})()