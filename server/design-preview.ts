// DESIGN.md says what the tokens are; this renders what they look like.
// Deterministic — the page is only ever what the document already declares,
// so a swatch that surprises you is a token you wrote, not one we invented.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from './db.js';
import { readFrontmatter } from './docs.js';

export interface Token {
  name: string;
  value: string;
  note: string;
  /** The same token in dark mode, when the document declares one. */
  dark?: string;
}

export interface TypeRole {
  role: string;
  family: string;
  size: string;
  lineHeight: string;
  weight: string;
  tracking: string;
}

export interface DesignTokens {
  colors: Token[];
  spacing: Token[];
  radius: Token[];
  shadows: Token[];
  motion: Token[];
  layout: Token[];
  fonts: Token[];
  type: TypeRole[];
}

const COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color-mix\([^)]*\))$/i;
const LENGTH = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|ch)$/i;
// Anything that reaches a style attribute has to survive this: the document is
// written by an agent, so "value" is untrusted text, not a constant.
const CSS_SAFE = /^[#\w%.,()\-+\s/'"]*$/;

const unwrap = (s: string) => s.trim().replace(/^`|`$/g, '').trim();

function safe(value: string): string | null {
  const v = unwrap(value);
  return v && v.length < 200 && CSS_SAFE.test(v) ? v : null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => unwrap(c));
}

const isSeparator = (row: string[]) => row.every((c) => /^:?-{2,}:?$/.test(c));

// The template writes a placeholder (`[VALUE]`, `[Family]`) wherever the
// designer has not decided yet. A placeholder is not a token.
const decided = (v: string) => v !== '' && !/^\[.*\]$/.test(v);

function bucket(tokens: DesignTokens, t: Token): void {
  const n = t.name.toLowerCase();
  if (COLOR.test(t.value)) tokens.colors.push(t);
  else if (/shadow|elevation/.test(n)) tokens.shadows.push(t);
  else if (/transition|duration|ease|motion/.test(n)) tokens.motion.push(t);
  else if (/font|family/.test(n)) tokens.fonts.push(t);
  else if (/radius|rounded/.test(n)) tokens.radius.push(t);
  else if (/space|gap|gutter/.test(n) && LENGTH.test(t.value)) tokens.spacing.push(t);
  else if (/container|screen|breakpoint|safe|max|width/.test(n) && LENGTH.test(t.value))
    tokens.layout.push(t);
}

/**
 * Reads token declarations wherever they sit: table rows (`| --color-primary |
 * #111 | buttons |`) and bullets (`- --space-md: 16px`). Rows the designer left
 * as prose contribute nothing rather than a broken swatch.
 */
