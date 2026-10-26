import { z, locale, name, parse } from '../../shared/validation.mjs';

export const questionSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['short_text', 'long_text', 'single_choice', 'multiple_choice', 'rating', 'nps']),
    label: z.string().trim().min(1).max(500),
    required: z.boolean(),
    ratingMax: z.number().int().min(2).max(10).optional(),
    lowLabel: z
      .object({ en: z.string().max(200), ar: z.string().max(200) })
      .strict()
      .optional(),
    highLabel: z
      .object({ en: z.string().max(200), ar: z.string().max(200) })
      .strict()
      .optional(),
    labelTranslations: z
      .object({ en: z.string().trim().max(500), ar: z.string().trim().max(500) })
      .strict()
      .optional(),
    optionTranslations: z
      .object({
        en: z.array(z.string().trim().max(200)).max(30),
        ar: z.array(z.string().trim().max(200)).max(30),
      })
      .strict()
      .optional(),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(30).optional(),
    segment: z.boolean().optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const choice = ['single_choice', 'multiple_choice'].includes(q.type);
    if (choice !== !!q.options || (q.options && new Set(q.options).size !== q.options.length))
      ctx.addIssue({ code: 'custom', message: 'Choice options required and unique' });
    if (q.segment && !['single_choice', 'multiple_choice', 'rating', 'nps'].includes(q.type))
      ctx.addIssue({ code: 'custom', message: 'Segments require bounded values' });
  });
const questions = z
  .array(questionSchema)
  .min(1)
  .max(50)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length);
const fields = {
  title: name,
  description: z.string().trim().max(2000).default(''),
  locale,
  questions,
  anonymous: z.boolean().default(true),
  enabledLanguages: z
    .array(locale)
    .min(1)
    .max(2)
    .refine((values) => new Set(values).size === values.length)
    .optional(),
};
export const surveyInput = z.object(fields).strict();
export const surveyPatch = z
  .object({
    title: name.optional(),
    description: z.string().trim().max(2000).optional(),
    locale: locale.optional(),
    questions: questions.optional(),
    anonymous: z.boolean().optional(),
    enabledLanguages: fields.enabledLanguages,
    revision: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'revision'));
export const publicInput = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: z.uuid(),
            value: z.union([
              z.string().max(10000),
              z.number().finite(),
              z.array(z.string().max(200)).max(30),
            ]),
          })
          .strict(),
      )
      .max(50),
    locale,
    idempotencyKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
    consent: z.literal(true),
    startId: z.uuid().optional(),
    sourceChannel: z.enum(['qr', 'link']).optional(),
    respondent: z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        email: z.email().trim().toLowerCase().max(254).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export function validateAnswers(questions, answers) {
  const ids = new Set(),
    values = new Map();
  for (const answer of answers) {
    if (ids.has(answer.questionId)) parse(z.never(), answer);
    ids.add(answer.questionId);
    const q = questions.find((q) => q.id === answer.questionId);
    if (!q) parse(z.never(), answer);
    let schema;
    if (q.type === 'short_text' || q.type === 'long_text')
      schema = z
        .string()
        .trim()
        .min(q.required ? 1 : 0)
        .max(q.type === 'short_text' ? 500 : 10000);
    if (q.type === 'single_choice') schema = z.string().refine((v) => q.options.includes(v));
    if (q.type === 'multiple_choice')
      schema = z
        .array(z.string().refine((v) => q.options.includes(v)))
        .min(q.required ? 1 : 0)
        .max(q.options.length)
        .refine((v) => new Set(v).size === v.length);
    if (q.type === 'rating')
      schema = z
        .number()
        .int()
        .min(1)
        .max(q.ratingMax || 5);
    if (q.type === 'nps') schema = z.number().int().min(0).max(10);
    values.set(q.id, parse(schema, answer.value));
  }
  for (const q of questions) if (q.required && !values.has(q.id)) parse(z.never(), null);
  return questions
    .filter((q) => values.has(q.id))
    .map((q) => ({ questionId: q.id, value: values.get(q.id) }));
}
