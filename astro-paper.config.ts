import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // GitHub user site. Repo must be named exactly `mrillicit.github.io`.
    url: "https://mrillicit.github.io/",
    // Shown as the wordmark in the header.
    title: "mrillicit",
    description:
      "Offensive security consultant. Vulnerability research, writeups and notes.",
    author: "Varshit Modi Jain",
    profile: "https://www.linkedin.com/in/varshitmodi/",
    lang: "en",
    timezone: "Asia/Dubai",
    dir: "ltr",
  },
  posts: {
    perPage: 10,
    perIndex: 5,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    // No blog, no archive page.
    showArchives: false,
    showBackButton: true,
    editPost: { enabled: false },
    // Nothing to search yet. Flip to "pagefind" once there are entries,
    // and restore the pagefind steps in package.json's build script.
    search: false,
  },
  socials: [
    { name: "linkedin", url: "https://www.linkedin.com/in/varshitmodi/" },
    { name: "x", url: "https://x.com/varshitmodi" },
    { name: "github", url: "https://github.com/mrillicit" },
    // { name: "mail", url: "mailto:you@domain" },
  ],
  shareLinks: [],
});
