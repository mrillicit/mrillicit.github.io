import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // GitHub user site. Repo must be named exactly `mrillicit.github.io`.
    url: "https://mrillicit.github.io/",
    // Shown as the wordmark in the header.
    title: "mrillicit",
    description:
      "Security research — vulnerability writeups, notes and tools.",
    // TODO: your real name. Used for meta tags and the footer.
    author: "mrillicit",
    profile: "https://github.com/mrillicit",
    lang: "en",
    // TODO: set your IANA timezone, e.g. "Asia/Kolkata".
    timezone: "UTC",
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
    // TODO: replace the placeholder URLs. Delete any you do not use.
    { name: "linkedin", url: "https://www.linkedin.com/in/YOUR-HANDLE/" },
    { name: "x", url: "https://x.com/YOUR-HANDLE" },
    { name: "github", url: "https://github.com/mrillicit" },
    { name: "mail", url: "mailto:YOU@EXAMPLE.COM" },
  ],
  shareLinks: [],
});
