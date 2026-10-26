import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSchema, listFeedback } from '../src/modules/feedback/service.mjs';

test('feedback order accepts only the two interface sort directions', () => {
  assert.equal(filterSchema.parse({}).order, 'newest');
  assert.equal(filterSchema.parse({ order: 'oldest' }).order, 'oldest');
  assert.equal(filterSchema.safeParse({ order: 'arbitrary' }).success, false);
});

test('oldest feedback ordering retains authorized workspace and branch scope', async () => {
  let actualQuery, actualSort;
  const chain = {
    sort(value) {
      actualSort = value;
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    lean: async () => [],
  };
  const deps = {
    models: {
      Response: {
        countDocuments: async () => 0,
        find(query) {
          actualQuery = query;
          return chain;
        },
      },
    },
  };
  const access = { workspace: { _id: 'workspace' }, branchIds: ['allowed-branch'] };
  const result = await listFeedback(filterSchema.parse({ order: 'oldest' }), access, deps);
  assert.deepEqual(actualQuery, {
    workspaceId: 'workspace',
    branchId: { $in: ['allowed-branch'] },
  });
  assert.deepEqual(actualSort, { createdAt: 1, _id: 1 });
  assert.equal(result.total, 0);
});
