import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import SurveyBuilder from '../src/features/surveys/SurveyBuilder.jsx';
import SurveysPage from '../src/features/surveys/SurveysPage.jsx';
import { productApi } from '../src/features/product/api.js';

const workspace = { role: 'owner', branches: [{ id: 'main', name: 'Main' }] };
function open() {
  history.replaceState(null, '', '/#/survey-builder');
  vi.spyOn(productApi, 'get').mockResolvedValue({ templates: [] });
  render(<SurveyBuilder language="en" workspace={workspace} />);
}
function questions() {
  fireEvent.change(screen.getByLabelText('Survey title'), { target: { value: 'Visit feedback' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
  fireEvent.change(screen.getByLabelText('Question 1'), {
    target: { value: 'How was your visit?' },
  });
}
it('validates details and retains the current draft across real steps without writing', () => {
  const send = vi.spyOn(productApi, 'send');
  open();
  expect(screen.queryByLabelText('Question 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a survey title.');
  expect(screen.getByLabelText('Survey title')).toHaveFocus();
  questions();
  fireEvent.click(screen.getByRole('button', { name: 'Back to details' }));
  expect(screen.getByLabelText('Survey title')).toHaveValue('Visit feedback');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
  expect(screen.getByLabelText('Question 1')).toHaveValue('How was your visit?');
  expect(send).not.toHaveBeenCalled();
});
it('previews unsaved questions on mobile without creating a response or survey', () => {
  const send = vi.spyOn(productApi, 'send');
  open();
  questions();
  fireEvent.click(screen.getByRole('button', { name: 'Preview on mobile' }));
  const preview = screen.getByRole('region', { name: 'Mobile preview' });
  expect(within(preview).getByText('Visit feedback')).toBeVisible();
  expect(within(preview).getByLabelText('How was your visit?')).toBeDisabled();
  expect(within(preview).queryByRole('button', { name: 'Send feedback' })).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(within(preview).getByRole('button', { name: 'Close preview' }));
  expect(screen.queryByRole('region', { name: 'Mobile preview' })).not.toBeInTheDocument();
});
it('saves each edited revision before sharing and only publishes on the explicit action', async () => {
  const send = vi.spyOn(productApi, 'send').mockImplementation(async (path, body) => ({
    survey: {
      ...body,
      id: 'saved',
      revision: body.revision ? body.revision + 1 : 1,
      status: path.endsWith('/publish') ? 'published' : 'draft',
      links: [],
    },
  }));
  open();
  questions();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to sharing' }));
  await screen.findByRole('heading', { name: 'Share survey' });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBe('/surveys');
  fireEvent.click(screen.getByRole('button', { name: 'Back to questions' }));
  fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Updated question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to sharing' }));
  await screen.findByRole('heading', { name: 'Share survey' });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toBe('/surveys/saved');
  expect(send.mock.calls[1][1].revision).toBe(1);
  expect(send.mock.calls[1][1].questions[0].label).toBe('Updated question');
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: 'Main' }));
  await user.click(screen.getByRole('button', { name: 'Publish survey' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  expect(send.mock.calls[2][0]).toBe('/surveys/saved/publish');
  expect(send.mock.calls[2][1]).toEqual({ branchIds: ['main'] });
});
it('keeps invalid choice questions in the editing step and does not save a partial draft', () => {
  const send = vi.spyOn(productApi, 'send');
  open();
  questions();
  fireEvent.change(screen.getByLabelText('Answer type'), { target: { value: 'single_choice' } });
  fireEvent.change(screen.getByLabelText('Options (one per line)'), {
    target: { value: 'Only one option' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to sharing' }));
  expect(screen.getByRole('alert')).toHaveTextContent('unique choice options');
  expect(screen.getByLabelText('Options (one per line)')).toHaveFocus();
  expect(send).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Publish survey' })).not.toBeInTheDocument();
});

it('selects one question editor and preserves its identity and answer type while reordering', () => {
  open();
  questions();
  fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
  fireEvent.change(screen.getByLabelText('Question 2'), { target: { value: 'Second question' } });
  fireEvent.change(screen.getByLabelText('Answer type'), { target: { value: 'rating' } });
  const id = screen.getByLabelText('Question 2').id;
  expect(screen.getByLabelText('Question 1')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit question 1' }));
  expect(screen.getByLabelText('Question 1')).toBeVisible();
  expect(screen.getByLabelText('Answer type')).toHaveValue('long_text');
  fireEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));
  const card = screen.getByRole('button', { name: 'Edit question 2' }).closest('section');
  fireEvent.click(within(card).getByRole('button', { name: 'Move up' }));
  expect(screen.getByLabelText('Question 1')).toHaveValue('Second question');
  expect(screen.getByLabelText('Question 1')).toHaveAttribute('id', id);
  expect(screen.getByLabelText('Answer type')).toHaveValue('rating');
});

it('retains the actual collection-close confirmation while its refreshed survey list is loading', async () => {
  history.replaceState(null, '', '/#/surveys?selected=saved');
  const published = {
    id: 'saved',
    title: 'Visit feedback',
    status: 'published',
    locale: 'en',
    questions: [],
    links: [],
  };
  const closed = { ...published, status: 'closed' };
  const other = { ...published, id: 'other', title: 'Other survey' };
  let finishReload;
  vi.spyOn(productApi, 'get')
    .mockResolvedValueOnce({ surveys: [published, other] })
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReload = resolve;
        }),
    );
  vi.spyOn(productApi, 'send').mockResolvedValue({ survey: closed });
  render(<SurveysPage language="en" workspace={workspace} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Close collection' }));
  const message = 'Collection closed. Existing responses are preserved.';
  expect(await screen.findByText(message)).toBeVisible();
  await waitFor(() => expect(finishReload).toBeTypeOf('function'));
  await act(async () => finishReload({ surveys: [closed, other] }));
  expect(screen.getByText(message)).toBeVisible();
  expect(screen.getAllByText('Closed').length).toBeGreaterThan(0);
  fireEvent.click(
    within(screen.getByRole('row', { name: /Other survey/ })).getByRole('button', {
      name: 'Share & manage',
    }),
  );
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

it('generates in the chosen survey locale and discards a result after that locale changes', async () => {
  let complete;
  const send = vi.spyOn(productApi, 'send').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  open();
  fireEvent.change(screen.getByLabelText('Survey language'), { target: { value: 'ar' } });
  fireEvent.change(screen.getByLabelText('What would you like to learn?'), {
    target: { value: 'Service quality' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest questions' }));
  expect(send.mock.calls[0][1].locale).toBe('ar');
  fireEvent.change(screen.getByLabelText('Survey language'), { target: { value: 'en' } });
  fireEvent.change(screen.getByLabelText('Survey language'), { target: { value: 'ar' } });
  await act(async () =>
    complete({
      suggestions: {
        title: 'استبيان الخدمة',
        questions: [
          { id: 'question', type: 'long_text', label: 'كيف كانت الخدمة؟', required: true },
        ],
      },
    }),
  );
  expect(screen.queryByRole('button', { name: 'Use these suggestions' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Survey language')).toHaveValue('ar');
});
