import type { CollectionEntry } from "astro:content";
import { entryFilter } from "./entryFilter";

/**
 * Returns research entries eligible to be shown, newest first (uses
 * `modDatetime` when present, otherwise `pubDatetime`).
 */
export function getSortedResearch(entries: CollectionEntry<"research">[]) {
  return entries
    .filter(entryFilter)
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
}
