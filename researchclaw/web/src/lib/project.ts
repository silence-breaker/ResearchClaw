const MAX_SLUG = 40;

// Turns a human research-direction name into a filesystem-safe project id of
// the form `proj_<slug>_<suffix>`. Non-ascii (e.g. Chinese) collapses away, so
// the caller-supplied random suffix guarantees uniqueness.
export function makeProjectId(name: string, suffix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/_+$/g, "");
  return slug ? `proj_${slug}_${suffix}` : `proj_${suffix}`;
}
