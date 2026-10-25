import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import App from '../src/app/App.jsx';
import AppRouter from '../src/app/router/AppRouter.jsx';
import { AuthProvider, useAuth } from '../src/app/providers/AuthProvider.jsx';
import { authApi } from '../src/features/auth/api.js';
import { productApi } from '../src/features/product/api.js';
import { TrendChart } from '../src/features/analytics/ChartVisuals.jsx';
import BusinessPageSettings from '../src/features/workspaces/BusinessPageSettings.jsx';
import AssistantPage from '../src/features/ai-analysis/AssistantPage.jsx';
import SurveyBuilder from '../src/features/surveys/SurveyBuilder.jsx';
import ReportsPage from '../src/features/reports/ReportsPage.jsx';
import { renderHook } from '@testing-library/react';
import { useResource } from '../src/features/product/useResource.js';
import AiTaskState from '../src/features/product/AiTaskState.jsx';
import { routePolicy } from '../src/app/router/access-policy.js';
const session = (id = 'workspace') => ({
  user: { id: 'owner', name: 'Owner', emailVerified: true },
  workspace: { id, businessName: 'Cafe', role: 'owner', onboardingStep: 'complete', branches: [] },
});
function RefreshSession() {
  const auth = useAuth();
  return <button onClick={() => auth.refresh()}>Refresh test session</button>;
}

