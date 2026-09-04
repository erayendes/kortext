/**
 * Line-oriented markdown parser for the v6 document viewer.
 *
 * Unlike a normal markdown→HTML pass, the v6 "Revise" / "Clarify" flows need
 * every *block* to be an independently selectable element (you annotate
 * specific lines). So we tokenise into a flat list of blocks, each keeping the
 * source-line indexes it covers — `AnnotatableDoc` renders one element per
 * token and tracks selection by token index.
 *
 * Ported from `mdToHtml` / `mdLine` in docs/concepts/wireframe-v6-hifi.html.
 */

export type MdTokenKind =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bullet'
  | 'ordered'
  | 'para'
  | 'table'
  | 'code'
  | 'blank';

export type MdToken = {
  kind: MdTokenKind;
  /** Raw text content (without the markdown prefix). Blank → ''. */
  text: string;
  /** For fenced code blocks: the fence's language tag (e.g. 'mermaid'). */
  lang?: string;
  /** For tables: parsed rows of cells (first row is the header). */
  table?: { header: string[]; rows: string[][] };
  /** Nesting level of a list item, from its leading indent (0 = top level). */
  depth?: number;
  /** Index into the token stream (stable selection key). */
  index: number;
  /** Whether this token can be selected for annotation (blank lines cannot). */
  selectable: boolean;
};

function tableCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isSeparatorRow(row: string): boolean {
  return tableCells(row).every((c) => /^:?-+:?$/.test(c));
}

function classifyLine(line: string): { kind: MdTokenKind; text: string; depth?: number } {
  if (line.trim() === '') return { kind: 'blank', text: '' };
  if (line.startsWith('### ')) return { kind: 'h3', text: line.slice(4) };
  if (line.startsWith('## ')) return { kind: 'h2', text: line.slice(3) };
  if (line.startsWith('# ')) return { kind: 'h1', text: line.slice(2) };
  if (line.startsWith('> ')) return { kind: 'quote', text: line.slice(2) };
  // All three markdown bullet characters, and indented ones: a document that
  // used `*` was rendering as paragraphs full of literal asterisks, which the
  // wrapped-line merge then glued into a wall of text.
  const bullet = line.match(/^(\s*)[-*+] (.*)$/);
  // The indent is the nesting: a sub-item under a request (what settled it) was
  // rendering as its sibling, which reads as a second, unrelated demand.
  if (bullet) return { kind: 'bullet', text: bullet[2], depth: Math.floor(bullet[1].length / 2) };
  // The marker stays in the text so the numbering survives; the kind exists so
  // the item is a block of its own rather than merged into the paragraph above.
  if (/^\s*\d+[.)] /.test(line)) return { kind: 'ordered', text: line.trim() };
  return { kind: 'para', text: line };
}

/**
 * Parse markdown into a flat token list. Consecutive `|`-prefixed lines collapse
 * into a single `table` token (with header + rows) when they look like a table.
 */
export function parseMarkdown(md: string): MdToken[] {
  const lines = md.split('\n');
  const out: MdToken[] = [];
  let i = 0;
  let index = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Fenced code block: ``` … ``` → one `code` token holding the raw body.
    // Without this the fence + body lines fall through to `para` and render as
    // literal backticks (the bug seen in foundation docs with JSON snippets).
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim().toLowerCase() || undefined;
      i++; // skip opening fence
      const code: string[] = [];
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        code.push(lines[i] ?? '');
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      out.push({ kind: 'code', text: code.join('\n'), lang, index: index++, selectable: true });
      continue;
    }

    if (line.trim().startsWith('|')) {
      const block: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        block.push(lines[i] ?? '');
        i++;
      }
      if (block.length >= 2) {
        const header = tableCells(block[0] ?? '');
        const bodyStart = isSeparatorRow(block[1] ?? '') ? 2 : 1;
        const rows = block.slice(bodyStart).map(tableCells);
        out.push({
          kind: 'table',
          text: '',
          table: { header, rows },
          index: index++,
          selectable: true,
        });
      } else {
        for (const b of block) {
          const { kind, text, depth } = classifyLine(b);
          out.push({ kind, text, depth, index: index++, selectable: kind !== 'blank' });
        }
      }
      continue;
    }

    const { kind, text, depth } = classifyLine(line);
    out.push({ kind, text, depth, index: index++, selectable: kind !== 'blank' });
    i++;
  }

  return out;
}

export type InlineSpan =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string };

/**
 * Split a line into inline spans: `**bold**`, `*italic*` / `_italic_` and
 * `` `code` `` are recognised, everything else is plain text. Returned as data
 * so the renderer can emit real React nodes (no dangerouslySetInnerHTML).
 *
 * Bold is matched before italic so `**x**` never reads as an empty emphasis.
 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\*(\S(?:.*?\S)?)\*|(?<![A-Za-z0-9_])_(\S(?:.*?\S)?)_(?![A-Za-z0-9_])/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      spans.push({ type: 'text', value: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) spans.push({ type: 'bold', value: m[1] });
    else if (m[2] !== undefined) spans.push({ type: 'code', value: m[2] });
    else spans.push({ type: 'italic', value: m[3] ?? m[4] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    spans.push({ type: 'text', value: text.slice(last) });
  }
  return spans;
}
