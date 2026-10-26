import { defineSchema, text, date } from './schema.mjs';
export const contactSchema = defineSchema('contact_requests', {
  name: text,
  email: text,
  company: text,
  createdAt: date,
  status: { type: String, enum: ['new', 'handled'], required: true },
});
contactSchema.index({ createdAt: -1 });
