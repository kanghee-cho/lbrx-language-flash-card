const test = require('node:test');
const assert = require('node:assert/strict');

const PurePagination = require('../src/pure/pagination');
const PureRowMapping = require('../src/pure/rowMapping');

test('pagination slices by cursor, applies limit, and reports hasMore', () => {
  const rows = [
    { serverSeq: 5, id: 'a' },
    { serverSeq: 2, id: 'b' },
    { serverSeq: 9, id: 'c' },
    { serverSeq: 7, id: 'd' }
  ];
  const page = PurePagination.sliceByCursor(rows, 4, 2);
  assert.deepEqual(page.items.map((item) => item.id), ['a', 'd']);
  assert.equal(page.nextCursor, 7);
  assert.equal(page.hasMore, true);
});

test('combined pagination cursor advances conservatively when one sheet overflows', () => {
  const nextCursor = PurePagination.combineSlices(0, [
    { items: [{ serverSeq: 5 }, { serverSeq: 10 }], hasMore: true },
    { items: [{ serverSeq: 20 }, { serverSeq: 25 }], hasMore: false }
  ]);
  assert.equal(nextCursor, 10);
});

test('row mapping round-trips tags JSON, nullable fields, booleans, and numbers', () => {
  const header = ['userId', 'serverSeq', 'id', 'tags', 'uploaded', 'deletedAt'];
  const schema = {
    jsonColumns: ['tags'],
    booleanColumns: ['uploaded'],
    numberColumns: ['serverSeq'],
    nullableColumns: ['deletedAt']
  };
  const row = PureRowMapping.toRow(header, {
    userId: 'user-1',
    serverSeq: 12,
    id: 'row-1',
    tags: ['a', 'b'],
    uploaded: true,
    deletedAt: null
  }, schema);

  assert.deepEqual(row, ['user-1', 12, 'row-1', '["a","b"]', true, '']);
  assert.deepEqual(PureRowMapping.fromRow(header, row, schema), {
    userId: 'user-1',
    serverSeq: 12,
    id: 'row-1',
    tags: ['a', 'b'],
    uploaded: true,
    deletedAt: null
  });
});
