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
  status: 'draft' | 'published' | 'closed';
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
