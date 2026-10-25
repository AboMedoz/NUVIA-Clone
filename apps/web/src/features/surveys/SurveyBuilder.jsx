import React, { useEffect, useRef, useState } from 'react';
import AutoGrowTextarea from '../../components/ui/AutoGrowTextarea.jsx';
import { productApi } from '../product/api.js';
import { canManage } from '../product/product-state.js';
import { useMutation, useResource } from '../product/useResource.js';
import { ErrorNotice, ResourceState } from '../product/ui.jsx';
import AiTaskState from '../product/AiTaskState.jsx';
import SurveySharing from './SurveySharing.jsx';
import SurveyDraftPreview from './SurveyDraftPreview.jsx';
import './survey-wizard.css';
import SurveyQuestionEditor from './SurveyQuestionEditor.jsx';
const freshQuestion = () => ({
  id: crypto.randomUUID(),
  type: 'long_text',
  label: '',
  required: true,
});
export default function SurveyBuilder({ language, workspace }) {
  const ar = language === 'ar',
    t = (en, arabic) => (ar ? arabic : en);
  const id = new URLSearchParams(location.hash.split('?')[1]).get('id');
  const templates = useResource('/survey-templates');
  const [draft, setDraft] = useState({
      title: '',
      description: '',
      locale: language,
      questions: [freshQuestion()],
    }),
    [loading, setLoading] = useState(Boolean(id)),
    [loadError, setLoadError] = useState(null),
    [validation, setValidation] = useState(''),
    [suggestion, setSuggestion] = useState(null),
    [goal, setGoal] = useState(''),
    [step, setStep] = useState(1),
    [savedSurvey, setSavedSurvey] = useState(null),
    [previewOpen, setPreviewOpen] = useState(false),
    [focusField, setFocusField] = useState(''),
    [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const save = useMutation(),
    suggest = useMutation();
  const suggestionLocale = useRef(draft.locale);
  const suggestionGeneration = useRef(0);
  useEffect(() => {
    suggestionLocale.current = draft.locale;
    suggestionGeneration.current += 1;
    setSuggestion(null);
  }, [draft.locale]);
  async function requestSuggestion() {
    const requestedLocale = draft.locale;
    const generation = ++suggestionGeneration.current;
    setSuggestion(null);
    const result = await suggest.run((signal) =>
      productApi.send(
        '/surveys/suggest',
        { businessType: workspace?.industry || 'other', goal, locale: requestedLocale },
        'POST',
        signal,
      ),
    );
    if (
      result &&
      generation === suggestionGeneration.current &&
      suggestionLocale.current === requestedLocale
    )
      setSuggestion({ ...result, requestedLocale });
  }
  useEffect(() => {
    if (!id || savedSurvey?.id === id) return;
    let current = true;
    const controller = new AbortController();
    productApi.get('/surveys/' + encodeURIComponent(id), controller.signal).then(
      (data) => {
        if (current) {
          setDraft(data.survey);
          setSavedSurvey(data.survey);
          setLoading(false);
        }
      },
      (error) => {
        if (current) {
          setLoadError(error);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [id, savedSurvey?.id]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  const update = (key, value) => {
    if (key === 'locale') {
      suggestionLocale.current = value;
      suggestionGeneration.current += 1;
      setSuggestion(null);
    }
    setValidation('');
    setFocusField('');
    setDraft((old) => ({ ...old, [key]: value }));
  };
  const question = (qid, key, value) => {
    setValidation('');
    setFocusField('');
    setDraft((old) => ({
      ...old,
      questions: old.questions.map((q) => (q.id === qid ? { ...q, [key]: value } : q)),
    }));
  };
  function applyTemplate(template) {
    suggestionLocale.current = template.locale || draft.locale;
    suggestionGeneration.current += 1;
    setSuggestion(null);
    setSelectedQuestionId(null);
    setValidation('');
    setFocusField('');
    setDraft((old) => ({
      ...old,
      title: template.title,
      description: template.description || '',
      locale: template.locale || old.locale,
      questions: template.questions.map((q) => ({ ...q, id: crypto.randomUUID() })),
    }));
  }
  useEffect(() => {
    if (focusField) document.getElementById(focusField)?.focus();
  }, [focusField, step, validation, selectedQuestionId]);
  function invalid(field, message, targetStep) {
    setStep(targetStep);
    if (targetStep === 2) {
      const q = draft.questions.find(
        (item) => field === 'question-' + item.id || field === 'question-options-' + item.id,
      );
      if (q) setSelectedQuestionId(q.id);
    }
    setValidation(message);
    setFocusField(field);
    return false;
  }
  function detailsValid() {
    if (!draft.title.trim())
      return invalid('survey-title', t('Add a survey title.', 'أضف عنوان الاستبيان.'), 1);
    if (draft.title.trim().length > 120)
      return invalid(
        'survey-title',
        t('Use a title of 120 characters or fewer.', 'استخدم عنوانًا من ١٢٠ حرفًا أو أقل.'),
        1,
      );
    return true;
  }
  function draftValid() {
    if (!detailsValid()) return false;
    const missing = draft.questions.find(
      (q) =>
        !q.label.trim() ||
        (['single_choice', 'multiple_choice'].includes(q.type) &&
          (!q.options ||
            q.options.length < 2 ||
            q.options.length > 30 ||
            q.options.some((o) => !o.trim() || o.trim().length > 200) ||
            new Set(q.options.map((o) => o.trim())).size !== q.options.length)),
    );
    if (!draft.questions.length || missing)
      return invalid(
        missing
          ? (!missing.label.trim() ? 'question-' : 'question-options-') + missing.id
          : 'add-question',
        t(
          'Add question labels and 2–30 unique choice options.',
          'أضف نصوص الأسئلة ومن ٢ إلى ٣٠ خيارًا غير مكرر.',
        ),
        2,
      );
    return true;
  }
  function toQuestions() {
    if (!detailsValid()) return;
    setValidation('');
    setFocusField('');
    setStep(2);
  }
  async function saveDraft(exit = true) {
    if (!canManage(workspace) || save.busy || !draftValid()) return;
    setValidation('');
    setFocusField('');
    const surveyId = savedSurvey?.id || id;
    const body = {
      title: draft.title,
      description: draft.description,
      locale: draft.locale,
      questions: draft.questions,
      ...(surveyId ? { revision: draft.revision } : {}),
    };
    const result = await save.run((signal) =>
      productApi.send(
        '/surveys' + (surveyId ? '/' + encodeURIComponent(surveyId) : ''),
        body,
        surveyId ? 'PATCH' : 'POST',
        signal,
      ),
    );
    if (result?.survey) {
      setSavedSurvey(result.survey);
      setDraft(result.survey);
      if (exit) location.hash = '/surveys?selected=' + result.survey.id;
      else {
        history.replaceState(null, '', '#/survey-builder?id=' + result.survey.id);
        setStep(3);
      }
    }
  }
  const submit = (event) => {
    event.preventDefault();
    void saveDraft(true);
  };
  if (loading) return <p role="status">{t('Loading survey…', 'جارٍ تحميل الاستبيان…')}</p>;
  if (loadError) return <ErrorNotice error={loadError} language={language} />;
  const editable = canManage(workspace);
  return (
    <>
      <a className="product-back-link" href="#/surveys">
        {t('← All surveys', 'كل الاستبيانات ←')}
      </a>
      <div className="product-heading">
        <div>
          <h1>
            {step === 3
              ? t('Share survey', 'مشاركة الاستبيان')
              : id
                ? t('Edit survey', 'تعديل الاستبيان')
                : t('Create survey', 'إنشاء استبيان')}
          </h1>
          <p>
            {t(
              'Build a questionnaire your customers can answer in minutes.',
              'صمّم استبيانًا يجيب عنه عملاؤك في دقائق.',
            )}
          </p>
        </div>
        <button type="submit" form="survey-builder-form" disabled={!editable || save.busy}>
          {t('Save as draft', 'حفظ كمسودة')}
        </button>
      </div>
      <nav className="survey-steps" aria-label={t('Survey workflow', 'خطوات الاستبيان')}>
        {[
          t('Survey details', 'تفاصيل الاستبيان'),
          t('Build questions', 'بناء الأسئلة'),
          t('Share survey', 'مشاركة الاستبيان'),
        ].map((label, index) => (
          <button
            key={index}
            type="button"
            aria-current={step === index + 1 ? 'step' : undefined}
            disabled={save.busy || loading}
            onClick={() => {
              if (index === 0) {
                setStep(1);
                setValidation('');
              } else if (index === 1) toQuestions();
              else if (step !== 3) {
                if (!editable && savedSurvey) setStep(3);
                else void saveDraft(false);
              }
            }}
          >
            <span>{step > index + 1 ? '✓' : index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {step === 3 && savedSurvey && (
        <div className="wizard-sharing-step">
          <SurveySharing
            survey={savedSurvey}
            language={language}
            workspace={workspace}
            onChange={(survey) => {
              setSavedSurvey(survey);
              setDraft(survey);
            }}
          />
          <div className="wizard-footer">
            <button type="button" onClick={() => setStep(2)}>
              {t('Back to questions', 'العودة للأسئلة')}
            </button>
            <a className="product-button primary" href="#/surveys">
              {t('Done, back to surveys', 'تم، العودة للاستبيانات')}
            </a>
          </div>
        </div>
      )}
      {id && draft.status === 'published' && (
        <p className="product-notice">
          {t(
            'Saving creates the next revision. Existing links and responses keep their original questions. Publish again to update collection.',
            'الحفظ ينشئ مراجعة جديدة. تحتفظ الروابط والردود بأسئلتها الأصلية؛ انشر مجددًا لتحديث الجمع.',
          )}
        </p>
      )}
      <div
        className={
          step === 1 ? 'survey-builder-layout survey-wizard-details' : 'survey-wizard-questions'
        }
        hidden={step === 3}
      >
        {step === 1 && !id && (
          <section className="product-card survey-templates">
            <h2>{t('Start with a template', 'ابدأ بقالب')}</h2>
            <p>
              {t(
                'Use a ready-made template or start fresh.',
                'استخدم قالبًا جاهزًا أو ابدأ من الصفر.',
              )}
            </p>
            <ResourceState resource={templates} language={language} />
            <div className="product-actions">
              {(templates.data?.templates || []).map((template) => (
                <button
                  key={template.id}
                  disabled={!editable || save.busy}
                  onClick={() => applyTemplate(template)}
                >
                  <span>
                    {template.title || template.name}
                    <small>
                      {template.questions.length} {t('questions', 'أسئلة')} ·{' '}
                      {template.locale === 'ar' ? 'العربية' : 'English'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <form
          id="survey-builder-form"
          onSubmit={submit}
          className="product-form survey-builder-form"
          noValidate
        >
          <fieldset hidden={step !== 1} id="survey-details" disabled={!editable || save.busy}>
            <legend>{t('Survey details', 'تفاصيل الاستبيان')}</legend>
            <div className="product-form">
              <label>
                {t('Survey title', 'عنوان الاستبيان')}
                <input
                  id="survey-title"
                  aria-invalid={focusField === 'survey-title' || undefined}
                  value={draft.title}
                  maxLength={120}
                  onChange={(e) => update('title', e.target.value)}
                />
              </label>
              <label>
                {t('Description', 'الوصف')}
                <AutoGrowTextarea
                  value={draft.description}
                  maxLength={2000}
                  onChange={(e) => update('description', e.target.value)}
                />
              </label>
              <label>
                {t('Survey language', 'لغة الاستبيان')}
                <select value={draft.locale} onChange={(e) => update('locale', e.target.value)}>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
            </div>
          </fieldset>
          {step === 2 && (
            <SurveyQuestionEditor
              draft={draft}
              language={language}
              editable={editable}
              busy={save.busy}
              selectedId={selectedQuestionId}
              focusField={focusField}
              onSelect={(qid) => {
                setSelectedQuestionId(qid);
                setFocusField('question-' + qid);
                setValidation('');
              }}
              onQuestionChange={question}
              onQuestionsChange={(questions) => update('questions', questions)}
              onAdd={() => {
                const q = freshQuestion();
                update('questions', [...draft.questions, q]);
                setSelectedQuestionId(q.id);
                setFocusField('question-' + q.id);
              }}
              onDetails={() => {
                setStep(1);
                setValidation('');
              }}
              onPreview={() => setPreviewOpen((old) => !old)}
            />
          )}
          {step === 2 && previewOpen && (
            <SurveyDraftPreview
              draft={draft}
              language={language}
              onClose={() => {
                setPreviewOpen(false);
                document.getElementById('survey-mobile-preview')?.focus();
              }}
            />
          )}
          {validation && (
            <p className="product-error" role="alert">
              {validation}
            </p>
          )}
          <ErrorNotice error={save.error} language={language} />
          <div className="wizard-footer">
            {step === 1 ? (
              <>
                <a href="#/surveys">{t('Cancel', 'إلغاء')}</a>
                <button className="primary" type="button" onClick={toQuestions}>
                  {t('Continue to questions', 'المتابعة للأسئلة')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setValidation('');
                  }}
                >
                  {t('Back to details', 'العودة للتفاصيل')}
                </button>
                <div className="product-actions">
                  <button type="submit" disabled={!editable || save.busy}>
                    {save.busy ? t('Saving…', 'جارٍ الحفظ…') : t('Save draft', 'حفظ المسودة')}
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={!editable || save.busy}
                    onClick={() => saveDraft(false)}
                  >
                    {t('Continue to sharing', 'المتابعة للمشاركة')}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>
        {step === 1 && (
          <section className="product-card survey-suggestions">
            <h2>{t('Survey suggestions', 'اقتراحات الاستبيان')}</h2>
            <p>
              {t(
                'Suggestions require a configured model. Review and edit any suggestion before publication.',
                'تتطلب الاقتراحات نموذجًا متاحًا. راجع أي اقتراح وعدّله قبل النشر.',
              )}
            </p>
            <div className="product-form">
              <label>
                {t('What would you like to learn?', 'ماذا تريد أن تعرف؟')}
                <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={1000} />
              </label>
              <button
                type="button"
                disabled={!editable || suggest.busy || !goal.trim()}
                onClick={requestSuggestion}
              >
                {t('Suggest questions', 'اقتراح أسئلة')}
              </button>
            </div>
            <ErrorNotice error={suggest.error} language={language} />
            {suggestion &&
            (suggestion.questions ||
              suggestion.survey?.questions ||
              suggestion.suggestions?.questions) ? (
              <button
                disabled={!editable || save.busy || suggestion.requestedLocale !== draft.locale}
                onClick={() =>
                  applyTemplate({
                    ...(suggestion.suggestions ||
                      suggestion.survey || { ...suggestion, title: draft.title }),
                    locale: suggestion.requestedLocale,
                  })
                }
              >
                {t('Use these suggestions', 'استخدام الاقتراحات')}
              </button>
            ) : (
              suggestion && (
                <AiTaskState
                  status={suggestion.status}
                  language={language}
                  busy={suggest.busy}
                  onRetry={editable ? requestSuggestion : undefined}
                />
              )
            )}
          </section>
        )}
      </div>
    </>
  );
}
