import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import AnalyticsPage from '../src/features/analytics/AnalyticsPage.jsx';
import ReportsPage from '../src/features/reports/ReportsPage.jsx';
import { productApi } from '../src/features/product/api.js';
import { ResponseTrendChart, TrendChart } from '../src/features/analytics/ChartVisuals.jsx';

const workspace = {
  role: 'owner',
  reportingTimezone: 'UTC',
  branches: [{ id: 'branch', name: 'Cairo' }],
};
it('localizes calendar-period labels and source tooltips without changing chart dates', () => {
  const rows = [
    {
      date: '2026-10-01',
      totalResponses: 2,
      sentimentDistribution: { positive: 1, negative: 1 },
      aspectScores: [{ aspect: 'Service', score: 5 }],
    },
  ];
  const { container, rerender } = render(
    <>
      <ResponseTrendChart language="ar" rows={rows} />
      <TrendChart language="ar" rows={rows} />
    </>,
  );
  expect(screen.getAllByText('١ أكتوبر ٢٠٢٦', { selector: 'text' })).toHaveLength(2);
  expect(container.querySelector('rect title').textContent).toContain('١ أكتوبر ٢٠٢٦');
  expect(container.textContent).not.toContain('2026-10-01');
  rerender(
    <ResponseTrendChart language="en" interval="month" rows={[{ ...rows[0], date: '2026-10' }]} />,
  );
  expect(screen.getByText('Oct 2026', { selector: 'text' })).toBeInTheDocument();
});
it('shows the overview chart grid together with real counts and all four sentiment classes', async () => {
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path.startsWith('/analytics')
        ? {
            totalResponses: 8,
            analyzedResponses: 6,
            pendingResponses: 2,
            sentimentDistribution: { positive: 3, negative: 1, neutral: 1, mixed: 1 },
            aspectScores: [{ aspect: 'Service', score: 7, mentions: 6, lowSample: true }],
            trends: [
              {
                date: '2026-10-25',
                totalResponses: 8,
                sentimentDistribution: { positive: 3, negative: 1, neutral: 1, mixed: 1 },
                aspectScores: [{ aspect: 'Service', score: 7 }],
              },
            ],
          }
        : path === '/surveys'
          ? { surveys: [] }
          : { jobs: [] },
    ),
  );
  render(<AnalyticsPage overview language="en" workspace={workspace} />);
  expect(
    await screen.findByRole('img', { name: 'Response count and positive sentiment over time' }),
  ).toBeVisible();
  expect(
    screen.getByRole('img', { name: 'Sentiment distribution for analyzed responses' }),
  ).toBeVisible();
  expect(screen.getByRole('img', { name: 'Aspect scores out of 10' })).toBeVisible();
  expect(
    within(
      screen.getByRole('img', { name: 'Sentiment distribution for analyzed responses' }),
    ).getByText('Mixed'),
  ).toBeVisible();
  expect(
    within(
      screen.getByText('Positive sentiment', { selector: '.metric-heading p' }).closest('section'),
    ).getByText('50%'),
  ).toBeVisible();
  expect(screen.queryByText('Completion rate')).not.toBeInTheDocument();
  expect(screen.queryByText('Customer satisfaction')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Filter feedback'));
  expect(screen.getByLabelText('Branch')).toBeVisible();
});

it('preserves unobserved gaps and excludes pending responses from positive sentiment percentages', () => {
  const { container } = render(
    <ResponseTrendChart
      language="en"
      rows={[
        {
          date: '2026-10-01',
          totalResponses: 10,
          sentimentDistribution: { positive: 1, mixed: 1 },
        },
        { date: '2026-10-03', totalResponses: 4, sentimentDistribution: { positive: 2 } },
      ]}
    />,
  );
  expect(
    container.querySelector('[data-series="positive-sentiment"]').getAttribute('d').match(/M/g),
  ).toHaveLength(2);
  expect(screen.getByText('1 Oct 2026: 50.0% positive', { selector: 'title' })).toBeInTheDocument();
});

it('retains report generation language and cohort filters while the controls are collapsed', async () => {
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(path === '/reports' ? { reports: [] } : { surveys: [] }),
  );
  const send = vi.spyOn(productApi, 'send').mockResolvedValue({
    report: {
      id: 'queued-report',
      locale: 'ar',
      status: 'queued',
      filters: { branchId: 'branch' },
    },
  });
  render(<ReportsPage language="en" workspace={workspace} />);
  const toggle = screen.getByRole('button', { name: 'Generate new report' });
  fireEvent.click(toggle);
  fireEvent.change(screen.getByLabelText('Report language'), { target: { value: 'ar' } });
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'branch' } });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(screen.getByLabelText('Branch')).toHaveValue('branch');
  expect(screen.getByLabelText('Report language')).toHaveValue('ar');
  fireEvent.click(screen.getByRole('button', { name: 'Create report' }));
  await screen.findByText(
    'This request is queued or processing. Refresh to see its latest status.',
  );
  expect(send.mock.calls[0][1]).toEqual({ locale: 'ar', filters: { branchId: 'branch', page: 1 } });
});

it('renders saved report cards and keeps generated Arabic content RTL within English controls', async () => {
  const report = {
    id: 'report',
    locale: 'ar',
    status: 'succeeded',
    createdAt: '2026-10-25T10:00:00Z',
    metrics: { totalResponses: 8, analyzedResponses: 6, comparisons: [{ branchId: 'branch' }] },
    snapshot: { totalTextResponses: 8, evidenceCount: 1, truncated: true },
    filters: {},
    content: {
      title: 'تقرير الخدمة',
      summary: 'ملخص محفوظ',
      sections: [{ title: 'الخدمة', text: 'تحسين الخدمة', evidenceIds: ['r1'] }],
      evidence: [{ id: 'r1', quote: 'خدمة جيدة' }],
    },
    evidence: [{ id: 'r1', text: 'خدمة جيدة' }],
  };
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path === '/reports'
        ? { reports: [report] }
        : path === '/reports/report'
          ? { report }
          : { surveys: [] },
    ),
  );
  render(<ReportsPage language="en" workspace={{ ...workspace, role: 'viewer' }} />);
  const card = await screen.findByRole('article', { name: 'تقرير الخدمة' });
  expect(within(card).getByText('ملخص محفوظ')).toHaveAttribute('dir', 'rtl');
  expect(within(card).getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
    'href',
    '/api/v1/reports/report/export',
  );
  fireEvent.click(within(card).getByRole('button', { name: 'Open report' }));
  const body = (await screen.findByText('تحسين الخدمة')).closest('.report-document');
  expect(body).toHaveAttribute('dir', 'rtl');
  expect(body).toHaveAttribute('lang', 'ar');
  expect(screen.queryByRole('button', { name: 'Create report' })).not.toBeInTheDocument();
});
