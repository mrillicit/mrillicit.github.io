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

Native image parsers have been a good place to find memory corruption for
twenty years. Nobody who does this for a living is surprised by that. What is
worth writing down is not the sink, it is the road: which ordinary feature, in
which ordinary framework, quietly hands a stranger's bytes to one.

In an application I wrote for the test, one anonymous POST carrying an SVG
reached a native library four dependencies below the framework, and a command
inside that SVG ran as the Next.js server process. The command wrote six bytes
to a file. On the build with the newer native library, the same request
returned a normal PNG and wrote nothing.

The report came back a duplicate. That is not the interesting part.

### What this is, and what it is not

Worth being exact before you read on, because the difference matters.

The memory-corruption bug is not mine. It was found upstream in librsvg and
already had a CVE. The exploit document is not mine either, and I say where it
came from in section 7.

What is mine is the **route**: the finding that a second, unlocked path reaches
that parser on builds that had already been patched against the first path, and
the test matrix showing it. Not a novel vulnerability. A reachability result.

That is a smaller claim than the headline, and it is still the part I think is
worth your time, because a patch that closes one road does not close the road
nobody mapped.

## Table of contents

## How upstream research works

A recurring shape in framework RCEs, and not the shape most people look
for:

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
those packages actually resolve. It is not universal. It is just far more
common than the number of people who could name `librsvg` if you asked them.

And "optional" turns out to be load-bearing in a very literal way. Section 8
shows the line in the shipped bundle where the renderer is chosen, and the
condition is not the runtime, it is `if (sharp)`. Whether a request reaches C
or reaches WebAssembly comes down to whether one optional package was present
at install time.

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

It is not a sealed door, and it would be wrong to write it up as one. On
2026-11-03, after everything below had already happened, Vercel published
[GHSA-7qx7-33qx-rqx2](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2):
an image from a permitted source can be misclassified as AVIF, slip past
`dangerouslyAllowSVG: false`, and still get decoded as SVG. The setting you
trusted to keep SVG out did not keep SVG out. Self-hosted deployments, fixed in
15.5.29 and 16.4.5.

So the defended road had a hole in it too. My point was only ever the narrower
one: a door somebody has visibly reinforced is the expensive place to spend your
week, so I went looking for a door nobody had thought about.

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
can be a `data:` URI.

This is the part worth proving rather than asserting, so here is the shipped
code. Satori reaches Next.js vendored and minified inside
`next/dist/compiled/@vercel/og/index.node.js`, so the names below are the
bundle's, not the author's:

```js
if (A.startsWith("data:")) {
  // ...regex splits A into { imageType: i, encodingType: o, dataString: a }
  if (i === ei) {                       // ei is "image/svg+xml"
    let u2 = o === "base64" ? atob(a) : decodeURIComponent(...),
        // the kept value when base64: A, the URI exactly as it arrived
        l2 = o === "base64" ? A : `data:image/svg+xml;base64,${btoa(u2)}`,
        // Os only reads width/height out of the decoded copy
        I  = Os(A, u2);
    return _e.set(A, [l2, ...I]), [l2, ...I];
  }
}
```

Read the middle line. When the encoding is base64, the value Satori keeps is
`A`, which is **the data URI exactly as it arrived**. It decodes your document
into `u2`, and it uses that decoded copy for one purpose only: `Os` measures the
width and height so layout can reserve a box. Then it throws the decoded copy
away and emits the original string.

So your SVG is never parsed as markup, never re-serialized, never escaped. It is
measured and copied. That single fact is the whole finding, and it is why the
escaping fix in section 3 cannot reach this: there is no serialization step here
to harden.

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

A working exploit document for the librsvg CVE already existed publicly, in
EQSTLab's proof of concept for CVE-2026-94545, and the nested XML and path data
carrying the control flow are their work, not mine. I pinned it at one commit
and changed one thing: the only command became a write of six bytes to a
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

