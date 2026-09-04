/**
 * verify-sha256sums.mjs — vendor integrity check (B6)
 * Usage: node tools/verify-sha256sums.mjs <sums-file> <base-dir>
 * Format: `<hex-sha256>  <relative-path>` per line.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const sumsFile = process.argv[2]
const base = process.argv[3]
if (!sumsFile || !base) { console.error('usage: node tools/verify-sha256sums.mjs <sums-file> <base-dir>'); process.exit(2) }

const lines = readFileSync(sumsFile, 'utf8').split(/\r?\n/).filter(Boolean)
let bad = 0
for (const line of lines) {
  const [want, rel] = line.split(/\s+/)
  if (!want || !rel) { console.error(`malformed: ${line}`); bad++; continue }
  const p = join(base, ...rel.split('/'))
  if (!existsSync(p)) { console.error(`missing: ${rel}`); bad++; continue }
  const got = createHash('sha256').update(readFileSync(p)).digest('hex').toUpperCase()
  if (got !== want) { console.error(`hash mismatch: ${rel}`); bad++ }
}
if (bad) { console.error(`FAIL: ${bad} entry/entries`); process.exit(1) }
console.log(`OK: ${lines.length} vendor entries verified`)
