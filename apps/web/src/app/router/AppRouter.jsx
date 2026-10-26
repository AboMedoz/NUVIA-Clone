import { currentRoute, routeTitle } from './routes.js';
import AuthPage from '../../features/approved-ui/pages/AuthScreen.jsx';
import ApprovedWorkspace from '../../features/approved-ui/ApprovedWorkspace.jsx';
import ApprovedVerification from '../../features/approved-ui/pages/EmailVerificationPage.jsx';
import InformationPage from '../../features/approved-ui/pages/InformationPage.jsx';
import ApprovedPublicSurvey from '../../features/approved-ui/features/customer-feedback/CustomerFeedback.jsx';
import React, { useEffect, useRef, useState } from 'react';
import Field from '../../features/approved-ui/components/Field.jsx';
import { en, ar } from '../../lib/i18n/auth-copy.js';
import { submitDemo, authApi } from '../../features/auth/api.js';
import { useAuth } from '../providers/AuthProvider.jsx';
import { routePolicy, afterLogin } from './access-policy.js';
import LandingPage from '../../features/approved-ui/pages/LandingPage.jsx';

import PublicBusiness from '../../features/workspaces/PublicBusiness.jsx';
import AcceptInvitation from '../../features/team/AcceptInvitation.jsx';
import { asset as resolveAsset } from '../../lib/assets.js';
import { apiRequest } from '../../lib/http/client.js';
import { saveProductReturn, readProductReturn, takeProductReturn } from './login-return.js';
const supportsWorkspaceLink = (page) =>
  [
    'feedbacks',
    'feedback-details',
    'reports',
    'report-details',
    'dashboard',
    'overview',
    'analytics',
    'action-board',
    'evidence',
    'notifications',
  ].includes(page) || page.startsWith('analytics-');
