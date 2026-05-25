import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slugifyHeading, updateToc } from '../server/services/toc-updater.ts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-toc-'));
  file = join(dir, 'decisions.md');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('slugifyHeading', () => {
  it('lowercases and converts non-alphanumerics to dashes', () => {
    expect(slugifyHeading('ADR-001: Auth Stack: Auth0')).toBe('adr-001-auth-stack-auth0');
  });

  it('collapses runs of non-alphanumerics', () => {
    expect(slugifyHeading('Foo --- Bar !!! Baz')).toBe('foo-bar-baz');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugifyHeading('--- Hello ---')).toBe('hello');
  });

  it('strips a leading `## ` marker', () => {
    expect(slugifyHeading('## ADR-001: Auth Stack')).toBe('adr-001-auth-stack');
  });

  it('handles Turkish-ish headings (anchor lossy by design)', () => {
    // Non-ASCII chars become dashes — this matches GitHub-flavoured slug
    // behaviour for our DOMPurify renderer.
    expect(slugifyHeading('Öğrenim: bir problem')).toBe('renim-bir-problem');
  });
});

describe('updateToc', () => {
  it('returns no-op when file does not exist', () => {
    const res = updateToc({ filePath: join(dir, 'missing.md') });
    expect(res).toEqual({ updated: false, entries: 0 });
  });

  it('returns no-op when file has no `## İçindekiler` heading', () => {
    writeFileSync(file, '# Title\n\n## ADR-001: Auth\nbody\n', 'utf8');
    const res = updateToc({ filePath: file });
    expect(res).toEqual({ updated: false, entries: 0 });
  });

  it('rewrites TOC with anchors derived from `##` headings', () => {
    const source =
      '# Architectural Decision Records (ADR)\n\n' +
      '## İçindekiler\n\n' +
      '<!-- old placeholder -->\n\n' +
      '---\n\n' +
      '## ADR-001: Auth Stack: Auth0\n' +
      'body 1\n\n' +
      '## ADR-002: Payment Provider: Stripe\n' +
      'body 2\n';
    writeFileSync(file, source, 'utf8');
    const res = updateToc({ filePath: file });
    expect(res).toEqual({ updated: true, entries: 2 });

    const next = readFileSync(file, 'utf8');
    expect(next).toContain('1. [ADR-001: Auth Stack: Auth0](#adr-001-auth-stack-auth0)');
    expect(next).toContain('2. [ADR-002: Payment Provider: Stripe](#adr-002-payment-provider-stripe)');
    // ADR bodies survive.
    expect(next).toContain('body 1');
    expect(next).toContain('body 2');
  });

  it('is idempotent — re-running on the same content does not change bytes', () => {
    const source =
      '# ADR\n\n## İçindekiler\n\n---\n\n## ADR-001: Foo\nbody\n';
    writeFileSync(file, source, 'utf8');
    updateToc({ filePath: file });
    const first = readFileSync(file, 'utf8');
    updateToc({ filePath: file });
    const second = readFileSync(file, 'utf8');
    expect(second).toBe(first);
  });

  it('skips template/skeleton `## ` headings inside HTML comments', () => {
    const source =
      '# Knowledge Base\n\n' +
      '## İçindekiler\n\n' +
      '<!-- ŞABLON — kopyala -->\n' +
      '<!--\n' +
      '## Öğrenim: [template]\n' +
      'body\n' +
      '-->\n\n' +
      '## Öğrenim: gerçek konu\n' +
      'real body\n';
    writeFileSync(file, source, 'utf8');
    const res = updateToc({ filePath: file });
    expect(res.entries).toBe(1);
    const next = readFileSync(file, 'utf8');
    expect(next).toContain('1. [Öğrenim: gerçek konu]');
    expect(next).not.toContain('[Öğrenim: [template]]');
  });

  it('emits a placeholder when there are no entries yet', () => {
    const source = '# ADR\n\n## İçindekiler\n\n---\n';
    writeFileSync(file, source, 'utf8');
    const res = updateToc({ filePath: file });
    expect(res.entries).toBe(0);
    expect(res.updated).toBe(true);
    const next = readFileSync(file, 'utf8');
    expect(next).toContain('Engine otomatik günceller');
  });
});
