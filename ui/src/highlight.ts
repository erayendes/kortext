/**
 * A very small syntax highlighter for the code blocks these documents actually
 * carry: shell commands, JSON payloads, SQL schemas, the odd JS snippet and
 * folder trees. It is a tokenizer, not a parser — it colours what is obvious
 * and leaves the rest alone.
 *
 * Written rather than installed: highlight.js is ~35 KB before its language
 * packs, and would be carrying a hundred grammars to colour `cd` and a quoted
 * string. Anything it gets wrong here shows up as plain text, never as a
 * mangled block, because the tokens are returned as data and the renderer emits
 * real nodes.
 */

export type HlKind = 'kw' | 'str' | 'num' | 'com' | 'flag' | 'key';
export type HlToken = { text: string; kind?: HlKind };

type Lang = 'shell' | 'json' | 'sql' | 'js' | 'plain';

const ALIASES: Record<string, Lang> = {
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shell: 'shell',
  console: 'shell',
  terminal: 'shell',
  json: 'json',
  jsonc: 'json',
  sql: 'sql',
  sqlite: 'sql',
  js: 'js',
  jsx: 'js',
  ts: 'js',
  tsx: 'js',
  javascript: 'js',
  typescript: 'js',
};

const SHELL_COMMANDS =
  'git|npm|npx|pnpm|yarn|node|deno|bun|cd|ls|mkdir|rm|cp|mv|cat|echo|export|source|curl|wget|chmod|chown|sudo|ssh|scp|tar|zip|unzip|grep|sed|awk|find|touch|open|kill|ps|docker|kubectl|make|python3?|pip3?|brew|sqlite3';

const JS_KEYWORDS =
  'import|from|export|default|const|let|var|function|return|await|async|class|extends|new|if|else|for|while|of|in|try|catch|finally|throw|typeof|instanceof|null|undefined|true|false|this';

const SQL_KEYWORDS =
  'CREATE|TABLE|INDEX|VIEW|TRIGGER|IF|NOT|EXISTS|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|AUTOINCREMENT|INTEGER|TEXT|REAL|BLOB|NUMERIC|BOOLEAN|DEFAULT|NULL|SELECT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|FROM|WHERE|JOIN|LEFT|INNER|ON|ORDER|GROUP|BY|LIMIT|OFFSET|AND|OR|AS|CASCADE|ON DELETE|ON UPDATE|BEGIN|COMMIT|PRAGMA';

// Each language is a list of (kind, pattern) pairs. The alternation is built
// from them so a group's position always names its kind — the earlier version
// padded the list with empty groups, and an empty group matches everywhere.
type Rule = { kind: HlKind; src: string };

const RULES: Record<Exclude<Lang, 'plain'>, { rules: Rule[]; flags: string }> = {
  shell: {
    flags: 'gm',
    rules: [
      { kind: 'com', src: '#[^\\n]*' },
      { kind: 'str', src: `"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'` },
      { kind: 'kw', src: `(?:^|(?<=[|&;(]\\s|\\$\\(|^\\s{1,8}))(?:${SHELL_COMMANDS})\\b` },
      { kind: 'flag', src: '(?<=\\s)--?[A-Za-z][\\w-]*' },
      { kind: 'num', src: '\\b\\d+(?:\\.\\d+)*\\b' },
    ],
  },
  json: {
    flags: 'g',
    rules: [
      { kind: 'str', src: '"(?:[^"\\\\]|\\\\.)*"' },
      { kind: 'kw', src: '\\b(?:true|false|null)\\b' },
      { kind: 'num', src: '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b' },
    ],
  },
  sql: {
    flags: 'gim',
    rules: [
      { kind: 'com', src: '--[^\\n]*' },
      { kind: 'str', src: `'(?:[^'\\\\\\n]|\\\\.)*'` },
      { kind: 'kw', src: `\\b(?:${SQL_KEYWORDS})\\b` },
      { kind: 'num', src: '\\b\\d+(?:\\.\\d+)?\\b' },
    ],
  },
  js: {
    flags: 'g',
    rules: [
      { kind: 'com', src: '//[^\\n]*|/\\*[\\s\\S]*?\\*/' },
      {
        kind: 'str',
        src: `"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\``,
      },
      { kind: 'kw', src: `\\b(?:${JS_KEYWORDS})\\b` },
      { kind: 'num', src: '\\b\\d+(?:\\.\\d+)?\\b' },
    ],
  },
};

/** A JSON key is a string followed by a colon — coloured apart from its value. */
function markJsonKeys(code: string, tokens: HlToken[]): HlToken[] {
  let at = 0;
  return tokens.map((t) => {
    const start = at;
    at += t.text.length;
    if (t.kind !== 'str') return t;
    const rest = code.slice(start + t.text.length);
    return /^\s*:/.test(rest) ? { ...t, kind: 'key' as const } : t;
  });
}

/**
 * Split `code` into coloured and plain runs. An unknown language (or none)
 * comes back as a single plain token, which renders exactly as it does today.
 */
export function highlight(code: string, lang?: string): HlToken[] {
  const resolved: Lang = (lang && ALIASES[lang.toLowerCase()]) || 'plain';
  if (resolved === 'plain') return [{ text: code }];

  const { rules, flags } = RULES[resolved];
  const re = new RegExp(rules.map((r) => `(${r.src})`).join('|'), flags);
  const out: HlToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const i = rules.findIndex((_, k) => m![k + 1] !== undefined);
    if (i === -1) continue;
    // The shell command rule matches a little context before the token; the
    // token itself is what gets the colour.
    const value = m[i + 1]!;
    const at = m.index + m[0].lastIndexOf(value);
    if (at > last) out.push({ text: code.slice(last, at) });
    out.push({ text: value, kind: rules[i]!.kind });
    last = at + value.length;
  }
  if (last < code.length) out.push({ text: code.slice(last) });

  return resolved === 'json' ? markJsonKeys(code, out) : out;
}
