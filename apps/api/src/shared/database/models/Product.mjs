import { Schema } from 'mongoose';
import { defineSchema, text, date, reference, positiveInteger } from './schema.mjs';

const mixed = Schema.Types.Mixed;
export const surveySchema = defineSchema('surveys', {
  workspaceId: reference('Workspace'),
  title: text,
  description: { type: String, default: '' },
  locale: { type: String, enum: ['ar', 'en'], required: true },
  status: { type: String, enum: ['draft', 'published', 'closed'], required: true },
  questions: { type: [mixed], required: true },
  revision: positiveInteger,
  draftBranchIds: { type: [String], default: null },
  version: positiveInteger,
  createdAt: date,
  updatedAt: date,
});
surveySchema.index({ workspaceId: 1, createdAt: -1 });
export const surveyRevisionSchema = defineSchema('survey_revisions', {
  workspaceId: reference('Workspace'),
  surveyId: reference('Survey'),
  revision: positiveInteger,
  title: text,
  description: { type: String, default: '' },
  locale: text,
  questions: { type: [mixed], required: true },
  createdAt: date,
});
surveyRevisionSchema.index({ surveyId: 1, revision: 1 }, { unique: true });
export const surveyLinkSchema = defineSchema('survey_links', {
  workspaceId: reference('Workspace'),
  surveyId: reference('Survey'),
  branchId: reference('Branch'),
  revision: positiveInteger,
  token: text,
  enabled: { type: Boolean, required: true },
  version: positiveInteger,
  createdAt: date,
});
surveyLinkSchema.index({ token: 1 }, { unique: true });
surveyLinkSchema.index({ workspaceId: 1, surveyId: 1, enabled: 1 });
export const responseSchema = defineSchema('responses', {
  workspaceId: reference('Workspace'),
  surveyId: reference('Survey'),
  linkId: reference('SurveyLink'),
  branchId: reference('Branch'),
  branchName: text,
  surveyTitle: text,
  revision: positiveInteger,
  answers: { type: [mixed], required: true },
  questions: { type: [mixed], required: true },
  segments: { type: mixed, required: true },
  text: { type: String, default: '' },
  language: { type: String, enum: ['ar', 'en', 'mixed', 'unknown'], required: true },
  submittedLocale: text,
  consentAt: date,
  createdAt: date,
  idempotencyKey: text,
  payloadDigest: text,
  analysisStatus: {
    type: String,
    enum: ['queued', 'running', 'waiting_for_model', 'partial', 'succeeded', 'failed'],
    required: true,
  },
  analysis: { type: mixed, default: null },
  preprocessing: { type: mixed, default: null },
  languageDetails: { type: mixed, default: null },
});
responseSchema.index({ linkId: 1, idempotencyKey: 1 }, { unique: true });
responseSchema.index({ workspaceId: 1, branchId: 1, createdAt: -1 });
export const analysisJobSchema = defineSchema('analysis_jobs', {
  workspaceId: reference('Workspace'),
  branchId: reference('Branch', false),
  responseId: reference('Response', false),
  reportId: reference('Report', false),
  parentJobId: reference('AnalysisJob', false),
  clusterId: { type: String },
  purpose: { type: String, enum: ['cluster_summary'] },
  capability: text,
  status: {
    type: String,
    enum: ['queued', 'running', 'succeeded', 'failed', 'waiting_for_model'],
    required: true,
  },
  attempts: { type: Number, required: true, min: 0 },
  createdAt: date,
  updatedAt: date,
  nextAttemptAt: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
  leaseId: { type: String, default: null },
  error: { type: String, default: null },
  result: { type: mixed, default: null },
  modelVersion: { type: String, default: null },
  pipelineVersion: { type: String, default: null },
  input: { type: mixed, default: null },
  provenance: { type: [mixed], default: [] },
  branchIds: { type: [String], default: undefined },
  datasetKey: { type: String },
});
analysisJobSchema.index({ workspaceId: 1, status: 1, nextAttemptAt: 1 });
analysisJobSchema.index({ status: 1, updatedAt: 1, createdAt: 1 });
analysisJobSchema.index(
  { responseId: 1, capability: 1 },
  { unique: true, partialFilterExpression: { responseId: { $type: 'string' } } },
);
analysisJobSchema.index(
  { workspaceId: 1, capability: 1, datasetKey: 1 },
  { unique: true, partialFilterExpression: { datasetKey: { $type: 'string' } } },
);
export const membershipSchema = defineSchema('memberships', {
  workspaceId: reference('Workspace'),
  userId: reference('User'),
  role: { type: String, enum: ['manager', 'viewer'], required: true },
  branchIds: { type: [String], required: true },
  revokedAt: { type: Date, default: null },
  createdAt: date,
  updatedAt: date,
});
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, revokedAt: 1 });
export const invitationSchema = defineSchema('team_invitations', {
  workspaceId: reference('Workspace'),
  email: text,
  role: { type: String, enum: ['manager', 'viewer'], required: true },
  branchIds: { type: [String], required: true },
  tokenDigest: text,
  createdAt: date,
  expiresAt: date,
  revokedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
});
invitationSchema.index({ tokenDigest: 1 }, { unique: true });
invitationSchema.index({ workspaceId: 1, email: 1 });
export const reportSchema = defineSchema('reports', {
  workspaceId: reference('Workspace'),
  createdBy: reference('User'),
  locale: text,
  filters: { type: mixed, required: true },
  branchIds: { type: [String], required: true },
  evidence: { type: [mixed], required: true },
  metrics: { type: mixed, required: true },
  snapshot: { type: mixed, default: null },
  status: {
    type: String,
    enum: [
      'queued',
      'running',
      'waiting_for_model',
      'succeeded',
      'failed',
      'insufficient_evidence',
    ],
    required: true,
  },
  content: { type: mixed, default: null },
  createdAt: date,
  updatedAt: date,
});
reportSchema.index({ workspaceId: 1, createdAt: -1 });
export const businessPageSchema = defineSchema('business_pages', {
  workspaceId: reference('Workspace'),
  slug: text,
  enabled: { type: Boolean, required: true },
  description: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  contactUrl: { type: String, default: '' },
  updatedAt: date,
});
businessPageSchema.index({ workspaceId: 1 }, { unique: true });
businessPageSchema.index({ slug: 1 }, { unique: true });
