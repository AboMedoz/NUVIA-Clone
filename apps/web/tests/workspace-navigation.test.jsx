import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { ProductProvider } from '../src/app/providers/ProductProvider.jsx';
import WorkspaceShell from '../src/components/layout/WorkspaceShell.jsx';

it('omits an unsupported unread badge in real accounts while retaining the explicit design preview', () => {
  const workspace = { role: 'owner', businessName: 'Saved cafe', industry: 'Cafe', branches: [] };
  const view = (preview) => (
    <ProductProvider language="en" setLanguage={vi.fn()} workspace={workspace} preview={preview}>
      <WorkspaceShell />
    </ProductProvider>
  );
  const { rerender } = render(view(false));
  expect(screen.getByRole('button', { name: /^Feedback/ })).toHaveTextContent(/^Feedback$/);
  rerender(view(true));
  expect(screen.getByRole('button', { name: /^Feedback/ })).toHaveTextContent(/12/);
});

it('opens actual feedback search from the header and supports focus, clear and IME-safe shortcuts', () => {
  history.replaceState(null, '', '/#/dashboard');
  render(
    <ProductProvider
      language="en"
      setLanguage={vi.fn()}
      workspace={{ role: 'owner', branches: [] }}
    >
      <WorkspaceShell />
    </ProductProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Search feedback…' });
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'delayed coffee' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(location.hash).toBe('#/dashboard');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(location.hash.split('?')[0]).toBe('#/feedbacks');
  expect(new URLSearchParams(location.hash.split('?')[1]).get('search')).toBe('delayed coffee');
  expect(input).toHaveValue('delayed coffee');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
});