import BusinessOnboarding, {
  ConnectedBusinessOnboarding,
} from '../../features/approved-ui/pages/BusinessOnboarding.jsx';
export default function AppRouter() {
  const auth = useAuth(),
    preview = auth.preview,
    cancel = auth.cancel;
  const submission = useRef(null),
    resetToken = useRef(null);
  const requestGeneration = useRef(0);
  const googleChallenge = useRef(null);
  const googleActive = useRef(false);
  const pendingProductNavigation = useRef(null);
  const [, refreshNavigationState] = useState(0);
  const [workspaceLinkState, setWorkspaceLinkState] = useState('idle');
  const [workspaceLinkRetry, setWorkspaceLinkRetry] = useState(0);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [business, setBusiness] = useState({
    businessName: '',
    industry: '',
    branchType: 'multiple',
    branchName: '',
  });
  const [page, setPage] = useState(currentRoute),
    [navigationEpoch, setNavigationEpoch] = useState(0),
    [language, setLanguage] = useState(() => localStorage.getItem('nuvia-language') || 'en'),
    [values, setValues] = useState({
      name: '',
      email: '',
      password: '',
      confirm: '',
      code: '',
      terms: false,
      remember: false,
    }),
    [errors, setErrors] = useState({}),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const t = {
      ...(language === 'ar' ? ar : en),
      googleNotLinked:
        language === 'ar'
          ? 'سجّل الدخول بكلمة المرور، ثم اربط Google من إعدادات الأمان.'
          : 'Sign in with your password, then connect Google from security settings.',
      googleTermsRequired:
        language === 'ar'
          ? 'لإنشاء حساب جديد، افتح إنشاء حساب ووافق على الشروط.'
          : 'To create a new account, open Sign up and accept the terms.',
    },
    isSignup = page === 'signup',
    isLogin = page === 'login',
    isForgot = page === 'forgot';
  useEffect(() => {
    if (page !== 'login') {
      googleChallenge.current = null;
      setTwoFactorRequired(false);
      return;
    }
    const params = new URLSearchParams(location.hash.split('?')[1]);
    const challenge = params.get('googleChallenge');
    if (challenge && /^[a-f0-9]{64}$/.test(challenge)) {
      googleChallenge.current = challenge;
      setTwoFactorRequired(true);
      history.replaceState(history.state, '', location.pathname + '#/login');
    }
    if (params.has('googleError')) {
      setNotice(
        params.get('googleError') === 'GOOGLE_ACCOUNT_NOT_LINKED'
          ? 'googleNotLinked'
          : params.get('googleError') === 'TERMS_REQUIRED'
            ? 'googleTermsRequired'
            : 'googleUnavailable',
      );
      history.replaceState(history.state, '', location.pathname + '#/login');
    }
  }, [page]);
  useEffect(() => {
    const listener = () => {
      if (currentRoute() !== 'reset') resetToken.current = null;
      submission.current?.abort();
      cancel();
      requestGeneration.current += 1;
      setBusy(false);
      setPage(currentRoute());
      setNavigationEpoch((epoch) => epoch + 1);
      setErrors({});
      setNotice('');
      setValues({
        name: '',
        email: '',
        password: '',
        confirm: '',
        code: '',
        terms: false,
        remember: false,
      });
    };
    addEventListener('hashchange', listener);
    return () => {
      removeEventListener('hashchange', listener);
      submission.current?.abort();
      requestGeneration.current += 1;
    };
  }, [cancel]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('nuvia-language', language);
  }, [language]);
  const resetParam = new URLSearchParams(location.hash.split('?')[1]).get('token');
  const legacyInvite = new URLSearchParams(location.hash.split('?')[1]).get('invite');
  const requestedWorkspace = new URLSearchParams(location.hash.split('?')[1]).get('workspace');
  const refreshSession = auth.refresh,
    verifiedUser = auth.user?.emailVerified,
    activeWorkspaceId = auth.workspace?.id,
    sessionStatus = auth.status;
  const needsWorkspaceSelection = Boolean(
    supportsWorkspaceLink(page) && requestedWorkspace && requestedWorkspace !== auth.workspace?.id,
  );
  useEffect(() => {
    if (
      !requestedWorkspace ||
      !verifiedUser ||
      sessionStatus !== 'ready' ||
      !supportsWorkspaceLink(page)
    )
      return;
    const removeContext = () => {
      const [route, raw] = location.hash.split('?'),
        params = new URLSearchParams(raw);
      params.delete('workspace');
      history.replaceState(
        history.state,
        '',
        location.pathname + location.search + route + (params.size ? '?' + params : ''),
      );
    };
    if (requestedWorkspace === activeWorkspaceId) {
      removeContext();
      return;
    }
    let active = true;
    const controller = new AbortController();
    setWorkspaceLinkState('loading');
    apiRequest('/workspaces/' + encodeURIComponent(requestedWorkspace) + '/select', {
      method: 'POST',
      body: {},
      signal: controller.signal,
    })
      .then(async () => {
        if (!active) return;
        removeContext();
        await refreshSession();
        if (active) setWorkspaceLinkState('idle');
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') setWorkspaceLinkState('error');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    requestedWorkspace,
    verifiedUser,
    sessionStatus,
    activeWorkspaceId,
    refreshSession,
    workspaceLinkRetry,
    page,
  ]);
  useEffect(() => {
    if (!preview && legacyInvite && page !== 'team-accept')
      location.hash = '/team/accept?token=' + encodeURIComponent(legacyInvite);
  }, [preview, legacyInvite, page]);
  useEffect(() => {
    if (page !== 'reset' || preview) return;
    const token = resetParam;
    if (token) {
      resetToken.current = token;
      history.replaceState(null, '', `${location.pathname}#/reset`);
    }
  }, [page, preview, resetParam]);
  const policy = routePolicy({
    route: page,
    preview,
    user: auth.user,
    workspace: auth.workspace,
    pendingInvitation: auth.pendingInvitation,
  });
  const redirect = policy.redirect;
  const providerReturn =
    page === 'dashboard' &&
    auth.user?.emailVerified &&
    auth.workspace?.onboardingStep === 'complete'
      ? readProductReturn()
      : null;
  useEffect(() => {
    if (providerReturn) {
      const target = takeProductReturn();
      if (target && target !== location.hash) location.hash = target;
      else refreshNavigationState((value) => value + 1);
    }
  }, [providerReturn]);
  useEffect(() => {
    const visiblePage =
      !preview && !policy.allow ? (auth.status === 'error' ? 'error' : 'loading') : page;
    document.title = routeTitle(visiblePage, language, preview);
  }, [page, language, preview, policy.allow, auth.status]);
  useEffect(() => {
    if (auth.status === 'ready' && redirect) {
      if (requestedWorkspace && auth.user?.emailVerified && needsWorkspaceSelection) return;
      if (
        redirect === 'login' &&
        !['login', 'signup', 'forgot', 'reset', 'verify-email'].includes(page)
      )
        pendingProductNavigation.current = saveProductReturn(location.hash);
      location.hash = '/' + redirect;
    }
  }, [
    auth.status,
    redirect,
    page,
    requestedWorkspace,
    auth.user?.emailVerified,
    needsWorkspaceSelection,
  ]);
  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setValues((v) => ({ ...v, [name]: type === 'checkbox' ? checked : value }));
    setErrors((old) => ({ ...old, [name]: undefined }));
    setNotice('');
  };
  const field = (name, label, placeholder, type = 'text', hint) => (
    <Field
      key={name}
      name={name}
      label={label}
      placeholder={placeholder}
      type={type}
      value={values[name]}
      onChange={change}
      error={errors[name] ? t[errors[name]] : undefined}
      hint={hint}
      showLabel={t.show}
      hideLabel={t.hide}
    />
  );
  async function startGoogle() {
    if (busy || googleActive.current) return;
    if (preview) {
      setNotice('googleDemo');
      return;
    }
    if (isSignup && !values.terms) {
      setErrors({ terms: 'termsError' });
      return;
    }
    const generation = ++requestGeneration.current;
    submission.current?.abort();
    const controller = new AbortController();
    submission.current = controller;
    googleActive.current = true;
    setBusy(true);
    setNotice('');
    try {
      const result = await apiRequest('/auth/google/start', {
        method: 'POST',
        body: { terms: isSignup ? values.terms : false, locale: language },
        signal: controller.signal,
      });
      if (
        generation === requestGeneration.current &&
        currentRoute() === page &&
        !controller.signal.aborted
      )
        location.assign(result.url);
    } catch (error) {
      if (generation === requestGeneration.current && error.name !== 'AbortError')
        setNotice('googleUnavailable');
    } finally {
      googleActive.current = false;
      if (generation === requestGeneration.current) setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!preview && googleChallenge.current) {
      if (!/^(?:\d{6}|[a-fA-F0-9]{20})$/.test((values.code || '').replaceAll('-', ''))) {
        setNotice('invalidToken');
        return;
      }
      const generation = ++requestGeneration.current;
      submission.current?.abort();
      const controller = new AbortController();
      submission.current = controller;
      setBusy(true);
      try {
        await apiRequest('/auth/google/second-factor', {
          method: 'POST',
          body: { challenge: googleChallenge.current, code: values.code },
          signal: controller.signal,
        });
        if (generation !== requestGeneration.current) return;
        const session = await auth.refresh();
        if (generation !== requestGeneration.current) return;
        googleChallenge.current = null;
        location.hash = '/' + afterLogin(session.workspace, session.pendingInvitation);
      } catch (error) {
        if (generation === requestGeneration.current && error.name !== 'AbortError')
          setNotice('invalidToken');
      } finally {
        if (generation === requestGeneration.current) setBusy(false);
      }
      return;
    }
    const next = {};
    if (isSignup && !values.name.trim()) next.name = 'required';
    if (page !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
      next.email = values.email ? 'invalidEmail' : 'required';
    if (!isForgot) {
      if (!values.password) next.password = 'required';
      else if (!isLogin && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(values.password))
        next.password = 'weakPassword';
      if (!isLogin && values.confirm !== values.password) next.confirm = 'mismatch';
    }
    if (isSignup && !values.terms) next.terms = 'termsError';
    setErrors(next);
    setNotice('');
    if (Object.keys(next).length) return;
    const generation = ++requestGeneration.current;
    const isCurrentRequest = () =>
      generation === requestGeneration.current && currentRoute() === page;
    setBusy(true);
    submission.current?.abort();
    const controller = new AbortController();
    submission.current = controller;
    try {
      if (!preview) {
        if (isSignup) {
          await authApi.register(
            {
              name: values.name,
              email: values.email,
              password: values.password,
              terms: values.terms,
              locale: language,
            },
            controller.signal,
          );
          if (isCurrentRequest()) {
            setVerificationEmail(values.email.trim());
            location.hash = '/verify-email';
          }
        } else if (isLogin) {
          const session = await auth.login(
            {
              email: values.email,
              password: values.password,
              remember: values.remember,
              ...(values.code ? { code: values.code } : {}),
            },
            controller.signal,
          );
          if (isCurrentRequest() && session) {
            const invite = new URLSearchParams(location.hash.split('?')[1]).get('invite');
            location.hash = invite
              ? '/team/accept?token=' + encodeURIComponent(invite)
              : (pendingProductNavigation.current || readProductReturn()) &&
                  session.workspace?.onboardingStep === 'complete' &&
                  !session.pendingInvitation
                ? takeProductReturn() || pendingProductNavigation.current
                : '/' + afterLogin(session.workspace, session.pendingInvitation);
            pendingProductNavigation.current = null;
          }
        } else if (isForgot) {
          await authApi.forgot(values.email, controller.signal);
          if (isCurrentRequest()) setNotice('resetAccepted');
        } else {
          await authApi.reset(
            { token: resetToken.current, password: values.password },
            controller.signal,
          );
          if (isCurrentRequest()) await auth.refresh();
          if (isCurrentRequest()) {
            resetToken.current = null;
            location.hash = '/login';
          }
        }
        if (isCurrentRequest()) setValues((v) => ({ ...v, password: '', confirm: '' }));
        return;
      }
      const result = await submitDemo(page, values);
      if (!isCurrentRequest()) return;
      if (result.field) setErrors({ [result.field]: result.error });
      else setNotice(result.error || result.message);
    } catch (error) {
      if (!isCurrentRequest() || error.name === 'AbortError') return;
      if (['TWO_FACTOR_REQUIRED', 'INVALID_TWO_FACTOR'].includes(error.code)) {
        setTwoFactorRequired(true);
        setNotice(error.code === 'INVALID_TWO_FACTOR' ? 'invalidToken' : '');
      } else if (error.code === 'EMAIL_USED') setErrors({ email: 'emailUsed' });
      else if (error.code === 'EMAIL_VERIFICATION_REQUIRED') location.hash = '/verify-email';
      else
        setNotice(
          {
            INVALID_CREDENTIALS: 'loginFailed',
            INVALID_TOKEN: 'invalidToken',
            RATE_LIMITED: 'rateLimited',
          }[error.code] || 'requestFailed',
        );
    } finally {
      if (isCurrentRequest()) setBusy(false);
    }
  }
  const title = isLogin
    ? t.welcome
    : isSignup
      ? t.signupTitle
      : isForgot
        ? t.forgotTitle
        : t.resetTitle;
  const intro = isLogin
    ? t.loginIntro
    : isSignup
      ? t.signupIntro
      : isForgot
        ? t.forgotIntro
        : t.resetIntro;
  const assetPrefix = isSignup
    ? '159-1494'
    : isForgot
      ? '159-1722'
      : page === 'reset'
        ? '159-1831'
        : 'login';
  const asset = (name, extension = 'svg') => resolveAsset(`${assetPrefix}-${name}.${extension}`);
  if (
    ['help', 'about', 'security', 'status', 'terms', 'privacy', 'stories', 'pricing'].includes(page)
  )
    return <InformationPage page={page} language={language} setLanguage={setLanguage} />;
  if (providerReturn)
    return (
      <main className="session-state" role="status">
        {t.loading}
      </main>
    );
  if (!preview && auth.user?.emailVerified && needsWorkspaceSelection)
    return (
      <main className="session-state" role={workspaceLinkState === 'error' ? 'alert' : 'status'}>
        <h1>
          {workspaceLinkState === 'error'
            ? language === 'ar'
              ? 'لا يمكنك فتح هذا النشاط'
              : 'Unable to open this business'
            : t.loading}
        </h1>
        {workspaceLinkState === 'error' && (
          <>
            <button className="primary" onClick={() => setWorkspaceLinkRetry((value) => value + 1)}>
              {t.retry}
            </button>
            <a href="#/business">
              {language === 'ar' ? 'العودة إلى نشاطك' : 'Back to your business'}
            </a>
          </>
        )}
      </main>
    );
  if (!preview && !policy.allow) {
    return (
      <main className="session-state" aria-live="polite">
        <h1>{t.loading}</h1>
        {auth.status === 'error' && (
          <>
            <p>{t.requestFailed}</p>
            <button className="primary" onClick={() => auth.refresh().catch(() => {})}>
              {t.retry}
            </button>
          </>
        )}
      </main>
    );
  }
  if (page.startsWith('verify-email'))
    return (
      <ApprovedVerification
        language={language}
        setLanguage={setLanguage}
        email={verificationEmail}
        onEmailChange={setVerificationEmail}
      />
    );
  if (page === 'team-accept') return <AcceptInvitation language={language} />;
  if (page === 'public-survey')
    return (
      <ApprovedPublicSurvey key={location.hash} language={language} setLanguage={setLanguage} />
    );
  if (page === 'public-business')
    return <PublicBusiness key={location.hash} language={language} setLanguage={setLanguage} />;
  if (
    !preview &&
    ![
      'landing',
      'login',
      'signup',
      'forgot',
      'reset',
      'verify-email',
      'business-information',
      'business-error',
      'business-setup',
      'get-started',
    ].includes(page)
  )
    return (
      <ApprovedWorkspace
        key={JSON.stringify([
          page,
          navigationEpoch,
          auth.user?.id,
          auth.workspace?.id,
          auth.workspace?.role,
          auth.workspace?.allowedBranchIds,
        ])}
        page={page}
        language={language}
        setLanguage={setLanguage}
      />
    );
  if (
    page === 'reset' &&
    !preview &&
    !resetToken.current &&
    !new URLSearchParams(location.hash.split('?')[1]).get('token')
  )
    return (
      <main className="session-state">
        <h1>{t.resetTitle}</h1>
        <p role="alert">{t.invalidToken}</p>
        <a href="#/forgot">{t.send}</a>
      </main>
    );
  if (page === 'landing') return <LandingPage language={language} setLanguage={setLanguage} />;
  if (['business-information', 'business-error', 'business-setup', 'get-started'].includes(page))
    return preview ? (
      <BusinessOnboarding
        page={page}
        language={language}
        setLanguage={setLanguage}
        values={business}
        setValues={setBusiness}
      />
    ) : (
      <ConnectedBusinessOnboarding
        key={auth.user.id}
        page={page}
        language={language}
        setLanguage={setLanguage}
      />
    );
  return (
    <AuthPage
      {...{
        t,
        twoFactorRequired,
        startGoogle,
        asset,
        isSignup,
        isLogin,
        isForgot,
        page,
        preview,
        setNotice,
        submit,
        field,
        values,
        change,
        errors,
        notice,
        busy,
        setLanguage,
        language,
        title,
        intro,
      }}
    />
  );
}
