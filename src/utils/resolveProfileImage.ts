const publicFiles = import.meta.glob("/public/*", { eager: false });

/**
 * Resolves a profile image that lives under `public/`.
 *
 * The point is that adding a photo should mean dropping a file in `public/`,
 * with no code edit, and a missing file should render nothing rather than a
 * broken image. So this returns "" unless the file is actually there.
 *
 * Mirrors the path rules in `resolveDefaultOgImagePath`: a bare filename only,
 * so a value here can never reach outside `public/`.
 */
export function resolveProfileImage(filename: string): string {
  if (!filename) return "";

  const name = filename.replace(/^\//, "");
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(
      `Profile image must be a bare filename under public/, got "${filename}"`
    );
  }

  return `/public/${name}` in publicFiles ? `/${name}` : "";
}

/** First of `candidates` that exists under public/, else "". */
export function resolveFirstProfileImage(candidates: string[]): string {
  for (const candidate of candidates) {
    const resolved = resolveProfileImage(candidate);
    if (resolved) return resolved;
  }
  return "";
}
