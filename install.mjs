#!/usr/bin/env node
/**
 * install.mjs — cross-platform installer for the dsh-html inline HTML renderer
 *
 * Usage:
 *   node install.mjs                    apply (idempotent install / repair)
 *   node install.mjs --check            report status only, no writes
 *   node install.mjs --uninstall        restore index.html, remove dist\dsh-html
 *   node install.mjs --force            re-sync even when hashes match
 *   node install.mjs --all              process every detected dist
 *   node install.mjs --dist <path>      explicit web dist directory
 *   node install.mjs --port <n>         HTTP probe port (default: $DSH_WEB_PORT || 3080)
 *
 * Exit codes: 0 = installed/checked-OK, 1 = error, 2 = check found problems.
 * This is the primary cross-platform installer; install-dsh-html.ps1 is the
 * Windows thin wrapper (same semantics).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, renameSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { execSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
/* 缓存击穿：注入标签携带 client 版本号（?v=N），client.js 升级后浏览器强制拉新，
 * 杜绝旧版缓存继续运行。兼容旧版无 ?v 的标签（正则匹配两者）。
 * 注意：不使用 g 标志 —— 带 g 的 .test() 会推进 lastIndex，导致二次判定失效。 */
const MARKER_RE = /<script src="\/dsh-html\/client\.js(?:\?v=\d+)?" defer><\/script>/
function clientVersion() {
  try {
    const s = readFileSync(clientSrc, 'utf8')
    const m = s.match(/dsh-html-renderer version:\s*(\d+)/)
    return m ? m[1] : '0'
  } catch { return '0' }
}
function markerTag() { return '<script src="/dsh-html/client.js?v=' + clientVersion() + '" defer></script>' }

/* ---------------- args ---------------- */
const args = process.argv.slice(2)
const opt = { check: false, uninstall: false, force: false, all: false, dist: null, port: null }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--check') opt.check = true
  else if (a === '--uninstall') opt.uninstall = true
  else if (a === '--force') opt.force = true
  else if (a === '--all') opt.all = true
  else if (a === '--dist') opt.dist = args[++i]
  else if (a === '--port') {
    const v = Number(args[++i])
    if (!Number.isInteger(v) || v <= 0) { console.error('[dsh-html] --port 必须是正整数'); process.exit(1) }
    opt.port = v
  }
  else if (a === '-h' || a === '--help') { console.log('see header comment'); process.exit(0) }
}
const PROBE_PORT = opt.port || Number(process.env.DSH_WEB_PORT) || 3080

/* ---------------- helpers ---------------- */
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const say = (tag, msg) => console.log(`[${tag}] ${msg}`)

function detectEncoding(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { enc: 'utf8', bom: Buffer.from([0xef, 0xbb, 0xbf]) }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { enc: 'utf16le', bom: buf.subarray(0, 2) }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { enc: 'utf16be', bom: buf.subarray(0, 2) }
  /* N7e：无 BOM 的 UTF-16LE 启发式（ASCII 内容奇数偏移多为 0x00） */
  if (buf.length >= 4 && buf.length % 2 === 0) {
    let zero = 0
    for (let i = 0; i < buf.length; i += 2) if (buf[i] === 0) zero++
    if (zero > buf.length / 8) return { enc: 'utf16le', bom: null }
  }
  return { enc: 'utf8', bom: null }
}

/* Atomic-ish write with retry (N7f: short retry loop on Windows rename). */
function atomicWrite(target, buf) {
  const tmp = target + '.tmp'
  writeFileSync(tmp, buf)
  for (let attempt = 0; attempt < 3; attempt++) {
    try { renameSync(tmp, target); return } catch {}
    rmSync(target, { force: true })
    try { renameSync(tmp, target); return } catch (e) { if (attempt === 2) throw e }
  }
}

function lastBodyIndex(text) {
  const idx = text.toLowerCase().lastIndexOf('</body>')
  return idx >= 0 ? idx : -1
}

function httpProbe() {
  return new Promise((resolveP) => {
    const req = http.get(`http://127.0.0.1:${PROBE_PORT}/dsh-html/client.js`, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        const m = data.match(/version:\s*(\d+)/)
        resolveP({ ok: res.statusCode === 200, bytes: data.length, version: m ? Number(m[1]) : null })
      })
    })
    req.setTimeout(5000, () => { req.destroy(); resolveP({ ok: false, bytes: 0, version: null }) })
    req.on('error', () => resolveP({ ok: false, bytes: 0, version: null }))
  })
}

