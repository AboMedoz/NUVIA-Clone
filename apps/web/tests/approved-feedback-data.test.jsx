import { describe, it, expect } from 'vitest';
import {
  defaultScopeDates,
  feedbackRow,
  feedbackFilters,
  feedbackExportUrl,
  taskMessage,
} from '../src/features/approved-ui/product/connected-data.js';

describe('approved feedback data boundary', () => {
  it('uses the workspace day after local midnight instead of excluding new responses', () => {
    expect(defaultScopeDates('Africa/Cairo', new Date('2026-10-25T22:00:00Z')).end).toBe(
      '2026-10-26',
    );
  });
  it('keeps response date and time on the same workspace day', () => {
    expect(feedbackRow({ createdAt: '2026-10-25T22:00:00Z' }, 'en', 'Africa/Cairo').date).toBe(
      '2026-10-26',
    );
  });
  it('keeps UUIDs and pending analysis without inventing sentiment or aspects', () => {
    const row = feedbackRow({
      id: 'saved-uuid',
      text: 'Customer text',
      createdAt: '2026-10-26T10:00:00Z',
      analysisStatus: 'waiting_for_model',
      language: 'ar',
    });
    expect(row.id).toBe('saved-uuid');
    expect(row.sentiment).toBe('waiting_for_model');
    expect(row.aspects).toEqual([]);
    expect(row.language).toBe('Arabic');
  });
  it('maps only actual model mentions and preserves literal evidence', () => {
    const row = feedbackRow({
      id: 'a',
      createdAt: '2026-10-26T10:00:00Z',
      analysis: {
        sentiment: { label: 'mixed' },
        aspects: { mentions: [{ aspect: 'service', quote: 'slow service' }] },
      },
    });
    expect(row.sentiment).toBe('Mixed');
    expect(row.aspects).toEqual(['service']);
    expect(row.analysis.aspects.mentions[0].quote).toBe('slow service');
  });
  it('maps visual filters to strict server filters and authenticated export', () => {
    const filters = feedbackFilters(
      {
        date: '7',
        sentiment: 'Negative',
        language: 'Arabic',
        branch: 'branch-uuid',
        aspect: 'all',
      },
      'saved',
      new Date('2026-10-26T00:00:00Z'),
    );
    expect(filters).toMatchObject({
      from: '2026-10-19T00:00:00.000Z',
      branchId: 'branch-uuid',
      sentiment: 'negative',
      language: 'ar',
    });
    expect(feedbackExportUrl(filters)).toContain('/api/v1/feedback/export?');
    expect(taskMessage('waiting_for_model')).toContain('compatible AI model');
  });
});
