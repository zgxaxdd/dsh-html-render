/**
 * build-bundle.mjs — assembles the out-of-tree profile bundle (P0-1).
 *
 * Inputs (repo root):
 *   dsh-html-client.js            → wrapped into bundle/lib/client.js
 *   vendor/katex/**               → copied to bundle/lib/assets/katex/**
 *   skills/dsh-html-usage/SKILL.md → copied to bundle/skills/dsh-html-usage/SKILL.md
 *
 * Outputs (bundle/):
 *   package.json                  → dsh.bundle.patch + dsh.client declarations
 *   cordis.patch.yml              → insert row (id: ui-dsh-html)
 *   lib/index.js                  → host half: asset route + systemPrompt section + skill provider
 *   lib/client.js                 → ModuleLoader wrapper around the kernel
 *   lib/assets/katex/**           → KaTeX engine + fonts (served by the host route)
 *
 * Run: node tools/build-bundle.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundleDir = join(root, 'bundle')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
const kernel = readFileSync(join(root, 'dsh-html-client.js'), 'utf8')

/* reset output */
rmSync(bundleDir, { recursive: true, force: true })
mkdirSync(join(bundleDir, 'lib', 'assets', 'katex', 'fonts'), { recursive: true })
mkdirSync(join(bundleDir, 'skills', 'dsh-html-usage'), { recursive: true })

/* 1. bundle package.json */
writeFileSync(join(bundleDir, 'package.json'), JSON.stringify({
  name: 'dsh-html-render',
  description: 'Inline HTML + KaTeX renderer for DeepSeek Harness (DSH) chats — sandboxed iframes, theme-adaptive, height-accurate, zero network. Install: dsh plugin --profile web add dsh-html-render',
  version,
  license: 'MIT',
  type: 'module',
  main: './lib/index.js',
  exports: {
    '.': './lib/index.js',
    './client': './lib/client.js',
  },
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: { inject: [], platform: 'web' },
  },
  files: ['lib', 'skills', 'cordis.patch.yml', 'README.md'],
  keywords: ['dsh', 'dsh-plugin', 'deepseek', 'katex', 'html-renderer', 'sandbox'],
}, null, 2))

/* 2. cordis.patch.yml */
writeFileSync(join(bundleDir, 'cordis.patch.yml'), `# dsh-html-render bundle for DeepSeek Harness (dsh).
# Installed via: dsh plugin --profile web add dsh-html-render
# The insert row registers the plugin; the host half (lib/index.js) serves the
# KaTeX assets over its own webserver route and teaches the model the
# dsh-html fence via a system-prompt section + a bundled skill; the client
# half (lib/client.js, declared through package.json dsh.client) activates
# the sandboxed-iframe rendering kernel in the browser.
- insert:
    - id: ui-dsh-html
      name: 'dsh-html-render'
`)

/* 3. host half: asset route + systemPrompt section + bundled skill */
const indexJs = `/**
 * dsh-html-render — host half (P0-1 out-of-tree profile bundle).
 *
 * Registers:
 *  1. a webserver prefix route serving the KaTeX engine/fonts from this
 *     package's own directory (same pattern as dsh-genui's asset route —
 *     no host source change needed);
 *  2. a system-prompt section teaching the dsh-html fence contract;
 *  3. a bundled skill (skills/dsh-html-usage/SKILL.md) carrying the full
 *     output protocol.
 *
 * The browser half ships via exports["./client"] (package.json dsh.client).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const F3 = String.fromCharCode(96, 96, 96);

const ASSET_ROUTE_PATH = "/plugins/dsh-html-render/assets";
const ALLOWED_RE = /\\.(js|css|woff2|json)$/;
const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

const here = dirname(fileURLToPath(import.meta.url));
const assetDir = join(here, "assets", "katex");

async function serveAsset(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return }
  let pathname
  try { pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname) }
  catch { res.writeHead(400); res.end(); return }
  const prefix = ASSET_ROUTE_PATH + "/katex/"
  if (!pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return }
  const rel = pathname.slice(prefix.length)
  const file = normalize(rel)
  if (file.startsWith("..") || !ALLOWED_RE.test(file)) { res.writeHead(404); res.end(); return }
  const full = join(assetDir, file)
  if (!full.startsWith(assetDir) || !existsSync(full)) { res.writeHead(404); res.end(); return }
  try {
    const body = readFileSync(full)
    res.writeHead(200, { "content-type": MIME[file.slice(file.lastIndexOf("."))] || "application/octet-stream", "cache-control": "no-cache" })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
}

const SECTION_TEXT = [
  "你可以用 " + F3 + "dsh-html 围栏输出任意原始 HTML，由渲染器在聊天流内联渲染（样式/本地脚本/KaTeX 公式全支持，无边框融入对话流）。",
  "触发：结构图/流程图、多卡讲义、对照大表、计算卡、交互小部件、整页交付物等纯文字难以表达的内容 —— 命中即用；普通问答/短答/公式推导仍用 Markdown。",
  "每个围栏是独立文档：自带精简 <style>（半透明中性底，不写死背景/文字色）；脚本仅围栏内本地交互（禁网络/禁 iframe/禁父页）；公式直接写 $…$ / $$…$$（KaTeX 本地渲染）；红字用 <mark>。",
  "沙箱会静默阻断 alert/confirm/prompt、表单提交、弹窗、localStorage —— 反馈一律用页内 DOM 呈现。",
  "限额：≤3 围栏/回合、各 ≤250 行；整页交付物单围栏 ≤500 行、≤1MB。",
].join("\\n");

const bundledSkillPath = join(here, "..", "skills", "dsh-html-usage", "SKILL.md");
const SKILL_PROVIDER = "dsh-html-render";
const SKILL_DESCRIPTION = "dsh-html 围栏输出协议：触发判定、样式库、安全红线与限额。";

function bundledSkillProvider() {
  const raw = existsSync(bundledSkillPath) ? readFileSync(bundledSkillPath, "utf8") : "";
  const end = raw.indexOf("---", 4);
  const meta = {
    name: "dsh-html-usage",
    description: SKILL_DESCRIPTION,
    invocation: { modelInvocable: true, userInvocable: true },
    source: "bundled",
    provider: SKILL_PROVIDER,
    path: bundledSkillPath,
    resourceBase: { kind: "directory", path: dirname(bundledSkillPath) },
    rank: 600,
    locator: bundledSkillPath,
  };
  return {
    name: SKILL_PROVIDER,
    list: () => Promise.resolve(end >= 0 ? [meta] : []),
    get: () => Promise.resolve(Object.assign({}, meta, { content: end >= 0 ? raw.slice(end + 5) : raw })),
  };
}

/**
 * Register host-side surfaces. The webserver is optional at apply time
 * (ordering), so the registration probes immediately AND on internal/service,
 * mirroring the dsh-genui asset-route pattern.
 * @param ctx - cordis host context.
 */
const inject = ["systemPrompt"];

function apply(ctx) {
  ctx.effect(() => {
    ctx.systemPrompt.section({
      name: "dsh-html:fence",
      order: 106,
      text: SECTION_TEXT,
    });
  }, "dsh-html.systemPrompt.section()");
  ctx.inject(["skills"], (skillCtx) => {
    skillCtx.skills.registerProvider(() => bundledSkillProvider());
  });
  let assetsRegistered = false;
  const tryRegisterAssets = (value) => {
    if (assetsRegistered) return;
    const webServer = value ?? ctx.reflect.get("webServer", false);
    if (webServer === void 0) return;
    webServer.register({ kind: "prefix", path: ASSET_ROUTE_PATH, handler: serveAsset });
    assetsRegistered = true;
  };
  tryRegisterAssets(void 0);
  ctx.on("internal/service", (name, value) => {
    if (name === "webServer") tryRegisterAssets(value);
  });
}

export { SECTION_TEXT, apply, inject };
`
writeFileSync(join(bundleDir, 'lib', 'index.js'), indexJs)

