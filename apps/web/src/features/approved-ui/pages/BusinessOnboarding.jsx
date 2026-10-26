import { useResource, useMutation } from '../../product/useResource.js';
import { productApi } from '../../product/api.js';
import { LanguageMenu } from '../components/ChoiceMenu.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { asset } from '../assets.js';
import { setupCopy } from '../setup-copy.js';
import SetupSidebar from '../components/SetupSidebar.jsx';
import LanguageIcon from '../components/LanguageIcon.jsx';
import BusinessInformationPage from './BusinessInformationPage.jsx';
import SetupPage from './SetupPage.jsx';
import GetStartedPage from './GetStartedPage.jsx';
import '../styles/setup.css';
export function ConnectedBusinessOnboarding(props) {
  const auth = useAuth(),
    { workspace } = auth;
  const existing = useResource(!workspace ? '/workspaces' : null),
    selection = useMutation();
  const selectBusiness = async (id) => {
    const result = await selection.run(async (signal) => {
      const saved = await productApi.send(
        '/workspaces/' + encodeURIComponent(id) + '/select',
        {},
        'POST',
        signal,
      );
      if (!signal.aborted) await auth.refresh();
      return saved;
    });
    if (result)
      location.hash =
        result.workspace.onboardingStep === 'complete' ? '/dashboard' : '/business-setup';
  };
  const [values, setValues] = useState(() =>
    workspace
      ? {
          businessName: workspace.businessName,
          industry: workspace.industry,
          branchType: workspace.branchType,
          branchName:
            workspace.branches.find((branch) => branch.id === workspace.primaryBranchId)?.name ||
            '',
        }
      : { businessName: '', industry: '', branchType: 'multiple', branchName: '' },
  );
  return (
    <BusinessOnboarding
      {...props}
      values={values}
      setValues={setValues}
      existingBusinesses={!workspace ? existing : null}
      selection={selection}
      selectBusiness={selectBusiness}
    />
  );
}
export default function BusinessOnboarding({
  page,
  language,
  setLanguage,
  values,
  setValues,
  existingBusinesses,
  selection,
  selectBusiness,
}) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), [page]);
  const choosingBusiness =
    existingBusinesses &&
    (existingBusinesses.loading ||
      existingBusinesses.error ||
      existingBusinesses.data?.workspaces?.length);
  const c = setupCopy[language],
    step = page === 'business-setup' ? 1 : page === 'get-started' ? 2 : 0;
  const [errors, setErrors] = useState(() =>
      page === 'business-error' ? { businessName: true, industry: true } : {},
    ),
    [branchError, setBranchError] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    setBusy(false);
    setSaveError(false);
    setErrors(page === 'business-error' ? { businessName: true, industry: true } : {});
    setBranchError(false);
    setNotice('');
  }, [page]);
  const folder =
      step === 0
        ? Object.values(errors).some(Boolean)
          ? 'information-error'
          : 'information'
        : step === 1
          ? 'branches'
          : 'get-started',
    icon = (name) => asset(`business-setup/${folder}/${name}.svg`);
  const change = (e) => {
    const { name, value } = e.target;
    setValues((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: false }));
    if (name === 'branchName' || name === 'branchType') setBranchError(false);
  };
  const go = (route) => {
    location.hash = '/' + route;
  };
  const save = async (operation, payload, destination) => {
    if (busy) return;
    setBusy(true);
    setSaveError(false);
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await operation(payload, request.signal);
      if (result && !request.signal.aborted) go(destination);
    } catch (error) {
      if (error.name !== 'AbortError' && !request.signal.aborted) setSaveError(true);
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  const infoNext = async (e) => {
    e.preventDefault();
    const invalid = {
      businessName: !values.businessName.trim(),
      industry: !values.industry.trim(),
    };
    setErrors(invalid);
    if (!Object.values(invalid).some(Boolean)) {
      if (auth.preview) go('business-setup');
      else
        await save(
          auth.saveWorkspace,
          {
            businessName: values.businessName,
            industry: values.industry,
            locale: language,
            reportingTimezone: 'Africa/Cairo',
          },
          'business-setup',
        );
    }
  };
  const branchNext = async (e) => {
    e.preventDefault();
    if (!values.businessName.trim() || !values.industry.trim()) {
      go('business-error');
      return;
    }
    if (values.branchType === 'multiple' && !values.branchName.trim()) {
      setBranchError(true);
      return;
    }
    if (auth.preview) go('get-started');
    else
      await save(
        auth.completeSetup,
        {
          branchType: values.branchType,
          ...(values.branchType === 'multiple' ? { branchName: values.branchName } : {}),
        },
        'get-started',
      );
  };
  return (
    <div className="business-onboarding" data-step={step}>
      <header className="setup-header">
        <a
          className="setup-mobile-back back"
          href="#/landing"
          aria-label={language === 'ar' ? 'العودة إلى الموقع' : 'Back to website'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m14 6-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <a className="brand" href="#/landing">
          <span>
            <img src={icon('header-nuvia-logo')} alt="" />
          </span>
          <strong>NUVIA</strong>
        </a>
        <button className="setup-help" onClick={() => setNotice(c.helpNotice)}>
          <img src={icon('header-help-icon')} alt="" />
          {c.help}
        </button>
      </header>
      <main className="setup-main">
        <ol
          className="setup-progress"
          aria-label={language === 'ar' ? 'خطوات الإعداد' : 'Setup progress'}
        >
          {c.steps.map((name, i) => (
            <li
              key={name}
              className={i <= step ? 'active' : ''}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="progress-marker">
                {i < step ? (
                  <img src={icon('progress-completed-check')} alt="" />
                ) : language === 'ar' ? (
                  (i + 1).toLocaleString('ar', { numberingSystem: 'arab' })
                ) : (
                  i + 1
                )}
              </span>
              <span>{name}</span>
            </li>
          ))}
        </ol>
        <div className="setup-card">
          <SetupSidebar copy={c} step={step} folder={folder} />
          {choosingBusiness ? (
            <section className="setup-content">
              <p className="setup-step-label">
                {language === 'ar' ? 'أنشطتك التجارية' : 'YOUR BUSINESSES'}
              </p>
              <h1>{language === 'ar' ? 'اختر نشاطًا تجاريًا' : 'Choose a business'}</h1>
              <p className="setup-intro">
                {language === 'ar'
                  ? 'اختر أحد الأنشطة المصرح لك بالوصول إليها للمتابعة.'
                  : 'Choose a business you currently have permission to access.'}
              </p>
              {existingBusinesses.loading && (
                <p role="status">{language === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>
              )}
              {existingBusinesses.error && (
                <div role="alert">
                  <p>{language === 'ar' ? 'تعذر تحميل الأنشطة.' : 'Unable to load businesses.'}</p>
                  <button type="button" className="primary" onClick={existingBusinesses.reload}>
                    {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                </div>
              )}
              <form noValidate onSubmit={(event) => event.preventDefault()}>
                {(existingBusinesses.data?.workspaces || []).map((business) => (
                  <button
                    type="button"
                    className="primary"
                    disabled={selection?.busy}
                    key={business.id}
                    onClick={() => selectBusiness(business.id)}
                  >
                    {language === 'ar' ? 'فتح النشاط: ' : 'Open business: '}
                    {business.businessName}
                  </button>
                ))}
              </form>
              {selection?.error && (
                <p className="notice error-notice" role="alert">
                  {language === 'ar'
                    ? 'تعذر فتح النشاط. قد يكون الوصول تغير، حدّث القائمة وحاول مجددًا.'
                    : 'Unable to open business. Access may have changed; refresh the list and try again.'}
                </p>
              )}
            </section>
          ) : step === 0 ? (
            <BusinessInformationPage
              copy={c}
              values={values}
              onChange={change}
              errors={errors}
              onContinue={infoNext}
              folder={folder}
              busy={busy}
            />
          ) : step === 1 ? (
            <SetupPage
              copy={c}
              values={values}
              onChange={change}
              error={branchError}
              onContinue={branchNext}
              onBack={() => go('business-information')}
              busy={busy}
            />
          ) : (
            <GetStartedPage
              copy={c}
              values={values}
              onEdit={() => go('business-information')}
              onStart={auth.preview ? undefined : () => go('dashboard')}
            />
          )}
        </div>
        {saveError && (
          <p className="notice error-notice" role="alert">
            {language === 'ar'
              ? 'تعذر حفظ بياناتك. تحقق من الاتصال وحاول مرة أخرى.'
              : 'Could not save your details. Check your connection and try again.'}
          </p>
        )}
        {notice && (
          <p className="notice setup-notice" role="status">
            {notice}
            <button
              onClick={() => setNotice('')}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
            >
              ×
            </button>
          </p>
        )}
      </main>
      <footer className="setup-footer">
        <span>© 2026 Nuvia</span>
        <div>
          <label className="language">
            <LanguageIcon />
            <LanguageMenu value={language} onChange={setLanguage} />
          </label>
          <button className="setup-mobile-help" onClick={() => setNotice(c.helpNotice)}>
            {c.help}
          </button>
          <button onClick={() => setNotice(c.reserved)}>{c.privacy}</button>
          <button onClick={() => setNotice(c.reserved)}>{c.terms}</button>
        </div>
      </footer>
    </div>
  );
}
