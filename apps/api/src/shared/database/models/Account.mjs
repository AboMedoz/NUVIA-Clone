import { defineSchema, text, date, reference } from './schema.mjs';
export const notificationSchema = defineSchema('notifications', {
  userId: reference('User'),
  workspaceId: reference('Workspace', false),
  branchIds: { type: [String], default: undefined },
  title: { ...text, maxlength: 200 },
  body: { ...text, maxlength: 2000 },
  path: String,
  createdAt: date,
  readAt: Date,
  inapp: { type: Boolean, default: true },
  kind: String,
  emailedAt: Date,
});
notificationSchema.index({ userId: 1, createdAt: -1 });
