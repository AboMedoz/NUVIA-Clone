import React, { useEffect, useRef, useState } from 'react';
import { authApi } from './api.js';
export default function VerificationPage({ language, preview = false }) {
  const ar = language === 'ar';
  const [email, setEmail] = useState(''),
    [emailError, setEmailError] = useState(false),
    [state, setState] = useState('pending');
  const started = useRef(null);
  const token = new URLSearchParams(location.hash.split('?')[1]).get('token');
  useEffect(() => {
    if (preview) return;
    if (!token || started.current === token) return;
    started.current = token;
    history.replaceState(null, '', `${location.pathname}#/verify-email`);
    setState('busy');
    authApi
      .verify(token)
      .then(() => setState('verified'))
      .catch(() => setState('invalid'));
  }, [token, preview]);
  async function resend(e) {
    e.preventDefault();
    if (state === 'busy') return;
    if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError(true);
      e.currentTarget.elements.namedItem('verification-email')?.focus();
      return;
    }
    setEmailError(false);
    if (preview) {
      setState('preview');
      return;
    }
    setState('busy');
    try {
      await authApi.resend(email.trim());
      setState('sent');
    } catch {
      setState('error');
    }
  }
  const messages = ar
    ? {
        pending: 'افتح رسالة التأكيد لإكمال إنشاء حسابك.',
        preview: 'معاينة فقط: لم يُرسل أي بريد ولم يتغير أي حساب.',
        busy: 'يرجى الانتظار…',
        verified: 'تم تأكيد بريدك. يمكنك تسجيل الدخول الآن.',
        invalid: 'رابط التأكيد غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',
        sent: 'تم استلام الطلب. راجع بريدك إذا كان الحساب يحتاج إلى تأكيد.',
        error: 'تعذر إكمال الطلب. حاول مرة أخرى.',
      }
    : {
        pending: 'Open the verification email to finish creating your account.',
        preview: 'Preview only: no email was sent and no account was changed.',
        busy: 'Please wait…',
        verified: 'Email verified. You can log in now.',
        invalid: 'This verification link is invalid or expired. Request a new one.',
        sent: 'Request received. Check your email if your account needs verification.',
        error: 'Could not complete the request. Please try again.',
      };
  return (
    <main className="session-state">
      <a href="#/landing" className="session-brand">
        NUVIA
      </a>
      <h1>{ar ? 'تأكيد البريد الإلكتروني' : 'Verify your email'}</h1>
      <p role="status">{messages[state]}</p>
      {state !== 'verified' && (
        <form onSubmit={resend} noValidate>
          <label>
            {ar ? 'البريد الإلكتروني' : 'Email'}
            <input
              type="email"
              name="verification-email"
              maxLength={254}
              aria-invalid={emailError || undefined}
              aria-describedby={emailError ? 'verification-email-error' : undefined}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(false);
              }}
              required
              autoComplete="email"
            />
            {emailError && (
              <span id="verification-email-error" role="alert">
                {ar ? 'أدخل بريدًا إلكترونيًا صالحًا.' : 'Enter a valid email address.'}
              </span>
            )}
          </label>
          <button className="primary" disabled={state === 'busy'}>
            {ar ? 'إعادة إرسال رابط التأكيد' : 'Resend verification link'}
          </button>
        </form>
      )}
      <a href="#/login">{ar ? 'العودة إلى تسجيل الدخول' : 'Back to log in'}</a>
    </main>
  );
}
