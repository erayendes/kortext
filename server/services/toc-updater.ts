import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * TOC (Table of Contents) updater for memory markdown files.
 *
 * Spec: v3.1-architecture-proposal.md Bölüm 7 + Bölüm 11. Engine's job is to
 * keep `## İçindekiler` of a file in 1:1 sync with the `## ` headings.
 *
 * Anchor slug rule (GitHub-flavoured):
 *   - lowercase
 *   - non-alphanumerics → `-`
 *   - collapse `-` runs
 *   - trim
 *
 * Idempotent. If the file has no `## İçindekiler` heading, the call is a
 * no-op (the file hasn't opted in).
 */

export type TocUpdateInput = {
  filePath: string;
  newHeading?: string;
};

export type TocUpdateResult = {
  updated: boolean;
  entries: number;
};

const TOC_HEADING = '## İçindekiler';
const TOC_PLACEHOLDER =
  '<!-- Engine otomatik günceller (server/services/toc-updater.ts). Yeni bölüm eklendiğinde bu listeye anchor satırı eklenir. -->';

export function slugifyHeading(heading: string): string {
  const text = heading.replace(/^#+\s*/, '').trim();
  const lowered = text.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-');
  return replaced.replace(/^-+|-+$/g, '');
}

export function updateToc(input: TocUpdateInput): TocUpdateResult {
  if (!existsSync(input.filePath)) {
    return { updated: false, entries: 0 };
  }
  const source = readFileSync(input.filePath, 'utf8');
  const lines = source.split('\n');

  const tocIdx = lines.findIndex((line) => line.trim() === TOC_HEADING);
  if (tocIdx === -1) {
    return { updated: false, entries: 0 };
  }

  // Pre-pass: classify every line as inside-HTML-comment or not, so neither
  // endIdx detection nor entry collection treats template-skeleton headings
  // as real ones.
  const inComment: boolean[] = new Array(lines.length).fill(false);
  {
    let open = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const hasOpen = line.includes('<!--');
      const hasClose = line.includes('-->');
      if (open) {
        inComment[i] = true;
        if (hasClose) open = false;
        continue;
      }
      if (hasOpen && hasClose) {
        // Single-line comment — line itself is "comment-only" for our
        // purposes (we don't try to parse markdown after `-->` on the same
        // line; that's a corner-case we don't need).
        inComment[i] = true;
        continue;
      }
      if (hasOpen && !hasClose) {
        inComment[i] = true;
        open = true;
        continue;
      }
      inComment[i] = false;
    }
  }

  // End of the TOC block = next REAL `## ` heading or `---` separator
  // (comments don't count).
  let endIdx = lines.length;
  for (let i = tocIdx + 1; i < lines.length; i += 1) {
    if (inComment[i]) continue;
    const line = lines[i] ?? '';
    if (/^##\s+/.test(line) || /^---\s*$/.test(line)) {
      endIdx = i;
      break;
    }
  }

  const tocEntries: { heading: string; slug: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i >= tocIdx && i < endIdx) continue;
    if (inComment[i]) continue;
    const line = lines[i] ?? '';
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const heading = m[1]!;
    tocEntries.push({ heading, slug: slugifyHeading(heading) });
  }

  const tocBody: string[] = [TOC_HEADING, ''];
  if (tocEntries.length === 0) {
    tocBody.push(TOC_PLACEHOLDER, '');
  } else {
    tocEntries.forEach((entry, i) => {
      tocBody.push(`${i + 1}. [${entry.heading}](#${entry.slug})`);
    });
    tocBody.push('');
  }

  const nextLines = [
    ...lines.slice(0, tocIdx),
    ...tocBody,
    ...lines.slice(endIdx),
  ];
  const next = nextLines.join('\n');

  if (next === source) {
    return { updated: true, entries: tocEntries.length };
  }
  writeFileSync(input.filePath, next, 'utf8');
  return { updated: true, entries: tocEntries.length };
}
