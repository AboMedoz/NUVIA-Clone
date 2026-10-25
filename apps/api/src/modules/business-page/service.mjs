import { randomUUID } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';
import { requireWrite } from '../team/access.mjs';
export const pageView = (p) =>
  p
    ? {
        slug: p.slug,
        enabled: p.enabled,
        description: p.description,
        logoUrl: p.logoUrl,
        contactUrl: p.contactUrl,
      }
    : { slug: '', enabled: false, description: '', logoUrl: '', contactUrl: '' };
export async function savePage(input, access, deps) {
  requireWrite(access, true);
  const page = await deps.models.BusinessPage.findOneAndUpdate(
    { workspaceId: access.workspace._id },
    {
      $set: {
        ...input,
        updatedAt: deps.now(),
      },
      $setOnInsert: { _id: randomUUID() },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return pageView(page);
}
export async function publicPage(slug, deps) {
  const page = await deps.models.BusinessPage.findOne({ slug, enabled: true }).lean();
  if (!page) throw new ApiError(404, 'NOT_FOUND');
  const workspace = await deps.models.Workspace.findOne({ _id: page.workspaceId }).lean();
  if (!workspace) throw new ApiError(404, 'NOT_FOUND');
  const branches = await deps.models.Branch.find({
    workspaceId: workspace._id,
    archivedAt: null,
  }).lean();
  const links = await deps.models.SurveyLink.find({
    workspaceId: workspace._id,
    enabled: true,
    branchId: { $in: branches.map((b) => b._id) },
  }).lean();
  const revisions = await deps.models.SurveyRevision.find({
    surveyId: { $in: links.map((l) => l.surveyId) },
  }).lean();
  return {
    business: {
      name: workspace.name,
      description: page.description,
      logoUrl: page.logoUrl,
      contactUrl: page.contactUrl,
    },
    slug,
    surveys: links.map((link) => ({
      token: link.token,
      title: revisions.find((r) => r.surveyId === link.surveyId && r.revision === link.revision)
        ?.title,
      branch: { id: link.branchId, name: branches.find((b) => b._id === link.branchId).name },
    })),
  };
}
