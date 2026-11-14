---
title: "Reachability x Exploitability via upstream leads to RCE"
description: "A known use-after-free in a native SVG parser, four dependencies below Next.js. The obvious route to it is hardened. A second one runs through next/og, in applications that hand it a user-supplied SVG."
pubDatetime: 2026-11-14T06:00:00Z
severity: "critical"
target: "NextJS"
theme: "web"
tags: ["collisions", "native", "upstream", "methodology"]
---

One unauthenticated POST carrying an SVG, and a command inside that SVG ran as
the Next.js server process. The command wrote six bytes to a file. On the same
application with a newer native library underneath it, the same request came back
a normal PNG and wrote nothing.

The report was closed as a duplicate. Thirteen days later Vercel published the
advisory anyway.

## What this is, and what it is not

Worth being exact before the rest, because the difference matters.

The memory-corruption bug is not mine. It is librsvg's, it already had a CVE, and
it was already patched upstream.

What is mine is the route. A second path reaches that parser on builds already
patched against the first path, and the matrix below shows where it does and
does not work. That is a reachability result, not a new vulnerability.

One distinction to hold throughout. Next.js does not expose an endpoint that
accepts your SVG. It offers a rendering capability, and an application decides
whether an unauthenticated requester may hand that capability a complete
document. No stock endpoint does this. The route in my test app does.

| | |
|---|---|
| Entry point | an application route that forwards a request body into `ImageResponse` |
| Next.js | 16.3.8, plus 16.3.5 and 16.3.6 for comparison |
| Sharp | 0.35.4 affected, 0.35.5 fixed |
| librsvg | 2.62.91 affected, 2.63.2 fixed |
| Runtime | Node v24.20.0 x64, official Linux archive, checked against the published SHA-256 |
| Host | Debian bookworm, glibc, offline containers |

## Starting at the sink

The first question was not what I could send. It was what native code sits under
the request path at all.

Search a Next.js `package.json` for librsvg and you find nothing. The only clue
is one line in the framework's own manifest:

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

Four levels below anything you chose, running in your server process with your
server's permissions. That word "optional" turns out to be load-bearing, and I
come back to it.

## The flaw

Two ordinary XML features, neither a bug alone.

**Entities** are shortcuts a document defines for itself:

```xml
<!DOCTYPE svg [ <!ENTITY greeting "hello"> ]>
<svg xmlns="http://www.w3.org/2000/svg"><text>&greeting;</text></svg>
```

librsvg allows these, but blocks the kind that point at files on
disk, which is what stops `&xxe;` reading `/etc/passwd`.

**XInclude** pastes another document inline, and nests.

Now the collision, in order. libxml2 is expanding an entity in the outer
document. Part way through, a nested XInclude parses a second document. That
document declares an entity with the same name, so librsvg replaces the entry in
the entity map the two share. The replacement frees an object the outer parse is
still holding, and when the outer parse resumes it reads memory that has already
been released.