/* ---------------- dist discovery (E1) ---------------- */
function distCandidates() {
  const out = []
  const push = (p) => { if (p && existsSync(join(p, 'index.html'))) out.push(resolve(p)) }
  if (opt.dist) {
    /* N7a：显式 --dist 但缺 index.html 时报错，而非静默降级为"未定位" */
    if (!existsSync(join(opt.dist, 'index.html'))) {
      console.error(`[dsh-html] --dist 下未找到 index.html: ${opt.dist}`)
      process.exit(1)
    }
    push(opt.dist)
    return out
  }

  const npmCache = process.env.npm_config_cache
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const localApp = process.env.LOCALAPPDATA || ''
  const appData = process.env.APPDATA || ''

  const roots = new Set()
  if (npmCache) roots.add(join(npmCache, '_npx'))
  if (localApp) roots.add(join(localApp, 'npm-cache', '_npx'))
  if (home) roots.add(join(home, '.npm', '_npx'))
  if (appData) roots.add(join(appData, 'npm', 'node_modules'))
  /* N7c：pnpm 全局根目录探测 */
  try {
    const pnpmRoot = execSync('pnpm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (pnpmRoot) roots.add(pnpmRoot)
  } catch {}
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const sub of readdirSync(root, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue
      if (root.endsWith('node_modules')) {
        push(join(root, sub.name, '@deepseek-ai', 'dsh-web-frontend', 'dist'))
      } else {
        push(join(root, sub.name, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist'))
      }
    }
  }
  for (const g of ['/usr/lib/node_modules', '/usr/local/lib/node_modules', join(home, '.bun', 'install', 'global', 'node_modules')]) {
    push(join(g, '@deepseek-ai', 'dsh-web-frontend', 'dist'))
  }
  return [...new Set(out)] // N7b：去重
}

/* ---------------- per-dist operations ---------------- */
function opTargets() {
  const targets = distCandidates()
  if (!targets.length) {
    console.error('[dsh-html] could not auto-locate the dsh-web-frontend dist.')
    console.error('[dsh-html] pass --dist "C:/path/to/dist" explicitly (or the web dist output of a source build).')
    console.error(`[dsh-html] scanned: npx caches, global npm/pnpm/bun dirs`)
    process.exit(1)
  }
  if (targets.length > 1 && !opt.all) {
    say('INFO', `${targets.length} dists found; processing only the first: ${targets[0]}  (use --all for every dist)`)
    return [targets[0]]
  }
  if (targets.length > 1) say('INFO', `${targets.length} dists found; --all given: processing all`)
  return targets
}

const clientSrc = join(HERE, 'dsh-html-client.js')
const katexSrcDir = join(HERE, 'vendor', 'katex')

function fileState(src, dst) {
  if (!existsSync(dst)) return 'missing'
  if (!existsSync(src)) return 'no-src'
  return hash(src) === hash(dst) ? 'ok' : 'stale'
}

function copyDir(src, dst) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) { mkdirSync(d, { recursive: true }); copyDir(s, d) }
    else { mkdirSync(dirname(d), { recursive: true }); copyFileSync(s, d) }
  }
}

function syncKatex(dstDir) {
  if (!existsSync(katexSrcDir)) { say('WARN', 'vendor/katex not found next to installer; LaTeX formulas will not render.'); return }
  const kjs = join(katexSrcDir, 'katex.min.js')
  const state = fileState(kjs, join(dstDir, 'katex.min.js'))
  if (opt.force || state !== 'ok') {
    mkdirSync(dstDir, { recursive: true })
    copyDir(katexSrcDir, dstDir)
    say('OK', `katex vendor synced -> ${dstDir}`)
  } else say('SKIP', 'katex vendor already up to date')
}

