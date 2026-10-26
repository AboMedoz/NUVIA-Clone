import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import useOverviewInsight from '../src/features/approved-ui/product/analytics/useOverviewInsight.js';
import { productApi } from '../src/features/product/api.js';
it('retries a failed generation and clears its error when the selected cohort changes', async () => {
  let reports = [];
  vi.spyOn(productApi, 'get').mockImplementation(async () => ({ reports }));
  vi.spyOn(productApi, 'send')
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async (path, body) => {
      const report = {
        ...body,
        id: 'generated',
        status: 'succeeded',
        metrics: { totalResponses: 12 },
        content: { summary: 'Recovered insight' },
      };
      reports = [report];
      return { report };
    });
  const view = renderHook(
    ({ branch }) =>
      useOverviewInsight(
        true,
        { role: 'owner', reportingTimezone: 'UTC' },
        { branch, start: '2026-10-01', end: '2026-10-27' },
        'en',
        12,
      ),
    { initialProps: { branch: 'all' } },
  );
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => view.result.current.generate());
  expect(view.result.current.error).toBeTruthy();
  await act(async () => view.result.current.reload());
  await waitFor(() =>
    expect(view.result.current.report?.content.summary).toBe('Recovered insight'),
  );
  expect(view.result.current.error).toBeNull();
  vi.spyOn(productApi, 'send').mockRejectedValueOnce(new Error('offline'));
  await act(async () => view.result.current.generate());
  expect(view.result.current.error).toBeTruthy();
  view.rerender({ branch: 'other' });
  expect(view.result.current.error).toBeNull();
});
