/**
 * check-version.mjs — version-consistency guard (F3/G2)
 * Verifies:
 *   1. client.js header marker `dsh-html-renderer version: N`
 *   2. CHANGELOG.md latest entry carries `（运行时标记 version: N）`
 *   3. README.md does not hardcode a `{version: N}` runtime pin
 * Run from the repo root: `node tools/check-version.mjs`
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = readFileSync(join(root, 'dsh-html-client.js'), 'utf8')
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const readme = readFileSync(join(root, 'README.md'), 'utf8')

const m = client.match(/dsh-html-renderer version:\s*(\d+)/)
if (!m) { console.error('FAIL: client.js header version marker missing'); process.exit(1) }
const v = Number(m[1])

if (!changelog.includes(`（运行时标记 version: ${v}）`)) {
  console.error(`FAIL: CHANGELOG.md missing "（运行时标记 version: ${v}）" in the latest entry`)
  process.exit(1)
}

const pinned = readme.match(/\{version:\s*\d+/)
if (pinned) {
  console.error('FAIL: README.md hardcodes a runtime version pin:', pinned[0], '— make it version-agnostic')
  process.exit(1)
}

console.log(`OK: client v${v} ↔ CHANGELOG marker ↔ README (no pin)`)
