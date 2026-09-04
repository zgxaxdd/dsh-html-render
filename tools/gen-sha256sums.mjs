/**
 * gen-sha256sums.mjs — (re)generate vendor/katex/SHA256SUMS.
 * Same format the verifier expects: `<UPPERCASE-HEX>  <relative-path>`.
 * Usage: node tools/gen-sha256sums.mjs <base-dir> <sums-file>
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const base = process.argv[2]
const sumsFile = process.argv[3]
if (!base || !sumsFile) { console.error('usage: node tools/gen-sha256sums.mjs <base-dir> <sums-file>'); process.exit(2) }

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name !== 'SHA256SUMS') out.push(relative(base, p).split('\\').join('/'))
  }
}

const files = []
walk(base, files)
files.sort()
const lines = files.map((f) => {
  const hex = createHash('sha256').update(readFileSync(join(base, ...f.split('/')))).digest('hex').toUpperCase()
  return `${hex}  ${f}`
})

/* also include the VERSION file if present (it is part of vendor integrity) */
if (!lines.some((l) => l.endsWith('VERSION'))) {
  try {
    const hex = createHash('sha256').update(readFileSync(join(base, 'VERSION'))).digest('hex').toUpperCase()
    lines.push(`${hex}  VERSION`)
    lines.sort()
  } catch {}
}

console.log(lines.join('\n'))
