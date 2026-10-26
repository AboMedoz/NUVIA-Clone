import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  FeedbackList,
  FeedbackDetail,
} from '../src/features/approved-ui/product/FeedbackScreens.jsx';
import AssistantScreen from '../src/features/approved-ui/product/preview/AssistantScreen.jsx';
import {
  ConnectedActionBoard,
  ConnectedEvidence,
} from '../src/features/approved-ui/pages/ConnectedActions.jsx';
import ConnectedReports from '../src/features/approved-ui/product/preview/ConnectedReports.jsx';

const state = vi.hoisted(() => ({
  response: { data: null, loading: false, error: null },
  paths: [],
  send: vi.fn(),
  reload: vi.fn(),
}));
vi.mock('../src/app/providers/AuthProvider.jsx', () => ({
  useAuth: () => ({
    preview: false,
    user: { name: 'Saved Owner' },
    workspace: {
      id: 'workspace',
      businessName: 'Saved Business',
      role: 'owner',
      branches: [{ id: 'branch', name: 'Saved Branch' }],
    },
  }),
}));
vi.mock('../src/features/approved-ui/product/ProductContext.jsx', () => ({
  useProductView: () => ({
    tr: (text) => text,
    language: 'en',
    formatNumber: String,
    query: '',
    setQuery: vi.fn(),
    isMobile: false,
    dashboard: { filters: { branch: 'all' } },
  }),
}));
vi.mock('../src/features/product/useResource.js', () => ({
  useResource: (path) => {
    state.paths.push(path);
    return { ...state.response, reload: state.reload };
  },
  useMutation: () => ({
    busy: false,
    error: null,
    run: async (operation) => operation(new AbortController().signal),
  }),
}));
vi.mock('../src/features/product/api.js', () => ({
  productApi: { send: (...args) => state.send(...args) },
}));
vi.mock('../src/features/approved-ui/product/WorkspaceScopeControls.jsx', () => ({
  default: () => <span>Saved scope</span>,
}));

beforeEach(() => {
  state.paths = [];
  state.response = { data: null, loading: false, error: null };
  state.send.mockReset();
});

