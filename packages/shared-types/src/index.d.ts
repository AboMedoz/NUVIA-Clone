export const API_PREFIX: '/api/v1';
export const SUPPORTED_LOCALES: readonly ['ar', 'en'];
export const QUESTION_TYPES: readonly [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'rating',
  'nps',
];
export const TEAM_ROLES: readonly ['owner', 'manager', 'viewer'];
export const SENTIMENT_LABELS: readonly ['positive', 'negative', 'neutral', 'mixed'];
export const ANALYSIS_JOB_STATUSES: readonly [
  'queued',
  'running',
  'succeeded',
  'failed',
  'waiting_for_model',
];
export type Locale = 'ar' | 'en';

export interface UserView {
  id: string;
  name: string;
  email: string;
  locale: Locale;
  emailVerified: boolean;
}

export interface BranchView {
  id: string;
  name: string;
  archivedAt: string | null;
  isPrimary: boolean;
  country?: string;
  city?: string;
  address?: string;
  responses?: number;
}

export interface WorkspaceView {
  role: 'owner' | 'manager' | 'viewer';
  allowedBranchIds: string[] | null;
  id: string;
  businessName: string;
  industry: string;
  locale: Locale;
  reportingTimezone: string;
  branchType: 'single' | 'multiple';
  primaryBranchId: string | null;
  onboardingStep: 'branches' | 'complete';
  branches: BranchView[];
}

export interface SessionView {
  pendingInvitation: boolean;
  user: UserView | null;
  workspace: WorkspaceView | null;
  csrfToken: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: { field: string; reason: string }[] };
  request_id: string;
}

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];
export type AnalysisJobStatus = (typeof ANALYSIS_JOB_STATUSES)[number];
export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options?: string[];
  segment?: boolean;
  labelTranslations?: Record<Locale, string>;
  optionTranslations?: Record<Locale, string[]>;
  ratingMax?: number;
  lowLabel?: Record<Locale, string>;
  highLabel?: Record<Locale, string>;
}
export interface SurveyLink {
  id: string;
  token: string;
  url: string;
  branchId: string;
  revision: number;
  enabled: boolean;
}
export interface SurveyView {
  id: string;
  title: string;
  description: string;
  locale: Locale;
  status: 'draft' | 'published' | 'paused' | 'closed' | 'archived';
  anonymous: boolean;
  enabledLanguages: Locale[];
  archivedAt?: string | null;
  responseCount?: number;
  questions: SurveyQuestion[];
  revision: number;
  links: SurveyLink[];
  createdAt: string;
  updatedAt: string;
}
export interface ResponseAnswer {
  questionId: string;
  value: string | number | string[];
}
export interface AspectMention {
  aspect: string;
  label: SentimentLabel;
  sentenceId: string;
  start: number;
  end: number;
  quote: string;
  confidence?: number;
}
export interface AnalysisProvenance {
  modelVersion: string;
  pipelineVersion: string;
}
export interface ResponseView {
  id: string;
  surveyId: string;
  surveyTitle: string;
  revision: number;
  branchId: string;
  branchName: string;
  respondent?: { name?: string; email?: string } | null;
  sourceChannel?: 'qr' | 'link' | 'unknown';
  answers: ResponseAnswer[];
  questions: SurveyQuestion[];
  text: string;
  segments: Record<string, string | number | string[]>;
  language: 'ar' | 'en' | 'mixed' | 'unknown';
  createdAt: string;
  analysisStatus: AnalysisJobStatus | 'partial';
  analysis: null | {
    sentiment?: AnalysisProvenance & {
      label: SentimentLabel;
      confidence?: number;
      sentences?: { sentenceId: string; label: SentimentLabel; confidence?: number }[];
    };
    aspects?: AnalysisProvenance & { taxonomyVersion: string; mentions: AspectMention[] };
  };
  preprocessing: null | {
    text: string;
    normalizedText: string;
    method: string;
    sentences: { id: string; start: number; end: number; text: string }[];
  };
}
export interface FeedbackFilters {
  order?: 'newest' | 'oldest';
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  surveyId?: string;
  from?: string;
  to?: string;
  language?: ResponseView['language'];
  sentiment?: SentimentLabel;
  aspect?: string;
  segment?: string | Record<string, string | number>;
  interval?: 'day' | 'week' | 'month';
}
export interface FeedbackList {
  responses: ResponseView[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AnalysisJobView {
  id: string;
  responseId?: string;
  reportId?: string;
  parentJobId?: string;
  clusterId?: string;
  purpose?: 'cluster_summary';
  capability: string;
  status: AnalysisJobStatus;
  attempts: number;
  error: string | null;
  modelVersion: string | null;
  pipelineVersion: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Evidence {
  id: string;
  text: string;
  branchId: string;
  createdAt: string;
}

export interface TopicView {
  id: string;
  label: string;
  labelKind: 'cluster_identifier';
  memberIds: string[];
  evidenceIds: string[];
  count: number;
  summaryStatus: AnalysisJobStatus | 'awaiting_analysis';
  summary: string | null;
  summaryTitle: string | null;
  summaryEvidence: { id: string; quote: string }[];
  summaryCoverage: { memberCount: number; evidenceCount: number; truncated: boolean } | null;
  summaryModelVersion: string | null;
  summaryPipelineVersion: string | null;
}

export type AssistantResult =
  | { status: 'succeeded'; answer: string; evidence: { id: string; quote: string }[] }
  | { status: 'insufficient_evidence'; answer: null; evidence: [] }
  | {
      status: 'model_unavailable' | 'failed';
      answer: null;
      evidence: [];
      capability?: string;
      error?: string;
    };
export interface EvidenceSnapshot {
  totalMatched: number;
  totalTextResponses: number;
  evidenceCount: number;
  truncated: boolean;
  maxItems: number;
  maxCharacters: number;
}
export interface ReportView {
  id: string;
  locale: Locale;
  status: AnalysisJobStatus | 'insufficient_evidence';
  filters: FeedbackFilters;
  evidence: Evidence[];
  snapshot: EvidenceSnapshot;
  metrics: Record<string, unknown>;
  content: null | {
    title: string;
    summary: string;
    sections: { title: string; text: string; evidenceIds: string[] }[];
    evidence: { id: string; quote: string }[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface AccountPreferences {
  language: Locale;
  region: string;
  zone: string;
  date: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  time: '12-Hour' | '24-Hour';
}
export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  title: string;
  phone: string;
  country: string;
  photo: string;
  createdAt: string;
  preferences: AccountPreferences;
  toggles: Record<
    | 'email'
    | 'inapp'
    | 'feedback'
    | 'low'
    | 'weekly'
    | 'news'
    | 'security'
    | 'reports'
    | 'sound'
    | 'popup',
    boolean
  >;
  delivery: 'Daily digest' | 'Immediately' | 'Weekly digest';
  pendingEmail: string | null;
  twoFA: boolean;
  googleConnected: boolean;
  passwordChangedAt?: string | null;
}
export interface AccountSession {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  userAgent: string;
}
export interface NotificationView {
  id: string;
  workspaceId?: string | null;
  title: string;
  body: string;
  path: string;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationListView {
  notifications: NotificationView[];
  unreadCount: number;
  feedbackUnreadCount: number;
}
export interface ActionView {
  id: string;
  title: string;
  summary: string;
  branchIds: string[];
  responseIds: string[];
  reportId: string | null;
  priority: 'high' | 'medium' | 'opportunity';
  status: 'todo' | 'progress' | 'done';
  owner: string;
  due: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
