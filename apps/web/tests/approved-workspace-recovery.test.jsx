import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/app/App.jsx';
import { authApi } from '../src/features/auth/api.js';
import { productApi } from '../src/features/product/api.js';

it('offers only authorized existing businesses after the selected membership is revoked', async () => {
  let workspace = null;
  vi.spyOn(authApi, 'session').mockImplementation(() =>
    Promise.resolve({
      user: { id: 'saved-member', name: 'Saved member', emailVerified: true },
      workspace,
    }),
  );
  vi.spyOn(productApi, 'get').mockImplementation((path) =>
    Promise.resolve(
      path === '/workspaces'
        ? {
            workspaces: [
              {
                id: 'remaining-workspace',
                businessName: 'Remaining authorized business',
                role: 'viewer',
              },
            ],
          }
        : {
            totalResponses: 0,
            analyzedResponses: 0,
            sentimentDistribution: {},
            aspectScores: [],
            comparisons: [],
            trends: [],
            capabilities: {},
          },
    ),
  );
  const send = vi.spyOn(productApi, 'send').mockImplementation((path) => {
    expect(path).toBe('/workspaces/remaining-workspace/select');
    workspace = {
      id: 'remaining-workspace',
      businessName: 'Remaining authorized business',
      industry: 'Cafe',
      role: 'viewer',
      branches: [],
      onboardingStep: 'complete',
    };
    return Promise.resolve({ workspace });
  });
  history.replaceState(null, '', '/#/business-information');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Choose a business' })).toBeVisible();
  expect(screen.queryByLabelText('Business name *')).not.toBeInTheDocument();
  expect(screen.queryByText('Revoked private business')).not.toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open business: Remaining authorized business' }),
  );
  expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible();
  expect(send).toHaveBeenCalledWith(
    '/workspaces/remaining-workspace/select',
    {},
    'POST',
    expect.any(AbortSignal),
  );
  expect(location.hash).toBe('#/dashboard');
});

it('does not offer a replacement-business save while existing access cannot be loaded', async () => {
  vi.spyOn(authApi, 'session').mockResolvedValue({
    user: { id: 'saved-member', emailVerified: true },
    workspace: null,
  });
  vi.spyOn(productApi, 'get').mockRejectedValue(new Error('offline'));
  const send = vi.spyOn(productApi, 'send');
  history.replaceState(null, '', '/#/business-information');
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load businesses');
  expect(screen.queryByLabelText('Business name *')).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});
