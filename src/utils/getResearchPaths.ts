import { getRelativeLocaleUrl } from "astro:i18n";
import { RESEARCH_PATH } from "@/content.config";
import { slugifyStr } from "./slugify";
import config from "@/config";

function getPathSegments(filePath: string | undefined): string[] {
  return (
    filePath
      ?.replace(RESEARCH_PATH, "")
      .split("/")
      .filter(path => path !== "")
      .filter(path => !path.startsWith("_"))
      .slice(0, -1)
      .map(segment => slugifyStr(segment)) ?? []
  );
}

function getIdSlug(id: string): string {
  const parts = id.split("/");
  return parts.length > 0 ? String(parts[parts.length - 1]) : id;
}

function getSlugPath(id: string, filePath: string | undefined): string {
  const pathSegments = getPathSegments(filePath);
  const slug = getIdSlug(id);
  return pathSegments.length > 0
    ? [...pathSegments, slug].join("/")
    : String(slug);
}

/**
 * Slug-only path for use as a route param in `getStaticPaths`.
 * No base prefix, no locale — Astro handles those at a higher level.
 */
export function getResearchSlug(
  id: string,
  filePath: string | undefined
): string {
  return `/${getSlugPath(id, filePath)}`;
}

/**
 * Fully navigable URL for `<a href>` and RSS links, with locale routing and
 * the configured Astro base applied.
 * e.g. `/research/my-finding`
 */
export function getResearchUrl(
  id: string,
  filePath: string | undefined,
  locale: string | undefined = config.site.lang
): string {
  return getRelativeLocaleUrl(locale, `research/${getSlugPath(id, filePath)}`);
}
