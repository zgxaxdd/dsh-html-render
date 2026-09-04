# Security Policy

## Reporting a vulnerability

This project deliberately renders **untrusted model output as HTML**. Security is
the top priority: a sandbox escape would run code with access to the DSH web
origin (localStorage / IndexedDB / same-origin APIs).

Please report any suspected vulnerability privately — do **not** open a public
issue first:

- Open a **private vulnerability report** via GitHub's "Security" tab
  (https://github.com/zgxaxdd/dsh-html-render/security/advisories/new), or
- Email the repository owner directly.

Include: the renderer version (`window.__dshHtmlRenderer.stats().version`),
the affected input (fence source), and a minimal reproduction. Reports are
acknowledged within 5 working days.

## Security model (what is guaranteed)

| Layer | Guarantee |
|---|---|
| iframe sandbox | `sandbox="allow-scripts"` + opaque origin — content cannot read parent cookies/storage/DOM |
| Document CSP | `default-src 'none'`; scripts inline-only, local; no network fetch / iframe / parent access |
| New-tab preview | dedicated CSP with `sandbox allow-scripts` — the top-level tab is also opaque |
| Channel 2 (bare fragments) | same sandboxed iframe pipeline — no `innerHTML` in the parent origin |
| Limits | 1MB per fence, 200KB per fragment, 12000px height, 2000 chars per formula, 200 formulas per fence, `maxExpand`/`maxSize` on KaTeX |
| postMessage | whitelist kind + mount-id O(1) lookup + `ev.source` verification |

## Scope

Only local/self-hosted DSH deployments are supported (the renderer requires
write access to the web `dist`). Cloud-hosted deployments without filesystem
access are out of scope.
