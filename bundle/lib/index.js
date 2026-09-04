/**
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

const ASSET_ROUTE_PATH = "/plugins/dsh-html-render/assets";
const ALLOWED_RE = /\.(js|css|woff2|json)$/;
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
].join("\n");

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
function apply(ctx) {
  ctx.systemPrompt.section({
    name: "dsh-html:fence",
    order: 106,
    text: SECTION_TEXT,
  });
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

export { SECTION_TEXT, apply };
