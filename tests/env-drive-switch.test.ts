import { describe, expect, it } from 'vitest';
import { EnvSchema } from '../server/config/env.ts';

/**
 * KORTEXT_DRIVE_ENABLED is the autonomous driver's safety switch (§5.16). It is
 * the ONLY thing standing between "wired but inert" and "the system does real
 * work", so its parse must fail safe: anything that is not an explicit "on"
 * token must read as OFF. A naive z.coerce.boolean() would arm the driver on
 * "0" — these tests pin the safe behavior.
 */
describe('KORTEXT_DRIVE_ENABLED — driver safety switch parses fail-safe (§5.16)', () => {
  const parse = (v: string | undefined) =>
    EnvSchema.parse({ KORTEXT_DRIVE_ENABLED: v }).KORTEXT_DRIVE_ENABLED;

  it('is OFF when unset', () => expect(parse(undefined)).toBe(false));
  it('reads "0" as OFF (not naively truthy)', () => expect(parse('0')).toBe(false));
  it('reads "false" as OFF', () => expect(parse('false')).toBe(false));
  it('reads "" as OFF', () => expect(parse('')).toBe(false));
  it('reads arbitrary junk as OFF', () => expect(parse('yes-please')).toBe(false));
  it('arms on "1"', () => expect(parse('1')).toBe(true));
  it('arms on "true"', () => expect(parse('true')).toBe(true));
});
