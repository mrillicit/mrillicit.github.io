import type { APIRoute } from "astro";
import satori from "satori";
import sharp from "sharp";
import { fontData, experimental_getFontFileURL } from "astro:assets";
import { getFontPathByWeight } from "@/utils/getFontPathByWeight";
import config from "@/config";
import { readFile } from "node:fs/promises";

// Site tokens, kept in step with src/styles/theme.css so the share card looks
// like the page it links to rather than a stock template.
const BACKGROUND = "#0d0e12";
const FOREGROUND = "#f4f4f5";
const MUTED = "#a1a1aa";
const ACCENT = "#ff6b01";
const BORDER = "#23262f";

async function loadFont(
  family: keyof typeof fontData,
  weight: number,
  url: URL
): Promise<ArrayBuffer> {
  const path = getFontPathByWeight(fontData[family], weight);
  if (path === undefined) {
    throw new Error(`Cannot find a ${weight} font file for ${family}.`);
  }
  return fetch(experimental_getFontFileURL(path, url)).then(res =>
    res.arrayBuffer()
  );
}

/**
 * The avatar, inlined so satori never has to fetch anything. "" when absent.
 *
 * The media type has to match the actual bytes. A browser sniffs content and
 * forgives a wrong label, but satori decodes on the declared type alone and
 * silently renders an empty box instead.
 */
const AVATARS: ReadonlyArray<[path: string, mediaType: string]> = [
  ["public/avatar.jpg", "image/jpeg"],
  ["public/avatar.png", "image/png"],
  ["public/avatar.webp", "image/webp"],
];

async function loadAvatar(): Promise<string> {
  for (const [path, mediaType] of AVATARS) {
    try {
      const file = await readFile(path);
      return `data:${mediaType};base64,${file.toString("base64")}`;
    } catch {
      continue;
    }
  }
  return "";
}

export const GET: APIRoute = async context => {
  const [regular, bold, mono, avatar] = await Promise.all([
    loadFont("--font-prose", 400, context.url),
    loadFont("--font-prose", 700, context.url),
    loadFont("--font-mono-face", 400, context.url),
    loadAvatar(),
  ]);

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BACKGROUND,
          padding: "72px",
          fontFamily: "IBM Plex Sans",
        },
        children: [
          // Wordmark, matching the header on the site.
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                fontFamily: "JetBrains Mono",
                fontSize: 30,
                color: MUTED,
              },
              children: [
                {
                  type: "span",
                  props: { style: { color: ACCENT }, children: "~/" },
                },
                {
                  type: "span",
                  props: {
                    style: { color: FOREGROUND },
                    children: config.site.title,
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: { display: "flex", alignItems: "center", gap: "40px" },
              children: [
                ...(avatar
                  ? [
                      {
                        type: "img",
                        props: {
                          src: avatar,
                          width: 190,
                          height: 190,
                          style: {
                            borderRadius: "95px",
                            border: `4px solid ${BORDER}`,
                          },
                        },
                      },
                    ]
                  : []),
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: 62,
                            fontWeight: 700,
                            color: FOREGROUND,
                            lineHeight: 1.15,
                          },
                          children: config.site.title,
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: 30,
                            color: MUTED,
                            marginTop: "16px",
                            lineHeight: 1.4,
                          },
                          children: config.site.description,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // Accent rule plus the domain, echoing the dividers on the site.
          {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column" },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      width: "88px",
                      height: "4px",
                      background: ACCENT,
                      marginBottom: "22px",
                    },
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "JetBrains Mono",
                      fontSize: 26,
                      color: MUTED,
                    },
                    children: new URL(config.site.url).hostname,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      embedFont: true,
      fonts: [
        { name: "IBM Plex Sans", data: regular, weight: 400, style: "normal" },
        { name: "IBM Plex Sans", data: bold, weight: 700, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
      ],
    }
  );

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(pngBuffer), {
    headers: { "Content-Type": "image/png" },
  });
};
