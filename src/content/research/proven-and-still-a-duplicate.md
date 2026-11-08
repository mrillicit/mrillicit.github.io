---
title: "Nobody installs librsvg, and everybody runs it"
description: "Four dependencies below your Next.js app sits an SVG parser driving C code from 1999. Everyone locks the obvious route to it. There is a second one, and it is the feature that makes your link previews."
pubDatetime: 2026-11-03T06:00:00Z
modDatetime: 2026-11-08T09:00:00Z
severity: "critical"
target: "librsvg via Next.js next/og"
theme: "web"
tags: ["collisions", "native", "upstream", "methodology"]
---

An image endpoint is not where you go looking for code execution. It takes some
markup, draws a picture, sends it back. No shell, no templates, no eval.

In the app I built to test this, one anonymous POST carrying an SVG reached a
native library four dependencies below the framework, and a command inside that
SVG ran as the Next.js server process. The command wrote six bytes to a file.
On the build with the newer native library, the same request returned a normal
PNG and wrote nothing.

The report came back a duplicate. That is not the interesting part.

The interesting part is **reachability**. A flaw that has already been found,
already been patched upstream, and already been written off as somebody else's
problem becomes live again the moment you find a different road to it.

## Table of contents

## How upstream research works

Almost every serious framework RCE of the last two years has the same shape,
and it is not the shape people look for:

1. A **vendored library** on the request path processes attacker data.
2. The flaw is **in that library's own code**.
3. The **integration** makes it reachable unauthenticated, and gives it
   authority it should not have.

The bug belongs to the library. The framework is delivery and amplification.

That ordering is also a search strategy. Most people start at the entry point
and push inwards, trying payloads against whatever the app exposes. Starting at
the other end works better: find the dangerous code first, then go looking for
a road to it.

## 1. Starting from the sink

So the first question was not "what can I send". It was "what native code is
sitting under this request path at all".

Searching a Next.js `package.json` for librsvg finds nothing. The only clue is
one line in the framework's own manifest:

```jsonc
// next/package.json, v16.3.8
"optionalDependencies": {
  "sharp": "^0.35.4"
}
```

Optional. That word is doing a lot of work. Sharp is the image library Next.js
uses for server-side image work, and in practice plenty of deployments have it
because the framework asks for it. Follow it down:

```
sharp        the Node addon you installed
  -> libvips   C image library
    -> librsvg   SVG renderer
      -> libxml2   the XML parser, C, from 1999
```

Four levels below anything you chose, running in-process with your server's
permissions. Nobody on the team has opened any of it.

To be exact about the claim in the title: this pipeline is only present when
those packages are installed and the code path runs on the Node runtime. It is
not universal. It is just far more common than the number of people who could
name `librsvg` if you asked them.

## 2. The picture before the detail

Before any of the parser internals, here is the road the bytes travel in the
app I tested:

```
  HTTP POST, unauthenticated
        |
        v
  [ application route handler ]
  app code, not framework code.
  puts the body into an
  <img src="data:image/svg+xml;...">
        |
        v
  [ Satori ]  JavaScript
  turns JSX and CSS into an SVG,
  copying that data: URI through
        |
  = = = = = = = = = = = = = = = =
  trust boundary ends here
        |
        v
  [ Sharp -> libvips -> librsvg ]
  native C, in your server process.
  parses the whole document, the
  attacker's child SVG included
```

The last stage is where memory safety stops being somebody else's problem. Note
the top box. **The complete attacker-controlled SVG is supplied by the
application handler, not by a stock Next.js endpoint.** I come back to that in
section 7, because it is the single biggest limit on this result.

## 3. The flaw in librsvg

