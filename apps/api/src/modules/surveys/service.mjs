import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { assertBranches, requireWrite } from '../team/access.mjs';
import { validateAnswers } from './validation.mjs';
import { queueResponseJobs } from '../analysis/service.mjs';

export async function surveyView(s, access, deps) {
  const links = await deps.models.SurveyLink.find({
    surveyId: s._id,
    ...(access.branchIds ? { branchId: { $in: access.branchIds } } : {}),
  })
    .sort({ createdAt: -1 })
    .lean();
  return {
    id: s._id,
    title: s.title,
    description: s.description,
    locale: s.locale,
    questions: s.questions,
    revision: s.revision,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    links: links.map((l) => ({
      id: l._id,
      branchId: l.branchId,
      revision: l.revision,
      enabled: l.enabled,
      token: l.token,
      url: `${deps.config.appOrigin}/#/s/${l.token}`,
    })),
  };
}
export async function findSurvey(id, access, deps, session) {
  const survey = await deps.models.Survey.findOne(
    { _id: id, workspaceId: access.workspace._id },
    null,
    { session },
  ).lean();
  if (!survey) throw new ApiError(404, 'NOT_FOUND');
  if (access.branchIds) {
    // A branch manager may only modify surveys whose complete distribution is authorized.
    const links = await deps.models.SurveyLink.find({ surveyId: id }, null, { session }).lean();
    if (
      !links.length &&
      (!survey.draftBranchIds || survey.draftBranchIds.some((id) => !access.branchIds.includes(id)))
    )
      throw new ApiError(404, 'NOT_FOUND');
    if (links.some((l) => !access.branchIds.includes(l.branchId)))
      throw new ApiError(404, 'NOT_FOUND');
    if (access.role === 'viewer' && !links.some((l) => access.branchIds.includes(l.branchId)))
      throw new ApiError(404, 'NOT_FOUND');
  }
  return survey;
}
export async function listSurveys(access, deps) {
  const surveys = await deps.models.Survey.find({ workspaceId: access.workspace._id })
    .sort({ updatedAt: -1 })
    .lean();
  const result = [];
  for (const s of surveys) {
    try {
      await findSurvey(s._id, access, deps);
      result.push(await surveyView(s, access, deps));
    } catch (error) {
      if (error.code !== 'NOT_FOUND') throw error;
    }
  }
  return result;
}
export async function createSurvey(input, access, deps) {
  requireWrite(access);
  const s = await deps.models.Survey.insertOne({
    _id: randomUUID(),
    workspaceId: access.workspace._id,
    draftBranchIds: access.branchIds,
    ...input,
    status: 'draft',
    revision: 1,
    version: 1,
    createdAt: deps.now(),
    updatedAt: deps.now(),
  });
  return surveyView(s, access, deps);
}
export async function editSurvey(id, input, access, deps) {
  requireWrite(access);
  const current = await findSurvey(id, access, deps);
  if (input.revision && input.revision !== current.revision)
    throw new ApiError(409, 'SURVEY_CHANGED');
  const { revision: ignored, ...fields } = input;
  void ignored;
  const updated = await deps.models.Survey.findOneAndUpdate(
    { _id: id, version: current.version },
    { $set: { ...fields, updatedAt: deps.now() }, $inc: { revision: 1, version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw new ApiError(409, 'SURVEY_CHANGED');
  return surveyView(updated, access, deps);
}
export async function publishSurvey(id, branchIds, access, deps) {
  requireWrite(access);
  await transaction(deps, async (session) => {
    await assertBranches(access, branchIds, deps, { session });
    // Coordinate publication with branch lifecycle mutations in the same workspace.
    await deps.models.Workspace.updateOne(
      { _id: access.workspace._id },
      { $inc: { version: 1 } },
      { session },
    );
    const s = await findSurvey(id, access, deps, session);
    await deps.models.Survey.updateOne(
      { _id: id },
      { $set: { status: 'published', updatedAt: deps.now() }, $inc: { version: 1 } },
      { session },
    );
    await deps.models.SurveyRevision.updateOne(
      { surveyId: id, revision: s.revision },
      {
        $setOnInsert: {
          _id: randomUUID(),
          workspaceId: s.workspaceId,
          surveyId: id,
          revision: s.revision,
          title: s.title,
          description: s.description,
          locale: s.locale,
          questions: s.questions,
          createdAt: deps.now(),
        },
      },
      { upsert: true, session },
    );
    // Re-publishing replaces links for the chosen branches, preserving disabled links and all old evidence.
    await deps.models.SurveyLink.updateMany(
      { surveyId: id, branchId: { $in: branchIds }, enabled: true },
      { $set: { enabled: false }, $inc: { version: 1 } },
      { session },
    );
    for (const branchId of branchIds)
      await deps.models.SurveyLink.insertOne(
        {
          _id: randomUUID(),
          workspaceId: s.workspaceId,
          surveyId: id,
          branchId,
          revision: s.revision,
          token: randomBytes(32).toString('hex'),
          enabled: true,
          version: 1,
          createdAt: deps.now(),
        },
        { session },
      );
  });
  return surveyView(await findSurvey(id, access, deps), access, deps);
}
export async function closeSurvey(id, access, deps) {
  requireWrite(access);
  await transaction(deps, async (session) => {
    await findSurvey(id, access, deps, session);
    await deps.models.Survey.updateOne(
      { _id: id },
      { $set: { status: 'closed', updatedAt: deps.now() }, $inc: { version: 1 } },
      { session },
    );
    await deps.models.SurveyLink.updateMany(
      { surveyId: id },
      { $set: { enabled: false }, $inc: { version: 1 } },
      { session },
    );
  });
  return surveyView(await findSurvey(id, access, deps), access, deps);
}
export async function publicSurvey(token, deps, session) {
  const link = await deps.models.SurveyLink.findOne({ token, enabled: true }, null, {
    session,
  }).lean();
  if (!link) throw new ApiError(404, 'NOT_FOUND');
  const branch = await deps.models.Branch.findOne(
    { _id: link.branchId, workspaceId: link.workspaceId, archivedAt: null },
    null,
    { session },
  ).lean();
  const business = await deps.models.Workspace.findOne({ _id: link.workspaceId }, null, {
    session,
  }).lean();
  const revision = await deps.models.SurveyRevision.findOne(
    { surveyId: link.surveyId, revision: link.revision },
    null,
    { session },
  ).lean();
  if (!branch || !business || !revision) throw new ApiError(404, 'NOT_FOUND');
  return { link, branch, business, revision };
}
export const safePublicSurvey = ({ link, branch, business, revision: r }) => ({
  survey: {
    id: link.surveyId,
    title: r.title,
    description: r.description,
    locale: r.locale,
    questions: r.questions,
    revision: r.revision,
    status: 'published',
  },
  branch: { id: branch._id, name: branch.name },
  business: { name: business.name },
});
export async function submitResponse(token, input, deps) {
  const payloadDigest = createHash('sha256')
    .update(JSON.stringify({ answers: input.answers, locale: input.locale }))
    .digest('hex');
  try {
    return await transaction(deps, async (session) => {
      const { link, branch, revision } = await publicSurvey(token, deps, session);
      const previous = await deps.models.Response.findOne(
        { linkId: link._id, idempotencyKey: input.idempotencyKey },
        null,
        { session },
      ).lean();
      if (previous) {
        if (previous.payloadDigest !== payloadDigest)
          throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
        return { id: previous._id, createdAt: previous.createdAt, status: 'received' };
      }
      const answers = validateAnswers(revision.questions, input.answers);
      // Locks the distribution while accepting so a concurrent close cannot commit a response after closure.
      await deps.models.SurveyLink.updateOne(
        { _id: link._id, enabled: true },
        { $inc: { version: 1 } },
        { session },
      );
      const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
      const text = revision.questions
        .filter((q) => ['short_text', 'long_text'].includes(q.type))
        .map((q) => answerMap.get(q.id))
        .filter(Boolean)
        .join('\n');
      const segments = Object.fromEntries(
        revision.questions
          .filter((q) => q.segment && answerMap.has(q.id))
          .map((q) => [q.id, answerMap.get(q.id)]),
      );
      const response = {
        _id: randomUUID(),
        workspaceId: link.workspaceId,
        surveyId: link.surveyId,
        linkId: link._id,
        branchId: link.branchId,
        branchName: branch.name,
        surveyTitle: revision.title,
        revision: link.revision,
        questions: revision.questions,
        answers,
        text,
        segments,
        language: 'unknown',
        submittedLocale: input.locale,
        consentAt: deps.now(),
        createdAt: deps.now(),
        idempotencyKey: input.idempotencyKey,
        payloadDigest,
        analysisStatus: 'waiting_for_model',
        analysis: null,
      };
      await deps.models.Response.insertOne(response, { session });
      await queueResponseJobs(response, deps, session);
      return { id: response._id, createdAt: response.createdAt, status: 'received' };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const link = await deps.models.SurveyLink.findOne({ token }).lean();
    const previous =
      link &&
      (await deps.models.Response.findOne({
        linkId: link._id,
        idempotencyKey: input.idempotencyKey,
      }).lean());
    if (!previous || previous.payloadDigest !== payloadDigest)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    return { id: previous._id, createdAt: previous.createdAt, status: 'received' };
  }
}

const sectors = {
  restaurants: {
    en: ['Restaurant visit', 'How was your meal?', 'What could improve about food or service?'],
    ar: ['تقييم المطعم', 'كيف كانت وجبتك؟', 'ما الذي يمكن تحسينه في الطعام أو الخدمة؟'],
  },
  retail: {
    en: [
      'Shopping experience',
      'How was your shopping experience?',
      'What could improve about products or checkout?',
    ],
    ar: ['تجربة التسوق', 'كيف كانت تجربة التسوق؟', 'ما الذي يمكن تحسينه في المنتجات أو الدفع؟'],
  },
  services: {
    en: [
      'Service experience',
      'How was the service?',
      'What could improve about your appointment or service?',
    ],
    ar: ['تقييم الخدمة', 'كيف كانت الخدمة؟', 'ما الذي يمكن تحسينه في الموعد أو الخدمة؟'],
  },
};
export const surveyTemplates = Object.entries(sectors).flatMap(([sector, content]) =>
  ['en', 'ar'].map((locale) => ({
    id: `${sector}-${locale}`,
    sector,
    title: content[locale][0],
    description: '',
    locale,
    questions: [
      {
        id: 'c89513f4-bb79-4ba4-86e4-0ae684eab680',
        type: 'rating',
        required: true,
        label: content[locale][1],
      },
      {
        id: '49d73741-2a8f-44cb-b068-5734bf314b7a',
        type: 'long_text',
        required: false,
        label: content[locale][2],
      },
      {
        id: 'bb1d1397-054e-492f-b50a-632c425cfac8',
        type: 'single_choice',
        required: false,
        segment: true,
        label: locale === 'ar' ? 'نوع الخدمة' : 'Service type',
        options: locale === 'ar' ? ['داخل الفرع', 'توصيل'] : ['Dine in', 'Delivery'],
      },
    ],
  })),
);
