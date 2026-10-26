import { createEditorQuestions } from './survey-editor.js';
const types = {
  'Star rating': 'rating',
  'Single choice': 'single_choice',
  'Multiple choice': 'multiple_choice',
  'Long text': 'long_text',
  'Short text': 'short_text',
  NPS: 'nps',
};
const labels = Object.fromEntries(Object.entries(types).map(([label, type]) => [type, label]));
export function toSurveyInput(draft, locale) {
  return {
    title: draft.title.trim(),
    description: draft.description || '',
    locale,
    anonymous: draft.anonymous !== false,
    enabledLanguages: draft.enabledLanguages || [locale],
    questions: Object.values(draft.questions).map((q) => ({
      id: q.id || crypto.randomUUID(),
      type: types[q.type] || 'long_text',
      label: (q.text[locale] || q.text.en || q.text.ar).trim(),
      required: Boolean(q.required),
      ...(q.segment ? { segment: true } : {}),
      ...(['Star rating', 'NPS'].includes(q.type)
        ? {
            ...(q.type === 'Star rating' ? { ratingMax: q.count || 5 } : {}),
            lowLabel: q.lowLabel,
            highLabel: q.highLabel,
          }
        : {}),
      labelTranslations: { en: q.text.en || '', ar: q.text.ar || '' },
      ...(['Single choice', 'Multiple choice'].includes(q.type)
        ? {
            options: q.options[locale].slice(0, q.count).map((v) => v.trim()),
            optionTranslations: {
              en: q.options.en.slice(0, q.count),
              ar: q.options.ar.slice(0, q.count),
            },
          }
        : {}),
    })),
  };
}
export function fromSurvey(survey) {
  const base = createEditorQuestions()[1];
  return {
    id: survey.id,
    revision: survey.revision,
    title: survey.title,
    description: survey.description || '',
    locale: survey.locale,
    anonymous: survey.anonymous !== false,
    enabledLanguages: survey.enabledLanguages?.length ? survey.enabledLanguages : [survey.locale],
    questions: Object.fromEntries(
      survey.questions.map((q, index) => [
        index + 1,
        {
          ...base,
          id: q.id,
          type: labels[q.type] || 'Long text',
          title: null,
          text: { en: '', ar: '', [survey.locale]: q.label, ...q.labelTranslations },
          options: { en: q.options || [], ar: q.options || [], ...q.optionTranslations },
          count: q.options?.length || q.ratingMax || 5,
          lowLabel: q.lowLabel || base.lowLabel,
          highLabel: q.highLabel || base.highLabel,
          required: q.required,
          segment: Boolean(q.segment),
          selection: [],
          rating: 0,
        },
      ]),
    ),
  };
}
export const surveyDisplayStatus = (status) =>
  ({ published: 'Live', draft: 'Draft', paused: 'Paused', closed: 'Closed', archived: 'Archived' })[
    status
  ] || status;
