import { describe, expect, it } from 'vitest';
import {
  analyticsQuery,
  connectedDefaults,
  overviewFromAnalytics,
} from '../src/features/approved-ui/product/analytics/connected-data.js';

describe('approved analytics contracts', () => {
  it('does not fabricate sentiment, satisfaction or completion from unanalyzed responses', () => {
    const result = overviewFromAnalytics({ totalResponses: 12, sentimentDistribution: {} });
    expect(result.total).toBe(12);
    expect(result.positivePercent).toBeNull();
    expect(result.rating).toBeNull();
    expect(result.completion).toBeNull();
    expect(overviewFromAnalytics(null).ready).toBe(false);
  });
  it('uses analyzed sentiment as the denominator and retains mixed responses', () => {
    const result = overviewFromAnalytics({
      totalResponses: 20,
      sentimentDistribution: { positive: 3, negative: 1, mixed: 2 },
      trends: [{ date: '2026-10-26', totalResponses: 20, sentimentDistribution: {} }],
      comparisons: [{ branchId: 'branch-1', branchName: 'Saved branch', totalResponses: 20 }],
    });
    expect(result.positivePercent).toBe(50);
    expect(result.mixed).toBe(2);
    expect(result.periods[0].positivePercent).toBeNull();
    expect(result.branches[0]).toMatchObject({ id: 'branch-1', branch: 'Saved branch' });
  });
  it('maps supplied filter state to authorized API filters in the workspace timezone', () => {
    const query = new URLSearchParams(
      analyticsQuery(
        { branch: 'branch-1', start: '2026-01-01', end: '2026-01-02' },
        { language: 'Arabic', surveyId: 'survey-1' },
        'Africa/Cairo',
      ).slice(1),
    );
    expect(query.get('branchId')).toBe('branch-1');
    expect(query.get('language')).toBe('ar');
    expect(query.get('surveyId')).toBe('survey-1');
    expect(query.get('from')).toBe('2025-12-31T22:00:00.000Z');
    expect(query.get('to')).toBe('2026-01-02T21:59:59.999Z');
  });
  it('defaults connected scopes to the current thirty days rather than the sample dates', () => {
    expect(connectedDefaults(new Date('2026-10-26T12:00:00Z'), 'Africa/Cairo')).toEqual({
      branch: 'all',
      start: '2026-09-27',
      end: '2026-10-26',
    });
  });
});
