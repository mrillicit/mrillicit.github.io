# mrillicit.github.io

Personal research site. Built with [Astro](https://astro.build) on the
[AstroPaper](https://github.com/satnaing/astro-paper) theme, reworked from a
blog into a research portfolio. Deployed to GitHub Pages on every push to
`main`.

## Editing

| What | Where |
| --- | --- |
| Name, tagline, intro, themes, tools, talks, recognition, certifications, links | `src/data/profile.ts` |
| Bio prose | `src/content/pages/about.md` |
| Site title, description, author, timezone, header socials | `astro-paper.config.ts` |
| Research entries | `src/content/research/*.md` |
| Colours, light and dark | `src/styles/theme.css` |

Every section driven by `profile.ts` renders only when it has entries, so
sections with nothing in them do not appear at all.

## Adding a research entry

Create `src/content/research/<slug>.md`, which is served at `/research/<slug>`.
`dev/example-research-entry.md` documents every frontmatter field.

```yaml
---
title: "Title in plain language, not the CVE number"
description: "Two sentences. What the flaw was, then what it allowed."
pubDatetime: 2026-01-01T00:00:00Z
severity: "high"   # critical | high | medium | low | note
target: "Vendor or product"
theme: "web"       # must match a theme id in src/data/profile.ts
links:
  advisory: "https://..."
---
```

A filename beginning with `_` is ignored by the content loader.

## Commands

| Command | Does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server on `localhost:4321` |
| `pnpm build` | Production build into `dist/` |
| `pnpm preview` | Serve the built site locally |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

Search is off while there is nothing to index. To enable it, set
`features.search` to `"pagefind"` in `astro-paper.config.ts` and restore the
pagefind steps in the `build` script:

```
astro check && astro build && pagefind --site dist && cp -r dist/pagefind public/
```

## Licence

Theme: MIT, Sat Naing — see `LICENSE`. Site content is mine.
