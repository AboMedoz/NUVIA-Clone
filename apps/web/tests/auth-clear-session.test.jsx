import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/app/providers/AuthProvider.jsx';
import { authApi } from '../src/features/auth/api.js';

it('cannot restore a revoked identity from an already pending refresh after clearing the session', async () => {
  let finish;
  const identity = {
    user: { id: 'revoked-owner' },
    workspace: { id: 'private-workspace' },
    pendingInvitation: true,
  };
  vi.spyOn(authApi, 'session')
    .mockResolvedValueOnce(identity)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const logout = vi.spyOn(authApi, 'logout');
  const { result } = renderHook(useAuth, {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });
  await waitFor(() => expect(result.current.user?.id).toBe('revoked-owner'));
  let pending;
  act(() => {
    pending = result.current.refresh();
  });
  act(() => result.current.clearSession());
  expect(result.current.user).toBeNull();
  expect(result.current.workspace).toBeNull();
  expect(result.current.pendingInvitation).toBe(false);
  expect(location.hash).toBe('#/login');
  await act(async () => {
    finish(identity);
    await pending;
  });
  expect(result.current.user).toBeNull();
  expect(result.current.workspace).toBeNull();
  expect(result.current.pendingInvitation).toBe(false);
  expect(logout).not.toHaveBeenCalled();
});