Two ordinary XML features. Neither is a bug on its own.

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
[CVE-2026-96889](https://rustsec.org/advisories/RUSTSEC-2026-0305.html).
The versions I tested were librsvg 2.62.91 affected and 2.63.2 fixed. RustSec
lists fixes on more than one release branch, so check your own build rather than
trusting a single version number.

Freed memory gets reused. The next allocation of that size can land on the same
address, so you shape the document until the thing landing there is yours.
librsvg then reads your bytes as its own bookkeeping and follows pointers you
wrote.

What makes it land reliably rather than at random: the official Node.js Linux
x64 binary is built **non-PIE**, so it loads at a fixed address and the gadgets
inside it sit at the same place in every copy of that same build. No memory leak
needed. That is a property of one binary on one platform, and it is exactly why
Sharp's own advisory treats position-independent builds as a mitigation. Swap
the Node build and the addresses in the payload stop meaning anything.

### Two CVEs, and they are not the same bug

These get conflated constantly, so, plainly:

| | CVE-2026-94545 | CVE-2026-96889 |
|---|---|---|
| Where | Satori, JavaScript | librsvg, C |
| What | attacker text written into the generated SVG without proper escaping | use-after-free on a duplicate entity during XInclude |
| Fixed in | Next.js 16.3.6 | librsvg 2.63.2, reaching apps via Sharp 0.35.5 |

The first is an **injection** bug: you smuggle markup into a document somebody
else is building. The second is a **memory corruption** bug in the code that
later parses that document. Patching the first does not touch the second. That
distinction is the whole story below.

## 4. The first road was the wrong one

`/_next/image`, the image optimizer, is where everyone goes first. I did too.

SVG there is refused unless the developer turns on `dangerouslyAllowSVG`, which
is off by default, and the libvips loaders are cut down to a short allowlist.
That is real hardening, and it is why I stopped spending time on it.

It is not a sealed door, and I should be careful not to say that it is. Vercel's
October security update names the Image Optimization API specifically, and there
is public work on content-type detection paths through it. My point is narrower:
it is the defended road, so it is the expensive place to dig.

## 5. The observation that moved it

`next/og` generates Open Graph images, the preview card that appears when
somebody pastes your link into a chat app. The thing worth noticing is that it
**does not reuse the optimizer at all**. Different module, different first
stage, different assumptions.

Its first stage is Satori, a Vercel library that turns JSX and CSS into an SVG
document in pure JavaScript. It runs layout, converts text to outlines, emits
shapes. No browser. On the Node runtime, that SVG then goes to Sharp, and down
the chain from section 1.

The two pipelines differ in one belief about their input. The optimizer treats
input as hostile, because it fetches from the internet. `next/og` treats the SVG
as its own, because Satori generated it microseconds earlier.

So one road has a lock, and the other has nothing anybody thought to lock.

## 6. Satori embeds images, and an image can be a document

The remaining question was how a requester gets bytes into that trusted SVG.

Satori does not only turn JSX into shapes. It embeds images, and an image source
can be a `data:` URI. When an application puts a user-supplied SVG into an
`<img>`, Satori keeps that data URI and writes it into the outer SVG. The whole
thing, child document included, goes to Sharp and into librsvg.

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

"Let users upload their own share card" is an ordinary feature request. That is
the chain.

And it explains why the serializer fix does not help. A fix for CVE-2026-94545
escapes text that gets written into the generated SVG. My SVG was never text
being written in. It was already a finished document before Satori saw it.

## 7. Six bytes

A working exploit document for the librsvg CVE already existed publicly, so I
used it and changed one thing: the only command became a write of six bytes to a
file. Padding and addresses untouched, because they are tuned to one allocator
and one Node build and I had no reason to retune them.

The delivery is what I changed. The public exploit arrives by injection into the
generated SVG, which is the route closed in 16.3.6. Mine arrives as a child
image, on builds **past** that fix. The hardening was present and never fired.

One POST. The connection closes with no response, because a successful `execve`
replaces the running process, so no worker survives to answer. Then:

```console
$ cat /tmp/next-og-rce-proof
PROVEN
```

Every cell below used the same nested SVG and ran a benign red-pixel control
first, so a failure to render could not be mistaken for a failure to exploit.

| Next.js | Sharp | librsvg | Result |
|---|---|---|---|
| 16.3.5 | 0.35.4 | 2.62.91 | connection closed, marker written |
| 16.3.6 | 0.35.4 | 2.62.91 | marker written, despite the serializer fix |
| 16.3.8 | 0.35.4 | 2.62.91 | marker written |
| 16.3.6 | 0.35.5 | 2.63.2 | PNG 200, no marker, server healthy |
| 16.3.8 | 0.35.5 | 2.63.2 | PNG 200, no marker, server healthy |

Node v24.20.0 x64 throughout, verified against the official checksum, in
offline containers. Rows four and five use the same built application as rows
two and three with only the native packages swapped, so the only variable in
the comparison is librsvg.

### What has to be true, stated separately

I am not claiming a stock Next.js install is exploitable by this route. The
result needs all of:

- **An application handler that forwards a complete SVG into
  `ImageResponse`.** No stock endpoint does this. This is the assumption that
  carries the most weight, and it is app code.
- **An affected Sharp.** `^0.35.4` permits both the affected and the fixed
  build, so your lockfile decides. A fresh install resolves to the fixed one.
- **The Node runtime**, not Edge. Next section.
- **A matching non-PIE Node x64 binary** and a favourable heap layout for the
  specific payload to work unmodified.

Drop any one of those and what remains is a crash risk rather than a demonstrated
command.

## 8. Why Node and not Edge

The same pipeline on the Edge runtime renders with `resvg` compiled to
WebAssembly. WASM is a sandbox with linear memory and no syscalls, so corrupting
it gets you the sandbox.

On Node, Sharp is a native addon inside the server process. No boundary. Code
execution there holds the filesystem, the environment variables and the network
position of your application.

Same bug, same payload. The runtime decides whether it is a curiosity or a
server.

## 9. Duplicate, then the advisory

- **2026-10-01.** Closed as a duplicate. The triage note named the same attack
  surface, a nested SVG passed through to the image pipeline, and the same
  impact, already tracked under an earlier private report.
- **2026-10-14.** Vercel published
  [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
  critical, patched in 15.5.28 and 16.4.1.

Thirteen days between being told it was known and watching it go public.

The remedy there is a Sharp version bump rather than a change to Next.js code,
which is section 1 restated: the memory-safety defect was upstream, and what the
framework shipped was a new dependency floor. Not a patch to its own logic, and
nothing to do with the earlier Satori serializer bug.

Their title says Image Optimization API, meaning `/_next/image`. I never touched
that endpoint. Both roads end at Sharp, so the bump covers both, but anyone who
read that title and concluded they were safe because they do not use the
optimizer read it too narrowly.

## 10. The idea worth keeping

A patch removes a mechanism. An exploit needs a capability.

The serializer fix was correct and effective against injection. This never
needed injection. It needed rendering, and rendering was never removed.

If you want to run this method on another framework, it is three questions:

1. **What native code is on the request path?** Walk the optional and
   transitive dependencies, not the ones you chose. Look for parsers, decoders,
   renderers.
2. **Which roads reach it, and what does each road assume about its input?**
   The defended road is rarely the only one. Find the one whose input is
   considered trusted because the framework generated it.
3. **When an advisory ships with a public exploit, separate the vendor's bug
   from the payload.** Then ask whether that payload can arrive another way.

The third one is where the duplicates and the originals part company.
