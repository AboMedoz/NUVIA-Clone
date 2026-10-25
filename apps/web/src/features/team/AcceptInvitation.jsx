import React, { useEffect, useState } from 'react';
import { useAuth } from '../../app/providers/AuthProvider.jsx';
import { productApi } from '../product/api.js';
import { useMutation } from '../product/useResource.js';
import { ErrorNotice } from '../product/ui.jsx';
import '../product/product.css';
export default function AcceptInvitation({ language }) {
  const auth = useAuth(),
    refresh = auth.refresh,
    mutation = useMutation(),
    token = new URLSearchParams(location.hash.split('?')[1]).get('token'),
    t = (a, b) => (language === 'ar' ? b : a);
  const [continuation, setContinuation] = useState({ loading: Boolean(token), error: null }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!token) return;
    let current = true;
    const controller = new AbortController();
    setContinuation({ loading: true, error: null });
    productApi
      .send('/auth/invitation-continuation', { token }, 'POST', controller.signal)
      .then(
        async () => {
          await refresh();
          if (!current) return;
          history.replaceState(null, '', location.pathname + '#/team/accept');
          setContinuation({ loading: false, error: null });
        },
        (error) => {
          if (current && error.name !== 'AbortError') setContinuation({ loading: false, error });
        },
      )
      .catch((error) => {
        if (current) setContinuation({ loading: false, error });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [token, refresh, retry]);
  const pending = Boolean(auth.pendingInvitation);
  return (
    <main className="public-feedback">
      <a href="#/landing" className="public-wordmark">
        NUVIA
      </a>
      <section className="product-card" style={{ marginTop: 30 }}>
        <h1>{t('Join your team', 'انضم إلى فريقك')}</h1>
        <p>
          {t(
            'Sign in with the email address this invitation was sent to.',
            'سجّل الدخول بالبريد الإلكتروني الذي تلقى الدعوة.',
          )}
        </p>
        {continuation.loading ? (
          <p role="status">{t('Saving invitation…', 'جارٍ حفظ الدعوة…')}</p>
        ) : continuation.error ? (
          <ErrorNotice
            error={continuation.error}
            language={language}
            retry={() => setRetry((v) => v + 1)}
          />
        ) : !pending ? (
          <p role="status">
            {t('Open your invitation link to join a team.', 'افتح رابط الدعوة للانضمام إلى فريق.')}
          </p>
        ) : !auth.user ? (
          <a href="#/login">{t('Sign in to accept', 'تسجيل الدخول لقبول الدعوة')}</a>
        ) : !auth.user.emailVerified ? (
          <a href="#/verify-email">
            {t(
              'Verify your email first, then sign in to join your team.',
              'أكّد بريدك أولًا ثم سجّل الدخول للانضمام إلى فريقك.',
            )}
          </a>
        ) : (
          <button
            className="primary"
            disabled={mutation.busy || !pending}
            onClick={async () => {
              const result = await mutation.run((signal) =>
                productApi.send('/team/accept', {}, 'POST', signal),
              );
              if (result) {
                await auth.refresh();
                location.hash = '/dashboard';
              }
            }}
          >
            {t('Accept invitation', 'قبول الدعوة')}
          </button>
        )}
        {pending && !continuation.loading && (
          <button
            type="button"
            disabled={mutation.busy}
            onClick={async () => {
              const result = await mutation.run((signal) =>
                productApi.send('/auth/invitation-continuation', {}, 'DELETE', signal),
              );
              if (result !== null) {
                await auth.refresh();
                location.hash = '/login';
              }
            }}
          >
            {t('Decline invitation', 'رفض الدعوة')}
          </button>
        )}
        <ErrorNotice error={mutation.error} language={language} />
      </section>
    </main>
  );
}
