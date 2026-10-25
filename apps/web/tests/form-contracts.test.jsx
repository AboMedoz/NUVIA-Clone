import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeamPage from '../src/features/team/TeamPage.jsx';
import BusinessPageSettings from '../src/features/workspaces/BusinessPageSettings.jsx';
import VerificationPage from '../src/features/auth/VerificationPage.jsx';
import { productApi } from '../src/features/product/api.js';
import { authApi } from '../src/features/auth/api.js';
import AutoGrowTextarea from '../src/components/ui/AutoGrowTextarea.jsx';

const workspace = { role: 'owner', branches: [{ id: 'cairo', name: 'Cairo' }] };
afterEach(() => vi.restoreAllMocks());

it('keeps long controlled text readable while preserving the textarea ref and input behavior', () => {
  const measured = vi
    .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(function () {
      return this.value.length > 100 ? 240 : 60;
    });
  const ref = React.createRef();
  const onInput = vi.fn();
  const { rerender } = render(
    <AutoGrowTextarea
      ref={ref}
      aria-label="Draft"
      value="Short"
      onChange={() => {}}
      onInput={onInput}
      style={{ boxSizing: 'border-box', border: '1px solid' }}
    />,
  );
  expect(ref.current).toBe(screen.getByLabelText('Draft'));
  expect(ref.current.style.resize).toBe('none');
  rerender(
    <AutoGrowTextarea
      ref={ref}
      aria-label="Draft"
      value={'Long text '.repeat(50)}
      onChange={() => {}}
      onInput={onInput}
      style={{ boxSizing: 'border-box', border: '1px solid' }}
    />,
  );
  expect(ref.current).toHaveStyle({ height: '242px' });
  fireEvent.input(ref.current);
  expect(onInput).toHaveBeenCalledTimes(1);
  rerender(
    <AutoGrowTextarea
      ref={ref}
      aria-label="Draft"
      value="Short again"
      onChange={() => {}}
      style={{ boxSizing: 'border-box', border: '1px solid' }}
    />,
  );
  expect(ref.current).toHaveStyle({ height: '62px' });
  measured.mockRestore();
});

it('shows Arabic invitation email validation without sending or losing the draft', async () => {
  vi.spyOn(productApi, 'get').mockResolvedValue({ members: [], invitations: [] });
  const send = vi.spyOn(productApi, 'send').mockResolvedValue({});
  render(<TeamPage language="ar" workspace={workspace} />);
  const email = screen.getByLabelText('البريد الإلكتروني');
  fireEvent.change(email, { target: { value: 'not-an-email' } });
  fireEvent.click(screen.getByLabelText('Cairo'));
  fireEvent.submit(email.closest('form'));
  expect(await screen.findByText('أدخل بريدًا إلكترونيًا صالحًا.')).toBeVisible();
  expect(email).toHaveFocus();
  expect(email).toHaveAttribute('aria-invalid', 'true');
  expect(email).toHaveValue('not-an-email');
  expect(send).not.toHaveBeenCalled();
});

it('validates a public-page slug and HTTPS links locally, then retains values after a server failure', async () => {
  vi.spyOn(productApi, 'get').mockResolvedValue({
    slug: 'my-cafe',
    enabled: false,
    description: '',
    logoUrl: '',
    contactUrl: '',
  });
  const send = vi.spyOn(productApi, 'send').mockRejectedValue(new Error('offline'));
  render(<BusinessPageSettings language="en" workspace={workspace} />);
  const slug = screen.getByLabelText('Page address');
  await waitFor(() => expect(slug).toBeEnabled());
  fireEvent.change(slug, { target: { value: 'Bad slug' } });
  fireEvent.submit(slug.closest('form'));
  expect(await screen.findByText('Use 3–80 lowercase letters, numbers or hyphens.')).toBeVisible();
  expect(slug).toHaveFocus();
  expect(send).not.toHaveBeenCalled();
  fireEvent.change(slug, { target: { value: 'my-cafe' } });
  const logo = screen.getByLabelText('Logo URL (HTTPS, optional)');
  fireEvent.change(logo, { target: { value: 'http://example.test/logo.png' } });
  fireEvent.submit(slug.closest('form'));
  expect(
    await screen.findByText('Enter an HTTPS URL without a username or password.'),
  ).toBeVisible();
  expect(logo).toHaveFocus();
  expect(send).not.toHaveBeenCalled();
  fireEvent.change(logo, { target: { value: 'https://example.test/logo.png' } });
  fireEvent.submit(slug.closest('form'));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(slug).toHaveValue('my-cafe');
  expect(logo).toHaveValue('https://example.test/logo.png');
});

it('validates Arabic resend email before requesting verification', async () => {
  const resend = vi.spyOn(authApi, 'resend').mockResolvedValue({});
  render(<VerificationPage language="ar" />);
  const email = screen.getByLabelText('البريد الإلكتروني');
  fireEvent.change(email, { target: { value: 'bad' } });
  fireEvent.submit(email.closest('form'));
  expect(await screen.findByText('أدخل بريدًا إلكترونيًا صالحًا.')).toBeVisible();
  expect(email).toHaveFocus();
  expect(resend).not.toHaveBeenCalled();
  fireEvent.change(email, { target: { value: 'qa@example.test' } });
  fireEvent.submit(email.closest('form'));
  await waitFor(() => expect(resend).toHaveBeenCalledWith('qa@example.test'));
});
