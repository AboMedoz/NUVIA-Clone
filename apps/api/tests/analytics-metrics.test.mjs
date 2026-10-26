import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateResponses } from '../src/modules/analytics/service.mjs';

test('analytics derives customer satisfaction only from valid saved five-point rating answers', () => {
  const base = {
    createdAt: new Date('2026-10-26T10:00:00Z'),
    branchId: 'branch',
    branchName: 'Saved branch',
    analysisStatus: 'waiting_for_model',
    questions: [
      { id: 'rating', type: 'rating' },
      { id: 'nps', type: 'nps' },
    ],
  };
  const metrics = aggregateResponses([
    {
      ...base,
      answers: [
        { questionId: 'rating', value: 5 },
        { questionId: 'nps', value: 10 },
      ],
    },
    { ...base, answers: [{ questionId: 'rating', value: 3 }] },
    { ...base, answers: [{ questionId: 'rating', value: 100 }] },
    { ...base, answers: [{ questionId: 'rating', value: '5' }] },
  ]);
  assert.equal(metrics.averageRating, 4);
  assert.equal(metrics.ratingAnswerCount, 2);
  assert.equal(metrics.comparisons[0].averageRating, 4);
  assert.equal(metrics.trends[0].averageRating, 4);
  assert.equal(metrics.analyzedResponses, 0);
});

test('analytics has no fabricated satisfaction when no rating answer exists', () => {
  const metrics = aggregateResponses([]);
  assert.equal(metrics.averageRating, null);
  assert.equal(metrics.ratingAnswerCount, 0);
});
