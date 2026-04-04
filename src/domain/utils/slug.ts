const MAX_SLUG_LENGTH = 200;

export function slugifyReadable(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return base.length > 0 ? base : "producto";
}

export function withSlugSuffix(slug: string, suffix: string): string {
  const trimmed = slug.slice(0, MAX_SLUG_LENGTH - suffix.length - 1);
  return `${trimmed}-${suffix}`.slice(0, MAX_SLUG_LENGTH);
}
