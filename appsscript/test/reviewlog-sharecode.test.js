const test = require('node:test');
const assert = require('node:assert/strict');

const PureReviewLog = require('../src/pure/reviewLog');
const PureShareCode = require('../src/pure/shareCode');

test('review logs are insert-only and idempotent by id', () => {
  assert.deepEqual(PureReviewLog.decideInsert(false), { action: 'insert' });
  assert.deepEqual(PureReviewLog.decideInsert(true), { action: 'ignore', reason: 'duplicate_id' });
});

test('share code generator yields 8-character Crockford base32 strings', () => {
  const code = PureShareCode.generateFromBytes([0xde, 0xad, 0xbe, 0xef, 0x42]);
  assert.equal(code.length, 8);
  assert.equal(PureShareCode.isValid(code), true);
  assert.equal(PureShareCode.isValid('O0INVALID'), false);
  assert.equal(PureShareCode.isValid('ABC1234'), false);
});
