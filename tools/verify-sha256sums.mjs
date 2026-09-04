/**
 * verify-sha256sums.mjs — vendor integrity check (N1: bidirectional + verbose).
 * Usage: node tools/verify-sha256sums.mjs <sums-file> <base-dir>
 * Format per line: `<UPPERCASE-HEX>  <relative-path>`.
 * Checks:
 *   1. every listed file exists and its hash matches (prints expected/actual)
 *   2. every file under base (except SHA256SUMS itself) is listed (anti-deletion)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const sumsFile = process.argv[2]
const base = process.argv[3]
if (!sumsFile || !base) { console.error('usage: node tools/verify-sha256sums.mjs <sums-file> <base-dir>'); process.exit(2) }

const lines = readFileSync(sumsFile, 'utf8').split(/\r?\n/).filter(Boolean)
let bad = 0
const listed = new Set()

for (const line of lines) {
  const [want, rel] = line.split(/\s+/)
  if (!want || !rel) { console.error(`malformed: ${line}`); bad++; continue }
  listed.add(rel)
  const p = join(base, ...rel.split('/'))
  if (!existsSync(p)) { console.error(`missing file: ${rel}`); bad++; continue }
  const got = createHash('sha256').update(readFileSync(p)).digest('hex').toUpperCase()
  if (got !== want) {
    console.error(`hash mismatch: ${rel}`)
    console.error(`  expected: ${want}`)
    console.error(`  actual  : ${got}`)
    bad++
  }
}

/* bidirectional: any unlisted file under base is a leak (or a deleted-entry mistake) */
function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name !== 'SHA256SUMS') out.push(relative(base, p).split('\\').join('/'))
  }
}
const onDisk = []
walk(base, onDisk)
for (const f of onDisk) {
  if (!listed.has(f)) { console.error(`unlisted file: ${f} — regenerate SHA256SUMS`); bad++ }
}

if (bad) { console.error(`FAIL: ${bad} problem(s)`); process.exit(1) }
console.log(`OK: ${lines.length} vendor entries verified (bidirectional)`)
