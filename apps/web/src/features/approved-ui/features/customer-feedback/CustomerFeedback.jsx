import Field from '../../components/Field.jsx';
import { productApi } from '../../../product/api.js';
import { validateAnswers } from '../../../product/product-state.js';
import { useMutation } from '../../../product/useResource.js';
import React, { useState, useEffect, useRef } from 'react';

import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
import './customer-feedback.css';
function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'star' ? (
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
      ) : name === 'check' ? (
        <path d="m5 12 4 4L19 6" />
      ) : name === 'globe' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18M5 7h14M5 17h14" />
        </>
      ) : name === 'delivery' ? (
        <>
          <path d="M3 6h11v12H3zM14 10h4l3 4v4h-7" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </>
      ) : name === 'store' ? (
        <>
          <path d="m3 10 2-6h14l2 6M4 10v11h16V10M9 21v-7h6v7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
        </>
      ) : name === 'lock' ? (
        <>
          <rect x="5" y="10" width="14" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      ) : name === 'send' ? (
        <>
          <path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3" />
        </>
      ) : (
        <>
          <path d="M4 5h16v13H8l-4 3V5Z" />
          <path d="M8 10h8M8 14h5" />
        </>
      )}
    </svg>
  );
}
export default function CustomerFeedback(props) {
  const token = decodeURIComponent(location.hash.split('?')[0].split('/')[2] || '');
  return (
    <div className="customer-feedback-root">
      {token ? <ConnectedPublicFeedback {...props} token={token} /> : <DemoCustomerFeedback />}
    </div>
  );
}
function DemoCustomerFeedback() {
  const [ar, setAr] = useState(false),
    [score, setScore] = useState(0),
    [service, setService] = useState(''),
    [feedback, setFeedback] = useState(''),
    [agree, setAgree] = useState(false),
    [topics, setTopics] = useState([]),
    [nps, setNps] = useState(null),
    [errors, setErrors] = useState({}),
    [state, setState] = useState('form');
  const formRef = useRef(),
    successRef = useRef();
  const t = (en, arabic) => (ar ? arabic : en);
  const labels = ar
    ? ['سيئة جدًا', 'سيئة', 'متوسطة', 'جيدة', 'ممتازة']
    : ['Very poor', 'Poor', 'Okay', 'Good', 'Great'];
  useEffect(() => {
    document.documentElement.lang = ar ? 'ar' : 'en';
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
  }, [ar]);
  useEffect(() => {
    if (state === 'success') {
      successRef.current?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [state]);
  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!score) next.score = t('Choose a score to continue.', 'اختر تقييمًا للمتابعة.');
    if (!service)
      next.service = t('Choose one answer for Question 2.', 'اختر إجابة واحدة للسؤال ٢.');
    if (feedback.trim().length < 10)
      next.feedback = t('Please write at least 10 characters.', 'اكتب رأيك في ١٠ أحرف على الأقل.');
    if (!agree)
      next.agree = t(
        'Please agree to share your answer with the business.',
        'يرجى الموافقة على مشاركة إجابتك مع النشاط.',
      );
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setState('sending');
    setTimeout(() => setState('success'), 600);
  }
  const reset = () => {
    setScore(0);
    setService('');
    setFeedback('');
    setAgree(false);
    setTopics([]);
    setNps(null);
    setErrors({});
    setState('form');
  };
  return (
    <div className="public-page">
      <header className="public-header">
        <img className="brand" src="/assets/brand/nuvia-logo.svg" alt="NUVIA" />
        <button
          className="language-control"
          onClick={() => setAr(!ar)}
          aria-label={t('Switch to Arabic', 'Switch to English')}
        >
          <Icon name="globe" />
          <span>{ar ? 'English' : 'العربية'}</span>
        </button>
      </header>
      <main>
        {state === 'success' ? (
          <section className="success-card" aria-labelledby="thank-you">
            <span className="success-icon">
              <Icon name="check" size={38} />
            </span>
            <span className="eyebrow">Bloom & Co.</span>
            <h1 id="thank-you" ref={successRef} tabIndex={-1}>
              {t('Thank you for your feedback', 'شكرًا لمشاركتنا رأيك')}
            </h1>
            <p>
              {t(
                'Your voice helps us create better experiences. We appreciate the time you took to share it.',
                'رأيك يساعدنا في تقديم تجربة أفضل. نقدّر الوقت الذي خصصته لمشاركتنا تجربتك.',
              )}
            </p>
            <div className="response-summary">
              <span>
                <Icon name="star" />
                {score} / 5 · {labels[score - 1]}
              </span>
              <span>
                <Icon name="check" />
                {t('Single choice · Option ', 'اختيار واحد · اختيار ') +
                  service.replace('option', '')}
              </span>
            </div>
            <button className="secondary-button" onClick={reset}>
              {t('Send another response', 'إرسال رأي آخر')}
            </button>
            <small>{t('From comments to clarity.', 'من الآراء إلى رؤية أوضح.')}</small>
          </section>
        ) : (
          <>
            <div className="survey-intro">
              <div className="business-heading">
                <span className="business-mark">B</span>
                <div>
                  <strong>Bloom & Co.</strong>
                  <span>
                    {t('Customer experience survey · Cairo', 'استبيان تجربة العملاء · القاهرة')}
                  </span>
                </div>
                <span className="time-badge">{t('~ 2 min', 'دقيقتان تقريبًا')}</span>
              </div>
              <h1>{t('Share your feedback', 'شاركنا رأيك')}</h1>
              <p>
                {t(
                  'Your feedback helps us make every experience better.',
                  'رأيك يساعدنا على تحسين كل تجربة.',
                )}
              </p>
            </div>
            <form
              className="survey-card"
              ref={formRef}
              onSubmit={submit}
              noValidate
              aria-label={t('Share your feedback', 'شاركنا رأيك')}
            >
              <fieldset className="question">
                <legend>
                  <span className="question-number">01</span>
                  {t('Question 1', 'سؤال ١')}
                  <span className="required">*</span>
                </legend>
                <p className="helper">{t('Select your star rating.', 'اختر تقييمك بالنجوم.')}</p>
                <div
                  className="star-rating"
                  role="radiogroup"
                  aria-label={t('Star rating', 'تقييم بالنجوم')}
                  aria-describedby="star-rating-label"
                  style={{
                    '--rating-color': score <= 2 ? '#dc6672' : score === 3 ? '#d3aa18' : '#269578',
                  }}
                >
                  {labels.map((label, i) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={score === i + 1}
                      aria-invalid={!!errors.score}
                      aria-label={i + 1 + ' · ' + label}
                      className={i < score ? 'filled' : ''}
                      key={i}
                      onClick={() => {
                        setScore(i + 1);
                        setErrors((v) => ({ ...v, score: '' }));
                      }}
                      onKeyDown={(e) => {
                        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                          e.preventDefault();
                          const direction = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1;
                          const n = (i + direction + 5) % 5;
                          setScore(n + 1);
                          e.currentTarget.parentElement.children[n].focus();
                        }
                      }}
                    >
                      <Icon name="star" size={32} />
                    </button>
                  ))}
                </div>
                <p className="star-rating-label" id="star-rating-label" aria-live="polite">
                  {score
                    ? score + ' / 5 · ' + labels[score - 1]
                    : t('Choose a rating', 'اختر تقييمًا')}
                </p>
                {errors.score && (
                  <p id="score-error" className="error" role="alert">
                    {errors.score}
                  </p>
                )}
              </fieldset>
              <fieldset className="question">
                <legend>
                  <span className="question-number">02</span>
                  {t('Question 2', 'سؤال ٢')}
                  <span className="required">*</span>
                </legend>
                <p className="helper">{t('Choose one answer.', 'اختر إجابة واحدة.')}</p>
                <div
                  className="single-options"
                  role="radiogroup"
                  aria-label={t('Single choice', 'اختيار واحد')}
                >
                  {[1, 2, 3].map((n) => (
                    <label
                      className={'single-option ' + (service === 'option' + n ? 'selected' : '')}
                      key={n}
                    >
                      <input
                        type="radio"
                        name="single-choice"
                        value={'option' + n}
                        checked={service === 'option' + n}
                        aria-invalid={!!errors.service}
                        onChange={(e) => {
                          setService(e.target.value);
                          setErrors((v) => ({ ...v, service: '' }));
                        }}
                      />
                      <span>{t('Option ', 'اختيار ') + n}</span>
                    </label>
                  ))}
                </div>
                {errors.service && (
                  <p className="error" role="alert">
                    {errors.service}
                  </p>
                )}
              </fieldset>
              <fieldset className="question">
                <legend>
                  <span className="question-number">03</span>
                  {t('Question 3', 'سؤال ٣')}
                </legend>
                <p className="helper">
                  {t(
                    'Choose all that apply. This question is optional.',
                    'يمكنك اختيار أكثر من إجابة. هذا السؤال اختياري.',
                  )}
                </p>
                <div className="multiple-options">
                  {[1, 2, 3, 4]
                    .map((n) => ['option' + n, t('Option ', 'اختيار ') + n])
                    .map(([id, label]) => (
                      <label
                        className={'multiple-option ' + (topics.includes(id) ? 'selected' : '')}
                        key={id}
                      >
                        <input
                          type="checkbox"
                          checked={topics.includes(id)}
                          onChange={(e) =>
                            setTopics((prev) =>
                              e.target.checked ? [...prev, id] : prev.filter((v) => v !== id),
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                </div>
              </fieldset>
              <fieldset className="question">
                <legend>
                  <span className="question-number">04</span>
                  {t('Question 4', 'سؤال ٤')}
                </legend>
                <p className="helper">
                  {t(
                    'Choose a score from 0 to 10. This question is optional.',
                    'اختر تقييمًا من ٠ إلى ١٠. هذا السؤال اختياري.',
                  )}
                </p>
                <div
                  className="nps-options"
                  style={{ '--nps-color': '#1e68ef' }}
                  role="radiogroup"
                  aria-label={t(
                    'Likelihood to recommend, from zero to ten',
                    'احتمالية الترشيح من صفر إلى عشرة',
                  )}
                >
                  {Array.from({ length: 11 }, (_, n) => (
                    <button
                      type="button"
                      role="radio"
                      key={n}
                      aria-label={t('Score ', 'تقييم ') + n}
                      aria-checked={nps === n}
                      className={nps === n ? 'selected' : ''}
                      onClick={() => setNps(n)}
                      onKeyDown={(e) => {
                        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                          e.preventDefault();
                          let direction = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1;
                          let next = (n + direction + 11) % 11;
                          setNps(next);
                          e.currentTarget.parentElement.children[next].focus();
                        }
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="nps-labels">
                  <span>{t('Not at all likely', 'غير محتمل إطلاقًا')}</span>
                  <span>{t('Extremely likely', 'محتمل جدًا')}</span>
                </div>
              </fieldset>
              <div className="question">
                <label className="text-label" htmlFor="feedback">
                  <span className="question-number">05</span>
                  {t('Question 5', 'سؤال ٥')}
                  <span className="required">*</span>
                </label>
                <p className="helper">
                  {t('Write your answer in the space below.', 'اكتب إجابتك في المساحة التالية.')}
                </p>
                <textarea
                  id="feedback"
                  value={feedback}
                  maxLength={1000}
                  rows={4}
                  aria-invalid={!!errors.feedback}
                  aria-describedby={errors.feedback ? 'feedback-error' : 'feedback-hint'}
                  placeholder={t('Your answer…', 'إجابتك…')}
                  onChange={(e) => {
                    setFeedback(e.target.value);
                    if (e.target.value.trim().length >= 10)
                      setErrors((v) => ({ ...v, feedback: '' }));
                  }}
                />
                <div className="textarea-meta">
                  <small id="feedback-hint">
                    {t(
                      'Please avoid sharing private or sensitive details.',
                      'يرجى عدم مشاركة بيانات خاصة أو حساسة.',
                    )}
                  </small>
                  <span>{feedback.length}/1000</span>
                </div>
                {errors.feedback && (
                  <p id="feedback-error" className="error" role="alert">
                    {errors.feedback}
                  </p>
                )}
              </div>
              <div className="consent-section">
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={agree}
                    aria-invalid={!!errors.agree}
                    onChange={(e) => {
                      setAgree(e.target.checked);
                      setErrors((v) => ({ ...v, agree: '' }));
                    }}
                  />
                  <span>
                    {t(
                      'I agree to share this answer with the business.',
                      'أوافق على مشاركة هذه الإجابة مع النشاط التجاري.',
                    )}
                  </span>
                </label>
                {errors.agree && (
                  <p className="error" role="alert">
                    {errors.agree}
                  </p>
                )}
                <button className="primary-button" type="submit" disabled={state === 'sending'}>
                  {state === 'sending' ? (
                    <>
                      <span className="spinner" />
                      {t('Sending…', 'جارٍ الإرسال…')}
                    </>
                  ) : (
                    <>
                      <Icon name="send" size={18} />
                      {t('Send feedback', 'إرسال الرأي')}
                    </>
                  )}
                </button>
                <p className="privacy-note">
                  <Icon name="lock" size={13} />
                  {t(
                    'Your feedback is shared privately with Bloom & Co.',
                    'تتم مشاركة رأيك بشكل خاص مع Bloom & Co.',
                  )}
                </p>
              </div>
            </form>
          </>
        )}
      </main>
      <footer className="public-footer">
        <span>
          {t('Powered by', 'بدعم من')} <img src="/assets/brand/nuvia-logo.svg" alt="NUVIA" />
        </span>
        <span>{t('Every voice matters.', 'كل رأي له قيمة.')}</span>
      </footer>
    </div>
  );
}

function ConnectedPublicFeedback({ token, language = 'en', setLanguage }) {
  const sourceChannel =
    new URLSearchParams(location.hash.split('?')[1]).get('channel') === 'qr' ? 'qr' : 'link';
  const startStorageKey = 'nuvia-public-start:' + token;
  const startId = useRef(null),
    startRequest = useRef(null);
  if (!startId.current) {
    try {
      startId.current = sessionStorage.getItem(startStorageKey) || crypto.randomUUID();
      sessionStorage.setItem(startStorageKey, startId.current);
    } catch {
      startId.current = crypto.randomUUID();
    }
  }
  const begin = () => {
    if (!startRequest.current)
      startRequest.current = productApi
        .send('/public/surveys/' + encodeURIComponent(token) + '/start', {
          startId: startId.current,
          channel: sourceChannel,
        })
        .then(() => true)
        .catch(() => {
          startRequest.current = null;
          return false;
        });
    return startRequest.current;
  };

  const [locale, setLocale] = useState(language),
    [resource, setResource] = useState({ loading: true }),
    [values, setValues] = useState({}),
    [errors, setErrors] = useState({}),
    [consent, setConsent] = useState(false),
    [respondent, setRespondent] = useState({ name: '', email: '' }),
    [complete, setComplete] = useState(false);
  const formRef = useRef(null),
    successRef = useRef(null),
    requestKey = useRef(crypto.randomUUID());
  const mutation = useMutation(),
    ar = locale === 'ar',
    t = (en, arabic) => (ar ? arabic : en);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setResource({ loading: true });
    productApi.publicSurvey(token, controller.signal).then(
      (data) => {
        if (current) {
          setResource({ data });
        }
      },
      (error) => {
        if (current && error.name !== 'AbortError') setResource({ error });
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [token]);
  useEffect(() => {
    const languages = resource.data?.survey?.enabledLanguages;
    if (languages?.length && !languages.includes(locale)) {
      setLocale(languages[0]);
      setLanguage?.(languages[0]);
    }
  }, [resource.data, locale, setLanguage]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
  }, [locale, ar]);
  useEffect(() => {
    if (complete) successRef.current?.focus();
  }, [complete]);
  const change = (q, value) => {
    setValues((old) => ({ ...old, [q.id]: value }));
    setErrors((old) => ({ ...old, [q.id]: null }));
  };
  const business = resource.data?.business?.name || '',
    survey = resource.data?.survey;
  async function submit(event) {
    event.preventDefault();
    if (mutation.busy) return;
    const invalid = validateAnswers(survey.questions, values);
    if (!consent) invalid.consent = 'required';
    if (
      survey.anonymous === false &&
      respondent.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respondent.email.trim())
    )
      invalid.respondentEmail = 'invalid';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    const answers = survey.questions
      .filter((q) => values[q.id] !== undefined && values[q.id] !== '')
      .map((q) => ({
        questionId: q.id,
        value: ['rating', 'nps'].includes(q.type) ? Number(values[q.id]) : values[q.id],
      }));
    const started = await begin();
    const result = await mutation.run((signal) =>
      productApi.submitResponse(
        token,
        {
          answers,
          locale,
          idempotencyKey: requestKey.current,
          consent: true,
          sourceChannel,
          ...(survey.anonymous === false && (respondent.name.trim() || respondent.email.trim())
            ? {
                respondent: Object.fromEntries(
                  Object.entries(respondent)
                    .filter(([, value]) => value.trim())
                    .map(([key, value]) => [key, value.trim()]),
                ),
              }
            : {}),
          ...(started ? { startId: startId.current } : {}),
        },
        signal,
      ),
    );
    if (result) {
      setComplete(true);
      try {
        sessionStorage.removeItem(startStorageKey);
      } catch {
        /* Anonymous tracking can work without browser storage. */
      }
    }
  }
  return (
    <div className="public-page">
      <header className="public-header">
        <img className="brand" src="/assets/brand/nuvia-logo.svg" alt="NUVIA" />
        <button
          className="language-control"
          disabled={resource.data?.survey?.enabledLanguages?.length === 1}
          aria-label={t('Switch to Arabic', 'Switch to English')}
          onClick={() => {
            const next = ar ? 'en' : 'ar';
            setLocale(next);
            setLanguage?.(next);
          }}
        >
          <Icon name="globe" />
          <span>{ar ? 'English' : 'العربية'}</span>
        </button>
      </header>
      <main>
        {resource.loading ? (
          <section className="survey-card" role="status">
            {t('Loading survey…', 'جارٍ تحميل الاستبيان…')}
          </section>
        ) : resource.error ? (
          <section className="survey-card">
            <h1>{t('This survey is unavailable', 'هذا الاستبيان غير متاح')}</h1>
            <p>
              {t(
                'The link may be closed or no longer active.',
                'قد يكون الرابط مغلقًا أو غير نشط.',
              )}
            </p>
          </section>
        ) : complete ? (
          <section className="success-card" aria-labelledby="thank-you">
            <span className="success-icon">
              <Icon name="check" size={38} />
            </span>
            <span className="eyebrow">{business}</span>
            <h1 id="thank-you" ref={successRef} tabIndex={-1}>
              {t('Thank you for your feedback', 'شكرًا لمشاركتنا رأيك')}
            </h1>
            <p>
              {t(
                'Your response has been saved. Your voice helps us create better experiences.',
                'تم حفظ ردك. رأيك يساعدنا في تقديم تجربة أفضل.',
              )}
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                setComplete(false);
                setValues({});
                setConsent(false);
                setRespondent({ name: '', email: '' });
                setErrors({});
                requestKey.current = crypto.randomUUID();
                startId.current = crypto.randomUUID();
                startRequest.current = null;
              }}
            >
              {t('Send another response', 'إرسال رأي آخر')}
            </button>
            <small>{t('From comments to clarity.', 'من الآراء إلى رؤية أوضح.')}</small>
          </section>
        ) : (
          <>
            <div className="survey-intro">
              <div className="business-heading">
                <span className="business-mark">{business.slice(0, 1)}</span>
                <div>
                  <strong>{business}</strong>
                  <span>
                    {survey.title} · {resource.data.branch.name}
                  </span>
                </div>
                <span className="time-badge">{t('~ 2 min', 'دقيقتان تقريبًا')}</span>
              </div>
              <h1>{t('Share your feedback', 'شاركنا رأيك')}</h1>
              <p>
                {survey.description ||
                  t(
                    'Your feedback helps us make every experience better.',
                    'رأيك يساعدنا على تحسين كل تجربة.',
                  )}
              </p>
            </div>
            <form
              className="survey-card"
              ref={formRef}
              onSubmit={submit}
              onInputCapture={begin}
              onClickCapture={begin}
              noValidate
              aria-label={t('Share your feedback', 'شاركنا رأيك')}
            >
              {survey.questions.map((q, index) => {
                const label = q.labelTranslations?.[locale] || q.label;
                const optionLabel = (option, i) => q.optionTranslations?.[locale]?.[i] || option;
                return (
                  <fieldset className="question" key={q.id}>
                    <legend>
                      <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
                      {label}
                      {q.required && <span className="required">*</span>}
                    </legend>
                    {q.type === 'rating' ? (
                      <>
                        <p className="helper">
                          {t('Select your star rating.', 'اختر تقييمك بالنجوم.')}
                        </p>
                        <div
                          className="star-rating"
                          role="radiogroup"
                          aria-label={label}
                          style={{
                            '--rating-color':
                              Number(values[q.id]) <= 2
                                ? '#dc6672'
                                : Number(values[q.id]) === 3
                                  ? '#d3aa18'
                                  : '#269578',
                          }}
                        >
                          {Array.from({ length: q.ratingMax || 5 }, (_, i) => (
                            <button
                              type="button"
                              role="radio"
                              key={i}
                              aria-checked={values[q.id] === i + 1}
                              aria-invalid={!!errors[q.id]}
                              aria-label={String(i + 1)}
                              className={i < Number(values[q.id]) ? 'filled' : ''}
                              onClick={() => change(q, i + 1)}
                              onKeyDown={(e) => {
                                if (
                                  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                                    e.key,
                                  )
                                ) {
                                  e.preventDefault();
                                  const direction = ['ArrowRight', 'ArrowDown'].includes(e.key)
                                    ? 1
                                    : -1;
                                  const count = q.ratingMax || 5;
                                  const next = (i + direction + count) % count;
                                  change(q, next + 1);
                                  e.currentTarget.parentElement.children[next].focus();
                                }
                              }}
                            >
                              <Icon name="star" size={32} />
                            </button>
                          ))}
                        </div>
                        <p className="star-rating-label" aria-live="polite">
                          {values[q.id]
                            ? values[q.id] + ' / ' + (q.ratingMax || 5)
                            : t('Choose a rating', 'اختر تقييمًا')}
                        </p>
                      </>
                    ) : q.type === 'nps' ? (
                      <>
                        <p className="helper">
                          {t('Choose a score from 0 to 10.', 'اختر تقييمًا من صفر إلى عشرة.')}
                        </p>
                        <div
                          className="nps-options"
                          role="radiogroup"
                          aria-label={label}
                          style={{ '--nps-color': '#1e68ef' }}
                        >
                          {Array.from({ length: 11 }, (_, n) => (
                            <button
                              type="button"
                              role="radio"
                              key={n}
                              aria-checked={values[q.id] === n}
                              aria-invalid={!!errors[q.id]}
                              className={values[q.id] === n ? 'selected' : ''}
                              onClick={() => change(q, n)}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <div className="nps-labels">
                          <span>{t('Not at all likely', 'غير محتمل إطلاقًا')}</span>
                          <span>{t('Extremely likely', 'محتمل جدًا')}</span>
                        </div>
                      </>
                    ) : ['single_choice', 'multiple_choice'].includes(q.type) ? (
                      <>
                        <p className="helper">
                          {q.type === 'single_choice'
                            ? t('Choose one answer.', 'اختر إجابة واحدة.')
                            : t('Choose all that apply.', 'اختر كل ما ينطبق.')}
                        </p>
                        <div
                          className={
                            q.type === 'single_choice' ? 'single-options' : 'multiple-options'
                          }
                        >
                          {q.options.map((option, i) => {
                            const checked =
                              q.type === 'single_choice'
                                ? values[q.id] === option
                                : (values[q.id] || []).includes(option);
                            return (
                              <label
                                className={
                                  (q.type === 'single_choice'
                                    ? 'single-option '
                                    : 'multiple-option ') + (checked ? 'selected' : '')
                                }
                                key={option}
                              >
                                <input
                                  type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
                                  name={q.id}
                                  checked={checked}
                                  aria-invalid={!!errors[q.id]}
                                  onChange={(e) =>
                                    change(
                                      q,
                                      q.type === 'single_choice'
                                        ? option
                                        : e.target.checked
                                          ? [...(values[q.id] || []), option]
                                          : (values[q.id] || []).filter((v) => v !== option),
                                    )
                                  }
                                />
                                <span>{optionLabel(option, i)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="helper">
                          {t(
                            'Write your answer in the space below.',
                            'اكتب إجابتك في المساحة التالية.',
                          )}
                        </p>
                        <textarea
                          aria-label={label}
                          value={values[q.id] || ''}
                          maxLength={q.type === 'short_text' ? 500 : 10000}
                          rows={q.type === 'short_text' ? 2 : 4}
                          aria-invalid={!!errors[q.id]}
                          aria-describedby={errors[q.id] ? 'error-' + q.id : undefined}
                          placeholder={t('Your answer…', 'إجابتك…')}
                          onChange={(e) => change(q, e.target.value)}
                        />
                        <div className="textarea-meta">
                          <small>
                            {t(
                              'Please avoid sharing private or sensitive details.',
                              'يرجى عدم مشاركة بيانات خاصة أو حساسة.',
                            )}
                          </small>
                          <span>
                            {(values[q.id] || '').length}/{q.type === 'short_text' ? 500 : 10000}
                          </span>
                        </div>
                      </>
                    )}
                    {errors[q.id] && (
                      <p className="error" id={'error-' + q.id} role="alert">
                        {t('Please provide a valid answer.', 'يرجى إدخال إجابة صحيحة.')}
                      </p>
                    )}
                  </fieldset>
                );
              })}
              {survey.anonymous === false && (
                <section className="question">
                  <p
                    className="text-label"
                    role="heading"
                    aria-level={2}
                    style={{ letterSpacing: 'normal' }}
                  >
                    {t('Contact details (optional)', 'بيانات التواصل (اختياري)')}
                  </p>
                  <p className="helper">
                    {t(
                      'You may leave your details if you would like the business to contact you.',
                      'يمكنك ترك بياناتك إذا أردت أن يتواصل معك النشاط التجاري.',
                    )}
                  </p>
                  <Field
                    name="respondent-name"
                    label={t('Name', 'الاسم')}
                    value={respondent.name}
                    onChange={(event) =>
                      setRespondent((old) => ({ ...old, name: event.target.value.slice(0, 120) }))
                    }
                  />
                  <Field
                    name="respondent-email"
                    type="email"
                    label={t('Email', 'البريد الإلكتروني')}
                    value={respondent.email}
                    onChange={(event) => {
                      setRespondent((old) => ({ ...old, email: event.target.value.slice(0, 254) }));
                      setErrors((old) => ({ ...old, respondentEmail: null }));
                    }}
                    error={
                      errors.respondentEmail
                        ? t('Enter a valid email.', 'أدخل بريدًا صالحًا.')
                        : undefined
                    }
                  />
                </section>
              )}
              <div className="consent-section">
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    aria-invalid={!!errors.consent}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      setErrors((old) => ({ ...old, consent: null }));
                    }}
                  />
                  <span>
                    {t(
                      survey.anonymous === false
                        ? 'I agree to share these answers and any contact details I provide with the business.'
                        : 'I agree to share these answers with the business.',
                      survey.anonymous === false
                        ? 'أوافق على مشاركة هذه الإجابات وأي بيانات تواصل أقدمها مع النشاط التجاري.'
                        : 'أوافق على مشاركة هذه الإجابات مع النشاط التجاري.',
                    )}
                  </span>
                </label>
                {errors.consent && (
                  <p className="error" role="alert">
                    {t('Your agreement is required.', 'موافقتك مطلوبة.')}
                  </p>
                )}
                {mutation.error && (
                  <p className="error" role="alert">
                    {t(
                      'Could not save your response. Please try again.',
                      'تعذر حفظ ردك. حاول مرة أخرى.',
                    )}
                  </p>
                )}
                <button className="primary-button" type="submit" disabled={mutation.busy}>
                  {mutation.busy ? (
                    <>
                      <span className="spinner" />
                      {t('Sending…', 'جارٍ الإرسال…')}
                    </>
                  ) : (
                    <>
                      <Icon name="send" size={18} />
                      {t('Send feedback', 'إرسال الرأي')}
                    </>
                  )}
                </button>
                <p className="privacy-note">
                  <Icon name="lock" size={13} />
                  {t('Your feedback is shared privately with ', 'تتم مشاركة رأيك بشكل خاص مع ')}
                  {business}.
                </p>
              </div>
            </form>
          </>
        )}
      </main>
      <footer className="public-footer">
        <span>
          {t('Powered by', 'بدعم من')}
          <img src="/assets/brand/nuvia-logo.svg" alt="NUVIA" />
        </span>
        <span>{t('Every voice matters.', 'كل رأي له قيمة.')}</span>
      </footer>
    </div>
  );
}
