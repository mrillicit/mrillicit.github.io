import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getSortedResearch } from "@/utils/getSortedResearch";
import { getResearchUrl } from "@/utils/getResearchPaths";
import config from "@/config";

export async function GET() {
  const entries = await getCollection("research");
  const sorted = getSortedResearch(entries);

  return rss({
    title: config.site.title,
    description: config.site.description,
    site: config.site.url,
    items: sorted.map(({ data, id, filePath }) => ({
      link: getResearchUrl(id, filePath, config.site.lang),
      title: data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });
}
