import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer } from '../server/update.js';

test('a newer release shows, an older or equal one does not', () => {
  assert.equal(isNewer('3.2.0', '3.1.0'), true);
  assert.equal(isNewer('3.1.1', '3.1.0'), true);
  assert.equal(isNewer('4.0.0', '3.10.0'), true);
  assert.equal(isNewer('3.1.0', '3.1.0'), false);
  assert.equal(isNewer('3.1.0', '3.2.0'), false);
  // Two digits sort as numbers, not as text: 3.10.0 is after 3.9.0.
  assert.equal(isNewer('3.9.0', '3.10.0'), false);
  // A prerelease is not the release, and never nags anyone into installing it.
  assert.equal(isNewer('3.2.0-rc.1', '3.2.0'), false);
});
