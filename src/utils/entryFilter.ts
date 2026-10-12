import type { CollectionEntry } from "astro:content";
import config from "@/config";

/**
 * Determines whether a research entry is eligible to be listed or rendered.
 *
 * - Drafts are always excluded
 * - In production, scheduled entries stay hidden until `pubDatetime` minus the
 *   configured margin
 * - In dev, every non-draft entry is shown, to make authoring easier
 */
export function entryFilter({ data }: CollectionEntry<"research">) {
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - config.posts.scheduledPostMargin;
  return !data.draft && (import.meta.env.DEV || isPublishTimePassed);
}