export function parseDesignTokens(md: string): DesignTokens {
  const tokens: DesignTokens = {
    colors: [],
    spacing: [],
    radius: [],
    shadows: [],
    motion: [],
    layout: [],
    fonts: [],
    type: [],
  };
  const seen = new Map<string, Token>();
  let header: string[] | null = null;
  // A dark palette is declared one of three ways, and all three occur: a second
  // value column, a heading that says dark, or a `-dark` suffix on the name.
  let darkColumn: number | null = null;
  let darkSection = false;
  // A dark value restates a token that already exists — under a "Dark mode"
  // heading it repeats the name, in a two-column table it sits beside it, and
  // in a flat list it carries a `-dark` suffix. All three land on the same
  // token, so one swatch shows both modes instead of two unrelated ones.
  const attach = (name: string, value: string, note: string, dark?: string) => {
    const base = name
      .replace(/-?dark-?/, '-')
      .replace(/--+$/, '')
      .replace(/-$/, '');
    const restates = darkSection
      ? (seen.get(name) ?? seen.get(base))
      : base !== name
        ? seen.get(base)
        : undefined;
    if (restates) {
      restates.dark = value;
      return;
    }
    if (seen.has(name)) return;
    const token: Token = dark ? { name, value, note, dark } : { name, value, note };
    seen.set(name, token);
    bucket(tokens, token);
  };

  for (const line of md.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) darkSection = /\bdark\b/i.test(heading[1] ?? '');
    if (/^\s*\|/.test(line)) {
      const row = cells(line);
      if (isSeparator(row)) continue;
      const lower = row.map((c) => c.toLowerCase());
      if (lower.some((c) => /size/.test(c)) && lower.some((c) => /line-?height|weight/.test(c))) {
        header = lower;
        darkColumn = null;
        continue;
      }
      // `| Token | Light | Dark | Usage |` — the header is the only place that
      // says which column is which, so it is read before the rows.
      if (lower.some((c) => /\bdark\b/.test(c)) && lower.some((c) => /token|name|light/.test(c))) {
        darkColumn = lower.findIndex((c) => /\bdark\b/.test(c));
        header = null;
        continue;
      }
      if (header) {
        const at = (re: RegExp) => {
          const i = header!.findIndex((h) => re.test(h));
          return i === -1 ? '' : (row[i] ?? '');
        };
        const role = row[0] ?? '';
        if (decided(role)) {
          tokens.type.push({
            role,
            family: at(/family|font/),
            size: at(/size/),
            lineHeight: at(/line-?height/),
            weight: at(/weight/),
            tracking: at(/letter|tracking/),
          });
          continue;
        }
        header = null;
      }
      // A token row: the name cell, then the first cell holding a real value.
      const name = row[0] ?? '';
      if (!/^--?[\w-]+$/.test(name)) continue;
      const usable = (c: string, i: number) =>
        i !== darkColumn && decided(c) && (COLOR.test(c) || LENGTH.test(c));
      const value = row.slice(1).find((c, i) => usable(c, i + 1));
      if (!value) continue;
      const darkCell = darkColumn === null ? '' : (row[darkColumn] ?? '');
      const dark = decided(darkCell) && COLOR.test(darkCell) ? darkCell : undefined;
      const note = row[row.length - 1] === value ? '' : (row[row.length - 1] ?? '');
      if (darkSection && !dark) attach(name, value, note);
      else attach(name, value, note, dark);
      continue;
    }
    header = null;
    darkColumn = null;
    const m = line.match(/^\s*[-*+]\s+`?(--[\w-]+)`?\s*:\s*(.+)$/);
    if (!m) continue;
    const name = m[1]!;
    const rest = m[2]!;
    const value = unwrap(rest.split(/\s{2,}|\s+\(|\s+—|\s+#\s/)[0] ?? '');
    if (!decided(value)) continue;
    const note = rest.slice(rest.indexOf(value) + value.length).replace(/^[\s(]+|[)\s]+$/g, '');
    attach(name, value, note);
  }
  return tokens;
}

// --- contrast -------------------------------------------------------------
// Only hex resolves to a number here. A token written as rgb()/oklch() gets no
// ratio rather than a guessed one — a wrong AA badge is worse than none.
function luminance(hex: string): number | null {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- rendering ------------------------------------------------------------

// Every color reaches the page as a variable, never as a literal, so one
// attribute on <html> repaints swatches, buttons and chrome together.
function varName(index: number): string {
  return `--kx-c${index}`;
}

interface Painted {
  token: Token;
  ref: string; // var(--kx-cN)
  on: string; // var(--kx-cN-on) — text that stays legible on it, per theme
}

// What a label on this color would actually be set in. On a light-blue button
// in dark mode that is the page's own near-black, not white and not the pale
// body text — grading it against those two reported a failure the design does
// not have.
function inks(theme: { bg: string; fg: string }): string[] {
  return [theme.fg, '#ffffff', theme.bg, '#111111'];
}

function bestInk(color: string, theme: { bg: string; fg: string }) {
  let best: { ink: string; ratio: number } | null = null;
  for (const ink of inks(theme)) {
    const ratio = contrast(color, ink);
    if (ratio !== null && (!best || ratio > best.ratio)) best = { ink, ratio };
  }
  return best;
}

function readable(color: string, theme: { bg: string; fg: string }): string {
  return bestInk(color, theme)?.ink ?? theme.fg;
}

function palette(
  colors: Token[],
  light: { bg: string; fg: string },
  dark: { bg: string; fg: string },
) {
  const painted: Painted[] = [];
  const lightVars: string[] = [];
  const darkVars: string[] = [];
  colors.forEach((token, i) => {
    const value = safe(token.value);
    if (!value) return;
    const darkValue = token.dark ? (safe(token.dark) ?? value) : value;
    lightVars.push(`${varName(i)}:${value};${varName(i)}-on:${readable(token.value, light)}`);
    darkVars.push(
      `${varName(i)}:${darkValue};${varName(i)}-on:${readable(token.dark ?? token.value, dark)}`,
    );
    painted.push({ token, ref: `var(${varName(i)})`, on: `var(${varName(i)}-on)` });
  });
  return { painted, lightVars, darkVars };
}

// A badge only where a threshold actually applies. Measuring a background
// against itself produced a red 1.00:1 that meant nothing — a failing grade on
// a token that was never text.
function verdict(
  token: Token,
  value: string,
  theme: { bg: string; fg: string },
): { ratio: number; label: string; min: number } | null {
  const n = token.name.toLowerCase();
  if (/text|fg|foreground/.test(n)) {
    const ratio = contrast(value, theme.bg);
    return ratio === null ? null : { ratio, label: 'on background', min: 4.5 };
  }
  if (/border|divider|outline/.test(n)) {
    const ratio = contrast(value, theme.bg);
    return ratio === null ? null : { ratio, label: 'on background', min: 3 };
  }
  if (/bg|background|surface|card/.test(n)) {
    const ratio = contrast(value, theme.fg);
    return ratio === null ? null : { ratio, label: 'text on it', min: 4.5 };
  }
  // Primary, semantic and accent colors carry a label — grade the text an
  // implementation would actually put on them, light or dark.
  const best = bestInk(value, theme);
  if (!best) return null;
  const light = (contrast(best.ink, '#000000') ?? 0) > 8;
  return { ratio: best.ratio, label: `${light ? 'light' : 'dark'} text on it`, min: 4.5 };
}

function badge(v: ReturnType<typeof verdict>, cls: string): string {
  if (!v) return '';
  const grade = v.ratio >= v.min ? 'ok' : v.ratio >= v.min - 1.5 ? 'warn' : 'bad';
  return `<span class="badge ${grade} ${cls}">${v.ratio.toFixed(2)}:1 ${esc(v.label)}</span>`;
}

function colorSection(
  painted: Painted[],
  light: { bg: string; fg: string },
  dark: { bg: string; fg: string },
): string {
  if (painted.length === 0) return '';
  const cards = painted
    .map(({ token, ref }) => {
      const darkValue = token.dark ?? token.value;
      return `<div class="tok">
        <div class="chip" style="background:${ref}"></div>
        <div class="tk">
          <b>${esc(token.name)}</b>
          <code class="only-light">${esc(token.value)}</code>
          <code class="only-dark">${esc(darkValue)}${token.dark ? '' : ' <span class="same">(same in dark)</span>'}</code>
          ${token.note ? `<span class="note">${esc(token.note)}</span>` : ''}
          ${badge(verdict(token, token.value, light), 'only-light')}
          ${badge(verdict(token, darkValue, dark), 'only-dark')}
        </div>
      </div>`;
    })
    .join('');
  return `<section><h2>Color</h2>
    <p class="desc">Each token is graded against the contrast that actually applies to it: text against the background (WCAG AA wants 4.5:1), borders against the background (3:1), and label colors against the text that sits on them. Switch the mode above to grade the dark palette.</p>
    <div class="tokrow">${cards}</div></section>`;
}

function typeSection(type: TypeRole[], fonts: Token[]): string {
  if (type.length === 0) return '';
  const fallback = fonts.map((f) => safe(f.value)).find(Boolean) ?? 'system-ui, sans-serif';
  const rows = type
    .map((r) => {
      const family = safe(r.family) ?? fallback;
      const size = safe(r.size) ?? '16px';
      const lh = safe(r.lineHeight) ?? '1.5';
      const weight = safe(r.weight) ?? '400';
      const tracking = safe(r.tracking) ?? 'normal';
      const style = `font-family:${esc(family)};font-size:${esc(size)};line-height:${esc(lh)};font-weight:${esc(weight)};letter-spacing:${esc(tracking)}`;
      return `<div class="spec">
        <div class="tag">${esc(r.role)}<span>${esc([r.size, r.weight, r.lineHeight].filter(Boolean).join(' · '))}</span></div>
        <div class="sample" style="${style}">Grumpy wizards make toxic brew — 0123</div>
      </div>`;
    })
    .join('');
  return `<section><h2>Typography</h2><div class="surface">${rows}</div></section>`;
}

// 'bar' draws the value at size — honest for a spacing scale, meaningless for
// a 1200px container, which is why layout is listed rather than drawn.
function scaleSection(title: string, tokens: Token[], kind: 'bar' | 'box' | 'list'): string {
  if (tokens.length === 0) return '';
  const items = tokens
    .map((t) => {
      const value = safe(t.value);
      if (!value) return '';
      const demo =
        kind === 'bar'
          ? `<div class="bar" style="width:${esc(value)}"></div>`
          : kind === 'box'
            ? `<div class="box" style="border-radius:${esc(value)}"></div>`
            : `<span class="note">${esc(t.note)}</span>`;
      return `<div class="scale-row"><code>${esc(t.name)}</code><span class="val">${esc(t.value)}</span>${demo}</div>`;
    })
    .join('');
  return `<section><h2>${esc(title)}</h2><div class="surface">${items}</div></section>`;
}

function shadowSection(shadows: Token[]): string {
  if (shadows.length === 0) return '';
  const items = shadows
    .map((t) => {
      const value = safe(t.value);
      if (!value) return '';
      return `<div class="shadow-cell"><div class="shadow-box" style="box-shadow:${esc(value)}"></div><code>${esc(t.name)}</code></div>`;
    })
    .join('');
  return `<section><h2>Elevation</h2><div class="surface grid">${items}</div></section>`;
}

function paintedPick(painted: Painted[], ...res: RegExp[]): Painted | null {
  for (const re of res) {
    const hit = painted.find((p) => re.test(p.token.name.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

function componentSection(painted: Painted[], radius: Token[]): string {
  const primary = paintedPick(painted, /primary(?!-hover)/, /accent/, /brand/);
  if (!primary) return '';
  const hover = paintedPick(painted, /primary-hover|accent-hover/) ?? primary;
  const border = paintedPick(painted, /border/);
  const error = paintedPick(painted, /error|danger|destructive/);
  const success = paintedPick(painted, /success/);
  const surface = paintedPick(painted, /surface|card/);
  const r = radius.map((t) => safe(t.value)).find(Boolean) ?? '8px';
  const line = border?.ref ?? 'var(--line)';
  const bad = error?.ref ?? '#dc2626';
  const good = success?.ref ?? '#16a34a';
  const b = (label: string, extra: string) =>
    `<div class="demo"><button style="background:${primary.ref};color:${primary.on};border-radius:${esc(r)};${extra}">Primary action</button><span>${esc(label)}</span></div>`;
  return `<section><h2>Components</h2>
    <p class="desc">Built from the tokens above — a state that looks wrong here is a token that is wrong in the document.</p>
    <div class="surface"${surface ? ` style="background:${surface.ref}"` : ''}>
      <div class="grid">
        ${b('default', '')}
        ${b('hover', `background:${hover.ref}`)}
        ${b('active', 'transform:scale(0.98)')}
        ${b('disabled', 'opacity:0.5;cursor:not-allowed')}
        ${b('focus', `outline:2px solid ${primary.ref};outline-offset:2px`)}
      </div>
      <div class="grid" style="margin-top:18px">
        <div class="demo"><input placeholder="Input — default" style="border:1px solid ${line};border-radius:${esc(r)}"><span>default</span></div>
        <div class="demo"><input placeholder="Input — focus" style="border:1px solid ${primary.ref};border-radius:${esc(r)};box-shadow:0 0 0 3px color-mix(in srgb, ${primary.ref} 30%, transparent)"><span>focus</span></div>
        <div class="demo"><input placeholder="Input — error" style="border:1px solid ${bad};border-radius:${esc(r)}"><span>error</span></div>
      </div>
      <div class="grid" style="margin-top:18px">
        <div class="demo"><span class="pill" style="background:color-mix(in srgb, ${good} 15%, transparent);color:${good};border-radius:${esc(r)}">Saved</span><span>success</span></div>
        <div class="demo"><span class="pill" style="background:color-mix(in srgb, ${bad} 15%, transparent);color:${bad};border-radius:${esc(r)}">Could not save</span><span>error</span></div>
      </div>
    </div></section>`;
}

function pick(tokens: Token[], ...res: RegExp[]): string | null {
  for (const re of res) {
    const hit = tokens.find((t) => re.test(t.name.toLowerCase()));
    if (hit) return safe(hit.value);
  }
  return null;
}

function pickDark(tokens: Token[], ...res: RegExp[]): string | null {
  for (const re of res) {
    const hit = tokens.find((t) => re.test(t.name.toLowerCase()));
    if (hit) return safe(hit.dark ?? hit.value);
  }
  return null;
}

export function renderDesignPreview(md: string, projectName = 'project'): string {
  const t = parseDesignTokens(md);
  const status = readFrontmatter(md).status ?? 'uninitialized';
  const light = {
    bg: pick(t.colors, /bg-main|background|bg(?!-)/) ?? '#ffffff',
    fg: pick(t.colors, /text-base|text(?!-muted)|fg/) ?? '#111111',
  };
  const dark = {
    bg: pickDark(t.colors, /bg-main|background|bg(?!-)/) ?? '#111113',
    fg: pickDark(t.colors, /text-base|text(?!-muted)|fg/) ?? '#f4f4f5',
  };
  const { painted, lightVars, darkVars } = palette(t.colors, light, dark);
  const hasDark = t.colors.some((c) => c.dark);
  const empty =
    t.colors.length === 0 && t.type.length === 0 && t.spacing.length === 0 && t.radius.length === 0;
  const body = empty
    ? `<section><div class="surface"><p class="desc">DESIGN.md carries no decided tokens yet — every value is still a <code>[placeholder]</code>. Run the designer step, then reopen this page.</p></div></section>`
    : [
        hasDark
          ? ''
          : `<div class="warn-strip only-dark">DESIGN.md declares no dark palette — only this page switches. Give each color a dark value (a <code>Dark</code> column, a <code>## Dark mode</code> table, or a <code>-dark</code> token) and the swatches below switch with it.</div>`,
        colorSection(painted, light, dark),
        typeSection(t.type, t.fonts),
        scaleSection('Spacing', t.spacing, 'bar'),
        scaleSection('Radius', t.radius, 'box'),
        shadowSection(t.shadows),
        componentSection(painted, t.radius),
        scaleSection('Layout', t.layout, 'list'),
      ].join('\n');

  return `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(projectName)} — Design tokens</title>
<style>
  :root { --paper:#fbfbfa; --ink:#18181b; --muted:#71717a; --line:#e4e4e7; --card:#fff; ${lightVars.join(';')} }
  :root[data-theme="dark"] { --paper:#111113; --ink:#f4f4f5; --muted:#a1a1aa; --line:#27272a; --card:#18181b; ${darkVars.join(';')} }
  :root[data-theme="dark"] .only-light, :root[data-theme="light"] .only-dark { display:none; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:14px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 28px 22px 100px; }
  .bar-top { display:flex; align-items:center; gap:12px; justify-content:space-between; margin-bottom:26px; }
  .modes { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:3px; background:var(--card); }
  .modes button { border:0; background:transparent; color:var(--muted); font:inherit; font-size:12px; padding:5px 14px; border-radius:999px; cursor:pointer; }
  .modes button[aria-pressed="true"] { background:var(--ink); color:var(--paper); font-weight:600; }
  header h1 { font-size: 28px; letter-spacing:-0.02em; margin: 0; }
  header p { color: var(--muted); margin: 8px 0 0; }
  .meta { font: 11px ui-monospace, monospace; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  section { margin-top: 48px; }
  section > h2 { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:0 0 10px; }
  .desc { color: var(--muted); margin: 0 0 14px; }
  .warn-strip { margin-top:32px; padding:12px 16px; border:1px solid var(--line); border-left:3px solid #f59e0b; border-radius:8px; color:var(--muted); font-size:13px; }
  .surface { background: var(--card); border:1px solid var(--line); border-radius:12px; padding:22px; }
  .tokrow { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px; }
  .tok { display:flex; gap:12px; align-items:flex-start; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px; }
  .chip { width:38px; height:38px; border-radius:8px; flex:none; box-shadow: inset 0 0 0 1px rgba(128,128,128,.25); }
  .tk b { display:block; font-weight:600; font-size:12.5px; }
  .tk code, .val, code { font-family: ui-monospace, SFMono-Regular, monospace; font-size:11.5px; color:var(--muted); }
  .tk code { display:block; }
  .tk .same { opacity:.65; }
  .tk .note, .scale-row .note { color:var(--muted); font-size:11.5px; }
  .tk .note { display:block; }
  .badge { display:inline-block; margin-top:6px; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge.ok { background:#16a34a26; color:#22a05a; } .badge.warn { background:#f59e0b26; color:#c1820c; } .badge.bad { background:#dc262626; color:#e0574f; }
  .spec { display:flex; gap:20px; align-items:baseline; padding:14px 0; border-bottom:1px solid var(--line); }
  .spec:last-child { border-bottom:0; }
  .spec .tag { width:150px; flex:none; font-family:ui-monospace,monospace; font-size:11.5px; color:var(--muted); }
  .spec .tag span { display:block; font-size:10.5px; opacity:.75; }
  .spec .sample { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .scale-row { display:flex; align-items:center; gap:14px; padding:7px 0; }
  .scale-row code { width:150px; flex:none; }
  .scale-row .val { width:70px; flex:none; }
  .bar { height:14px; background:currentColor; opacity:.75; border-radius:3px; max-width:100%; }
  .box { width:56px; height:40px; border:2px solid currentColor; opacity:.7; }
  .grid { display:flex; flex-wrap:wrap; gap:18px; }
  .shadow-cell { text-align:center; }
  .shadow-box { width:110px; height:66px; background:var(--card); border-radius:10px; margin-bottom:8px; border:1px solid var(--line); }
  .demo { display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
  .demo > span { font-size:11px; color:var(--muted); font-family:ui-monospace,monospace; }
  .demo button { border:0; padding:0 18px; height:44px; font:inherit; font-weight:600; cursor:pointer; }
  .demo input { height:44px; padding:0 12px; font:inherit; background:transparent; color:inherit; min-width:220px; }
  .pill { display:inline-block; padding:5px 12px; font-size:12.5px; font-weight:600; }
  footer { margin-top:60px; color:var(--muted); font-size:12px; border-top:1px solid var(--line); padding-top:14px; }
</style></head>
<body><div class="wrap">
<div class="bar-top">
  <div class="meta">${esc(status)} · generated from DESIGN.md</div>
  <div class="modes" role="group" aria-label="Preview mode">
    <button type="button" data-mode="light" aria-pressed="true">Light</button>
    <button type="button" data-mode="dark" aria-pressed="false">Dark</button>
    <button type="button" data-mode="system" aria-pressed="false">System</button>
  </div>
</div>
<header>
  <h1>${esc(projectName)} — design tokens</h1>
  <p>Every value on this page is read out of <code>.kortext/DESIGN.md</code>. Edit the document, not this file.</p>
</header>
${body}
<footer>Generated by kortext on ${new Date().toISOString().slice(0, 10)} — regenerated each time DESIGN.md changes.</footer>
</div>
<script>
  // The mode is the reader's, not the document's: it survives a reload, and
  // "system" keeps following the OS while the page is open.
  (function () {
    var root = document.documentElement;
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var mode = 'system';
    try { mode = localStorage.getItem('kortext-preview-mode') || 'system'; } catch (e) {}
    function paint() {
      root.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
      document.querySelectorAll('.modes button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      });
    }
    document.querySelectorAll('.modes button').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.dataset.mode;
        try { localStorage.setItem('kortext-preview-mode', mode); } catch (e) {}
        paint();
      });
    });
    media.addEventListener('change', function () { if (mode === 'system') paint(); });
    paint();
  })();
</script>
</body></html>`;
}

/** Writes `.kortext/DESIGN.html` next to the document. No document, no page. */
export function writeDesignPreview(project: Project): void {
  const md = join(project.repo_path, '.kortext', 'DESIGN.md');
  if (!existsSync(md)) return;
  const content = readFileSync(md, 'utf8');
  writeFileSync(
    join(project.repo_path, '.kortext', 'DESIGN.html'),
    renderDesignPreview(content, project.name),
    'utf8',
  );
}
