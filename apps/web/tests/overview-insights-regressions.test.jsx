import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ScopedInsights from '../src/features/approved-ui/product/ScopedInsights.jsx';
import { matchingOverviewReport } from '../src/features/approved-ui/product/analytics/connected-data.js';
const { dashboard } = vi.hoisted(() => ({
  dashboard: {
    connected: true,
    filters: { branch: 'all', start: '2026-10-01', end: '2026-10-27' },
    resource: { loading: false },
    report: { raw: { totalResponses: 12 } },
    insight: {
      report: {
        id: 'saved',
        status: 'succeeded',
        content: {
          summary: 'Customers praised service.',
          evidence: [{ id: 'response', quote: 'Late delivery' }],
          sections: [
            {
              title: 'Next actions',
              text: 'Review the delivery feedback.',
              evidenceIds: ['response'],
            },
          ],
        },
      },
      loading: false,
    },
  },
}));
vi.mock('../src/features/approved-ui/product/ProductContext.jsx', () => ({
  useProductView: () => ({ dashboard, language: 'en', tr: (text) => text }),
}));
it('shows saved model summary and actionable report sections with evidence links', () => {
  render(
    <>
      <ScopedInsights kind="daily" />
      <ScopedInsights kind="recommendations" />
    </>,
  );
  expect(screen.getByText('Customers praised service.')).toBeVisible();
  expect(
    screen.getAllByRole('link', { name: 'View saved report and evidence' })[0],
  ).toHaveAttribute('href', '#/report-details?id=saved');
  expect(screen.getByText('Review the delivery feedback.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Late delivery' })).toHaveAttribute(
    'href',
    '#/feedback-details?id=response',
  );
});
it('selects only reports matching the selected cohort, locale and response count', () => {
  const filters = {
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-27T23:59:59.999Z',
    interval: 'day',
  };
  const report = {
    id: 'right',
    filters,
    locale: 'en',
    metrics: { totalResponses: 12 },
    createdAt: '2026-10-27T08:00:00Z',
  };
  const reports = [
    { ...report, id: 'branch', filters: { ...filters, branchId: 'other' } },
    { ...report, id: 'old', metrics: { totalResponses: 11 } },
    { ...report, id: 'arabic', locale: 'ar' },
    report,
  ];
  expect(matchingOverviewReport(reports, filters, 'en', 12)?.id).toBe('right');
  expect(matchingOverviewReport(reports, { ...filters, search: 'new' }, 'en', 12)).toBeNull();
});
it('keeps observed decline alerts visible alongside model insight states', () => {
  dashboard.report.raw.alerts = [
    { aspect: 'Service', change: -3, from: '2026-10-01', to: '2026-10-02' },
  ];
  render(<ScopedInsights kind="daily" />);
  expect(screen.getByText(/Observed score change/)).toHaveTextContent('-3');
  expect(screen.getByRole('link', { name: 'Review feedback' })).toHaveAttribute(
    'href',
    '#/feedbacks?aspect=Service',
  );
  dashboard.report.raw.alerts = [];
});
