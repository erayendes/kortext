import { describe, it, expect } from 'vitest';

describe('stack smoke', () => {
  it('node runtime is 22+', () => {
    const major = Number(process.versions.node.split('.')[0]);
    expect(major).toBeGreaterThanOrEqual(22);
  });

  it('zod is importable and validates', async () => {
    const { z } = await import('zod');
    const schema = z.object({ ok: z.boolean() });
    expect(schema.parse({ ok: true })).toEqual({ ok: true });
  });
});
