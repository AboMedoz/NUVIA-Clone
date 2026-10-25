import React, { useEffect, useRef } from 'react';
import AutoGrowTextarea from '../../components/ui/AutoGrowTextarea.jsx';

export default function SurveyDraftPreview({ draft, language, onClose }) {
  const t = (en, ar) => (language === 'ar' ? ar : en);
  const region = useRef(null);
  useEffect(() => {
    region.current?.focus();
    region.current?.scrollIntoView?.({ block: 'start' });
  }, []);
  return (
    <section
      ref={region}
      tabIndex={-1}
      className="product-card wizard-preview"
      aria-label={t('Mobile preview', 'معاينة الهاتف')}
    >
      <header className="product-heading">
        <div>
          <h2>{t('Mobile preview', 'معاينة الهاتف')}</h2>
          <p>
            {t(
              'Preview only. Answers cannot be submitted here.',
              'معاينة فقط. لا يمكن إرسال إجابات من هنا.',
            )}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          {t('Close preview', 'إغلاق المعاينة')}
        </button>
      </header>
      <div className="wizard-phone" dir={draft.locale === 'ar' ? 'rtl' : 'ltr'} lang={draft.locale}>
        <strong>NUVIA</strong>
        <h2>{draft.title}</h2>
        <p>{draft.description}</p>
        {draft.questions.map((q, index) => (
          <DraftQuestionPreview key={q.id} q={q} index={index} language={language} />
        ))}
        <p>
          {t('Anonymous feedback · No sign-in required', 'إجابات بدون هوية · لا يلزم تسجيل الدخول')}
        </p>
      </div>
    </section>
  );
}

export function DraftQuestionPreview({ q, index, language, showLegend = true }) {
  const t = (en, ar) => (language === 'ar' ? ar : en);
  return (
    <fieldset disabled className="wizard-preview-question">
      <legend hidden={!showLegend}>
        {q.label || `${t('Question', 'السؤال')} ${index + 1}`}
        {q.required ? ' *' : ''}
      </legend>
      {q.type === 'short_text' && <input aria-label={q.label || String(index + 1)} readOnly />}
      {q.type === 'long_text' && (
        <AutoGrowTextarea aria-label={q.label || String(index + 1)} value="" readOnly rows={3} />
      )}
      {['single_choice', 'multiple_choice'].includes(q.type) &&
        (q.options || []).map((option, optionIndex) => (
          <label key={optionIndex} className="product-check">
            <input
              type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
              name={`preview-${q.id}`}
            />
            {option}
          </label>
        ))}
      {['rating', 'nps'].includes(q.type) && (
        <select aria-label={q.label || String(index + 1)} defaultValue="">
          <option value="">—</option>
          {Array.from({ length: q.type === 'rating' ? 5 : 11 }, (_, value) =>
            q.type === 'rating' ? value + 1 : value,
          ).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}