That is [CVE-2026-96889](https://rustsec.org/advisories/RUSTSEC-2026-0305.html).
I tested librsvg 2.62.91 as affected and 2.63.2 as fixed. RustSec lists fixes on
more than one release branch, so check your own build rather than one version
number.

Triggering the invalid read is not the same as controlling it. An attacker also
has to influence what lands in the freed space, which is the part that depends on
the allocator and on a payload built for it.

Two CVEs get conflated constantly here, so, plainly:

| | CVE-2026-94545 | CVE-2026-96889 |
|---|---|---|
| Where | Satori, JavaScript | librsvg, C |
| What | attacker text written into the generated SVG without proper escaping | use-after-free on a duplicate entity during XInclude |
| Fixed in | Next.js 16.3.6 | librsvg 2.63.2, reaching apps via Sharp 0.35.5 |

The first is an injection bug. The second is memory corruption in the code that
later parses the result. Patching the first does not touch the second.

## The optimizer was the wrong place to look

`/_next/image` is where everyone goes first, and I did too.

A surface somebody has deliberately hardened
is the surface everyone else is also testing, and that makes it an expensive
place to spend a week. The question I took elsewhere was whether a second
application-facing rendering path reached the same library.

`next/og` generates Open Graph images, the preview card that appears when
somebody pastes your link into a chat app. It does not reuse the optimizer. Its
first stage is Satori, which turns JSX and CSS into an SVG document in pure
JavaScript, and on the Node runtime that SVG then goes to Sharp.


## What the shipped code says

Minified names are regenerated on every build. The same function is `l2` and `Os`
in the 16.3.5 bundle and `c2` and `Js` in 16.3.8, so an excerpt means nothing
without the artifact it came from. Everything below is from the Node OG bundle
shipped with **next@16.3.8**, and the names are the bundle's.

Satori handling an SVG data URI:

```js
if (A.startsWith("data:")) {
  // ...regex splits A into { imageType: i, encodingType: o, dataString: a }
  if (i === ei) {                       // ei is "image/svg+xml"
    let u2 = o === "base64" ? atob(a) : decodeURIComponent(...),
        // base64 keeps A, the URI exactly as it arrived.
        // anything else is decoded and re-encoded.
        c2 = o === "base64" ? A : `data:image/svg+xml;base64,${btoa(u2)}`,
        // Js only reads width/height out of the decoded copy
        I  = Js(A, u2);
    return _e.set(A, [c2, ...I]), [c2, ...I];
  }
}
```

Read the middle line, and notice it has two branches. A base64 data URI is kept
as `A`, the URI exactly as it arrived. Anything else is decoded and rebuilt.
Satori does read your document either way, but on the base64 branch it reads it
for one purpose only, which is to measure width and height so layout can reserve
a box. Then it discards that copy and emits your original string.

Where the SVG goes next is decided by one ternary, in
`next/dist/server/og/image-response.js`:

```js
function importModule() {
  return import(
    process.env.NEXT_RUNTIME === 'edge'
      ? 'next/dist/compiled/@vercel/og/index.edge.js'
      : 'next/dist/compiled/@vercel/og/index.node.js'
  );
}
```

And inside the Node bundle, at the point it renders:

```js
if (sharp) {
  pngBuffer = await sharp(new TextEncoder().encode(svg))
    .resize(...).png().toBuffer();
} else {
  const resvgJS = new resvg.Resvg(svg, { ... });
}
```

Three things fall out of those lines.

Satori's output enters `sharp()` with no security check in between. Not "no
inspection", because the excerpt above shows Satori reading the document to
measure it, but no validation of what it is allowed to contain and no loader
allowlist of the kind the optimizer applies.

The branch is `if (sharp)`, not the runtime. A Node deployment where Sharp never
resolved takes the `else` and renders with resvg. That optional dependency
decides the attack surface.

And Edge is not this bug behind a sandbox. `resvg` is a separate SVG
implementation in Rust. It does not use librsvg's shared entity map, which is the
structure CVE-2026-96889 is about, so there is nothing there for this payload to
act on. It is not contained on Edge, it is irrelevant on Edge.

That leaves the application. This is an ordinary feature request:

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

## Why the serializer fix does not reach this

The obvious summary is too broad, so it is worth being careful.

The hardening in [PR #99061](https://github.com/vercel/next.js/pull/99061), which
rebuilt the OG bundles against
[Satori commit `26a52aff`](https://github.com/vercel/satori/commit/26a52affc031216fee5882b6e965c8dbc7ac1782)
for [GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j),
did several things: XML text and attribute escaping, element and attribute name
validation, internal-style rejection, and ampersand encoding for embedded SVG
data URLs. That last item sounds like it should cover exactly this case.

It does not, and you can check rather than take my word for it. Diff the data-URI
region of the pre-fix bundle against the post-fix one. Between 16.3.5 and 16.3.8
the only changes in that block are the minifier renames:

```diff
-  l2 = o === "base64" ? A : `data:image/svg+xml;base64,...`
+  c2 = o === "base64" ? A : `data:image/svg+xml;base64,...`
-  I = Os(A, u2)
+  I = Js(A, u2)
```

Same logic, different names. The encoding work the fix added lives on the branch
that rebuilds the URI, and a base64 input never takes that branch.

So this is not a bypass of the serializer hardening. Those checks were present
and they did their job on the inputs they govern. It is a different delivery path
into the same native renderer, and the hardening was never positioned across it.

## The proof

![Triage response closing the report as a duplicate, dated October 1 2026. It states that the report describes the same vulnerability as a prior submission, identifying the same attack surface, a nested SVG document passed through to the image processing pipeline, and the same resulting impact.](../../assets/images/duplicate-triage.png)

## Duplicate, then the advisory

**2026-10-01.** Closed as a duplicate. The triage note named the same attack
surface, a nested SVG passed through to the image pipeline, and the same impact,
already tracked under an earlier private report.

**2026-10-14.** Vercel published
[GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
critical, patched in 15.5.28 and 16.4.1.

Thirteen days between being told it was known and watching it go public.

Those two facts sit together more comfortably than they first look. A duplicate
decision is about the root cause, not about your route to it. I had a different
delivery path, on builds past the fix that was supposed to close this, and that
is a real and separate fact about reachability. It is still the same underlying
defect in the same library, so from the program's side there is one thing to
track and one thing to fix. Finding another delivery path can show real exposure
without establishing a new root cause.

## What transfers

A patch removes a mechanism. An exploit needs a capability. The serializer fix
was correct and effective against injection. This never needed injection. It
needed rendering, and rendering was never removed.

Three questions to take to another framework:

1. **What native code is on the request path?** Walk the optional and transitive
   dependencies, not the ones you chose. Look for parsers, decoders, renderers.
2. **Which paths reach it, and what does each assume about its input?** The
   defended one is rarely the only one. Find the one whose input is trusted
   because the framework generated it.
3. **When an advisory ships with a public exploit, separate the vendor's bug from
   the payload.** Then ask whether that payload can arrive another way.