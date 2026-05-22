import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Persona registry — single source of truth for `agents/*.md`.
 *
 * Each persona file is a markdown document of the form:
 *
 *   # backend-developer
 *
 *   - description: One-line role summary.
 *
 *   ## identity
 *   Sen sunucu tarafı geliştiricisisin...
 *
 *   ## purpose
 *   ...
 *
 * The parser is minimal on purpose — only the H1 handle and the first
 * `- description:` bullet are structured fields. Everything else is
 * passed through as the system-prompt body that CLI executors feed to
 * Claude/Codex/Gemini.
 */

export type PersonaDefinition = {
  /** Canonical handle including '+' prefix, e.g. '+backend-developer'. */
  handle: string;
  /** Filename stem (= handle without the '+'). */
  id: string;
  /** Short one-line description from the `- description:` bullet. */
  description: string;
  /** Full file body, used verbatim as the system prompt prefix. */
  systemPrompt: string;
};

export type PersonaLoadError = {
  /** Filename relative to the scanned directory, e.g. 'broken.md'. */
  file: string;
  /** Human-readable reason — surfaced by `kortext doctor`. */
  reason: string;
};

export type PersonaRegistry = {
  /** Accepts '+handle' or 'handle'. Returns null if unknown. */
  get(handle: string): PersonaDefinition | null;
  list(): PersonaDefinition[];
  errors(): PersonaLoadError[];
  /** Re-read the source directory in place. Same object identity, fresh data. */
  reload(): void;
};

const H1_RE = /^#\s+([\w-]+)\s*$/;
const DESCRIPTION_RE = /^-\s*description\s*:\s*(.+?)\s*$/i;

export function parsePersonaMarkdown(
  source: string,
  fileId: string,
): PersonaDefinition {
  const lines = source.split('\n');

  let handleId: string | null = null;
  let description: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    if (handleId === null) {
      const m = line.match(H1_RE);
      if (m?.[1]) {
        handleId = m[1];
        continue;
      }
    }

    if (description === null) {
      const d = line.match(DESCRIPTION_RE);
      if (d?.[1]) {
        description = d[1];
      }
    }

    if (handleId !== null && description !== null) break;
  }

  if (!handleId) {
    throw new Error(`missing H1 handle (expected '# <handle>') in ${fileId}`);
  }
  if (!description) {
    throw new Error(`missing '- description:' bullet in ${fileId}`);
  }

  return {
    handle: `+${handleId}`,
    id: handleId,
    description,
    systemPrompt: source,
  };
}

export function loadPersonasFromDir(dir: string): PersonaRegistry {
  const dirStat = statSync(dir);
  if (!dirStat.isDirectory()) {
    throw new Error(`persona registry: not a directory: ${dir}`);
  }

  const byHandle = new Map<string, PersonaDefinition>();
  const errors: PersonaLoadError[] = [];

  const refresh = () => {
    byHandle.clear();
    errors.length = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      const fullPath = join(dir, entry.name);
      const fileId = basename(entry.name, '.md');
      try {
        const source = readFileSync(fullPath, 'utf8');
        const def = parsePersonaMarkdown(source, fileId);
        byHandle.set(def.handle, def);
      } catch (err) {
        errors.push({
          file: entry.name,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  refresh();

  return {
    get(handle) {
      const canonical = handle.startsWith('+') ? handle : `+${handle}`;
      return byHandle.get(canonical) ?? null;
    },
    list() {
      return [...byHandle.values()];
    },
    errors() {
      return [...errors];
    },
    reload: refresh,
  };
}

/**
 * Shared prompt resolver for CLI executors.
 *
 * If `source` is a registry, look up the canonical systemPrompt. Otherwise
 * fall back to a disk-direct read from `<agentsDir>/<handle>.md` — the
 * pre-Faz-5 behavior, kept for tests and stand-alone use.
 *
 * Returns an empty string when the persona is unknown / file missing. The
 * caller decides whether that's an error (CLI executors silently continue
 * today; `kortext doctor` raises it as a consistency finding).
 */
export function readPersonaPrompt(
  handle: string | null,
  source: PersonaRegistry | { agentsDir: string },
): string {
  if (!handle) return '';
  if ('list' in source) {
    return source.get(handle)?.systemPrompt ?? '';
  }
  const id = handle.replace(/^\+/, '');
  const path = join(source.agentsDir, `${id}.md`);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}
