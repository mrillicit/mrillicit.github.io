import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";

export const RESEARCH_PATH = "src/content/research";

/** Severity of a finding. `note` is for research that is not a disclosed bug. */
export const SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "note",
] as const;

const research = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${RESEARCH_PATH}` }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Two sentences, plain language: what the flaw was, then what it allowed. */
      description: z.string(),
      author: z.string().default(config.site.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      /** Drives the coloured badge on cards. */
      severity: z.enum(SEVERITIES).default("note"),
      /** The affected product, vendor, or research subject. */
      target: z.string(),
      /** Must match a theme `id` in src/data/profile.ts to be grouped. */
      theme: z.string().optional(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      links: z
        .object({
          advisory: z.string().optional(),
          cve: z.string().optional(),
          poc: z.string().optional(),
          repo: z.string().optional(),
        })
        .optional(),
      tags: z.array(z.string()).default([]),
      ogImage: image().or(z.string()).optional(),
      canonicalURL: z.string().optional(),
      timezone: z.string().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

export const collections = { research, pages };
