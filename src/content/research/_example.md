---
title: "Example — delete this file once you have a real entry"
description: "Two sentences, plain language. What the flaw actually was, then what it let you do. The reference sites all read like this — no jargon padding."
pubDatetime: 2026-01-01T00:00:00Z
severity: "note"
target: "Example Vendor"
theme: "web"
draft: true
featured: false
tags: ["example"]
links:
  advisory: "https://example.com/advisory"
  cve: "https://nvd.nist.gov/vuln/detail/CVE-0000-00000"
  poc: "https://github.com/mrillicit/example"
---

## Summary

Write the finding here. The filename becomes the URL, so
`src/content/research/cache-poisoning-acme.md` is served at
`/research/cache-poisoning-acme`.

Field notes:

- `severity` — one of `critical`, `high`, `medium`, `low`, `note`.
  Use `note` for research that is not a disclosed bug; it renders as `RESEARCH`.
- `target` — the affected product or vendor, shown next to the badge.
- `theme` — must match a theme `id` in `src/data/profile.ts`
  (`web`, `ai`, `web3` by default). Entries with no match fall under "Other".
- `featured: true` — pins the entry to the home page. With none set,
  the home page shows the most recent entries instead.
- `links` — every key is optional; only the ones you set are rendered.

The filename starts with `_` so this file is ignored entirely by the content
loader. Real entries must not start with an underscore.