async function runTarget(dist) {
  const indexPath = join(dist, 'index.html')
  const clientDst = join(dist, 'dsh-html', 'client.js')
  const katexDst = join(dist, 'dsh-html', 'katex')
  const bakPath = indexPath + '.bak'
  say('INFO', `dist = ${dist}`)
  if (!existsSync(indexPath)) { say('ISSUE', `index.html not found at ${indexPath}`); return 1 }

  const buf = readFileSync(indexPath)
  const det = detectEncoding(buf)
  let text = buf.toString(det.enc === 'utf16be' ? 'utf16le' : det.enc)
  if (det.enc === 'utf16be') {
    /* swap byte order back: utf16be stored big-endian; node only decodes le */
    const swapped = Buffer.from(buf.subarray(det.bom ? 2 : 0))
    for (let i = 0; i + 1 < swapped.length; i += 2) { const t = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = t }
    text = swapped.toString('utf16le')
  } else if (det.bom) {
    text = buf.subarray(det.bom.length).toString(det.enc)
  }
  const injected = MARKER_RE.test(text) || text.includes('/dsh-html/client.js')

  const encode = () => {
    let body = Buffer.from(text, 'utf16be' === det.enc ? 'utf16le' : det.enc)
    if (det.enc === 'utf16be') {
      const sw = Buffer.alloc(body.length)
      for (let i = 0; i + 1 < body.length; i += 2) { sw[i] = body[i + 1]; sw[i + 1] = body[i] }
      body = sw
    }
    return det.bom ? Buffer.concat([det.bom, body]) : body
  }

  /* -------- uninstall -------- */
  if (opt.uninstall) {
    if (!injected) {
      say('SKIP', 'index.html carries no injection; nothing to restore.')
      if (existsSync(bakPath) && hash(indexPath) !== hash(bakPath)) {
        rmSync(bakPath, { force: true })
        say('OK', 'stale backup (from a pre-upgrade version) discarded.')
      }
    } else if (existsSync(bakPath)) {
      copyFileSync(bakPath, indexPath)
      say('OK', `index.html restored from backup -> ${indexPath}`)
    } else {
      text = text.replace(MARKER_RE, '')
      atomicWrite(indexPath, encode())
      say('OK', 'injected script tag removed (no backup existed; line-level restore).')
    }
    if (existsSync(join(dist, 'dsh-html'))) { rmSync(join(dist, 'dsh-html'), { recursive: true, force: true }); say('OK', 'removed dist/dsh-html') }
    else say('SKIP', 'dist/dsh-html not present.')
    say('dsh-html', 'uninstall complete. Hard-refresh the DSH web GUI (Ctrl+F5).')
    return 0
  }

  /* -------- check -------- */
  if (opt.check) {
    let problems = 0
    const st = fileState(clientSrc, clientDst)
    if (st !== 'ok') problems++
    say(st === 'ok' ? 'OK' : 'ISSUE', `client.js      : ${st}`)
    const kst = fileState(join(katexSrcDir, 'katex.min.js'), join(katexDst, 'katex.min.js'))
    if (kst !== 'ok') problems++
    say(kst === 'ok' ? 'OK' : 'ISSUE', `katex engine   : ${kst}`)
    if (!existsSync(join(katexDst, 'fonts'))) { problems++; say('ISSUE', 'katex fonts    : missing') } else say('OK', 'katex fonts    : present')
    if (injected) say('OK', 'index.html     : script tag injected')
    else { problems++; say('ISSUE', 'index.html   : injection missing') }
    say('INFO', `backup        : ${existsSync(bakPath) ? 'present' : 'absent (uninstall strips the tag instead)'}`)
    const probe = await httpProbe()
    if (probe.ok) say('OK', `HTTP            : 200, served renderer version ${probe.version ?? '?'} (${probe.bytes} bytes)`)
    else say('WARN', 'HTTP            : probe skipped')
    if (problems) { say('dsh-html', `check: ${problems} issue(s). Run without switches to repair.`); return 2 }
    say('dsh-html', 'check: fully installed.')
    return 0
  }

  /* -------- apply -------- */
  if (!existsSync(clientSrc)) { say('ISSUE', `renderer truth-source not found at ${clientSrc}`); return 1 }

  /* upgrade-safe backup: dist re-deployed without injection → refresh backup (E5) */
  if (existsSync(bakPath) && !injected && hash(indexPath) !== hash(bakPath)) {
    copyFileSync(indexPath, bakPath)
    say('OK', 'backup refreshed (dist was re-deployed; new pristine index.html saved)')
  }
  if (!existsSync(bakPath)) { copyFileSync(indexPath, bakPath); say('OK', `backup created -> ${bakPath}`) }
  else say('SKIP', 'backup already exists')

  const st = fileState(clientSrc, clientDst)
  if (opt.force || st !== 'ok') {
    mkdirSync(dirname(clientDst), { recursive: true })
    copyFileSync(clientSrc, clientDst)
    say('OK', `client.js synced -> ${clientDst}`)
  } else say('SKIP', 'client.js already up to date')

  syncKatex(katexDst)

  /* 注入 / 升级注入标签（缓存击穿：带当前 client 版本号 ?v=N） */
  const want = markerTag()
  if (injected) {
    if (text.includes(want)) {
      say('SKIP', 'index.html already injected (current version)')
    } else if (MARKER_RE.test(text)) {
      /* 已注入但版本落后：替换标签为新版本号（升级场景，强制浏览器拉新） */
      text = text.replace(MARKER_RE, want)
      atomicWrite(indexPath, encode())
      say('OK', 'injection tag upgraded (cache-bust v' + clientVersion() + ')')
    } else {
      say('WARN', 'index.html references /dsh-html/client.js but no standard tag found — leaving as-is')
    }
  } else {
    const idx = lastBodyIndex(text)
    if (idx < 0) { say('ISSUE', `no '</body>' found in ${indexPath}`); return 1 }
    text = text.slice(0, idx) + want + '\n' + text.slice(idx)
    atomicWrite(indexPath, encode())
    say('OK', 'script tag injected before the last </body> (cache-bust v' + clientVersion() + ')')
  }

  const probe = await httpProbe()
  if (probe.ok) say('OK', `HTTP 200 verified: http://127.0.0.1:${PROBE_PORT}/dsh-html/client.js (${probe.bytes} bytes${probe.version ? `, renderer v${probe.version}` : ''})`)
  else say('WARN', 'HTTP probe skipped')
  say('dsh-html', 'install complete. Hard-refresh the DSH web GUI (Ctrl+F5) to activate.')
  return 0
}

/* ---------------- main ---------------- */
const targets = opTargets()
let final = 0
for (const t of targets) {
  try { const rc = await runTarget(t); if (rc !== 0) final = rc }
  catch (e) { console.error(`[dsh-html] ${t} failed: ${e.message}`); final = 1 }
}
process.exit(final)
