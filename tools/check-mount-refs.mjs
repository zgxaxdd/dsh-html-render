/**
 * check-mount-refs.mjs — A1 static regression guard.
 *
 * The A1 bug was: inside `mountBlock`, the 源码/复制/重载 handlers referenced a
 * variable named `mount` that was never declared in that scope (the object was
 * actually called `mountObj`), so clicking threw `ReferenceError`. The guard
 * extracts the REAL `mountBlock` body by brace matching (same technique as the
 * unit tests) and asserts:
 *   1. no `mountObj` reference anywhere in the file;
 *   2. `var mount = {` exists inside mountBlock;
 *   3. the three previously-broken handler patterns reference `mount` (defined).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'dsh-html-client.js'), 'utf8')
const issues = []

/* 1. whole-file scan: no mountObj remnant */
if (src.includes('mountObj')) issues.push('reference to mountObj found (A1 regression)')

/* 2. extract the real mountBlock body (scope-aware, ignores other `mount.` uses) */
function extractBody(fnName) {
  const start = src.indexOf(`function ${fnName}(`)
  if (start < 0) return null
  const open = src.indexOf('{', start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1) }
  }
  return null
}
const mb = extractBody('mountBlock')
if (!mb) { issues.push('function mountBlock not found'); console.error('FAIL (A1 guard):\n  - ' + issues.join('\n  - ')); process.exit(1) }

if (!mb.includes('var mount = {')) issues.push('mountBlock does not declare var mount')

/* 3. the three previously-broken handler patterns must exist inside mountBlock
 *    and reference `mount` (the declared object), not a stray `mountObj`. */
for (const pattern of [
  'makeSourceView(mount.raw)',
  'clipboard.writeText(mount.raw)',
  'renderFrame(mount)',
]) {
  if (!mb.includes(pattern)) issues.push(`mountBlock missing expected pattern: ${pattern}`)
}

if (issues.length) {
  console.error('FAIL (A1 guard):')
  for (const i of issues) console.error('  - ' + i)
  process.exit(1)
}
console.log('OK: A1 mount-naming guard passed (mountBlock scoped)')
