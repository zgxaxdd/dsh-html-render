# Contributing

Thanks for helping make `dsh-html-render` better!

## Getting started

```sh
git clone https://github.com/zgxaxdd/dsh-html-render
cd dsh-html-render
npm run check          # syntax + version consistency + vendor integrity
```

## Development workflow

- `dsh-html-client.js` is a single zero-dependency IIFE — keep it that way.
- `install.mjs` is the primary cross-platform installer; `install-dsh-html.ps1`
  is a Windows wrapper with the same semantics — keep them in sync.
- Bump `VERSION` in `dsh-html-client.js` **and** add a CHANGELOG entry with
  `（运行时标记 version: N）`; `npm run check` enforces this.
- When touching vendor files, regenerate `vendor/katex/SHA256SUMS` (format:
  `<sha256>  <relative-path>`, one per line).

## Testing

- `npm run check` — static guards (syntax / versions / sums / A1 mount guard).
- `npm run lint` — ESLint (`no-undef` catches A1-class scope bugs).
- `npm test` — pure-function unit tests (extracted from the shipped source).
- Manual smoke: run `node install.mjs --check`, then in a DSH session paste one
  of the `examples/` fences and verify: rendered inline, toolbar buttons work
  (源码/新标签/复制/重载), height fits content, no console errors
  (`window.__dshHtmlRenderer.stats()` shows `errors: 0`).

> ⚠️ Do not run bare `npm install` and expect a side-effect-free dependency
> install: the `install` npm lifecycle name is intentionally **not** used here
> (N4) — use `npm run setup` to install the renderer into a DSH dist.

## Submitting

- Open a PR against `master` with a clear description of the change and which
  review-list item (A/B/C/D/E/F/G) it addresses, if any.
- CI must pass: `ci` workflow (syntax, version consistency, vendor integrity).

## Code of conduct

Be constructive. This project renders untrusted input — review security-related
changes especially carefully.
