import { defineSchema, text, date, reference, positiveInteger } from './schema.mjs';

export const actionSchema = defineSchema('actions', {
  workspaceId: reference('Workspace'),
  createdBy: reference('User'),
  title: { ...text, maxlength: 200 },
  summary: { type: String, default: '', maxlength: 5000 },
  branchIds: { type: [String], required: true },
  responseIds: { type: [String], default: [] },
  reportId: { type: String, default: null },
  priority: { type: String, enum: ['high', 'medium', 'opportunity'], required: true },
  status: { type: String, enum: ['todo', 'progress', 'done'], required: true },
  owner: { type: String, default: '', maxlength: 120 },
  due: { type: String, default: '' },
  version: positiveInteger,
  createdAt: date,
  updatedAt: date,
});
actionSchema.index({ workspaceId: 1, createdAt: -1 });