it('hands committed header searches across the protected route remount and clears the URL query', async () => {
  history.replaceState(null, '', '/#/reports');
  vi.spyOn(authApi, 'session').mockResolvedValue(session());
  vi.spyOn(productApi, 'get').mockImplementation((path) => {
    if (path === '/reports') return Promise.resolve({ reports: [] });
    if (path === '/surveys') return Promise.resolve({ surveys: [] });
    if (path.startsWith('/feedback')) {
      const filtered = new URLSearchParams(path.split('?')[1]).get('search') === 'match';
      return Promise.resolve({
        total: 1,
        responses: [
          {
            id: 'saved',
            text: filtered ? 'Matched saved feedback' : 'All saved feedback',
            createdAt: '2026-10-01',
            analysisStatus: 'waiting_for_model',
          },
        ],
      });
    }
    return Promise.resolve({ jobs: [] });
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'AI Reports' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Search feedback…' }), {
    target: { value: 'match' },
  });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search feedback…' }), { key: 'Enter' });
  expect(await screen.findByRole('link', { name: 'Matched saved feedback' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Search feedback…' })).toHaveValue('match');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(await screen.findByRole('link', { name: 'All saved feedback' })).toBeVisible();
  expect(new URLSearchParams(location.hash.split('?')[1]).has('search')).toBe(false);
});

it('retains a saved wizard draft and later edits across a language change after replacing its URL', async () => {
  history.replaceState(null, '', '/#/survey-builder');
  vi.spyOn(authApi, 'session').mockResolvedValue(session());
  let persisted;
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(path === '/survey-templates' ? { templates: [] } : { survey: persisted }),
  );
  vi.spyOn(productApi, 'send').mockImplementation((_path, body) => {
    persisted = { ...body, id: 'saved-survey', revision: 1, status: 'draft', links: [] };
    return Promise.resolve({ survey: persisted });
  });
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Survey title'), {
    target: { value: 'Saved title' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
  fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Saved question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to sharing' }));
  await screen.findByRole('heading', { name: 'Share survey' });
  fireEvent.click(screen.getByRole('button', { name: /Build questions/ }));
  fireEvent.change(screen.getByLabelText('Question 1'), {
    target: { value: 'Unsaved edit after saving' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Language / اللغة' }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /العربية/ }));
  expect(await screen.findByLabelText('السؤال 1')).toHaveValue('Unsaved edit after saving');
});

it.each([
  ['survey-builder', 'Survey title', 'عنوان الاستبيان'],
  ['settings', 'Description', 'الوصف'],
  ['assistant', 'Your question', 'سؤالك'],
])('preserves unsaved %s text when the UI language changes', async (route, english, arabic) => {
  history.replaceState(null, '', '/#/' + route);
  vi.spyOn(authApi, 'session').mockResolvedValue(session());
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path === '/business-page'
        ? { slug: 'cafe', enabled: false, description: '', logoUrl: '', contactUrl: '' }
        : path === '/survey-templates'
          ? { templates: [] }
          : { surveys: [], capabilities: {} },
    ),
  );
  render(<App />);
  const field = await screen.findByLabelText(english);
  await waitFor(() => expect(field).toBeEnabled());
  fireEvent.change(field, { target: { value: 'Unsaved customer question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Language / اللغة' }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /العربية/ }));
  expect(await screen.findByLabelText(arabic)).toHaveValue('Unsaved customer question');
});

it('clears workspace drafts when the authenticated workspace changes without a route change', async () => {
  history.replaceState(null, '', '/#/survey-builder');
  vi.spyOn(authApi, 'session')
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(session('other-workspace'));
  vi.spyOn(productApi, 'get').mockResolvedValue({ templates: [] });
  render(
    <AuthProvider>
      <AppRouter />
      <RefreshSession />
    </AuthProvider>,
  );
  fireEvent.change(await screen.findByLabelText('Survey title'), {
    target: { value: 'Private workspace draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh test session' }));
  await waitFor(() => expect(screen.getByLabelText('Survey title')).toHaveValue(''));
});

it.each([
  ['day', ['2026-10-01', '2026-10-03', '2026-10-04']],
  ['week', ['2026-10-05', '2026-10-19', '2026-10-26']],
  ['month', ['2026-01', '2026-03', '2026-04']],
])('breaks chart lines across an omitted %s period', (interval, dates) => {
  const { container } = render(
    <TrendChart
      interval={interval}
      language="en"
      rows={dates.map((date) => ({ date, aspectScores: [{ aspect: 'service', score: 6 }] }))}
    />,
  );
  const path = container.querySelector('[data-aspect="service"]').getAttribute('d');
  expect(path.match(/M/g)).toHaveLength(2);
  expect(path.match(/L/g)).toHaveLength(1);
  const x = [...container.querySelectorAll('circle')].map((circle) =>
    Number(circle.getAttribute('cx')),
  );
  expect((x[1] - x[0]) / (x[2] - x[1])).toBeCloseTo(2);
});
it('connects adjacent calendar months across varying lengths and year boundaries', () => {
  const { container } = render(
    <TrendChart
      interval="month"
      rows={['2025-12', '2026-01', '2026-02', '2026-03'].map((date) => ({
        date,
        aspectScores: [{ aspect: 'service', score: 6 }],
      }))}
    />,
  );
  expect(
    container.querySelector('[data-aspect="service"]').getAttribute('d').match(/M/g),
  ).toHaveLength(1);
});

it('returns to page one when feedback search changes after paging', async () => {
  history.replaceState(null, '', '/#/feedbacks');
  vi.spyOn(authApi, 'session').mockResolvedValue(session());
  vi.spyOn(productApi, 'get').mockImplementation((path) => {
    if (!path.startsWith('/feedback')) return Promise.resolve({ surveys: [] });
    const params = new URLSearchParams(path.split('?')[1]);
    const page = Number(params.get('page') || 1),
      search = params.get('search');
    const text = search
      ? 'Matching response'
      : page === 2
        ? 'Second page response'
        : 'First page response';
    return Promise.resolve({
      total: search ? 1 : 40,
      responses:
        search && page > 1
          ? []
          : [
              {
                id: 'response',
                text,
                createdAt: '2026-10-01',
                analysisStatus: 'waiting_for_model',
              },
            ],
    });
  });
  render(<App />);
  await screen.findByRole('link', { name: 'First page response' });
  fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
  await screen.findByRole('link', { name: 'Second page response' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Search feedback…' }), {
    target: { value: 'match' },
  });
  expect(await screen.findByRole('link', { name: 'Matching response' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await act(async () => {});
});

it('disables business-page edits until saved branding is loaded', async () => {
  let resolve;
  vi.spyOn(productApi, 'get').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<BusinessPageSettings language="en" workspace={session().workspace} />);
  expect(screen.getByLabelText('Page address')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save page settings' })).toBeDisabled();
  await act(async () =>
    resolve({
      enabled: true,
      slug: 'existing-cafe',
      description: 'Saved description',
      logoUrl: 'https://example.test/logo.png',
      contactUrl: 'https://example.test/contact',
    }),
  );
  await waitFor(() => expect(screen.getByLabelText('Page address')).toBeEnabled());
  expect(screen.getByLabelText('Page address')).toHaveValue('existing-cafe');
  expect(screen.getByLabelText('Enable public page')).toBeChecked();
});
it('prevents replacement writes after an initial business-page load failure', async () => {
  vi.spyOn(productApi, 'get').mockRejectedValue(new Error('offline'));
  render(<BusinessPageSettings language="en" workspace={session().workspace} />);
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Page address')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save page settings' })).toBeDisabled();
});

it.each(['en', 'ar'])(
  'distinguishes a failed assistant envelope and retries the original question in %s',
  async (language) => {
    vi.spyOn(productApi, 'get').mockResolvedValue({ surveys: [], capabilities: {} });
    vi.spyOn(productApi, 'send')
      .mockResolvedValueOnce({ status: 'failed', answer: null, evidence: [] })
      .mockResolvedValueOnce({ status: 'succeeded', answer: 'Validated answer', evidence: [] });
    render(<AssistantPage language={language} workspace={session().workspace} />);
    fireEvent.change(screen.getByLabelText(language === 'ar' ? 'سؤالك' : 'Your question'), {
      target: { value: 'What needs attention?' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: language === 'ar' ? 'اسأل المساعد' : 'Ask assistant' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      language === 'ar' ? 'فشل' : 'failed',
    );
    fireEvent.click(
      screen.getByRole('button', { name: language === 'ar' ? 'إعادة المحاولة' : 'Retry request' }),
    );
    expect(await screen.findByText('Validated answer')).toBeVisible();
  },
);
it('distinguishes failed survey suggestions from a missing model', async () => {
  vi.spyOn(productApi, 'get').mockResolvedValue({ templates: [] });
  vi.spyOn(productApi, 'send').mockResolvedValue({ status: 'failed', suggestions: null });
  render(<SurveyBuilder language="en" workspace={session().workspace} />);
  fireEvent.change(screen.getByLabelText('What would you like to learn?'), {
    target: { value: 'Service quality' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest questions' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('failed');
  expect(
    screen.queryByText('Waiting for a compatible survey generation model.'),
  ).not.toBeInTheDocument();
});
it('offers report retry for failed generation without labeling it as an unavailable model', async () => {
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path === '/reports'
        ? { reports: [{ id: 'report', status: 'failed', createdAt: '2026-10-01' }] }
        : path === '/reports/report'
          ? { report: { id: 'report', status: 'failed', evidence: [], content: null } }
          : { surveys: [] },
    ),
  );
  render(<ReportsPage language="en" workspace={session().workspace} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open report' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('failed');
  expect(screen.getByRole('button', { name: 'Retry request' })).toBeEnabled();
});
it.each([
  ['model_unavailable', 'A compatible model is not available yet.'],
  ['insufficient_evidence', 'There is not enough saved evidence for this request.'],
  ['busy', 'The model service is busy. Please retry shortly.'],
  ['queued', 'This request is queued or processing. Refresh to see its latest status.'],
])('labels the %s envelope truthfully', (status, message) => {
  render(<AiTaskState status={status} language="en" />);
  expect(screen.getByRole('status')).toHaveTextContent(message);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('refreshes asynchronous resources gently while visible and stops on hiding/unmount', async () => {
  vi.useFakeTimers();
  const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  let value = 0;
  const get = vi
    .spyOn(productApi, 'get')
    .mockImplementation(() => Promise.resolve({ value: ++value }));
  try {
    const { result, unmount } = renderHook(() =>
      useResource('/analysis/jobs', { refreshInterval: 30000 }),
    );
    await act(async () => {});
    expect(result.current.data).toEqual({ value: 1 });
    await act(async () => vi.advanceTimersByTime(30000));
    expect(result.current.data).toEqual({ value: 2 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => vi.advanceTimersByTime(60000));
    expect(result.current.data).toEqual({ value: 2 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => vi.advanceTimersByTime(30000));
    expect(result.current.data).toEqual({ value: 3 });
    unmount();
    await act(async () => vi.advanceTimersByTime(60000));
    expect(get).toHaveBeenCalledTimes(3);
  } finally {
    if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
    else delete document.visibilityState;
    vi.useRealTimers();
  }
});
it('continues a fresh invitation through signup, verification and login without browser token storage', async () => {
  const inviteToken = 'private-invitation-token';
  let pending = false,
    user = null,
    workspace = null;
  vi.spyOn(authApi, 'session').mockImplementation(() =>
    Promise.resolve({ user, workspace, pendingInvitation: pending }),
  );
  vi.spyOn(authApi, 'register').mockResolvedValue({});
  vi.spyOn(authApi, 'verify').mockResolvedValue({});
  vi.spyOn(authApi, 'login').mockImplementation(() => {
    user = { id: 'invitee', name: 'Invitee', emailVerified: true };
    return Promise.resolve({});
  });
  vi.spyOn(productApi, 'get').mockResolvedValue({
    surveys: [],
    jobs: [],
    totalResponses: 0,
    analyzedResponses: 0,
    pendingResponses: 0,
  });
  const send = vi.spyOn(productApi, 'send').mockImplementation((path, body) => {
    if (path === '/auth/invitation-continuation') {
      pending = true;
      return Promise.resolve({ pendingInvitation: true });
    }
    if (path === '/team/accept') {
      expect(body).toEqual({});
      pending = false;
      workspace = session().workspace;
      return Promise.resolve({ status: 'accepted' });
    }
    return Promise.resolve({});
  });
  history.replaceState(null, '', '/#/team/accept?token=' + inviteToken);
  render(<App />);
  const navigate = async (hash) => {
    await act(async () => {
      location.hash = hash;
    });
  };
  const signIn = await screen.findByRole('link', { name: 'Sign in to accept' });
  await waitFor(() => expect(location.hash).not.toContain(inviteToken));
  await navigate(signIn.getAttribute('href'));
  await screen.findByRole('button', { name: 'Log in', exact: true });
  await navigate(
    screen.getByRole('link', { name: 'Create an account', exact: true }).getAttribute('href'),
  );
  fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Invitee' } });
  fireEvent.change(screen.getByLabelText('Work email'), {
    target: { value: 'invitee@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'Synthetic123' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'Synthetic123' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }));
  await screen.findByRole('heading', { name: 'Verify your email' });
  await navigate('#/verify-email?token=verification-token');
  await screen.findByText('Email verified. You can log in now.');
  await navigate(screen.getByRole('link', { name: 'Back to log in' }).getAttribute('href'));
  fireEvent.change(await screen.findByLabelText('Work email'), {
    target: { value: 'invitee@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'Synthetic123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Log in', exact: true }));
  await screen.findByRole('button', { name: 'Accept invitation', exact: true });
  expect(location.hash).toMatch(/^#\/team(?:\/|-)accept$/);
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation', exact: true }));
  await screen.findByRole('heading', { name: 'Overview', exact: true });
  expect(send).toHaveBeenCalledWith('/team/accept', {}, 'POST', expect.any(AbortSignal));
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(inviteToken);
});
it('routes a pending invite before business onboarding after a session refresh', () => {
  expect(
    routePolicy({
      route: 'business-information',
      user: { emailVerified: true },
      workspace: null,
      pendingInvitation: true,
    }).redirect,
  ).toBe('team-accept');
});
it('resumes a saved invitation after a new-tab login and allows explicit cancellation', async () => {
  let user = null,
    pending = true;
  vi.spyOn(authApi, 'session').mockImplementation(() =>
    Promise.resolve({ user, workspace: null, pendingInvitation: pending }),
  );
  vi.spyOn(authApi, 'login').mockImplementation(() => {
    user = { id: 'invitee', emailVerified: true };
    return Promise.resolve({});
  });
  vi.spyOn(productApi, 'send').mockImplementation((path, body, method) => {
    if (path === '/auth/invitation-continuation' && method === 'DELETE') pending = false;
    return Promise.resolve({});
  });
  history.replaceState(null, '', '/#/login');
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Work email'), {
    target: { value: 'invitee@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'Synthetic123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Log in', exact: true }));
  await screen.findByRole('button', { name: 'Accept invitation' });
  expect(screen.queryByRole('heading', { name: 'Business information' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Decline invitation' }));
  await screen.findByRole('button', { name: 'Log in', exact: true });
  expect(pending).toBe(false);
});