/* 4. client half: ModuleLoader wrapper around the kernel */
const clientJs = `/**
 * dsh-html-render — browser half (built by tools/build-bundle.mjs — do not edit).
 * Wraps the rendering kernel in the web shell's ModuleLoader contract and
 * points the kernel's asset base at this plugin's own webserver route.
 *
 * The factory MUST return a plugin-shaped module (an object exposing apply);
 * the loader activates it as a client Cordis plugin. Without a returned
 * apply the loader reports: "invalid plugin, expect function or object with
 * an apply method, received undefined" (mirrors the dsh-genui client half).
 */
window.__ModuleLoader__.load({
  id: "dsh-html-render",
  factory: function () {
    window.__dshHtmlAssetsBase = "/plugins/dsh-html-render/assets/katex/";
    ${kernel}
    return {
      apply: function () {
        return function dispose() {
          try { if (window.__dshHtmlRenderer) window.__dshHtmlRenderer.disable() } catch (e) {}
        }
      },
    }
  }
})
`
writeFileSync(join(bundleDir, 'lib', 'client.js'), clientJs)

/* 5. KaTeX assets + bundled skill */
copyDir(join(root, 'vendor', 'katex'), join(bundleDir, 'lib', 'assets', 'katex'))
copyFileSync(join(root, 'skills', 'dsh-html-usage', 'SKILL.md'), join(bundleDir, 'skills', 'dsh-html-usage', 'SKILL.md'))

/* 6. bundle README */
writeFileSync(join(bundleDir, 'README.md'), `# dsh-html-render（DSH profile bundle）

Out-of-tree profile bundle 形态的 dsh-html-render —— 由仓库根的 \`tools/build-bundle.mjs\` 生成，请勿手改。

\`\`\`sh
dsh plugin --profile web add dsh-html-render        # npm 形态（发布后）
dsh plugin --profile web add link:<本目录绝对路径>    # 本地 link 形态
\`\`\`

- Host 半边（lib/index.js）：KaTeX 资产路由 + systemPrompt 围栏契约 + 打包 skill
- Client 半边（lib/client.js）：ModuleLoader 包装的渲染内核（v${version}，资产基座指向插件路由）
- 卸载：\`dsh plugin --profile web remove dsh-html-render\`

与磁盘补丁形态互斥守卫：两形态同时存在时由 \`window.__dshHtmlRenderer\` 版本守卫保证只有一个内核实例运行；建议插件形态下卸载磁盘补丁（\`node install.mjs --uninstall\`）。
`)

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else copyFileSync(s, d)
  }
}

console.log(`bundle built -> ${bundleDir}`)
console.log(`  lib/client.js  (${Math.round(statSize(join(bundleDir, 'lib', 'client.js')) / 1024)} KB)`)
console.log(`  lib/index.js   (${Math.round(statSize(join(bundleDir, 'lib', 'index.js')) / 1024)} KB)`)
console.log(`  lib/assets/katex (${countFiles(join(bundleDir, 'lib', 'assets', 'katex'))} files)`)
console.log(`  skills/dsh-html-usage/SKILL.md`)

function statSize(p) { return existsSync(p) ? readFileSync(p).length : 0 }
function countFiles(dir) {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(join(dir, e.name))
    else n++
  }
  return n
}
