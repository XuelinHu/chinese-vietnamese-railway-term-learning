import test from 'node:test';
import assert from 'node:assert/strict';
import { getPagination, paged } from '../src/utils/pagination.js';

test('pagination defaults and clamps invalid and oversized input safely', () => {
  assert.deepEqual(getPagination({}), { page: 1, pageSize: 10, limit: 10, offset: 0 });
  assert.deepEqual(getPagination({ page: '-1', pageSize: '1000' }), { page: 1, pageSize: 100, limit: 100, offset: 0 });
  assert.deepEqual(getPagination({ page: 'not-a-number', pageSize: '0' }), { page: 1, pageSize: 1, limit: 1, offset: 0 });
  const maximum = getPagination({ page: '999999999999999999999999', pageSize: '100' });
  assert(Number.isSafeInteger(maximum.offset));
  assert(maximum.offset <= Number.MAX_SAFE_INTEGER);
});

test('paged response converts PostgreSQL count values to a JSON number', () => {
  assert.deepEqual(paged([{ id: 1 }], '9223372036854775807', 1, 10), {
    rows: [{ id: 1 }], total: Number.MAX_SAFE_INTEGER, page: 1, pageSize: 10
  });
});
