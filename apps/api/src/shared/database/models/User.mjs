import { Schema } from 'mongoose';
import { defineSchema, text, date, locale, positiveInteger } from './schema.mjs';

export const userSchema = defineSchema('users', {
  name: { ...text, maxlength: 120 },
  email: { ...text, maxlength: 254 },
  locale,
  passwordHash: text,
  credentialsVersion: positiveInteger,
  workspaceVersion: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  verifiedAt: Date,
  termsAcceptedAt: date,
  createdAt: date,
  updatedAt: date,
  profile: Schema.Types.Mixed,
  preferences: Schema.Types.Mixed,
  notificationPreferences: Schema.Types.Mixed,
  notificationDelivery: String,
  notificationLastDigestAt: Date,
  weeklyReportsEnabled: { type: Boolean, default: false },
  weeklyReportsLastCheckedAt: Date,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: Schema.Types.Mixed,
  twoFactorPending: Schema.Types.Mixed,
  twoFactorRecoveryHashes: { type: [String], default: [] },
  googleSubject: String,
  pendingEmail: String,
  passwordChangedAt: Date,
});
userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
  { googleSubject: 1 },
  { unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } } },
);
