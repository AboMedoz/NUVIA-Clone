import React from 'react';
import AutoGrowTextarea from '../../components/ui/AutoGrowTextarea.jsx';
import { questionTypes } from '../product/product-state.js';
import { DraftQuestionPreview } from './SurveyDraftPreview.jsx';

export default function SurveyQuestionEditor({
  draft,
  language,
  editable,
  busy,
  selectedId,
  onSelect,
  onQuestionChange,
  onQuestionsChange,
  onAdd,
  onDetails,
  onPreview,
  focusField,
}) {
  const t = (en, ar) => (language === 'ar' ? ar : en);
  const selected = draft.questions.find((q) => q.id === selectedId) || draft.questions[0];
  const types = {
    short_text: t('Short text', 'نص قصير'),
    long_text: t('Long text', 'نص طويل'),
    single_choice: t('Single choice', 'اختيار واحد'),
    multiple_choice: t('Multiple choice', 'اختيارات متعددة'),
    rating: t('Rating (1–5)', 'تقييم (١–٥)'),
    nps: t('Recommendation (0–10)', 'التوصية (٠–١٠)'),
  };
  const selectType = (type) =>
    onQuestionsChange(
      draft.questions.map((q) => {
        if (q.id !== selected.id) return q;
        const next = { ...q, type };
        if (['single_choice', 'multiple_choice'].includes(type))
          next.options = q.options || ['', ''];
        else delete next.options;
        if (!['single_choice', 'multiple_choice', 'rating', 'nps'].includes(type))
          delete next.segment;
        return next;
      }),
    );
  return (
    <div className="wizard-editor-columns">
      <aside className="product-card wizard-outline">
        <h2>{t('Survey outline', 'مخطط الاستبيان')}</h2>
        <ol>
          {draft.questions.map((q, index) => (
            <li key={q.id}>
              <button
                type="button"
                aria-current={selected?.id === q.id ? 'true' : undefined}
                onClick={() => onSelect(q.id)}
              >
                {index + 1}. {q.label || t('Untitled question', 'سؤال بدون عنوان')}
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <div className="wizard-question-cards">
        {draft.questions.map((q, index) => (
          <section
            className="product-card product-question"
            key={q.id}
            data-selected={selected?.id === q.id}
          >
            <header>
              <button
                type="button"
                className="wizard-question-selector"
                aria-label={t(`Edit question ${index + 1}`, `تعديل السؤال ${index + 1}`)}
                aria-expanded={selected?.id === q.id}
                aria-controls={`question-panel-${q.id}`}
                onClick={() => onSelect(q.id)}
              >
                <strong>
                  {t('Question', 'السؤال')} {index + 1}
                </strong>
                <small>
                  {q.label || t('Untitled question', 'سؤال بدون عنوان')} · {types[q.type]}
                </small>
              </button>
              <div className="product-actions">
                <button
                  type="button"
                  disabled={!editable || busy || index === 0}
                  onClick={() => {
                    const list = [...draft.questions];
                    [list[index - 1], list[index]] = [list[index], list[index - 1]];
                    onQuestionsChange(list);
                  }}
                >
                  {t('Move up', 'لأعلى')}
                </button>
                <button
                  type="button"
                  disabled={!editable || busy || draft.questions.length === 1}
                  onClick={() =>
                    onQuestionsChange(draft.questions.filter((item) => item.id !== q.id))
                  }
                >
                  {t('Remove', 'حذف')}
                </button>
              </div>
            </header>
            <div
              id={`question-panel-${q.id}`}
              hidden={selected?.id !== q.id}
              className="wizard-question-panel"
            >
              <fieldset disabled={!editable || busy}>
                <label>
                  {t('Question', 'السؤال')} {index + 1}
                  <input
                    id={`question-${q.id}`}
                    value={q.label}
                    maxLength={500}
                    aria-invalid={focusField === `question-${q.id}` || undefined}
                    onChange={(e) => onQuestionChange(q.id, 'label', e.target.value)}
                  />
                </label>
              </fieldset>
              <DraftQuestionPreview q={q} index={index} language={language} showLegend={false} />
            </div>
          </section>
        ))}
        <button
          id="add-question"
          className="wizard-add-question"
          type="button"
          disabled={!editable || busy || draft.questions.length >= 50}
          onClick={onAdd}
        >
          {t('Add question', 'إضافة سؤال')}
        </button>
      </div>
      <aside className="wizard-settings-column">
        {selected && (
          <section className="product-card wizard-settings">
            <h2>{t('Question settings', 'إعدادات السؤال')}</h2>
            <fieldset disabled={!editable || busy} className="product-form">
              <label>
                {t('Answer type', 'نوع الإجابة')}
                <select value={selected.type} onChange={(e) => selectType(e.target.value)}>
                  {questionTypes.map((type) => (
                    <option key={type} value={type}>
                      {types[type]}
                    </option>
                  ))}
                </select>
              </label>
              {['single_choice', 'multiple_choice'].includes(selected.type) && (
                <label>
                  {t('Options (one per line)', 'الخيارات (كل خيار في سطر)')}
                  <AutoGrowTextarea
                    id={`question-options-${selected.id}`}
                    aria-invalid={focusField === `question-options-${selected.id}` || undefined}
                    value={(selected.options || []).join('\n')}
                    onChange={(e) =>
                      onQuestionChange(selected.id, 'options', e.target.value.split('\n'))
                    }
                  />
                </label>
              )}
              <label className="product-check">
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={(e) => onQuestionChange(selected.id, 'required', e.target.checked)}
                />
                {t('Required answer', 'إجابة مطلوبة')}
              </label>
              {['single_choice', 'multiple_choice', 'rating', 'nps'].includes(selected.type) && (
                <label className="product-check">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.segment)}
                    onChange={(e) => onQuestionChange(selected.id, 'segment', e.target.checked)}
                  />
                  {t('Use answers as a customer segment', 'استخدام الإجابات كشريحة عملاء')}
                </label>
              )}
              {selected.type === 'rating' && (
                <p>{t('Customers select a score from 1 to 5.', 'يختار العميل درجة من ١ إلى ٥.')}</p>
              )}
              {selected.type === 'nps' && (
                <p>
                  {t('Customers select a score from 0 to 10.', 'يختار العميل درجة من ٠ إلى ١٠.')}
                </p>
              )}
            </fieldset>
          </section>
        )}
        <section className="product-card wizard-settings">
          <h2>{t('Survey settings', 'إعدادات الاستبيان')}</h2>
          <p>
            {t('Survey language', 'لغة الاستبيان')}: {draft.locale === 'ar' ? 'العربية' : 'English'}
          </p>
          <p>
            {draft.questions.length} {t('questions', 'أسئلة')}
          </p>
          <p>
            {t(
              'Anonymous responses. No sign-in required.',
              'إجابات بدون هوية. لا يلزم تسجيل الدخول.',
            )}
          </p>
          <button type="button" onClick={onDetails}>
            {t('Edit survey details', 'تعديل تفاصيل الاستبيان')}
          </button>
          <button id="survey-mobile-preview" type="button" onClick={onPreview}>
            {t('Preview on mobile', 'معاينة على الهاتف')}
          </button>
        </section>
      </aside>
    </div>
  );
}
