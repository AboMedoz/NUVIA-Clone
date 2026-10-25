import React, { useEffect, useRef, useState } from 'react';
import { LanguageMenu } from '../../components/ui/ChoiceMenu.jsx';
import { productApi } from '../product/api.js';
import { validateAnswers } from '../product/product-state.js';
import { useMutation } from '../product/useResource.js';
import { ErrorNotice } from '../product/ui.jsx';
import '../product/product.css';
export default function PublicSurvey({ language, setLanguage }) {
  const token = decodeURIComponent(location.hash.split('?')[0].split('/')[2] || '');
  const [state, setState] = useState({ loading: true }),
    [values, setValues] = useState({}),
    [errors, setErrors] = useState({}),
    [consent, setConsent] = useState(false),
    [complete, setComplete] = useState(false);
  const key = useRef(crypto.randomUUID());
  const mutation = useMutation(),
    ar = language === 'ar',
    t = (en, arabic) => (ar ? arabic : en);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    productApi.publicSurvey(token, controller.signal).then(
      (data) => {
        if (current) setState({ data });
      },
      (error) => {
        if (current && error.name !== 'AbortError') setState({ error });
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [token]);
  const update = (q, value) => setValues((old) => ({ ...old, [q.id]: value }));
  async function submit(event) {
    event.preventDefault();
    const next = validateAnswers(state.data.survey.questions, values);
    if (!consent) next.consent = 'required';
    setErrors(next);
    if (Object.keys(next).length) return;
    const answers = state.data.survey.questions
      .filter((q) => values[q.id] !== undefined && values[q.id] !== '')
      .map((q) => ({
        questionId: q.id,
        value: ['nps', 'rating'].includes(q.type) ? Number(values[q.id]) : values[q.id],
      }));
    const result = await mutation.run((signal) =>
      productApi.submitResponse(
        token,
        { answers, locale: language, idempotencyKey: key.current, consent: true },
        signal,
      ),
    );
    if (result) setComplete(true);
  }
  return (
    <main className="public-feedback" dir={ar ? 'rtl' : 'ltr'}>
      <header>
        <a href="#/landing" className="public-wordmark">
          NUVIA
        </a>
        <LanguageMenu value={language} onChange={setLanguage} />
      </header>
      {state.loading ? (
        <p role="status">{t('Loading survey…', 'جارٍ تحميل الاستبيان…')}</p>
      ) : state.error ? (
        <>
          <h1>{t('This survey is unavailable', 'هذا الاستبيان غير متاح')}</h1>
          <p>
            {t('The link may be closed or no longer active.', 'قد يكون الرابط مغلقًا أو غير نشط.')}
          </p>
        </>
      ) : complete ? (
        <section className="product-card public-confirmation">
          <h1>{t('Thank you for your feedback', 'شكرًا لمشاركتك رأيك')}</h1>
          <p>{t('Your response has been saved.', 'تم حفظ ردك بنجاح.')}</p>
        </section>
      ) : (
        <form onSubmit={submit} className="product-card public-questionnaire" noValidate>
          <p className="product-eyebrow">
            {state.data.business?.name} · {state.data.branch?.name}
          </p>
          <h1>{state.data.survey.title}</h1>
          <p>{state.data.survey.description}</p>
          {state.data.survey.questions.map((q) => (
            <fieldset key={q.id} className="public-question">
              <legend>
                {q.label}
                {q.required ? ' *' : ''}
              </legend>
              {['single_choice', 'multiple_choice'].includes(q.type) ? (
                q.options.map((option) => (
                  <label className="product-check" key={option}>
                    <input
                      type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
                      name={q.id}
                      checked={
                        q.type === 'single_choice'
                          ? values[q.id] === option
                          : (values[q.id] || []).includes(option)
                      }
                      onChange={(e) =>
                        update(
                          q,
                          q.type === 'single_choice'
                            ? option
                            : e.target.checked
                              ? [...(values[q.id] || []), option]
                              : (values[q.id] || []).filter((v) => v !== option),
                        )
                      }
                    />
                    {option}
                  </label>
                ))
              ) : q.type === 'long_text' ? (
                <textarea
                  aria-label={q.label}
                  value={values[q.id] || ''}
                  maxLength={10000}
                  onChange={(e) => update(q, e.target.value)}
                />
              ) : ['rating', 'nps'].includes(q.type) ? (
                <select
                  aria-label={q.label}
                  value={values[q.id] ?? ''}
                  onChange={(e) => update(q, e.target.value)}
                >
                  <option value="">{t('Choose a score', 'اختر تقييمًا')}</option>
                  {Array.from(
                    { length: q.type === 'nps' ? 11 : 5 },
                    (_, i) => i + (q.type === 'nps' ? 0 : 1),
                  ).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={q.label}
                  value={values[q.id] || ''}
                  maxLength={500}
                  onChange={(e) => update(q, e.target.value)}
                />
              )}
              {errors[q.id] && (
                <p className="product-error" role="alert">
                  {t('Please provide a valid answer.', 'يرجى إدخال إجابة صحيحة.')}
                </p>
              )}
            </fieldset>
          ))}
          <label className="product-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t(
              'I agree to share these answers with this business.',
              'أوافق على مشاركة هذه الإجابات مع هذا النشاط.',
            )}
          </label>
          {errors.consent && (
            <p role="alert">{t('Your agreement is required.', 'موافقتك مطلوبة.')}</p>
          )}
          <ErrorNotice error={mutation.error} language={language} />
          <button className="primary" disabled={mutation.busy}>
            {mutation.busy ? t('Sending…', 'جارٍ الإرسال…') : t('Send feedback', 'إرسال الرأي')}
          </button>
        </form>
      )}
    </main>
  );
}
