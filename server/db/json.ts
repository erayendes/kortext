/**
 * Tiny helpers for JSON column round-tripping.
 * SQLite stores JSON as TEXT; these wrap stringify/parse with safe fallbacks
 * so callers can keep working with native objects.
 */

export function packJson(value: unknown): string {
  if (value === undefined) return '{}';
  return JSON.stringify(value);
}

export function unpackJson<T = unknown>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
