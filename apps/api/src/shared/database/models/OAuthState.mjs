import { Schema } from 'mongoose';
import { defineSchema, text, date } from './schema.mjs';

export const oauthStateSchema = defineSchema('oauth_states', {
  digest: text,
  sessionDigest: text,
  payload: { type: Schema.Types.Mixed, required: true },
  createdAt: date,
  expiresAt: date,
});
oauthStateSchema.index({ digest: 1 }, { unique: true });
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
