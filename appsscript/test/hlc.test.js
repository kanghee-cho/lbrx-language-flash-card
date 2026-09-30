const test = require('node:test');
const assert = require('node:assert/strict');

const PureHlc = require('../src/pure/hlc');
const PureDecideApply = require('../src/pure/decideApply');

test('HLC compare is plain lexicographic ordering', () => {
  assert.equal(PureHlc.compare('000000000000001-00000-a', '000000000000001-00000-a'), 0);
  assert.equal(PureHlc.compare('000000000000001-00000-a', '000000000000001-00001-a'), -1);
  assert.equal(PureHlc.compare('000000000000001-00009-a', '000000000000002-00000-a'), -1);
  assert.equal(PureHlc.compare('000000000000010-00000-b', '000000000000009-99999-z'), 1);
});

test('HLC validation accepts documented server format and rejects malformed values', () => {
  assert.equal(PureHlc.isValidHlc('000001727650000-00000-server'), true);
  assert.equal(PureHlc.isValidHlc('1727650000-00000-server'), false);
  assert.equal(PureHlc.isValidHlc('000001727650000-0-server'), false);
  assert.equal(PureHlc.isValidHlc('000001727650000-00000-UPPER'), false);
});

test('decideApply returns insert, update, ignore, and reject as expected', () => {
  assert.deepEqual(
    PureDecideApply.decideApply(null, '000000000000002-00000-a', null, 'user-1'),
    { action: 'insert' }
  );
  assert.deepEqual(
    PureDecideApply.decideApply('000000000000001-00000-a', '000000000000002-00000-a', 'user-1', 'user-1'),
    { action: 'update' }
  );
  assert.deepEqual(
    PureDecideApply.decideApply('000000000000003-00000-a', '000000000000002-00000-a', 'user-1', 'user-1'),
    { action: 'ignore', reason: 'stale_hlc' }
  );
  assert.deepEqual(
    PureDecideApply.decideApply('000000000000001-00000-a', '000000000000002-00000-a', 'user-2', 'user-1'),
    { action: 'reject', reason: 'owner_mismatch' }
  );
});
