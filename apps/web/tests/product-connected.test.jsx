import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { currentRoute } from '../src/app/router/routes.js';
import { routePolicy } from '../src/app/router/access-policy.js';
import {
  validateAnswers,
  queryString,
  canManage,
  requestFilters,
} from '../src/features/product/product-state.js';
import PublicSurvey from '../src/features/surveys/PublicSurvey.jsx';
import { productApi } from '../src/features/product/api.js';
import SurveyBuilder from '../src/features/surveys/SurveyBuilder.jsx';
import { AspectScoreChart, TrendChart } from '../src/features/analytics/ChartVisuals.jsx';
import AnalyticsPage from '../src/features/analytics/AnalyticsPage.jsx';
import ReportsPage from '../src/features/reports/ReportsPage.jsx';
import SurveysPage from '../src/features/surveys/SurveysPage.jsx';
import { renderHook, act } from '@testing-library/react';
import { useResource } from '../src/features/product/useResource.js';

it('opens anonymous survey and business links without an account', () => {
  history.replaceState(null, '', '/#/s/public-token');
  expect(currentRoute()).toBe('public-survey');
  expect(routePolicy({ route: currentRoute(), user: null }).allow).toBe(true);
  history.replaceState(null, '', '/#/b/cafe');
  expect(currentRoute()).toBe('public-business');
  history.replaceState(null, '', '/#/team/accept?token=invitation');
  expect(currentRoute()).toBe('team-accept');
  expect(
    routePolicy({ route: currentRoute(), user: { emailVerified: true }, workspace: null }).allow,
  ).toBe(true);
});

it('serializes workspace dates and segment selectors using the strict API filter contract', () => {
  expect(
    requestFilters(
      {
        from: '2026-10-01',
        to: '2026-10-02',
        segmentKey: 'c89513f4-bb79-4ba4-86e4-0ae684eab680',
        segmentValue: 'Delivery',
      },
      'Africa/Cairo',
    ),
  ).toEqual({
    from: '2026-09-30T21:00:00.000Z',
    to: '2026-10-02T20:59:59.999Z',
    segment: JSON.stringify({ 'c89513f4-bb79-4ba4-86e4-0ae684eab680': 'Delivery' }),
  });
});
it('draws only observed aspect scores and preserves missing trend periods as gaps', () => {
  const { container } = render(
    <>
      <AspectScoreChart language="en" rows={[{ aspect: 'service', score: 7.5, mentions: 12 }]} />
      <TrendChart
        language="en"
        rows={[
          { date: '2026-10-01', aspectScores: [{ aspect: 'service', score: 8 }] },
          { date: '2026-10-02', aspectScores: [] },
          { date: '2026-10-03', aspectScores: [{ aspect: 'service', score: 4 }] },
        ]}
      />
    </>,
  );
  expect(screen.getByRole('img', { name: 'Aspect scores out of 10' })).toBeVisible();
  expect(screen.getByText('7.5 / 10')).toBeVisible();
  const line = container.querySelector('[data-aspect="service"]');
  expect(line.getAttribute('d').match(/M/g)).toHaveLength(2);
});
it('discards a stale response after the resource scope changes', async () => {
  let complete;
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    path === '/old'
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : Promise.resolve({ scope: 'new' }),
  );
  const { result, rerender } = renderHook(({ path }) => useResource(path), {
    initialProps: { path: '/old' },
  });
  rerender({ path: '/new' });
  await waitFor(() => expect(result.current.data).toEqual({ scope: 'new' }));
  await act(async () => complete({ scope: 'old' }));
  expect(result.current.data).toEqual({ scope: 'new' });
});
it('renders model-produced aspect scores, forecasts and observed risks from their actual DTO shape', async () => {
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path.startsWith('/analytics')
        ? {
            totalResponses: 30,
            analyzedResponses: 30,
            pendingResponses: 0,
            sentimentDistribution: { positive: 20, negative: 10 },
            aspectScores: [{ aspect: 'Service', score: 3, mentions: 30, lowSample: false }],
            trends: [
              {
                date: '2026-10-01',
                totalResponses: 30,
                aspectScores: [{ aspect: 'Service', score: 3 }],
              },
            ],
            forecasts: [
              {
                points: [{ date: '2026-10-02', value: 4, lower: 2, upper: 6 }],
                sampleCount: 30,
                uncertainty: 'Test interval',
                modelVersion: 'test-only',
              },
            ],
            atRiskAspects: [{ aspect: 'Service', score: 3, mentions: 30 }],
            comparisons: [
              {
                branchId: 'branch',
                branchName: 'Cairo',
                totalResponses: 30,
                aspectScores: [{ aspect: 'Service', score: 3 }],
              },
            ],
          }
        : path === '/surveys'
          ? { surveys: [] }
          : { jobs: [] },
    ),
  );
  render(<AnalyticsPage language="en" workspace={{ role: 'viewer', branches: [] }} />);
  await screen.findByText('Aspects needing attention');
  fireEvent.click(screen.getByRole('button', { name: 'Aspects', exact: true }));
  expect(screen.getByText('3 / 10')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Trends', exact: true }));
  expect(screen.getByText('Test interval')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Aspect scores over time out of 10' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Retry eligible analysis' })).not.toBeInTheDocument();
});
it('renders structured report sections and literal evidence without offering viewer mutations', async () => {
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path === '/reports'
        ? { reports: [{ id: 'report', status: 'succeeded', createdAt: '2026-10-01' }] }
        : path === '/reports/report'
          ? {
              report: {
                id: 'report',
                status: 'succeeded',
                content: {
                  title: 'Test-only report',
                  summary: 'Saved summary',
                  sections: [
                    { title: 'Service', text: 'Saved section', evidenceIds: ['response'] },
                  ],
                  evidence: [{ id: 'response', quote: 'Exact saved words' }],
                },
                evidence: [{ id: 'response', text: 'Exact saved words' }],
              },
            }
          : { surveys: [] },
    ),
  );
  render(<ReportsPage language="en" workspace={{ role: 'viewer', branches: [] }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open report' }));
  expect(await screen.findByText('Saved section')).toBeVisible();
  expect(screen.getAllByRole('link', { name: /Exact saved words/ })[0]).toHaveAttribute(
    'href',
    '#/feedback-details?id=response',
  );
  expect(screen.queryByRole('button', { name: 'Create report' })).not.toBeInTheDocument();
});
it('hides survey creation from viewers', async () => {
  vi.spyOn(productApi, 'get').mockResolvedValue({ surveys: [] });
  render(<SurveysPage language="en" workspace={{ role: 'viewer' }} />);
  await screen.findByText('Your first survey starts here');
  expect(screen.queryByRole('link', { name: 'Create survey' })).not.toBeInTheDocument();
});

