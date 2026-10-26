import React, { useContext, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GlobalSearch from '../src/features/approved-ui/product/GlobalSearch.jsx';
const state = vi.hoisted(() => ({ context: null, get: vi.fn() }));
state.context = React.createContext(null);
vi.mock('../src/features/approved-ui/product/ProductContext.jsx', () => ({
  useProductView: () => useContext(state.context),
}));
vi.mock('../src/features/product/api.js', () => ({
  productApi: { get: (...args) => state.get(...args) },
}));
function Harness() {
  const [query, setQuery] = useState(''),
    [workspace, setWorkspace] = useState('workspace-a');
  return (
    <state.context.Provider
      value={{
        connected: true,
        workspaceQuery: query,
        setWorkspaceQuery: setQuery,
        language: 'en',
        workspace: { id: workspace, role: 'owner' },
      }}
    >
      <div data-name="Search">
        <input
          data-workspace-search
          aria-label="Search workspace"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <button onClick={() => setWorkspace('workspace-b')}>Switch workspace</button>
      <GlobalSearch />
    </state.context.Provider>
  );
}
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
const resolve = async (callback, value) =>
  act(async () => {
    callback(value);
    await Promise.resolve();
  });
beforeEach(() => {
  state.get.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
describe('connected workspace search', () => {
  it('debounces saved results and opens their real ID without sample records', async () => {
    state.get.mockResolvedValue({
      results: [
        {
          id: 'saved-uuid',
          title: 'Saved customer comment',
          section: 'Feedbacks',
          description: 'Saved Branch',
          path: '#/feedback-details?id=saved-uuid',
        },
      ],
    });
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Cairo' } });
    expect(state.get).not.toHaveBeenCalled();
    await tick();
    expect(state.get.mock.calls[0][0]).toBe('/search?q=Cairo');
    expect(screen.getByText('Saved customer comment')).toBeVisible();
    expect(screen.queryByText(/coffee was good.*25 minutes/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Saved customer comment/ }));
    expect(location.hash).toBe('#/feedback-details?id=saved-uuid');
  });
  it('aborts superseded requests and ignores late responses after clearing or switching scope', async () => {
    let oldResolve, newResolve;
    state.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldResolve = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            newResolve = resolve;
          }),
      )
      .mockResolvedValue({ results: [] });
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'alpha' } });
    await tick();
    const oldSignal = state.get.mock.calls[0][1];
    fireEvent.change(input, { target: { value: 'beta' } });
    expect(oldSignal.aborted).toBe(true);
    await tick();
    await resolve(newResolve, {
      results: [
        {
          id: 'b',
          title: 'Current saved result',
          section: 'Reports',
          path: '#/report-details?id=b',
        },
      ],
    });
    await resolve(oldResolve, {
      results: [
        { id: 'a', title: 'Stale saved result', section: 'Reports', path: '#/report-details?id=a' },
      ],
    });
    expect(screen.getByText('Current saved result')).toBeVisible();
    expect(screen.queryByText('Stale saved result')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }));
    expect(screen.queryByText('Current saved result')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '' } });
    await tick();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('does not issue remote searches during text composition and Enter falls back to saved feedback search', async () => {
    state.get.mockResolvedValue({ results: [] });
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'unique-query' } });
    await tick();
    expect(state.get).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await tick();
    expect(state.get).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(location.hash).toBe('#/feedbacks?search=unique-query');
  });
});
