import { describe, expect, it } from 'vitest';
import { fromSurvey, toSurveyInput } from '../src/features/approved-ui/surveys/survey-contract.js';
import { moveEditorQuestion } from '../src/features/approved-ui/surveys/survey-editor.js';

describe('approved survey editor storage contract', () => {
  it('retains short-text bounds and bounded-choice segment marking across edits', () => {
    const saved = {
      id: 'saved',
      revision: 1,
      title: 'Six types',
      locale: 'en',
      questions: [
        { id: 'short', type: 'short_text', label: 'Short answer', required: true },
        {
          id: 'choice',
          type: 'single_choice',
          label: 'Visit type',
          options: ['Delivery', 'Dine in'],
          required: true,
          segment: true,
        },
      ],
    };
    const input = toSurveyInput(fromSurvey(saved), 'en');
    expect(input.questions[0].type).toBe('short_text');
    expect(input.questions[1]).toMatchObject({
      type: 'single_choice',
      segment: true,
      options: ['Delivery', 'Dine in'],
    });
  });
  it('round trips saved identities and both translations instead of sample questions', () => {
    const survey = {
      id: 'saved',
      revision: 4,
      title: 'Saved title',
      description: 'Saved intro',
      locale: 'en',
      questions: [
        {
          id: 'question-id',
          type: 'single_choice',
          label: 'Saved question',
          required: true,
          options: ['One', 'Two'],
          labelTranslations: { en: 'Saved question', ar: 'سؤال محفوظ' },
          optionTranslations: { en: ['One', 'Two'], ar: ['واحد', 'اثنان'] },
        },
      ],
    };
    const draft = fromSurvey(survey),
      input = toSurveyInput(draft, 'en');
    expect(input.questions[0]).toEqual(survey.questions[0]);
    expect(draft.id).toBe('saved');
    expect(draft.revision).toBe(4);
    expect(input.title).toBe('Saved title');
    expect(toSurveyInput(draft, 'ar').questions[0]).toMatchObject({
      label: 'سؤال محفوظ',
      options: ['واحد', 'اثنان'],
    });
  });
  it('does not attach preview options to text or rating questions', () => {
    const saved = {
      id: 'saved',
      revision: 1,
      title: 'Saved',
      locale: 'en',
      questions: [
        { id: 'text-id', type: 'long_text', label: 'Your experience?', required: false },
        { id: 'rating-id', type: 'rating', label: 'Rating', required: true },
      ],
    };
    const input = toSurveyInput(fromSurvey(saved), 'en');
    expect(input.questions.map((q) => q.id)).toEqual(['text-id', 'rating-id']);
    expect(input.questions.every((q) => q.options === undefined)).toBe(true);
    expect(input.questions[0].required).toBe(false);
  });
  it('persists privacy and enabled languages while reordering stable question identities', () => {
    const saved = {
      id: 'saved',
      revision: 2,
      title: 'Contact allowed',
      locale: 'ar',
      anonymous: false,
      enabledLanguages: ['ar'],
      questions: [
        { id: 'first', type: 'long_text', label: 'الأول', required: true },
        { id: 'second', type: 'long_text', label: 'الثاني', required: false },
      ],
    };
    const draft = fromSurvey(saved),
      moved = moveEditorQuestion(draft.questions, 2, 1);
    const input = toSurveyInput({ ...draft, questions: moved.questions }, 'ar');
    expect(input).toMatchObject({ anonymous: false, enabledLanguages: ['ar'] });
    expect(input.questions.map((q) => q.id)).toEqual(['second', 'first']);
    expect(moved.id).toBe(1);
    expect(input.questions[0].label).toBe('الثاني');
  });
});
