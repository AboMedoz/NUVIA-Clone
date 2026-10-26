import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConnectedAnalytics, {
  analyticsExportRows,
} from '../src/features/approved-ui/product/analytics/ConnectedAnalytics.jsx';
import { overviewFromAnalytics } from '../src/features/approved-ui/product/analytics/connected-data.js';

const state = vi.hoisted(() => ({ value: null }));
vi.mock('../src/features/approved-ui/product/ProductContext.jsx', () => ({
  useProductView: () => state.value,
}));

function configure(kind, data, resource = {}) {
  state.value = {
    analytics: {
      kind,
      filters: { language: 'All languages' },
      setFilters: vi.fn(),
      resource: { data, loading: false, error: null, reload: vi.fn(), ...resource },
    },
    dashboard: {
      connected: true,
      isFiltered: true,
      filters: { branch: 'all', start: '2026-10-01', end: '2026-10-26' },
      setFilters: vi.fn(),
      branches: [{ id: 'branch-1', name: 'Saved branch' }],
      surveys: [],
      report: overviewFromAnalytics(data),
    },
    tr: (text) => text,
    formatNumber: String,
    language: 'en',
    isMobile: false,
  };
}
const sample = {
  totalResponses: 12,
  analyzedResponses: 0,
  pendingResponses: 12,
  sentimentDistribution: {},
  aspectScores: [],
  topics: [],
  trends: [],
  comparisons: [
    {
      branchId: 'branch-1',
      branchName: 'Saved branch',
      totalResponses: 12,
      sentimentDistribution: {},
    },
  ],
  forecasts: [],
  capabilityStates: { clustering: { status: 'waiting_for_model' } },
};

describe('approved connected analytics', () => {
  it('shows saved counts and honest waiting sentiment without illustrative records', () => {
    configure('sentiment', sample);
    const { container } = render(<ConnectedAnalytics />);
    expect(screen.getByText(/Saved customer feedback · 12 responses/)).toBeTruthy();
    expect(screen.getByText('No analyzed sentiment yet')).toBeTruthy();
    expect(container.textContent).not.toMatch(/1,248|974|Sample workspace|Illustrative/);
    expect(screen.getAllByText('—').length).toBe(4);
  });
  it('keeps failed requests retryable without replacing them with demo data', () => {
    const reload = vi.fn();
    configure('aspects', null, { error: new Error('NETWORK_ERROR'), reload });
    render(<ConnectedAnalytics />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Export data' }).disabled).toBe(true);
  });
  it('exports only saved aggregate values for the active view', () => {
    expect(analyticsExportRows(sample, 'comparison')).toEqual([
      ['Branch', 'Responses', 'Positive', 'Negative', 'Neutral', 'Mixed'],
      ['Saved branch', 12, 0, 0, 0, 0],
    ]);
    expect(analyticsExportRows(null, 'aspects')).toEqual([]);
  });
});
