// Public wire-contract constants only. Never export persistence models or secrets.
export const API_PREFIX = '/api/v1';
export const SUPPORTED_LOCALES = Object.freeze(['ar', 'en']);
export const QUESTION_TYPES = Object.freeze([
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'rating',
  'nps',
]);
export const TEAM_ROLES = Object.freeze(['owner', 'manager', 'viewer']);
export const SENTIMENT_LABELS = Object.freeze(['positive', 'negative', 'neutral', 'mixed']);
export const ANALYSIS_JOB_STATUSES = Object.freeze([
  'queued',
  'running',
  'succeeded',
  'failed',
  'waiting_for_model',
]);