Node v24.20.0 x64 throughout, the official Linux archive checked against the
published SHA-256, on Debian bookworm with glibc, in containers with no network
and a read-only filesystem apart from one evidence directory. Rows four and five
use the same built application as rows two and three with the Sharp package
and its two native directories overlaid, so the application code and the Next.js
bundle are byte-identical across the comparison. To be precise about what moved:
Sharp went 0.35.4 to 0.35.5 and carried librsvg 2.62.91 to 2.63.2 with it. The
librsvg ownership fix is the change that matters, but it is not the only line
that changed, and I cannot claim a single-variable experiment.

### Telling a crash apart from execution

This part is worth stating, because a native parser falling over looks a lot
like a native parser being driven, and it is the easiest way to fool yourself.

Three things had to line up before I counted a row as execution. Every cell
first rendered a harmless red square and had the centre pixel checked for
`[255,0,0,255]`, so a cell that simply could not render was visible as a broken
cell rather than a quiet one. The marker file had to appear, and it is a file
the application has no code to create, so nothing but the payload could have
written it. And the connection had to close with no response, which is what a
successful `execve` looks like from outside: the process that owed you a reply
has been replaced by the thing you asked for.

A crash gives you the closed connection and nothing else. It is the marker that
separates the two, and it is why the payload writes a file instead of doing
anything more interesting.

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

## 8. Edge is not this bug behind a sandbox

This is the other claim I would rather show than assert, and I had it wrong in
my head at the start.

Next.js picks the renderer in `next/dist/server/og/image-response.js`, and the
entire decision is one ternary:

```js
function importModule() {
  return import(
    process.env.NEXT_RUNTIME === 'edge'
      ? 'next/dist/compiled/@vercel/og/index.edge.js'
      : 'next/dist/compiled/@vercel/og/index.node.js'
  );
}
```

Two different bundles. Inside the Node one, at the point the SVG is finally
rendered:

```js
if (sharp) {
  pngBuffer = await sharp(new TextEncoder().encode(svg))
    .resize(...).png().toBuffer();
} else {
  const resvgJS = new resvg.Resvg(svg, { ... });
}
```

Three things fall out of those nine lines.

The Satori output goes into `sharp()` with nothing in between. No inspection, no
validation, no allowlist. The trust boundary in the diagram is not a
simplification, it is that line.

The branch is `if (sharp)`, not the runtime. A Node deployment without Sharp
resolved takes the `else` and renders with `resvg` like Edge does. The optional
dependency decides the attack surface.

And Edge is **not this bug behind a sandbox**. `resvg` is a separate SVG
implementation in Rust, not librsvg. Different codebase, different entity
handling, nothing to free twice. A payload built for the librsvg use-after-free
is not contained there, it is irrelevant there.

Two separate properties get credited to Edge and they are worth keeping apart.
The first is that it runs different code, which is why this particular CVE does
not apply. The second is that WebAssembly is a sandbox with linear memory and no
syscalls, so even a genuine memory bug in `resvg` would have to escape that
before it reached a shell. On Node there is no second property to fall back on:
Sharp is a native addon inside the server process, and execution there holds the
filesystem, the environment variables and the network position of your
application.

The lesson is not "use Edge and you are safe". It is that two runtimes of the
same feature can be two different attack surfaces, and a finding against one
says nothing about the other until you check which library each actually
loads.

## 9. Duplicate, then the advisory

- **2026-10-01.** Closed as a duplicate. The triage note named the same attack
  surface, a nested SVG passed through to the image pipeline, and the same
  impact, already tracked under an earlier private report.
- **2026-10-14.** Vercel published
  [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
  critical, patched in 15.5.28 and 16.4.1.

Thirteen days between being told it was known and watching it go public.

Those two facts fit together more comfortably than they first look. A duplicate
decision is about the root cause, not about your route to it. I had a different
delivery path, on builds past the fix that was supposed to close this, and that
is a real and separate fact about reachability. It is still the same underlying
defect in the same library, so from the program's side there is one thing to
track and one thing to fix. Finding a second door into a room somebody has
already reported does not give you a second room.

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
