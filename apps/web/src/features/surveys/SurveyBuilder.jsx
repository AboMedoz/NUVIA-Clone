import React, { useEffect, useState } from 'react';
import { productApi } from '../product/api.js';
import { canManage, questionTypes } from '../product/product-state.js';
import { useMutation, useResource } from '../product/useResource.js';
import { ErrorNotice, ResourceState } from '../product/ui.jsx';
import AiTaskState from '../product/AiTaskState.jsx';
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
    [goal, setGoal] = useState('');
  const save = useMutation(),
    suggest = useMutation();
  async function requestSuggestion() {
    const result = await suggest.run((signal) =>
      productApi.send(
        '/surveys/suggest',
        { businessType: workspace?.industry || 'other', goal, locale: language },
        'POST',
        signal,
      ),
    );
    if (result) setSuggestion(result);
  }
  useEffect(() => {
    if (!id) return;
    let current = true;
    const controller = new AbortController();
    productApi.get('/surveys/' + encodeURIComponent(id), controller.signal).then(
      (data) => {
        if (current) {
          setDraft(data.survey);
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
  }, [id]);
  const update = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const question = (qid, key, value) =>
    setDraft((old) => ({
      ...old,
      questions: old.questions.map((q) => (q.id === qid ? { ...q, [key]: value } : q)),
    }));
  function applyTemplate(template) {
    setDraft((old) => ({
      ...old,
      title: template.title,
      description: template.description || '',
      locale: template.locale || old.locale,
      questions: template.questions.map((q) => ({ ...q, id: crypto.randomUUID() })),
    }));
  }
  async function submit(event) {
    event.preventDefault();
    if (
      !draft.title.trim() ||
      !draft.questions.length ||
      draft.questions.some(
        (q) =>
          !q.label.trim() ||
          (['single_choice', 'multiple_choice'].includes(q.type) &&
            (!q.options?.length || q.options.some((o) => !o.trim()))),
      )
    ) {
      setValidation(
        t(
          'Add a title, question labels and choice options.',
          'أضف عنوانًا ونصوص الأسئلة والخيارات.',
        ),
      );
      return;
    }
    setValidation('');
    const body = {
      title: draft.title,
      description: draft.description,
      locale: draft.locale,
      questions: draft.questions,
      ...(id ? { revision: draft.revision } : {}),
    };
    const result = await save.run((signal) =>
      productApi.send(
        '/surveys' + (id ? '/' + encodeURIComponent(id) : ''),
        body,
        id ? 'PATCH' : 'POST',
        signal,
      ),
    );
    if (result?.survey) location.hash = '/surveys?selected=' + result.survey.id;
  }
  if (loading) return <p role="status">{t('Loading survey…', 'جارٍ تحميل الاستبيان…')}</p>;
  if (loadError) return <ErrorNotice error={loadError} language={language} />;
  const editable = canManage(workspace);
  const typeNames = {
    short_text: t('Short text', 'نص قصير'),
    long_text: t('Long text', 'نص طويل'),
    single_choice: t('Single choice', 'اختيار واحد'),
    multiple_choice: t('Multiple choice', 'اختيارات متعددة'),
    rating: t('Rating (1–5)', 'تقييم (١–٥)'),
    nps: t('Recommendation (0–10)', 'التوصية (٠–١٠)'),
  };
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{id ? t('Edit survey', 'تعديل الاستبيان') : t('Create survey', 'إنشاء استبيان')}</h1>
          <p>
            {t(
              'Build a questionnaire your customers can answer in minutes.',
              'صمّم استبيانًا يجيب عنه عملاؤك في دقائق.',
            )}
          </p>
        </div>
        <a href="#/surveys">{t('Back to surveys', 'العودة للاستبيانات')}</a>
      </div>
      {id && draft.status === 'published' && (
        <p className="product-notice">
          {t(
            'Saving creates the next revision. Existing links and responses keep their original questions. Publish again to update collection.',
            'الحفظ ينشئ مراجعة جديدة. تحتفظ الروابط والردود بأسئلتها الأصلية؛ انشر مجددًا لتحديث الجمع.',
          )}
        </p>
      )}
      <div className="survey-builder-layout">
        {!id && (
          <section className="product-card survey-templates">
            <h2>{t('Start with a template', 'ابدأ بقالب')}</h2>
            <ResourceState resource={templates} language={language} />
            <div className="product-actions">
              {(templates.data?.templates || []).map((template) => (
                <button
                  key={template.id}
                  disabled={!editable}
                  onClick={() => applyTemplate(template)}
                >
                  {template.title || template.name}
                </button>
              ))}
            </div>
          </section>
        )}
        <form onSubmit={submit} className="product-form survey-builder-form">
          <fieldset disabled={!editable || save.busy}>
            <legend>{t('Survey details', 'تفاصيل الاستبيان')}</legend>
            <div className="product-form">
              <label>
                {t('Survey title', 'عنوان الاستبيان')}
                <input
                  value={draft.title}
                  maxLength={160}
                  onChange={(e) => update('title', e.target.value)}
                />
              </label>
              <label>
                {t('Description', 'الوصف')}
                <textarea
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
          {draft.questions.map((q, index) => (
            <section className="product-card product-question" key={q.id}>
              <header>
                <h2>
                  {t('Question', 'السؤال')} {index + 1}
                </h2>
                <div className="product-actions">
                  <button
                    type="button"
                    disabled={!editable || index === 0}
                    onClick={() => {
                      const list = [...draft.questions];
                      [list[index - 1], list[index]] = [list[index], list[index - 1]];
                      update('questions', list);
                    }}
                  >
                    {t('Move up', 'لأعلى')}
                  </button>
                  <button
                    type="button"
                    disabled={!editable || draft.questions.length === 1}
                    onClick={() =>
                      update(
                        'questions',
                        draft.questions.filter((v) => v.id !== q.id),
                      )
                    }
                  >
                    {t('Remove', 'حذف')}
                  </button>
                </div>
              </header>
              <fieldset disabled={!editable || save.busy}>
                <div className="product-form">
                  <label>
                    {t('Question', 'السؤال')} {index + 1}
                    <input
                      value={q.label}
                      maxLength={500}
                      onChange={(e) => question(q.id, 'label', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('Answer type', 'نوع الإجابة')}
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        setDraft((old) => ({
                          ...old,
                          questions: old.questions.map((v) => {
                            if (v.id !== q.id) return v;
                            const next = { ...v, type };
                            if (['single_choice', 'multiple_choice'].includes(type))
                              next.options = v.options || ['', ''];
                            else delete next.options;
                            if (
                              !['single_choice', 'multiple_choice', 'rating', 'nps'].includes(type)
                            )
                              delete next.segment;
                            return next;
                          }),
                        }));
                      }}
                    >
                      {questionTypes.map((type) => (
                        <option key={type} value={type}>
                          {typeNames[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {['single_choice', 'multiple_choice'].includes(q.type) && (
                    <label>
                      {t('Options (one per line)', 'الخيارات (كل خيار في سطر)')}
                      <textarea
                        value={(q.options || []).join('\n')}
                        onChange={(e) => question(q.id, 'options', e.target.value.split('\n'))}
                      />
                    </label>
                  )}
                  <label className="product-check">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => question(q.id, 'required', e.target.checked)}
                    />
                    {t('Required answer', 'إجابة مطلوبة')}
                  </label>
                  {['single_choice', 'multiple_choice', 'rating', 'nps'].includes(q.type) && (
                    <label className="product-check">
                      <input
                        type="checkbox"
                        checked={Boolean(q.segment)}
                        onChange={(e) => question(q.id, 'segment', e.target.checked)}
                      />
                      {t('Use answers as a customer segment', 'استخدام الإجابات كشريحة عملاء')}
                    </label>
                  )}
                </div>
              </fieldset>
            </section>
          ))}
          {validation && (
            <p className="product-error" role="alert">
              {validation}
            </p>
          )}
          <ErrorNotice error={save.error} language={language} />
          <div className="product-actions">
            <button
              type="button"
              disabled={!editable}
              onClick={() => update('questions', [...draft.questions, freshQuestion()])}
            >
              {t('Add question', 'إضافة سؤال')}
            </button>
            <button className="primary" disabled={!editable || save.busy}>
              {save.busy ? t('Saving…', 'جارٍ الحفظ…') : t('Save draft', 'حفظ المسودة')}
            </button>
          </div>
        </form>
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
              onClick={() =>
                applyTemplate(
                  suggestion.suggestions ||
                    suggestion.survey || { ...suggestion, title: draft.title },
                )
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
      </div>
    </>
  );
}
