export const routes = [
  'help',
  'about',
  'security',
  'status',
  'terms',
  'privacy',
  'stories',
  'pricing',
  'overview',
  'feedbacks-loading',
  'feedbacks-no-results',
  'analytics-sentiment',
  'analytics-aspects',
  'analytics-topics',
  'analytics-trends',
  'analytics-comparison',
  'nuvia-assistant',
  'report-details',
  'survey-results',
  'survey-all',
  'survey-empty',
  'survey-live',
  'survey-drafts',
  'survey-paused',
  'survey-closed',
  'survey-create',
  'survey-questions',
  'survey-choices',
  'survey-edit',
  'survey-share',
  'survey-ai',
  'survey-ai-review',
  'business',
  'business-add',
  'business-edit',
  'branch',
  'branch-add',
  'branch-edit',
  'branch-history',
  'settings-account',
  'settings-devices',
  'settings-email',
  'settings-language',
  'settings-notifications',
  'settings-notifications-email',
  'settings-notifications-inapp',
  'settings-password',
  'settings-personal',
  'settings-profile',
  'settings-security',
  'settings-two-factor',
  'subscription',
  'notifications',
  'action-board',
  'evidence',
  'business-page',
  'landing',
  'dashboard',
  'dashboard-empty',
  'feedbacks',
  'feedbacks-empty',
  'feedback-details',
  'login',
  'signup',
  'forgot',
  'reset',
  'verify-email',
  'business-information',
  'business-error',
  'business-setup',
  'get-started',
  'surveys',
  'survey-builder',
  'analytics',
  'reports',
  'team',
  'branches',
  'assistant',
  'settings',
  'team-accept',
];
export const currentRoute = () => {
  const value = location.hash.slice(2).split('?')[0];
  if (value === 'team/accept') return 'team-accept';
  if (value.startsWith('s/')) return 'public-survey';
  if (value.startsWith('b/')) return 'public-business';
  return routes.includes(value) ? value : 'landing';
};

const pageTitles = {
  help: ['Help center', 'مركز المساعدة'],
  about: ['About NUVIA', 'عن NUVIA'],
  security: ['Account security', 'أمان الحساب'],
  status: ['Service status', 'حالة الخدمة'],
  terms: ['Terms of service', 'شروط الاستخدام'],
  privacy: ['Privacy policy', 'سياسة الخصوصية'],
  stories: ['Customer stories', 'قصص العملاء'],
  pricing: ['Plans and pricing', 'الخطط والأسعار'],
  subscription: ['Subscription', 'الاشتراك'],
  notifications: ['Notifications', 'الإشعارات'],
  business: ['Business', 'النشاط التجاري'],
  evidence: ['Supporting evidence', 'الأدلة'],
  'action-board': ['Action board', 'لوحة الإجراءات'],

  landing: ['Customer feedback', 'آراء العملاء'],
  login: ['Sign in', 'تسجيل الدخول'],
  signup: ['Create account', 'إنشاء حساب'],
  forgot: ['Reset password', 'استعادة كلمة المرور'],
  reset: ['Set new password', 'تعيين كلمة مرور جديدة'],
  'verify-email': ['Verify email', 'تأكيد البريد الإلكتروني'],
  'business-information': ['Business information', 'بيانات النشاط'],
  'business-error': ['Business information', 'بيانات النشاط'],
  'business-setup': ['Business setup', 'إعداد النشاط'],
  'get-started': ['Get started', 'البدء'],
  dashboard: ['Overview', 'نظرة عامة'],
  'dashboard-empty': ['Overview', 'نظرة عامة'],
  feedbacks: ['Feedback', 'الردود'],
  'feedbacks-empty': ['Feedback', 'الردود'],
  'feedback-details': ['Feedback details', 'تفاصيل الرد'],
  surveys: ['Surveys', 'الاستبيانات'],
  'survey-builder': ['Survey builder', 'إنشاء استبيان'],
  analytics: ['Analytics', 'التحليلات'],
  reports: ['Reports', 'التقارير'],
  team: ['Business and team', 'النشاط والفريق'],
  'team-accept': ['Join team', 'الانضمام للفريق'],
  branches: ['Branches', 'الفروع'],
  assistant: ['Assistant', 'المساعد'],
  settings: ['Business settings', 'إعدادات النشاط'],
  'public-survey': ['Share feedback', 'شارك رأيك'],
  'public-business': ['Business surveys', 'استبيانات النشاط'],
  loading: ['Loading', 'جارٍ التحميل'],
  error: ['Unable to load', 'تعذر التحميل'],
};
export function routeTitle(page, language, preview = false) {
  const canonical = pageTitles[page]
    ? page
    : page === 'overview'
      ? 'dashboard'
      : page.startsWith('analytics-')
        ? 'analytics'
        : page === 'nuvia-assistant'
          ? 'assistant'
          : page === 'report-details'
            ? 'reports'
            : page.startsWith('survey-')
              ? page.includes('create') ||
                page.includes('edit') ||
                page.includes('questions') ||
                page.includes('share')
                ? 'survey-builder'
                : 'surveys'
              : page.startsWith('settings-')
                ? 'settings'
                : page.startsWith('branch-')
                  ? 'branches'
                  : page.startsWith('feedbacks-')
                    ? 'feedbacks'
                    : page.startsWith('business-')
                      ? 'business'
                      : page;
  const label = pageTitles[canonical]?.[language === 'ar' ? 1 : 0] || 'NUVIA';
  return `NUVIA — ${label}${preview ? (language === 'ar' ? ' · معاينة التصميم' : ' · Design preview') : ''}`;
}
