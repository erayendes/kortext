import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseInline } from '../src/components/v6/markdown.ts';

describe('parseMarkdown', () => {
  it('classifies heading levels, quotes, bullets and paragraphs', () => {
    const tokens = parseMarkdown(
      ['# Title', '## Section', '### Sub', '> note', '- item', 'plain'].join('\n'),
    );
    expect(tokens.map((t) => t.kind)).toEqual([
      'h1',
      'h2',
      'h3',
      'quote',
      'bullet',
      'para',
    ]);
    expect(tokens[0]!.text).toBe('Title');
    expect(tokens[4]!.text).toBe('item');
  });

  it('marks blank lines as non-selectable spacers', () => {
    const tokens = parseMarkdown('a\n\nb');
    expect(tokens.map((t) => t.kind)).toEqual(['para', 'blank', 'para']);
    expect(tokens[1]!.selectable).toBe(false);
    expect(tokens[0]!.selectable).toBe(true);
  });

  it('assigns stable incrementing indexes', () => {
    const tokens = parseMarkdown('# A\n- one\n- two');
    expect(tokens.map((t) => t.index)).toEqual([0, 1, 2]);
  });

  it('collapses a pipe block into a single table token with header + rows', () => {
    const md = ['| Name | Age |', '| --- | --- |', '| Ann | 30 |', '| Bo | 25 |'].join(
      '\n',
    );
    const tokens = parseMarkdown(md);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.kind).toBe('table');
    expect(tokens[0]!.table).toEqual({
      header: ['Name', 'Age'],
      rows: [
        ['Ann', '30'],
        ['Bo', '25'],
      ],
    });
  });

  it('treats a lone pipe line as a paragraph, not a table', () => {
    const tokens = parseMarkdown('| just one row |');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.kind).toBe('para');
  });
});

describe('parseInline', () => {
  it('splits bold and code spans out of surrounding text', () => {
    expect(parseInline('a **b** c `d` e')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', value: 'b' },
      { type: 'text', value: ' c ' },
      { type: 'code', value: 'd' },
      { type: 'text', value: ' e' },
    ]);
  });

  it('returns a single text span when there is no markup', () => {
    expect(parseInline('plain text')).toEqual([{ type: 'text', value: 'plain text' }]);
  });
});
