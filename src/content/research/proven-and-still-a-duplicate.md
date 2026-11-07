---
title: "Nobody installs librsvg, and everybody runs it"
description: "Four dependencies below your Next.js app sits an SVG parser driving C code from 1999. Everyone locks the obvious route to it. There is a second one, and it is the feature that makes your link previews."
pubDatetime: 2026-11-03T06:00:00Z
severity: "high"
target: "librsvg via Next.js next/og"
theme: "web"
tags: ["collisions", "native", "upstream", "methodology"]
---

An anonymous POST carrying an SVG reached `librsvg` through `next/og`, and a
command inside that SVG ran as the Next.js server process.

It came back a duplicate. Two weeks later Vercel published the advisory anyway.

## How upstream research works

Almost every serious framework RCE of the last two years has the same shape,
and it is not the one people look for:

1. A **vendored library** on the request path processes attacker data.
2. The flaw is **in that library's own code**.
3. The **integration** makes it reachable unauthenticated, and gives it
   authority it should not have.

The bug belongs to the library. The framework is delivery and amplification.

## 1. The library nobody lists as a dependency

Search a Next.js `package.json` for librsvg. Nothing. The only clue is in the
framework's own manifest:

```jsonc
// next/package.json, v16.3.8
"optionalDependencies": {
  "sharp": "^0.35.4"
}
```

Follow it down:

```
sharp        the Node addon you installed
  -> libvips   C image library
    -> librsvg   SVG renderer
      -> libxml2   the XML parser, C, from 1999
```

Four levels below anything you chose, running in-process with your server's
permissions. That is where to look.

## 2. The flaw

Two ordinary XML features. Neither is a bug alone.

**Entities** are shortcuts a document defines for itself:

```xml
<!DOCTYPE svg [ <!ENTITY greeting "hello"> ]>
<svg xmlns="http://www.w3.org/2000/svg"><text>&greeting;</text></svg>
```

librsvg allows these on purpose. It blocks the kind that point at files on
disk, which is what stops `&xxe;` reading `/etc/passwd`. The kind that just
expand text were left on.

**XInclude** pastes another document inline, and nests.

Now the collision. The outer document defines an entity and starts expanding
it. A nested include brings in a document defining an entity **with the same
name**. librsvg frees the first one to make room. The expansion that is still
running carries on using the memory that was just freed.

That is
[CVE-2026-96889](https://rustsec.org/advisories/RUSTSEC-2026-0305.html),
librsvg up to 2.62.91, fixed in 2.63.2.

Freed memory gets reused. The next allocation of that size lands on the same
address, so you shape the document until the thing landing there is yours.
librsvg then reads your bytes as its own bookkeeping and follows pointers you
wrote.

What makes it reliable instead of a lottery: the official Node.js Linux binary
is built **non-PIE**. It loads at a fixed address, so every gadget inside it is
at the same place on every server running that build. No leak needed. Hardcode
the addresses and they work everywhere.

## 3. Finding the chain

A vulnerable parser is worth nothing until something hands it attacker bytes.
Finding that something is the research.

### The obvious route is locked

`/_next/image` is what everyone tries. SVG is refused there unless the
developer sets `dangerouslyAllowSVG: true`, which defaults to false, and
libvips loaders are blocked down to a short allowlist.

Defended. Which is exactly why it is the wrong place to spend time.

### next/og is a different route with a different assumption

`next/og` is the module that generates Open Graph images, the preview card that
appears when someone pastes your link into a chat app. It does not reuse the
optimizer.

Its first stage is **Satori**, a Vercel library that converts JSX and CSS into
an SVG document in pure JavaScript. It runs layout, turns text into outlines,
and emits shapes. No browser involved. On the Node runtime that SVG then goes
to Sharp, and down the chain from section 1.

The two pipelines differ in one assumption. The optimizer treats input as
hostile, because it fetches from the internet. `next/og` treats input as its
own, because Satori generated it microseconds earlier.

So one path has a lock and the other has nothing to lock.

### Satori embeds images, and an image can be a document

Satori does not only turn your JSX into shapes. It embeds images, and an image
source can be a `data:` URI.

So when an application puts a user-supplied SVG into an `<img>`, Satori keeps
that data URI and writes it into the outer SVG. The whole thing, child document
included, goes to Sharp and into librsvg.

Nothing is injected. Nothing needs escaping. The attacker's document arrives
complete and gets parsed.

```tsx
// application code, not framework code
export async function POST(req: Request) {
  const userSvg = await req.text();
  const dataUri = `data:image/svg+xml;base64,${btoa(userSvg)}`;

  return new ImageResponse(
    <div style={{ display: "flex" }}>
      <img src={dataUri} width={600} height={400} />
    </div>
  );
}
```

"Let users upload their own share card" is an ordinary feature. That is the
chain.

## 4. Six bytes

A working exploit document for this CVE already existed, so I used it and
changed one thing: the command became a write of six bytes to a file. Padding
and addresses untouched, because they are tuned to one allocator and one Node
build.

The delivery is the variable. The published exploit injects into the generated
SVG, fixed in 16.3.6. Mine arrives as a child image, on a build **past** that
fix. The hardening was present and never fired, because my SVG was already a
finished document when Satori met it.

One POST. The connection closes with no response, because a successful `execve`
replaces the running process, so no worker survives to answer. Then:

```console
$ cat /tmp/next-og-rce-proof
PROVEN
```

Same build with Sharp 0.35.5 and librsvg 2.63.2: a PNG comes back and no marker
is written.

## 5. Why Node and not Edge

The same pipeline on the Edge runtime renders with `resvg` compiled to
WebAssembly. WASM is a sandbox with linear memory and no syscalls, so
corrupting it gets you the sandbox.

On Node, Sharp is a native addon inside the server process. No boundary. Code
execution there holds the filesystem, the environment variables and the network
position of your application.

Same bug, same payload. The runtime decides whether it is a curiosity or a
server.

## 6. What it needs to be true

- An app that forwards a complete SVG into `ImageResponse`. No stock endpoint
  does this.
- An older Sharp. `^0.35.4` permits both the affected and the fixed build, so
  your lockfile decides. A fresh install resolves to the fixed one.

## 7. Duplicate, then the advisory

The program closed it as a duplicate: same attack surface, a nested SVG passed
through to the image pipeline, same impact, already tracked.

Two weeks later Vercel published
[GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
critical, patched in 15.5.28 and 16.4.1. The remedy is a Sharp version bump,
not a code change, which is the whole point of section 1. There was no Next.js
defect to fix.

Their title says Image Optimization API, meaning `/_next/image`. I never
touched that endpoint. Both routes end at Sharp, so the bump covers both, but
anyone who read the title and concluded they were safe without the optimizer
was wrong.

## 8. The idea worth keeping

A patch removes a mechanism. An exploit needs a capability.

The serializer fix was correct and effective against injection. The exploit
never needed injection. It needed rendering, and rendering was never removed.

When an advisory ships with a public exploit, separate the vendor's bug from
the payload, then ask whether the payload can arrive another way.