describe('approved connected feedback and AI screens', () => {
  it('shows only saved responses and opens their UUID', () => {
    state.response.data = {
      responses: [
        {
          id: 'saved-response-uuid',
          text: 'Actual saved review',
          language: 'ar',
          createdAt: '2026-10-26T10:00:00Z',
          branchName: 'Saved Branch',
          surveyTitle: 'Saved Survey',
          analysisStatus: 'waiting_for_model',
        },
      ],
      total: 1,
    };
    render(<FeedbackList />);
    expect(screen.getByText('Actual saved review')).toBeInTheDocument();
    expect(screen.queryByText(/25 minutes/)).not.toBeInTheDocument();
    expect(screen.getByText('waiting_for_model')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    expect(location.hash).toBe('#/feedback-details?id=saved-response-uuid');
    expect(
      state.paths.some((path) => path?.startsWith('/feedback?') && path.includes('pageSize=8')),
    ).toBe(true);
  });
  it('filters declared customer segments through authorized server queries', () => {
    state.response.data = {
      responses: [],
      total: 0,
      surveys: [
        {
          title: 'Saved Survey',
          questions: [
            {
              id: 'segment-question',
              label: 'Visit type',
              type: 'single_choice',
              segment: true,
              options: ['Dine in', 'Delivery'],
            },
          ],
        },
      ],
    };
    render(<FeedbackList />);
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    expect(
      screen
        .getByRole('button', { name: 'Customer segment', exact: true })
        .parentElement.closest('button'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Customer segment', exact: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Saved Survey · Visit type', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Segment value', exact: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Delivery', exact: true }));
    expect(
      state.paths.some(
        (path) =>
          path?.startsWith('/feedback?') &&
          new URLSearchParams(path.split('?')[1]).get('segment') ===
            JSON.stringify({ 'segment-question': 'Delivery' }),
      ),
    ).toBe(true);
  });
  it('offers the real survey route when no feedback exists', () => {
    state.response.data = { responses: [], total: 0 };
    render(<FeedbackList />);
    fireEvent.click(screen.getByRole('button', { name: 'Share a survey' }));
    expect(location.hash).toBe('#/survey-all');
    expect(screen.queryByText(/nuvia.link/)).not.toBeInTheDocument();
  });
  it('preserves error state instead of falling back to sample responses', () => {
    state.response.error = new Error('NETWORK_ERROR');
    render(<FeedbackList />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load responses');
    expect(screen.queryByText(/first response starts/)).not.toBeInTheDocument();
  });
  it('loads detail using the saved UUID without sample analysis', () => {
    history.replaceState(null, '', '/#/feedback-details?id=saved-uuid');
    state.response.data = {
      response: {
        id: 'saved-uuid',
        text: 'Literal customer feedback',
        answers: [{ questionId: 'rating-question', value: 5 }],
        questions: [{ id: 'rating-question', label: 'Saved rating question' }],
        branchName: 'Saved Branch',
        surveyTitle: 'Saved Survey',
        createdAt: '2026-10-26T10:00:00Z',
        language: 'en',
        analysisStatus: 'waiting_for_model',
      },
    };
    render(<FeedbackDetail />);
    expect(state.paths).toContain('/feedback/saved-uuid');
    expect(screen.getByText('Literal customer feedback')).toBeInTheDocument();
    expect(screen.getByText('Saved rating question')).toBeInTheDocument();
    expect(screen.getByLabelText('Survey answers')).toHaveTextContent('5');
    expect(screen.getByText('No aspect scores available')).toBeInTheDocument();
    expect(screen.queryByText(/25 minutes/)).not.toBeInTheDocument();
  });
  it('asks the real assistant and links only returned literal sources', async () => {
    state.response.data = { totalResponses: 1 };
    state.send.mockResolvedValue({
      status: 'succeeded',
      answer: 'Grounded saved answer',
      evidence: [{ id: 'source-uuid', quote: 'Literal source quotation' }],
    });
    render(<AssistantScreen />);
    expect(screen.queryByText('Sara Ahmed · Just now')).not.toBeInTheDocument();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'What changed?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Grounded saved answer')).toBeInTheDocument());
    expect(state.send).toHaveBeenCalledWith(
      '/assistant/messages',
      { message: 'What changed?', locale: 'en', filters: {} },
      'POST',
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('link', { name: /View original feedback/ })).toHaveAttribute(
      'href',
      '#/feedback-details?id=source-uuid',
    );
    expect(screen.getByText('Literal source quotation')).toBeInTheDocument();
  });
  it('does not put an old assistant answer into a new conversation', async () => {
    let resolve;
    state.send.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    state.response.data = { totalResponses: 1 };
    render(<AssistantScreen />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old question' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    await act(async () =>
      resolve({ status: 'succeeded', answer: 'Stale private answer', evidence: [] }),
    );
    expect(screen.queryByText('Stale private answer')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('shows real report snapshots and builds generation requests from scope', async () => {
    state.response.data = { reports: [] };
    state.send.mockResolvedValue({ report: { id: 'new-report-uuid' } });
    render(<ConnectedReports />);
    expect(screen.getByText('No reports yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate new report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }));
    await waitFor(() => expect(location.hash).toBe('#/report-details?id=new-report-uuid'));
    expect(state.send).toHaveBeenCalledWith(
      '/reports',
      { locale: 'en', filters: {} },
      'POST',
      expect.any(AbortSignal),
    );
  });
  it('creates a persisted action from saved feedback instead of local preview storage', async () => {
    state.response.data = {
      actions: [],
      responses: [{ id: 'response-uuid', text: 'Saved action source', branchId: 'branch' }],
    };
    state.send.mockResolvedValue({ action: { id: 'saved-action' } });
    render(<ConnectedActionBoard />);
    expect(screen.queryByText('Shorten the evening queue at Cairo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create action' }));
    fireEvent.change(screen.getByLabelText('Action title'), {
      target: { value: 'Review service flow' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Saved action source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await waitFor(() =>
      expect(state.send).toHaveBeenCalledWith(
        '/actions',
        {
          title: 'Review service flow',
          summary: '',
          branchIds: ['branch'],
          responseIds: ['response-uuid'],
          priority: 'medium',
        },
        'POST',
        expect.any(AbortSignal),
      ),
    );
    expect(localStorage.getItem('nuvia-action-board-v1')).toBeNull();
  });
  it('saves action owner against its server version and keeps the supplied card controls', async () => {
    state.response.data = {
      actions: [
        {
          id: 'action-uuid',
          title: 'Saved action',
          summary: 'Actual next step',
          branchIds: ['branch'],
          responseIds: [],
          priority: 'high',
          status: 'todo',
          owner: '',
          due: '',
          version: 4,
        },
      ],
    };
    state.send.mockResolvedValue({ action: { id: 'action-uuid' } });
    render(<ConnectedActionBoard />);
    fireEvent.change(screen.getByLabelText('Owner — Saved action'), {
      target: { value: 'Saved lead' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(state.send).toHaveBeenCalledWith(
        '/actions/action-uuid',
        { owner: 'Saved lead', version: 4 },
        'PATCH',
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByRole('link', { name: /View evidence/ })).toHaveAttribute(
      'href',
      '#/evidence?action=action-uuid',
    );
  });
  it('loads only authorized saved evidence linked to the selected action', () => {
    history.replaceState(null, '', '/#/evidence?action=action-uuid');
    state.response.data = {
      action: { title: 'Saved action' },
      responses: [
        {
          id: 'response-uuid',
          text: 'Literal saved evidence',
          createdAt: '2026-10-26T00:00:00Z',
          branchName: 'Saved branch',
          language: 'en',
          analysisStatus: 'waiting_for_model',
        },
      ],
    };
    render(<ConnectedEvidence />);
    expect(state.paths).toContain('/actions/action-uuid/evidence');
    expect(screen.getByText('Literal saved evidence')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Response/ })).toHaveAttribute(
      'href',
      '#/feedback-details?id=response-uuid',
    );
  });
});