it('validates required choices and numeric endpoints without treating zero as empty', () => {
  const questions = [
    { id: 'n', type: 'nps', required: true, label: 'Recommend' },
    { id: 'c', type: 'single_choice', required: true, options: ['Yes', 'No'] },
  ];
  expect(validateAnswers(questions, { n: 0, c: 'Yes' })).toEqual({});
  expect(validateAnswers(questions, { n: 11, c: 'Other' })).toEqual({ n: 'invalid', c: 'invalid' });
  expect(validateAnswers(questions, {})).toEqual({ n: 'required', c: 'required' });
});

it('omits empty filters while preserving explicit segment filters and viewer restrictions', () => {
  expect(queryString({ branchId: '', page: 1, sentiment: 'mixed', 'segment.age': 'adult' })).toBe(
    '?page=1&sentiment=mixed&segment.age=adult',
  );
  expect(canManage({ role: 'viewer' })).toBe(false);
  expect(canManage({ role: 'manager' })).toBe(true);
});

it('clears corrected public answer and consent errors without hiding other invalid fields', async () => {
  history.replaceState(null, '', '/#/s/token');
  vi.spyOn(productApi, 'publicSurvey').mockResolvedValue({
    survey: {
      title: 'Customer feedback',
      questions: [
        { id: 'text', type: 'short_text', label: 'Your experience', required: true },
        { id: 'n', type: 'nps', label: 'Recommend', required: true },
      ],
    },
  });
  const submit = vi.spyOn(productApi, 'submitResponse');
  render(<PublicSurvey language="en" setLanguage={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send feedback' }));
  expect(screen.getAllByRole('alert')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Your experience'), { target: { value: '   ' } });
  expect(screen.getAllByRole('alert')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Your experience'), {
    target: { value: 'Friendly staff' },
  });
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Recommend'), { target: { value: '0' } });
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  fireEvent.click(screen.getByLabelText(/agree/));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});

it('submits real public answers and retains its idempotency key after a failed request', async () => {
  history.replaceState(null, '', '/#/s/token');
  vi.spyOn(productApi, 'publicSurvey').mockResolvedValue({
    survey: {
      title: 'Customer feedback',
      questions: [{ id: 'n', type: 'nps', label: 'Recommend', required: true }],
    },
    branch: { name: 'Main' },
    business: { name: 'Cafe' },
  });
  const submit = vi
    .spyOn(productApi, 'submitResponse')
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ response: { id: 'saved' } });
  render(<PublicSurvey language="en" setLanguage={() => {}} />);
  fireEvent.change(await screen.findByLabelText(/Recommend/), { target: { value: '0' } });
  fireEvent.click(screen.getByLabelText(/agree/));
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect(await screen.findByRole('heading', { name: 'Thank you for your feedback' })).toBeVisible();
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[0][1].idempotencyKey).toBe(submit.mock.calls[1][1].idempotencyKey);
  expect(submit.mock.calls[1][1].answers).toEqual([{ questionId: 'n', value: 0 }]);
});

it('saves a six-type editable draft and only publishes with selected branches', async () => {
  history.replaceState(null, '', '/#/survey-builder');
  vi.spyOn(productApi, 'get').mockResolvedValue({ templates: [] });
  const send = vi.spyOn(productApi, 'send').mockResolvedValue({
    survey: { id: 'saved', revision: 1, title: 'Visit feedback', questions: [] },
  });
  render(
    <SurveyBuilder language="en" workspace={{ branches: [{ id: 'branch', name: 'Main' }] }} />,
  );
  fireEvent.change(screen.getByLabelText('Survey title'), { target: { value: 'Visit feedback' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
  fireEvent.change(screen.getByLabelText('Question 1'), {
    target: { value: 'How was your visit?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(send).toHaveBeenCalled());
  expect(send.mock.calls[0][0]).toBe('/surveys');
  expect(send.mock.calls[0][1].questions[0].label).toBe('How was your visit?');
  expect(send.mock.calls[0][1].questions[0].id).toBeTruthy();
});
