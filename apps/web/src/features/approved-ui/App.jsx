import WorkspacePages from './features/workspace/WorkspacePages.jsx';
import { routeTitle } from '../../app/router/routes.js';
import CustomerFeedback from './features/customer-feedback/CustomerFeedback.jsx';
import { installRouteHistory } from './product/navigation.js';
import { validateAuth } from './validation/auth.js';
import ActionEvidencePage from './pages/ActionEvidencePage.jsx';
import SurveyPage from './surveys/SurveyPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ExtraPreviewPage from './pages/ExtraPreviewPage.jsx';
import EmailVerificationPage from './pages/EmailVerificationPage.jsx';
import { LanguageMenu } from './components/ChoiceMenu.jsx';
import React, { useEffect, useRef, useState } from 'react';
import Field from './components/Field.jsx';
import LanguageIcon from './components/LanguageIcon.jsx';
import { en, ar } from './i18n.js';
import { submitDemo } from './services/auth.js';
import LandingPage from './pages/LandingPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FeedbacksPage from './pages/FeedbacksPage.jsx';
import { asset as resolveAsset } from './assets.js';
import BusinessOnboarding from './pages/BusinessOnboarding.jsx';
const routes = [
  'dashboard-empty',
  'analytics',
  'assistant',
  'branch',
  'branch-add',
  'branch-edit',
  'branch-history',
  'branches',
  'business',
  'business-add',
  'business-edit',
  'notifications',
  'overview',
  'settings',
  'settings-account',
  'settings-devices',
  'settings-email',
  'settings-language',
  'settings-notifications',
  'settings-notifications-',
  'settings-notifications-email',
  'settings-notifications-inapp',
  'settings-password',
  'settings-personal',
  'settings-profile',
  'settings-security',
  'settings-two-factor',
  'subscription',
  'surveys',
  'customer-feedback',
  'action-board',
  'evidence',
  'survey-results',
  'survey-all',
  'survey-empty',
  'survey-live',
  'survey-drafts',
  'survey-paused',
  'survey-closed',
  'survey-create',
  'survey-questions',
  'survey-choices',
  'survey-edit',
  'survey-share',
  'survey-ai',
  'survey-ai-review',

  'landing',
  'dashboard',
  'feedbacks',
  'analytics-sentiment',
  'analytics-aspects',
  'analytics-topics',
  'analytics-trends',
  'analytics-comparison',
  'nuvia-assistant',
  'reports',
  'report-details',
  'feedbacks-loading',
  'feedbacks-no-results',
  'feedbacks-empty',
  'feedback-details',
  'login',
  'signup',
  'verify-email',
  'verify-email-expired',
  'verify-email-verified',
  'forgot',
  'reset',
  'business-information',
  'business-error',
  'business-setup',
  'get-started',
];
const currentRoute = () => {
  const value = location.hash.slice(2).split('?')[0];
  return routes.includes(value) ? value : 'landing';
};
export default function App() {
  useEffect(installRouteHistory, []);
  const requestGeneration = useRef(0);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [business, setBusiness] = useState({
    businessName: '',
    industry: '',
    branchType: 'multiple',
    branchName: '',
  });
  const [page, setPage] = useState(currentRoute),
    [language, setLanguage] = useState(
      () =>
        (['en', 'ar'].includes(new URLSearchParams(location.search).get('lang'))
          ? new URLSearchParams(location.search).get('lang')
          : localStorage.getItem('nuvia-language')) || 'en',
    ),
    [values, setValues] = useState({
      name: '',
      email: '',
      password: '',
      confirm: '',
      terms: false,
      remember: false,
    }),
    [errors, setErrors] = useState({}),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector(
        'main h1, .product-view h1, [data-name="Page introduction"] [data-name="Introduction"] > p, .setup-main h1',
      );
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.dataset.routeFocus = 'true';
        heading.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);
  const t = language === 'ar' ? ar : en,
    isSignup = page === 'signup',
    isLogin = page === 'login',
    isForgot = page === 'forgot';
  useEffect(() => {
    document.title = routeTitle(page, language, true);
  }, [page, language]);
  useEffect(() => {
    const listener = () => {
      requestGeneration.current += 1;
      setBusy(false);
      setPage(currentRoute());
      setErrors({});
      setNotice('');
      setValues({ name: '', email: '', password: '', confirm: '', terms: false, remember: false });
    };
    addEventListener('hashchange', listener);
    return () => {
      removeEventListener('hashchange', listener);
      requestGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('nuvia-language', language);
  }, [language]);
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
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const next = validateAuth(page, values);
    setErrors(next);
    setNotice('');
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.getElementById(Object.keys(next)[0])?.focus());
      return;
    }
    const generation = ++requestGeneration.current;
    const isCurrentRequest = () =>
      generation === requestGeneration.current && currentRoute() === page;
    setBusy(true);
    try {
      const result = await submitDemo(page, values);
      if (!isCurrentRequest()) return;
      if (result.field) setErrors({ [result.field]: result.error });
      else if (isSignup && !result.error) {
        setVerificationEmail(values.email.trim());
        location.hash = '/verify-email';
      } else setNotice(result.error || result.message);
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
  if (page === 'dashboard-empty')
    return (
      <div className="workspace-extension">
        <WorkspacePages language={language} setLanguage={setLanguage} initialEmpty />
      </div>
    );
  if (page === 'customer-feedback')
    return (
      <div className="customer-feedback-root">
        <CustomerFeedback />
      </div>
    );
  if (
    page === 'dashboard' ||
    page === 'overview' ||
    page === 'feedback-details' ||
    page.startsWith('feedbacks') ||
    page.startsWith('analytics-') ||
    page === 'analytics' ||
    page.startsWith('survey-') ||
    page === 'surveys' ||
    [
      'action-board',
      'evidence',
      'nuvia-assistant',
      'assistant',
      'reports',
      'report-details',
      'notifications',
      'subscription',
    ].includes(page) ||
    page.startsWith('settings') ||
    [
      'business',
      'business-edit',
      'business-add',
      'branches',
      'branch-add',
      'branch-edit',
      'branch-history',
    ].includes(page)
  )
    return (
      <div className="workspace-extension">
        <WorkspacePages language={language} setLanguage={setLanguage} />
      </div>
    );
  if (
    [
      'feedbacks',
      'feedbacks-loading',
      'feedbacks-no-results',
      'feedbacks-empty',
      'feedback-details',
    ].includes(page)
  )
    return (
      <FeedbacksPage
        key={location.hash}
        page={page}
        language={language}
        setLanguage={setLanguage}
      />
    );
  if (['action-board', 'evidence'].includes(page))
    return (
      <ActionEvidencePage
        key={location.hash}
        page={page}
        language={language}
        setLanguage={setLanguage}
      />
    );
  if (page.startsWith('survey-'))
    return <SurveyPage page={page} language={language} setLanguage={setLanguage} />;
  if (page.startsWith('analytics-'))
    return (
      <AnalyticsPage
        key={location.hash}
        page={page}
        language={language}
        setLanguage={setLanguage}
      />
    );
  if (['nuvia-assistant', 'reports', 'report-details'].includes(page))
    return (
      <ExtraPreviewPage
        key={location.hash}
        page={page}
        language={language}
        setLanguage={setLanguage}
      />
    );
  if (page.startsWith('verify-email'))
    return (
      <EmailVerificationPage
        key={page}
        initialStatus={
          page === 'verify-email-expired'
            ? 'expired'
            : page === 'verify-email-verified'
              ? 'verified'
              : 'sent'
        }
        language={language}
        setLanguage={setLanguage}
        email={verificationEmail}
        onEmailChange={setVerificationEmail}
      />
    );
  if (page === 'dashboard') return <DashboardPage language={language} setLanguage={setLanguage} />;
  if (page === 'landing') return <LandingPage language={language} setLanguage={setLanguage} />;
  if (['business-information', 'business-error', 'business-setup', 'get-started'].includes(page))
    return (
      <BusinessOnboarding
        page={page}
        language={language}
        setLanguage={setLanguage}
        values={business}
        setValues={setBusiness}
      />
    );
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <header>
          <div className="brand">
            <span>
              <img src={asset('imgLogo')} alt="" />
            </span>
            <strong>NUVIA</strong>
          </div>
          <button
            className="back"
            title={t.back}
            aria-label={t.back}
            onClick={() => {
              location.hash = '/landing';
            }}
          >
            <img
              src={asset(isForgot || page === 'reset' ? 'imgBackArrow' : 'imgArrowLeft')}
              alt=""
            />
            <span className="back-text">{t.back}</span>
          </button>
        </header>
        <div className={`auth-content ${isSignup ? 'signup' : ''} ${isLogin ? 'login' : ''}`}>
          <div className="intro">
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          {(isLogin || isSignup) && (
            <>
              <button type="button" className="google" onClick={() => setNotice('googleDemo')}>
                <img src={asset('imgGoogleLogo')} alt="" />
                {isSignup ? t.googleSignup : t.google}
              </button>
              <div className="divider">
                <span />
                {isSignup ? t.dividerSignup : t.divider}
                <span />
              </div>
            </>
          )}
          <form noValidate onSubmit={submit} className={isLogin ? 'login-form' : ''}>
            {isSignup && field('name', t.name, t.namePlaceholder)}
            {page !== 'reset' && field('email', t.email, 'you@company.com', 'email')}
            {!isForgot &&
              field(
                'password',
                page === 'reset' ? t.newPassword : t.password,
                isSignup
                  ? t.createPassword
                  : page === 'reset'
                    ? t.newPasswordPlaceholder
                    : t.passwordPlaceholder,
                'password',
                !isLogin ? t.passwordHint : undefined,
              )}
            {(isSignup || page === 'reset') &&
              field('confirm', t.confirm, isSignup ? t.confirm : t.confirmPlaceholder, 'password')}
            {isLogin && (
              <div className="preferences">
                <label>
                  <input
                    type="checkbox"
                    name="remember"
                    checked={values.remember}
                    onChange={change}
                  />
                  {t.remember}
                </label>
                <a href="#/forgot">{t.forgot}</a>
              </div>
            )}
            {isSignup && (
              <div>
                <label className="terms">
                  <input type="checkbox" name="terms" checked={values.terms} onChange={change} />
                  <span>
                    {t.agree}{' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setNotice('unavailable')}
                    >
                      {t.terms}
                    </button>{' '}
                    {t.and}{' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setNotice('unavailable')}
                    >
                      {t.privacy}
                    </button>
                    .
                  </span>
                </label>
                {errors.terms && (
                  <p className="error-text" role="alert">
                    {t[errors.terms]}
                  </p>
                )}
              </div>
            )}
            {notice && (
              <p
                role="status"
                className={`notice ${notice === 'loginFailed' ? 'error-notice' : ''}`}
              >
                {t[notice]}
              </p>
            )}
            <button disabled={busy} className="primary" type="submit">
              {busy
                ? t.loading
                : isLogin
                  ? t.login
                  : isSignup
                    ? t.signup
                    : isForgot
                      ? t.send
                      : t.reset}
            </button>
          </form>
          <p className="cross-link">
            {isLogin ? (
              <>
                {t.newUser} <a href="#/signup">{t.createAccount}</a>
              </>
            ) : isSignup ? (
              <>
                {t.existing} <a href="#/login">{t.login}</a>
              </>
            ) : (
              <a href="#/login">
                <span aria-hidden="true">{language === 'ar' ? '→' : '←'}</span> {t.backLogin}
              </a>
            )}
          </p>
        </div>
        <footer>
          <span>© 2026 NUVIA</span>
          <div>
            <button onClick={() => setNotice('unavailable')}>{t.privacy}</button>
            <button onClick={() => setNotice('unavailable')}>{t.help}</button>
            <label className="language">
              <LanguageIcon />
              <LanguageMenu value={language} onChange={setLanguage} />
            </label>
          </div>
        </footer>
      </section>
      <aside className="story">
        <div className="eyebrow">
          <img src={asset('imgSparkles')} alt="" />
          {t.eyebrow}
        </div>
        <h2>
          {isSignup ? t.signupStory : t.storyTitle}
          <span>{isSignup ? t.signupBlue : t.storyBlue}</span>
        </h2>
        <div className="illustration">
          <img className="art" src={asset('imgIllustratedFeedbackObjects', 'png')} alt="" />
          <div className="comment-card">
            <div className="source">
              <span>AM</span>
              {t.source}
            </div>
            <p>{isSignup ? t.signupQuote : t.quote}</p>
            <small>{isSignup ? t.signupTag : t.tag}</small>
          </div>
          <div className="insight-card">
            <strong>
              <img src={asset(isSignup ? 'imgCircleCheck' : 'imgSparkles')} alt="" />
              {isSignup ? t.signupAction : t.action}
            </strong>
            <p>{isSignup ? t.signupInsight : t.insight}</p>
            {!isSignup && <small>{t.evidence}</small>}
          </div>
        </div>
        <p className="caption">{isSignup ? t.signupCaption : t.caption}</p>
        <div className="capability">
          <LanguageIcon />
          {t.languages}
        </div>
      </aside>
    </main>
  );
}
