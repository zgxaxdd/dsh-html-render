/**
 * test-unit.mjs — pure-function unit tests for dsh-html-client.js (G3).
 *
 * The renderer is a browser IIFE, so we extract the pure function bodies
 * straight from the shipped source (brace-matched) and execute them with
 * `new Function`. This tests the REAL shipped code, not a copy, and needs
 * no DOM / jsdom / dependencies.
 *
 * Run: node --test tools/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'dsh-html-client.js'), 'utf8')

/* Extract `function name(...) { ... }` from source by brace matching. */
function extractFn(name) {
  const start = src.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `function ${name} not found in client.js`)
  const open = src.indexOf('{', start)
  assert.ok(open >= 0, `brace not found for ${name}`)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced braces in ${name}`)
}

const hasLatex = new Function(`return ${extractFn('hasLatex')}`)()
const looksLikeHtmlFragment = new Function(`return ${extractFn('looksLikeHtmlFragment')}`)()
const safeColor = new Function(`return ${extractFn('safeColor')}`)()
const MAX_HEIGHT = Number(src.match(/var MAX_HEIGHT = (\d+)/)?.[1])
const HEIGHT_PAD = Number(src.match(/var HEIGHT_PAD = (\d+)/)?.[1])
const helperScript = new Function(
  'MAX_HEIGHT', 'HEIGHT_PAD', `return ${extractFn('helperScript')}`,
)(MAX_HEIGHT, HEIGHT_PAD)

test('hasLatex triggers on math markers', () => {
  assert.equal(hasLatex('$$x^2$$'), true)
  assert.equal(hasLatex('\\[x\\]'), true)
  assert.equal(hasLatex('\\(x\\)'), true)
  assert.equal(hasLatex('inline $a+b$'), true)
  assert.equal(hasLatex('no math here'), false)
  assert.equal(hasLatex('single $'), false)
  assert.equal(hasLatex(''), false)
})

test('looksLikeHtmlFragment: A3 structured recall', () => {
  assert.equal(looksLikeHtmlFragment('<div class="mdt">x</div>'), true)
  assert.equal(looksLikeHtmlFragment("<div class='mdt'>x</div>"), true) // 单引号
  assert.equal(looksLikeHtmlFragment('<div class="mdt card">x</div>'), true) // 额外 class
  assert.equal(looksLikeHtmlFragment('<!-- c --><section>x</section>'), true) // 注释+section
  assert.equal(looksLikeHtmlFragment('<article>x</article>'), true)
  assert.equal(looksLikeHtmlFragment('<style>.a{}</style><div>x</div>'), true)
  assert.equal(looksLikeHtmlFragment('plain text'), false)
  assert.equal(looksLikeHtmlFragment('<p>only a paragraph</p>'), false)
  assert.equal(looksLikeHtmlFragment('<div  class="mdt">x</div>'), true) // 双空格属性
  assert.equal(looksLikeHtmlFragment('<span>x</span>'), false) // span 非块级容器
})

test('safeColor: whitelist rejects injectable values (B5)', () => {
  assert.equal(safeColor('#fff', 'Canvas'), '#fff')
  assert.equal(safeColor('#a1b2c3', 'Canvas'), '#a1b2c3')
  assert.equal(safeColor('rgba(0, 0, 0, .5)', 'Canvas'), 'rgba(0, 0, 0, .5)')
  assert.equal(safeColor('rgb(1,2,3)', 'Canvas'), 'rgb(1,2,3)')
  assert.equal(safeColor('red', 'Canvas'), 'red')
  assert.equal(safeColor('javascript:alert(1)', 'Canvas'), 'Canvas')
  assert.equal(safeColor('url("evil")', 'Canvas'), 'Canvas')
  assert.equal(safeColor('expression(alert(1))', 'Canvas'), 'Canvas')
  assert.equal(safeColor(null, 'Canvas'), 'Canvas')
  assert.equal(safeColor(undefined, 'Canvas'), 'Canvas')
})

test('helperScript: constant injection + id (F2/B3)', () => {
  const s = helperScript(7)
  assert.ok(s.includes('MID=7'), 'mount id injected')
  assert.ok(s.includes(`MAX=${MAX_HEIGHT}`), 'MAX_HEIGHT injected')
  assert.ok(s.includes(`PAD=${HEIGHT_PAD}`), 'HEIGHT_PAD injected')
  assert.ok(s.includes('"dsh-html-height"'), 'message kind')
  assert.ok(s.includes('id:MID'), 'id in postMessage payload')
})
