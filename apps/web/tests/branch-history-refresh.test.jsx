import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../src/app/App.jsx';
import { authApi } from '../src/features/auth/api.js';
import { productApi } from '../src/features/product/api.js';
import { invalidateResources } from '../src/lib/http/resource-cache.js';

it('updates the read-only history status after the same branch is archived', async () => {
  let branch = { id: 'branch', name: 'Saved branch', archivedAt: null };
  const workspace = {
    id: 'workspace',
    businessName: 'Saved business',
    industry: 'Cafe',
    role: 'owner',
    onboardingStep: 'complete',
    branches: [branch],
  };
  vi.spyOn(authApi, 'session').mockResolvedValue({
    user: { id: 'owner', emailVerified: true },
    workspace,
  });
  vi.spyOn(productApi, 'get').mockImplementation(async (path) =>
    path.includes('/branches')
      ? [branch]
      : path === '/workspaces'
        ? { workspaces: [workspace] }
        : { surveys: [], totalResponses: 0, notifications: [] },
  );
  history.replaceState(null, '', '/#/branch-history?id=branch');
  render(<App />);
  await screen.findByRole('heading', { name: 'Saved branch', exact: true });
  expect(
    screen.queryByRole('button', { name: 'Restore branch', exact: true }),
  ).not.toBeInTheDocument();
  branch = { ...branch, archivedAt: '2026-10-27T00:00:00Z' };
  await act(async () => invalidateResources());
  expect(await screen.findByRole('button', { name: 'Restore branch', exact: true })).toBeVisible();
});
