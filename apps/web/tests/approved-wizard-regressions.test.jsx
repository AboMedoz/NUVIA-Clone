import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import ConnectedSurveyPage from '../src/features/approved-ui/surveys/ConnectedSurveyPage.jsx';
import { productApi } from '../src/features/product/api.js';
import { resetApiSession } from '../src/lib/http/client.js';

vi.mock('../src/app/providers/AuthProvider.jsx', () => ({
  useAuth: () => ({
    user: { id: 'owner' },
    workspace: {
      id: 'business',
      role: 'owner',
      businessName: 'Saved cafe',
      industry: 'Cafe',
      branches: [{ id: 'one', name: 'Main' }],
    },
  }),
}));
beforeEach(() => {
  resetApiSession();
  sessionStorage.clear();
  vi.spyOn(productApi, 'get').mockResolvedValue({
    surveys: [],
    notifications: [],
    branches: [],
    workspaces: [],
  });
});
function open(page = 'survey-create', language = 'en') {
  location.hash = '/' + page;
  return render(<ConnectedSurveyPage page={page} language={language} setLanguage={() => {}} />);
}
it.each(['en', 'ar'])('routes AI starting point to generation in %s', (language) => {
  open('survey-create', language);
  fireEvent.change(screen.getByLabelText(language === 'ar' ? 'عنوان الاستبيان' : 'Survey title'), {
    target: { value: 'Visit' },
  });
  fireEvent.click(document.querySelector('[data-node-id="262:12005"]'));
  expect(location.hash).toBe('#/survey-ai');
});
it('ignores late generation after leaving the AI step', async () => {
  let finish;
  vi.spyOn(productApi, 'send').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = open('survey-ai');
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Survey goal', exact: true, multiline: true }),
    { target: { value: 'Understand service' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generate Questions', exact: true }));
  view.rerender(<ConnectedSurveyPage page="survey-create" language="en" setLanguage={() => {}} />);
  const { act } = await import('@testing-library/react');
  await act(async () =>
    finish({
      status: 'succeeded',
      suggestions: {
        title: 'Generated',
        questions: [{ type: 'rating', label: 'Service?', required: true }],
      },
    }),
  );
  expect(location.hash).toBe('#/survey-ai');
  expect(screen.getByLabelText('Survey title')).toBeInTheDocument();
});
it('takes successful AI questions to review without applying a customer template', async () => {
  vi.spyOn(productApi, 'send').mockResolvedValue({
    status: 'succeeded',
    suggestions: {
      title: 'Generated service survey',
      questions: [{ type: 'rating', label: 'Service?', required: true }],
    },
  });
  open('survey-ai');
  fireEvent.change(screen.getByRole('textbox', { name: 'Survey goal', exact: true }), {
    target: { value: 'Understand service' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate Questions', exact: true }));
  const { waitFor } = await import('@testing-library/react');
  await waitFor(() => expect(location.hash).toBe('#/survey-ai-review'));
  expect(
    JSON.parse(sessionStorage.getItem('nuvia-draft:owner:business')).generatedQuestions.questions[0]
      .label,
  ).toBe('Service?');
});
it('requires a name before selecting a starting point and clears the error on correction', () => {
  open();
  fireEvent.click(document.querySelector('[data-node-id="259:4759"]'));
  expect(location.hash).toBe('#/survey-create');
  expect(screen.getByText('Add a survey name.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Survey title'), { target: { value: 'Visit' } });
  expect(screen.queryByText('Add a survey name.')).not.toBeInTheDocument();
});
it('shows selected saved branches rather than three sample branches', () => {
  open();
  expect(document.querySelector('[data-node-id="259:4715"]')).toHaveTextContent('1');
  expect(screen.queryByText('All 3 branches selected')).not.toBeInTheDocument();
});
it('renders real unread feedback counts and removes the bell dot once everything is read', async () => {
  const get = vi
    .spyOn(productApi, 'get')
    .mockImplementation(async (path) =>
      path === '/account/notifications'
        ? { unreadCount: 3, feedbackUnreadCount: 2 }
        : { surveys: [], branches: [], workspaces: [] },
    );
  const view = open();
  expect(await screen.findByText('2', { selector: '[data-name="Unread count"] p' })).toBeVisible();
  expect(document.querySelector('[data-name="Unread notification indicator"]')).toBeInTheDocument();
  view.unmount();
  const { resetApiSession } = await import('../src/lib/http/client.js');
  resetApiSession();
  get.mockResolvedValue({
    unreadCount: 0,
    feedbackUnreadCount: 0,
    surveys: [],
    branches: [],
    workspaces: [],
  });
  open();
  expect(
    document.querySelector('[data-name="Unread notification indicator"]'),
  ).not.toBeInTheDocument();
});
it('keeps focus through continuous typing and supports deleting and readding the last question', async () => {
  open('survey-questions');
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'Question text', exact: true });
  await user.type(input, 'A complete question');
  expect(screen.getByRole('textbox', { name: 'Question text', exact: true })).toHaveValue(
    'A complete question',
  );
  expect(input).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Delete question' }));
  expect(
    screen.queryByRole('textbox', { name: 'Question text', exact: true }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add question', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Question text', exact: true })).toHaveValue('');
});
