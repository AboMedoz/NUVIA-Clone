import { defineSchema, text, date, reference } from './schema.mjs';

export const branchSchema = defineSchema('branches', {
  workspaceId: reference('Workspace'),
  name: { ...text, maxlength: 120 },
  normalizedName: text,
  country: { type: String, default: '', maxlength: 120 },
  city: { type: String, default: '', maxlength: 120 },
  address: { type: String, default: '', maxlength: 500 },
  archivedAt: Date,
  createdAt: date,
  updatedAt: date,
});
branchSchema.index(
  { workspaceId: 1, normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: { archivedAt: null },
  },
);
