export const routes = [
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
  const label = pageTitles[page]?.[language === 'ar' ? 1 : 0] || 'NUVIA';
  return `NUVIA — ${label}${preview ? (language === 'ar' ? ' · معاينة التصميم' : ' · Design preview') : ''}`;
}
