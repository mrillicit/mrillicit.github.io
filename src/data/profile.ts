/**
 * Everything personal about this site lives here.
 *
 * Every list below is optional. A section with an empty list does not render
 * at all — no empty headings — so it is fine to leave them as they are and
 * fill them in as the work accumulates.
 */

export type Theme = {
  /** Referenced by a research entry's `theme` field. */
  id: string;
  name: string;
  /** One line on what ties this group together. */
  description: string;
};

export type Tool = {
  name: string;
  description: string;
  url: string;
  language?: string;
};

export type Talk = {
  year: string;
  title: string;
  venue: string;
  url?: string;
  slides?: string;
};

export type Recognition = {
  year: string;
  title: string;
  org: string;
  url?: string;
};

export type Certification = {
  name: string;
  year: string;
  issuer?: string;
  url?: string;
};

export type ProfileLink = {
  label: string;
  handle: string;
  url: string;
  icon: "linkedin" | "x" | "github" | "mail";
};

export const displayName = "Varshit Modi Jain";

/** One line. What you research. Keep it concrete. */
export const tagline = "Security guy. Illicit in name only.";

/** Two sentences under the tagline on the home page. Optional. */
export const intro =
  "Dubai, since 2023. Whatever application turns up — different stack every time, same four ways in.";

/** Path under /public for the avatar, or "" to show initials instead. */
export const avatar = "";

/**
 * Shown under the bio on /about. Set to "" to hide it.
 * Worth keeping: it is a short, unambiguous statement of posture.
 */
export const disclosureNote = "";

/**
 * Written in the third person so event organisers and press can lift it
 * unedited. Roughly 50 words. Set to "" to hide the block.
 */
export const shortBio = "";

/** Research groups on /research. A theme with no entries is not rendered. */
export const themes: Theme[] = [
  {
    id: "web",
    name: "Web application security",
    description:
      "Access control, authentication flows, and server-side request handling.",
  },
  {
    id: "ai",
    name: "LLM & agentic AI security",
    description:
      "Prompt injection, tool-use boundaries, and agents handed untrusted input.",
  },
  {
    id: "web3",
    name: "Smart contract & DeFi",
    description:
      "Accounting logic, oracle assumptions, and upgrade paths in on-chain protocols.",
  },
];

export const tools: Tool[] = [];

export const talks: Talk[] = [];

export const recognition: Recognition[] = [];

export const certifications: Certification[] = [];

/** Shown as cards at the bottom of /about. */
export const profileLinks: ProfileLink[] = [
  {
    label: "LinkedIn",
    handle: "/in/varshitmodi",
    url: "https://www.linkedin.com/in/varshitmodi/",
    icon: "linkedin",
  },
  {
    label: "X",
    handle: "@varshitmodi",
    url: "https://x.com/varshitmodi",
    icon: "x",
  },
  {
    label: "GitHub",
    handle: "@mrillicit",
    url: "https://github.com/mrillicit",
    icon: "github",
  },
  // To publish an email address, add:
  // { label: "Email", handle: "you@domain", url: "mailto:you@domain", icon: "mail" },
];
