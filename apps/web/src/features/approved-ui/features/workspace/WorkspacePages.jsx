import { defaultScopeDates } from '../../product/connected-data.js';
import { queryString } from '../../../product/product-state.js';
import useAccountSettings from './useAccountSettings.js';
import QRCode from 'qrcode';
import { useAuth } from '../../../../app/providers/AuthProvider.jsx';
import { productApi } from '../../../product/api.js';
import { useResource, useMutation } from '../../../product/useResource.js';
import PreviewWorkspaceContext from '../../product/PreviewWorkspaceContext.jsx';
import ChoiceMenu from '../../components/ChoiceMenu.jsx';
import OverviewEmpty from '../../product/OverviewEmpty.jsx';
import UiArrow from '../../components/UiArrow.jsx';
import figmaPencil from './assets/figma/imgPencil.svg';
import figmaInfo from './assets/figma/imgInfo.svg';
import figmaBuilding from './assets/figma/imgBuilding2.svg';
import figmaInfoLarge from './assets/figma/imgInfo1.svg';
import figmaUser from './assets/figma/imgUserRound.svg';
import figmaPlus from './assets/figma/imgPlus.svg';
import figmaStore from './assets/figma/imgStore.svg';
import figmaMore from './assets/figma/imgEllipsis.svg';
import ReferenceAction from '../../pages/ActionEvidencePage.jsx';
import ReferenceAnalytics from '../../pages/AnalyticsPage.jsx';
import ReferenceReports from '../../pages/ExtraPreviewPage.jsx';
import ReferenceSurveys from '../../surveys/SurveyPage.jsx';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/manrope/800.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/700.css';
import ReferenceFrame from '../../product/ReferenceFrame.jsx';
import ReferenceDashboard from '../../pages/DashboardPage.jsx';
import ReferenceFeedbacks from '../../pages/FeedbacksPage.jsx';
import React, { useState, useEffect, useRef } from 'react';

import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/600.css';
import './workspace.css';
const shapes = {
  business: 'M3 10h18l-2-7H5z M4 10v11h16V10 M9 21v-7h6v7',
  settings:
    'M12 3 15 5 19 5 21 9 19 12 21 16 18 20 14 19 10 21 6 19 5 15 2 12 4 8 8 7Z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  feedbacks: 'M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z',
  analytics: 'M4 20V10m6 10V5m6 15v-8m5 9H2',
  reports: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h6m-6 4h6',
  surveys: 'M8 4H5v17h14V4h-3 M8 2h8v5H8z M8 11h8m-8 4h6',
  assistant: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  subscription: 'M3 5h18v14H3z M3 9h18m-14 6h4',
  notifications: 'M5 16h14l-2-4V8a5 5 0 0 0-10 0v4z M10 20h4',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3q-8 9 0 18q8-9 0-18',
  down: 'm6 9 6 6 6-6',
  back: 'M20 12H4m6-6-6 6 6 6',
  plus: 'M12 4v16M4 12h16',
  search: 'M17 17l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm4 12 5 5L20 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  archive: 'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',
  shield: 'M12 2 3 6v7q0 6 9 9 9-3 9-9V6z M8 12l3 3 5-6',
  mail: 'M2 5h20v14H2z m0 0 10 8L22 5',
  device: 'M3 3h18v13H3z M8 21h8m-4-5v5',
  logout: 'M9 3H3v18h6 M9 12h12m-5-5 5 5-5 5',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3',
  menu: 'M3 5h18M3 12h18M3 19h18',
};
function I({ name, size = 20 }) {
  if (name === 'back')
    return <UiArrow direction="back" size={18} rtl={document.documentElement.dir === 'rtl'} />;
  const asset = {
    edit: figmaPencil,
    info: figmaInfo,
    building: figmaBuilding,
    'info-large': figmaInfoLarge,
    user: figmaUser,
    plus: figmaPlus,
    business: figmaStore,
    more: figmaMore,
  }[name];
  if (asset)
    return (
      <img src={asset} className={name === 'plus' ? 'figma-icon plus-icon' : 'figma-icon'} alt="" />
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={shapes[name] || shapes.overview} />
    </svg>
  );
}
const words = {
  'View profile': 'عرض الملف الشخصي',
  'Business profile': 'ملف النشاط',
  Branches: 'الفروع',
  Business: 'النشاط التجاري',
  Settings: 'الإعدادات',
  'Account settings': 'إعدادات الحساب',
  'Language settings': 'إعدادات اللغة',
  'Notification settings': 'إعدادات الإشعارات',
  'Account security': 'أمان الحساب',
  Overview: 'نظرة عامة',
  Feedbacks: 'آراء العملاء',
  Analytics: 'التحليلات',
  Reports: 'التقارير',
  Surveys: 'الاستبيانات',
  'NUVIA Assistant': 'مساعد NUVIA',
  Subscription: 'الاشتراك',
  Notifications: 'الإشعارات',
  'Workspace owner': 'مالكة مساحة العمل',
  'Save changes': 'حفظ التغييرات',
  Cancel: 'إلغاء',
  'Edit profile': 'تعديل الملف',
  'Add branch': 'إضافة فرع',
  'Edit branch': 'تعديل الفرع',
  'Business information': 'معلومات النشاط',
  'Business name': 'اسم النشاط',
  'Business type / Industry': 'نوع النشاط / المجال',
  'Branch information': 'معلومات الفرع',
  'Branch name': 'اسم الفرع',
  Country: 'الدولة',
  City: 'المدينة',
  'Street address': 'عنوان الشارع',
  'Active branches': 'الفروع النشطة',
  Archived: 'المؤرشفة',
  Responses: 'الردود',
  Location: 'الموقع',
  Status: 'الحالة',
  Actions: 'الإجراءات',
  Active: 'نشط',
  'Archive branch': 'أرشفة الفرع',
  Edit: 'تعديل',
  'View Analytics': 'عرض التحليلات',
  'View past analytics': 'عرض التحليلات السابقة',
  'Member since': 'عضو منذ',
  'Full name': 'الاسم الكامل',
  'Email address': 'البريد الإلكتروني',
  'Phone number': 'رقم الهاتف',
  'Job title': 'المسمى الوظيفي',
  'Personal information': 'المعلومات الشخصية',
  'Sign-in information': 'معلومات تسجيل الدخول',
  'Edit account details': 'تعديل بيانات الحساب',
  'Change email': 'تغيير البريد',
  'Current password': 'كلمة المرور الحالية',
  'New email address': 'البريد الإلكتروني الجديد',
  'Display language': 'لغة العرض',
  Region: 'المنطقة',
  'Time zone': 'المنطقة الزمنية',
  'Date format': 'تنسيق التاريخ',
  'Time format': 'تنسيق الوقت',
  'Format preview': 'معاينة التنسيق',
  'Email notifications': 'إشعارات البريد',
  'In-app notifications': 'الإشعارات داخل التطبيق',
  'Manage preferences': 'إدارة التفضيلات',
  'New customer feedback': 'آراء العملاء الجديدة',
  'Low-rating alerts': 'تنبيهات التقييم المنخفض',
  'Weekly performance report': 'تقرير الأداء الأسبوعي',
  'Product news & tips': 'أخبار المنتج والنصائح',
  'Account & security': 'الحساب والأمان',
  'Reports ready to view': 'تقارير جاهزة للعرض',
  'Play a notification sound': 'تشغيل صوت الإشعار',
  'Show pop-up alerts': 'عرض تنبيهات منبثقة',
  'Change password': 'تغيير كلمة المرور',
  'New password': 'كلمة المرور الجديدة',
  'Confirm new password': 'تأكيد كلمة المرور',
  'Update password': 'تحديث كلمة المرور',
  'Two-factor authentication': 'المصادقة الثنائية',
  'Devices & active sessions': 'الأجهزة والجلسات النشطة',
  'Manage devices': 'إدارة الأجهزة',
  'Sign out': 'تسجيل الخروج',
  'Sign out of all devices': 'تسجيل الخروج من كل الأجهزة',
  'This device': 'هذا الجهاز',
  'Set up': 'إعداد',
  'Verify & enable': 'تأكيد وتفعيل',
  'Coming soon': 'قريبًا',
  'Back to overview': 'العودة للنظرة العامة',
  All: 'الكل',
  Unread: 'غير المقروءة',
  'Mark all as read': 'تحديد الكل كمقروء',
  'No notifications yet': 'لا توجد إشعارات بعد',
  'No reports yet': 'لا توجد تقارير بعد',
  'No surveys yet': 'لا توجد استبيانات بعد',
  'No analytics yet': 'لا توجد تحليلات بعد',
  'Create survey': 'إنشاء استبيان',
  'View feedbacks': 'عرض آراء العملاء',
  'Search branches': 'ابحث عن الفروع',
  'Search your workspace': 'ابحث في مساحة العمل',
  'Your workspace': 'مساحة عملك',
  'Business owner': 'مالك النشاط',
  'Save branch': 'حفظ الفرع',
  'Changes saved': 'تم حفظ التغييرات',
  'Notification preferences': 'تفضيلات الإشعارات',
  Empty: 'بدون بيانات',
  'With data': 'ببيانات',
  'Preview state': 'حالة المعاينة',
  'History retained': 'السجل محفوظ',
  'Upload photo': 'رفع صورة',
  Remove: 'إزالة',
  'Fields marked * are required.': 'الحقول المميزة بعلامة * مطلوبة.',
  'Back to branches': 'العودة إلى الفروع',
  'All dates': 'كل التواريخ',
  'All languages': 'كل اللغات',
  'All caught up': 'كل شيء محدث',
  'Daily digest': 'ملخص يومي',
  Immediately: 'فورًا',
  'Weekly digest': 'ملخص أسبوعي',
  Search: 'بحث',
  'Discard changes': 'تجاهل التغييرات',
  'Keep editing': 'متابعة التعديل',
};
const navigation = [
  ['Overview', 'overview'],
  ['Feedbacks', 'feedbacks'],
  ['Analytics', 'analytics'],
  ['Reports', 'reports'],
  ['Surveys', 'surveys'],
  ['Business', 'business'],
  ['NUVIA Assistant', 'assistant'],
];
const tabs = [
  ['Account settings', 'settings'],
  ['Language settings', 'settings-language'],
  ['Notification settings', 'settings-notifications'],
  ['Account security', 'settings-security'],
];
const initialBranches = [
  {
    id: 1,
    name: 'Cairo',
    country: 'Egypt',
    city: 'Cairo',
    address: '21 Tahrir Street',
    responses: 540,
  },
  {
    id: 2,
    name: 'Alex',
    country: 'Egypt',
    city: 'Alexandria',
    address: '18 Sea Road',
    responses: 468,
  },
  {
    id: 3,
    name: 'El Zamalek',
    country: 'Egypt',
    city: 'Cairo',
    address: '12 Brazil Street, Zamalek',
    responses: 240,
  },
];
function currentPreviewRoute() {
  const route = location.hash.slice(2).split('?')[0] || 'business';
  if (route.startsWith('analytics-')) return 'analytics';
  return (
    {
      dashboard: 'overview',
      'dashboard-empty': 'overview',
      'analytics-sentiment': 'analytics',
      'survey-all': 'surveys',
      'nuvia-assistant': 'assistant',
    }[route] || route
  );
}
export default function WorkspacePages({ language, setLanguage, initialEmpty = false }) {
  const settings = useAccountSettings();
  const profileDraftSeeded = useRef(false);
  const clearEnrollment = settings.clearEnrollment;
  const [enrollmentQr, setEnrollmentQr] = useState('');
  const auth = useAuth();
  const connected = auth && !auth.preview;
  const branchResource = useResource(
    connected && auth.workspace
      ? '/workspaces/' + auth.workspace.id + '/branches?includeArchived=true'
      : null,
  );
  const branchMutation = useMutation();
  const [page, setPage] = useState(currentPreviewRoute),
    [, setMobile] = useState(false),
    [, setMenu] = useState(false),
    [sample, setSample] = useState(
      () =>
        connected ||
        (!initialEmpty && new URLSearchParams(location.search).get('state') !== 'empty'),
    ),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(''),
    [row, setRow] = useState(null),
    [query, setQuery] = useState(''),
    [archive, setArchive] = useState(false);
  const [historyStart, setHistoryStart] = useState(() =>
      connected ? defaultScopeDates(auth.workspace?.reportingTimezone).start : '2026-09-12',
    ),
    [historyEnd, setHistoryEnd] = useState(() =>
      connected ? defaultScopeDates(auth.workspace?.reportingTimezone).end : '2026-10-09',
    ),
    [historySurvey, setHistorySurvey] = useState(connected ? 'all' : 'Customer experience survey'),
    [historyDateOpen, setHistoryDateOpen] = useState(false);
  const historyResource = useResource(
    connected && page === 'branch-history'
      ? '/analytics' +
          queryString(
            {
              branchId: new URLSearchParams(location.hash.split('?')[1]).get('id') || undefined,
              from: historyStart || undefined,
              to: historyEnd || undefined,
              surveyId: historySurvey === 'all' ? undefined : historySurvey,
            },
            auth.workspace?.reportingTimezone,
          )
      : null,
  );
  const historySurveys = useResource(connected && page === 'branch-history' ? '/surveys' : null);
  const [otherBusinesses, setOtherBusinesses] = useState([]);
  const [biz, setBiz] = useState(() =>
      connected
        ? { name: auth.workspace?.businessName || '', industry: auth.workspace?.industry || '' }
        : { name: 'Bloom & Co.', industry: 'Food & beverage' },
    ),
    [branches, setBranches] = useState(() =>
      connected
        ? []
        : new URLSearchParams(location.search).get('state') !== 'empty'
          ? initialBranches
          : [],
    ),
    [account, setAccount] = useState(
      connected
        ? {
            name: auth.user?.name || '',
            email: auth.user?.email || '',
            title: auth.workspace?.role || '',
            phone: '',
            country: '',
            photo: '',
          }
        : {
            name: 'Sara Ahmed',
            email: 'sara@example.test',
            title: 'Founder & workspace owner',
            phone: '+20 100 123 4567',
            country: 'Egypt',
            photo: '/assets/dashboard/overview/account-avatar.svg',
          },
    ),
    [draft, setDraft] = useState({}),
    [error, setError] = useState({}),
    [pending, setPending] = useState('');
  const [preferences, setPreferences] = useState({
      language: 'en',
      region: 'Egypt',
      zone: 'Africa/Cairo',
      date: 'DD/MM/YYYY',
      time: '12-Hour',
    }),
    [prefDraft, setPrefDraft] = useState(preferences),
    [toggles, setToggles] = useState({
      email: true,
      inapp: true,
      feedback: true,
      low: true,
      weekly: true,
      news: false,
      security: true,
      reports: true,
      sound: false,
      popup: true,
    }),
    [switchDraft, setSwitchDraft] = useState(toggles),
    [delivery, setDelivery] = useState('Daily digest'),
    [notificationTab, setNotificationTab] = useState('All'),
    [read, setRead] = useState([]),
    [sessions, setSessions] = useState(connected ? [] : [1, 2, 3]),
    [code, setCode] = useState(''),
    [twoFA, setTwoFA] = useState(false);
  useEffect(() => {
    if (page !== 'settings-two-factor') {
      clearEnrollment();
      setEnrollmentQr('');
      setCode('');
    }
  }, [page, clearEnrollment]);
  useEffect(() => {
    if (!connected || !settings.account) return;
    setAccount(settings.account);
    setPreferences(settings.account.preferences);
    setPrefDraft(settings.account.preferences);
    setToggles(settings.account.toggles);
    setSwitchDraft(settings.account.toggles);
    setDelivery(settings.account.delivery);
    setTwoFA(settings.account.twoFA);
    setPending(settings.account.pendingEmail || '');
  }, [connected, settings.account]);
  useEffect(() => {
    if (
      !connected ||
      page !== 'settings-profile' ||
      !settings.account ||
      profileDraftSeeded.current
    )
      return;
    profileDraftSeeded.current = true;
    setDraft({ ...settings.account });
  }, [connected, page, settings.account]);
  useEffect(() => {
    if (connected) setSessions(settings.sessions.map((s) => s.id));
  }, [connected, settings.sessions]);
  useEffect(() => {
    if (connected) setRead(settings.notifications.filter((n) => n.readAt).map((n) => n.id));
  }, [connected, settings.notifications]);
  useEffect(() => {
    let active = true;
    if (settings.enrollment?.uri)
      QRCode.toDataURL(settings.enrollment.uri, { width: 180, margin: 1 }).then((url) => {
        if (active) setEnrollmentQr(url);
      });
    else setEnrollmentQr('');
    return () => {
      active = false;
    };
  }, [settings.enrollment]);
  const lang = language,
    setLang = setLanguage;
  const ar = lang === 'ar',
    t = (s) =>
      connected && s === 'Workspace owner' && auth.workspace?.role !== 'owner'
        ? ar
          ? auth.workspace?.role === 'manager'
            ? 'مدير مساحة العمل'
            : 'مشاهد مساحة العمل'
          : auth.workspace?.role === 'manager'
            ? 'Workspace manager'
            : 'Workspace viewer'
        : ar
          ? words[s] || s
          : s,
    L = (en, arabic) => (ar ? arabic : en),
    go = (dest) => {
      location.hash = '/' + dest;
      setMobile(false);
      setMenu(false);
      setRow(null);
    },
    notify = (s) => setToast(t(s));
  useEffect(() => {
    const onHash = () => {
      const next = currentPreviewRoute();
      setPage(next);
      if (next === 'business-add') setDraft({ name: '', industry: '' });
      setQuery('');
      setError({});
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
  }, [lang, ar]);
  useEffect(() => {
    const shortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuery('');
        setModal({ type: 'search' });
      }
    };
    addEventListener('keydown', shortcut);
    return () => removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!modal)
      setDraft((old) => {
        if (!old.googlePassword && !old.googleCode) return old;
        const safe = { ...old };
        delete safe.googlePassword;
        delete safe.googleCode;
        return safe;
      });
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab') {
        const a = [...document.querySelectorAll('.modal button,.modal input')].filter(
          (x) => !x.disabled,
        );
        if (e.shiftKey && document.activeElement === a[0]) {
          e.preventDefault();
          a.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
          e.preventDefault();
          a[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.querySelector('.modal button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!connected) return;
    if (branchResource.data)
      setBranches(
        (branchResource.data.branches || branchResource.data).map((b) => ({
          ...b,
          archived: Boolean(b.archivedAt),
          responses: b.responses || 0,
        })),
      );
  }, [connected, branchResource.data]);
  useEffect(() => {
    if (!connected || !auth.workspace) return;
    setBiz({ name: auth.workspace.businessName, industry: auth.workspace.industry });
  }, [connected, auth.workspace]);
  useEffect(() => {
    if (!connected || !['branch-edit', 'branch-history'].includes(page)) return;
    const id = new URLSearchParams(location.hash.split('?')[1]).get('id');
    const current = branches.find((b) => b.id === id);
    if (current)
      setDraft((old) =>
        page === 'branch-history' || old.id !== current.id ? { ...current } : old,
      );
  }, [connected, page, branches]);
  const persistBusiness = async () => {
    if (!validate(['name', 'industry'])) return;
    if (connected) {
      const result = await branchMutation.run((signal) =>
        auth.saveWorkspace(
          {
            businessName: draft.name,
            industry: draft.industry,
            locale: language,
            reportingTimezone: auth.workspace.reportingTimezone || 'Africa/Cairo',
          },
          signal,
        ),
      );
      if (!result) return;
    }
    setBiz({ ...draft });
    notify('Changes saved');
    go('business');
  };
  const persistBranch = async () => {
    if (!validate(['name', 'country', 'city', 'address'])) return;
    if (connected) {
      const body = Object.fromEntries(
        ['name', 'country', 'city', 'address'].map((key) => [key, draft[key] || '']),
      );
      const result = await branchMutation.run((signal) =>
        productApi.send(
          '/workspaces/' +
            auth.workspace.id +
            '/branches' +
            (page === 'branch-edit' ? '/' + draft.id : ''),
          body,
          page === 'branch-edit' ? 'PATCH' : 'POST',
          signal,
        ),
      );
      if (!result) return;
      branchResource.reload();
      await auth.refresh();
    } else
      setBranches((prev) =>
        page === 'branch-add'
          ? [...prev, { ...draft, id: Date.now(), responses: 0 }]
          : prev.map((b) => (b.id === draft.id ? { ...b, ...draft } : b)),
      );
    notify('Changes saved');
    setArchive(false);
    go('branches');
  };
  const restoreBranch = async () => {
    if (!connected) return;
    const result = await branchMutation.run((signal) =>
      productApi.send(
        '/workspaces/' + auth.workspace.id + '/branches/' + draft.id,
        { archived: false },
        'PATCH',
        signal,
      ),
    );
    if (!result) return;
    branchResource.reload();
    await auth.refresh();
    setArchive(false);
    go('branches');
  };
  const archiveBranch = async () => {
    if (connected) {
      const result = await branchMutation.run((signal) =>
        productApi.send(
          '/workspaces/' + auth.workspace.id + '/branches/' + modal.branch.id,
          { archived: true },
          'PATCH',
          signal,
        ),
      );
      if (!result) return;
      branchResource.reload();
      await auth.refresh();
    } else
      setBranches((prev) =>
        prev.map((b) => (b.id === modal.branch.id ? { ...b, archived: true } : b)),
      );
    setArchive(true);
    setModal(null);
    notify(L('Branch archived. Its history is retained.', 'تمت أرشفة الفرع مع الاحتفاظ بالسجل.'));
  };
  const businessPage = page.startsWith('business') || page.startsWith('branch'),
    settingsPage = page.startsWith('settings'),
    active = branches.filter((b) => !b.archived),
    old = branches.filter((b) => b.archived);
  const btn = (text, action, primary = false, icon) => (
    <button
      type="button"
      className={'button' + (primary ? ' primary' : '')}
      disabled={connected && (settings.busy || !settings.ready)}
      onClick={action}
    >
      {icon && <I name={icon} size={18} />}
      <span>{t(text)}</span>
    </button>
  );
  const heading = (title, description, action, back) => {
    if (page.startsWith('settings') && page !== 'settings' && !back)
      back = ['Settings', 'settings'];
    return (
      <header className="page-heading">
        <div>
          <div className="title-line">
            {back && (
              <button
                className="icon-button back"
                aria-label={t(back[0])}
                title={t(back[0])}
                onClick={() => go(back[1])}
              >
                <I name="back" />
              </button>
            )}
            <h1>{t(title)}</h1>
          </div>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
    );
  };
  const field = (label, key, options = {}) => (
    <label className="field" key={key}>
      <span>
        {t(label)}
        {options.required ? ' *' : ''}
      </span>
      {options.values ? (
        <PreviewSelect
          label={t(label)}
          value={draft[key] ?? ''}
          values={options.values}
          onChange={(v) => setDraft({ ...draft, [key]: v })}
        />
      ) : (
        <input
          type={options.type || 'text'}
          disabled={
            connected &&
            (!settings.ready ||
              (page === 'branch-edit' &&
                draft.id !== new URLSearchParams(location.hash.split('?')[1]).get('id')))
          }
          autoComplete={options.type === 'password' ? 'new-password' : 'off'}
          value={draft[key] || ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          aria-invalid={!!error[key]}
          aria-describedby={error[key] ? 'error-' + key : undefined}
          placeholder={t(label)}
        />
      )}{' '}
      {error[key] && (
        <small className="error" id={'error-' + key}>
          {error[key]}
        </small>
      )}
      {options.hint && <small>{options.hint}</small>}
    </label>
  );
  const validate = (keys) => {
    const e = {};
    keys.forEach((k) => {
      if (!String(draft[k] || '').trim()) e[k] = L('This field is required.', 'هذا الحقل مطلوب.');
    });
    setError(e);
    return !Object.keys(e).length;
  };
  const cancel = (to) => setModal({ type: 'discard', to });
  const actions = (save, to, label = 'Save changes') =>
    ['business-edit', 'settings-profile', 'settings-password'].includes(page) ? (
      <div className="stacked-form-actions">
        {btn(label, save, true)}
        {page === 'settings-password' && (
          <div className="subtle-strip">
            {L(
              'Other sessions will be signed out. This session stays active.',
              'تنتهي الجلسات الأخرى وتبقى هذه الجلسة نشطة.',
            )}
          </div>
        )}
        <div className="cancel-row">
          <small>{L('Your changes have not been saved yet.', 'لم يتم حفظ التغييرات بعد.')}</small>
          {btn('Cancel', () => cancel(to))}
        </div>
        {page === 'business-edit' && (
          <div className="business-status">
            <I name="building" />
            <small>{biz.name} · Café · Egypt</small>
          </div>
        )}
      </div>
    ) : (
      <div className="form-actions">
        <small>{L('Changes apply only to your account.', 'تنطبق التغييرات على حسابك فقط.')}</small>
        <div>
          {btn('Cancel', () => cancel(to))}
          {btn(label, save, true)}
        </div>
      </div>
    );
  const note = (title, body) => (
    <aside className="guidance-stack">
      <section className="side-note">
        {(page === 'business-edit' || page === 'settings-profile' || page === 'settings') && (
          <span className="guidance-icon">
            <I name={page === 'business-edit' ? 'building' : 'user'} />
          </span>
        )}
        <h3>{title}</h3>
        <p>{body}</p>
        {['business-edit', 'settings-profile', 'settings'].includes(page) && (
          <small className="note-divider">
            {page === 'business-edit'
              ? L(
                  'Use the business name your team recognizes and an industry that best describes it.',
                  'استخدم اسم النشاط الذي يعرفه فريقك والمجال الذي يصفه بدقة.',
                )
              : L(
                  'Your sign-in email is managed separately. Changing profile details does not affect your workspace role.',
                  'يتم إدارة بريد الدخول بشكل منفصل. تعديل الملف لا يؤثر على دورك في مساحة العمل.',
                )}
          </small>
        )}
      </section>
      {['business-edit', 'settings-profile', 'settings'].includes(page) && (
        <section className="card context-card">
          <h3>{t('Your workspace')}</h3>
          <p>{biz.name}</p>
          <p>
            {account.name} · {t('Workspace owner')}
          </p>
          <small>
            {L(
              'These settings apply to your personal NUVIA account, not your whole team.',
              'هذه الإعدادات تخص حسابك الشخصي فقط، وليس الفريق بأكمله.',
            )}
          </small>
        </section>
      )}
    </aside>
  );
  const linkAction = (label, dest) => (
    <button
      className="text-link action-arrow"
      onClick={() => {
        setDraft({});
        setCode('');
        go(dest);
      }}
    >
      {t(label)}
      <UiArrow size={14} rtl={ar} />
    </button>
  );
  const currentSettingsSection = [
    'settings',
    'settings-personal',
    'settings-account',
    'settings-profile',
    'settings-email',
  ].includes(page)
    ? 'settings'
    : page === 'settings-language'
      ? 'settings-language'
      : page.includes('notification')
        ? 'settings-notifications'
        : 'settings-security';
  const selectSettingsSection = (dest) => {
    setPrefDraft(preferences);
    setCode('');
    go(dest);
  };
  const settingsTabs = (
    <nav className="tabs desktop-settings-sections" aria-label={t('Settings')}>
      {tabs.map(([label, dest]) => (
        <button
          key={dest}
          className={currentSettingsSection === dest ? 'selected' : ''}
          onClick={() => selectSettingsSection(dest)}
        >
          {t(label)}
        </button>
      ))}
    </nav>
  );
  const businessTabs = (
    <nav className="tabs">
      {[
        ['Business profile', 'business'],
        ['Branches', 'branches'],
      ].map(([label, dest]) => (
        <button
          className={
            (dest === 'business' ? page.startsWith('business') : page.startsWith('branch'))
              ? 'selected'
              : ''
          }
          key={dest}
          onClick={() => go(dest)}
        >
          {t(label)}
        </button>
      ))}
    </nav>
  );
  const toggle = (label, key, values, setValues, body, disabled = false) => (
    <div className="setting-row" key={key}>
      <div>
        <strong>{t(label)}</strong>
        {body && <p>{body}</p>}
      </div>
      <button
        className="switch"
        type="button"
        role="switch"
        aria-label={t(label)}
        aria-checked={values[key]}
        disabled={disabled}
        onClick={() => setValues({ ...values, [key]: !values[key] })}
      >
        <span />
      </button>
    </div>
  );
  const editBiz = () => {
      setDraft({ ...biz });
      go('business-edit');
    },
    editBranch = (b) => {
      setDraft(b ? { ...b } : { name: '', country: 'Egypt', city: '', address: '' });
      go(b ? 'branch-edit?id=' + encodeURIComponent(b.id) : 'branch-add');
    },
    editProfile = () => {
      setDraft({ ...account });
      go('settings-profile');
    };
  let content;
  if (page === 'business')
    content = (
      <>
        {heading(
          'Business profile',
          L(
            'View and manage the business information behind your workspace.',
            'اعرض وأدر بيانات النشاط المرتبط بمساحة عملك.',
          ),
          btn('Edit profile', editBiz, true, 'edit'),
        )}
        {businessTabs}
        <section className="card identity-card">
          <span className="business-avatar">{biz.name?.slice(0, 1)}</span>
          <div>
            <h2>{biz.name}</h2>
            <p>{biz.industry}</p>
          </div>
          <span className="badge neutral">{biz.industry}</span>
        </section>
        <section className="side-note profile-guidance">
          <I name="info-large" />
          <h3>{L('Business information, in one place', 'بيانات نشاطك في مكان واحد')}</h3>
          <p>
            {L(
              'Keep your business identity here. Branch locations are managed in Branches, and plan details in Subscription.',
              'احتفظ بهوية نشاطك هنا. أدر مواقع الفروع من الفروع وتفاصيل الباقات من الاشتراك.',
            )}
          </p>
        </section>
        <div className="two-col business-profile-grid">
          <section className="card">
            <h2>{t('Business information')}</h2>
            <p className="muted">
              {L(
                'The details used to personalize your workspace.',
                'البيانات المستخدمة لتخصيص مساحة عملك.',
              )}
            </p>
            <div className="business-field-pair">
              <div className="profile-detail">
                <span>{t('Business name')}</span>
                <strong>{biz.name}</strong>
                <small>{L('The name of your business in NUVIA.', 'اسم نشاطك في NUVIA.')}</small>
              </div>
              <div className="profile-detail">
                <span>{t('Business type / Industry')}</span>
                <strong>{biz.industry}</strong>
                <small>
                  {L(
                    'Helps us recommend relevant survey templates.',
                    'يساعدنا في اقتراح قوالب استبيانات مناسبة.',
                  )}
                </small>
              </div>
            </div>
            <div className="business-status">
              <I name="building" />
              <small>
                {L(
                  'Business identity · Editable from Edit profile',
                  'هوية النشاط · قابلة للتعديل من تعديل الملف',
                )}
              </small>
            </div>
          </section>
          <div className="guidance-stack">
            <section className="card workspace-context">
              <h2>{t('Your workspace')}</h2>
              <span className="muted small-label">
                {connected && auth.workspace?.role !== 'owner'
                  ? L('Your account', 'حسابك')
                  : t('Workspace owner')}
              </span>
              <div className="owner-line">
                <span className="avatar small">{account.name?.slice(0, 2)}</span>
                <strong>{account.name}</strong>
              </div>
              <div className="branch-count">
                <span>{t('Active branches')}</span>
                <b>{active.length}</b>
              </div>
              <small>{active.map((b) => b.name).join(' · ')}</small>
              <button
                className="text-link action-arrow business-branches-link"
                onClick={() => go('branches')}
              >
                {L('View branches', 'عرض الفروع')}
                <UiArrow rtl={ar} />
              </button>
              {connected && (
                <div className="inline-actions">
                  <a className="button" href="#/team">
                    {L('Team management', 'إدارة الفريق')}
                  </a>
                  <a className="button" href="#/business-page">
                    {L('Public business page', 'صفحة النشاط العامة')}
                  </a>
                </div>
              )}
            </section>
          </div>
        </div>
      </>
    );
  else if (page === 'business-edit')
    content = (
      <>
        {heading(
          L('Edit business profile', 'تعديل ملف النشاط'),
          L(
            'Update the business information used in your workspace.',
            'حدّث بيانات نشاطك في مساحة العمل.',
          ),
          null,
          ['Business profile', 'business'],
        )}
        {businessTabs}
        <div className="edit-layout">
          <form noValidate className="card" onSubmit={(e) => e.preventDefault()}>
            <h2>{t('Business information')}</h2>
            <p>{t('Fields marked * are required.')}</p>
            {field('Business name', 'name', { required: true })}
            {field('Business type / Industry', 'industry', { required: true })}
            {actions(persistBusiness, 'business')}
          </form>
          {note(
            L('Make it your business', 'مساحة تعبر عن نشاطك'),
            L(
              'Your business name and industry help make your NUVIA workspace feel relevant to you.',
              'اسم النشاط ومجاله يساعدان في تخصيص مساحة عملك.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'branches')
    content = (
      <>
        {heading(
          'Branches',
          L(
            'Manage your locations and explore the experience behind each branch.',
            'أدر مواقعك وتعرف على تجربة العملاء في كل فرع.',
          ),
          btn('Add branch', () => editBranch(), true, 'plus'),
        )}
        {businessTabs}
        <div className="metrics">
          <Metric
            title={t('Active branches')}
            value={active.length}
            detail={active.map((b) => b.name).join(' · ')}
          />
          <Metric
            title={t('Responses')}
            value={branches.reduce((n, b) => n + b.responses, 0).toLocaleString()}
            detail={L('Across all branches · selected period', 'كل الفروع · الفترة المحددة')}
          />
          <Metric
            title={
              connected && auth.workspace?.role !== 'owner'
                ? L('Workspace role', 'دورك في المساحة')
                : t('Business owner')
            }
            value={
              connected && auth.workspace?.role !== 'owner' ? auth.workspace.role : account.name
            }
            detail={biz.name}
          />
        </div>
        <section className="card table-card">
          <div className="table-tools">
            <div className="segmented">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  className={archive === v ? 'selected' : ''}
                  onClick={() => setArchive(v)}
                >
                  {t(v ? 'Archived' : 'Active branches')}{' '}
                  <span>{v ? old.length : active.length}</span>
                </button>
              ))}
            </div>
            <label className="search">
              <I name="search" size={18} />
              <input
                aria-label={t('Search branches')}
                placeholder={t('Search branches')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="table-head">
            {['Branch name', 'Location', 'Responses', 'Status', 'Actions'].map((s) => (
              <span key={s}>{t(s)}</span>
            ))}
          </div>
          {branches
            .filter(
              (b) =>
                !!b.archived === archive &&
                `${b.name} ${b.city}`.toLowerCase().includes(query.toLowerCase()),
            )
            .map((b) => (
              <div className="branch-row" key={b.id}>
                <strong>
                  <span className="tile">
                    <I name="business" size={18} />
                  </span>
                  {b.name}
                </strong>
                <span>
                  {b.city} · {b.country}
                </span>
                <span>
                  {b.responses.toLocaleString()}{' '}
                  <small className="mobile-only">{t('Responses')}</small>
                </span>
                <span>
                  <span className={'badge ' + (b.archived ? 'neutral' : 'green')}>
                    {t(b.archived ? 'Archived' : 'Active')}
                  </span>
                </span>
                <div className="row-actions">
                  <button
                    className="text-link action-arrow"
                    onClick={() => {
                      setDraft({ ...b });
                      go('branch-history?id=' + encodeURIComponent(b.id));
                    }}
                  >
                    {t(b.archived ? 'View past analytics' : 'View Analytics')}
                    <UiArrow rtl={ar} />
                  </button>
                  <div className="row-menu-wrap">
                    <button
                      className="icon-button"
                      aria-label={t('Actions') + ' ' + b.name}
                      aria-expanded={row === b.id}
                      onClick={() => setRow(row === b.id ? null : b.id)}
                    >
                      <I name="more" />
                    </button>
                    {row === b.id && (
                      <div className="dropdown row-menu">
                        {!b.archived ? (
                          <>
                            <button
                              disabled={connected && auth.workspace?.role !== 'owner'}
                              onClick={() => editBranch(b)}
                            >
                              {t('Edit')}
                            </button>
                            <button
                              disabled={
                                connected && (b.isPrimary || auth.workspace?.role !== 'owner')
                              }
                              onClick={() => {
                                setRow(null);
                                setModal({ type: 'archive', branch: b });
                              }}
                            >
                              {t('Archive branch')}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setDraft({ ...b });
                              go('branch-history?id=' + encodeURIComponent(b.id));
                            }}
                          >
                            {t('View past analytics')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          {!branches.some(
            (b) =>
              !!b.archived === archive &&
              `${b.name} ${b.city}`.toLowerCase().includes(query.toLowerCase()),
          ) && (
            <div className="table-empty">
              <I name="business" size={34} />
              <h3>
                {query
                  ? L('No matching branches', 'لا توجد فروع مطابقة')
                  : L('No archived branches', 'لا توجد فروع مؤرشفة')}
              </h3>
              <p>
                {L(
                  'Try another search or check your active branches.',
                  'جرّب البحث باسم آخر أو اعرض الفروع النشطة.',
                )}
              </p>
            </div>
          )}
          <div className="table-footer">
            {branches.filter((b) => !!b.archived === archive).length}{' '}
            {t(archive ? 'Archived' : 'Active branches')}
          </div>
        </section>
        <div className="info-strip">
          <I name="archive" />
          <div>
            <strong>
              {L('Closed a location? Keep its history.', 'أغلقت أحد الفروع؟ احتفظ بسجله.')}
            </strong>
            <p>
              {L(
                'Archiving removes a branch from active lists without deleting earlier responses or scores.',
                'الأرشفة تخفي الفرع من القوائم النشطة ولا تحذف الردود والدرجات السابقة.',
              )}
            </p>
          </div>
        </div>
      </>
    );
  else if (page === 'business-add')
    content = (
      <>
        {heading(
          L('Add business', 'إضافة نشاط'),
          L('Create a separate business for your workspace.', 'أضف نشاطًا مستقلاً إلى مساحة عملك.'),
          null,
          ['Business profile', 'business'],
        )}
        <div className="edit-layout">
          <form noValidate className="card" onSubmit={(e) => e.preventDefault()}>
            <h2>{t('Business information')}</h2>
            <p>{t('Fields marked * are required.')}</p>
            {field('Business name', 'name', { required: true })}
            {field('Business type / Industry', 'industry', { required: true })}
            {actions(
              async () => {
                if (!validate(['name', 'industry'])) return;
                if (connected) {
                  const result = await branchMutation.run((signal) =>
                    productApi.send(
                      '/workspaces',
                      {
                        businessName: draft.name,
                        industry: draft.industry,
                        locale: language,
                        reportingTimezone: auth.workspace?.reportingTimezone || 'Africa/Cairo',
                      },
                      'POST',
                      signal,
                    ),
                  );
                  if (!result) return;
                  await auth.refresh();
                  go('business');
                  return;
                }
                notify(L('Business created in this preview.', 'تم إنشاء النشاط في هذه المعاينة.'));
                setOtherBusinesses((prev) => [...prev, { ...biz, branches: [...branches] }]);
                setBiz({ name: draft.name, industry: draft.industry });
                setBranches([]);
                setSample(true);
                go('business');
              },
              'business',
              L('Create business', 'إنشاء نشاط'),
            )}
          </form>
          {note(
            L('A separate business', 'نشاط مستقل'),
            L(
              'Each business has its own profile and branches. Adding one does not change the existing business.',
              'لكل نشاط ملفه وفروعه. إضافة نشاط لا تعدّل بيانات النشاط الحالي.',
            ),
          )}
        </div>
      </>
    );
  else if (['branch-add', 'branch-edit'].includes(page))
    content = (
      <>
        {heading(
          page === 'branch-add' ? 'Add branch' : 'Edit branch',
          L(
            'Keep responses organized by location. Existing history stays connected.',
            'نظّم الردود حسب الموقع مع الاحتفاظ بالسجل السابق.',
          ),
          null,
          ['Back to branches', 'branches'],
        )}
        <div className="edit-layout">
          <form noValidate className="card" onSubmit={(e) => e.preventDefault()}>
            <h2>{t('Branch information')}</h2>
            <p>{t('Fields marked * are required.')}</p>
            {field('Branch name', 'name', { required: true })}
            <h3>{t('Location')}</h3>
            <div className="field-grid">
              {field('Country', 'country', { required: true })}
              {field('City', 'city', { required: true })}
            </div>
            {field('Street address', 'address', { required: true })}
            {actions(persistBranch, 'branches', 'Save branch')}
          </form>
          {note(
            L('Keep your context', 'احتفظ بسياق نشاطك'),
            L(
              'Changes update branch information. Existing responses and historical scores stay associated with the branch.',
              'التعديلات تحدث بيانات الفرع. تظل الردود والدرجات السابقة مرتبطة به.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'branch-history')
    content = (
      <>
        {heading(
          draft.name || t('Branch information'),
          L(
            'Branch information and preserved historical analytics.',
            'بيانات الفرع والتحليلات السابقة المحفوظة.',
          ),
          connected && draft.archived && auth.workspace?.role === 'owner'
            ? btn(L('Restore branch', 'استعادة الفرع'), restoreBranch, true)
            : null,
          ['Back to branches', 'branches'],
        )}
        {draft.archived && (
          <div className="info-strip">
            <I name="archive" />
            <div>
              <strong>
                {t('Archived')} · {t('History retained')}
              </strong>
              <p>
                {L(
                  'Hidden from active lists. Earlier responses and scores remain available.',
                  'مخفي من القوائم النشطة مع بقاء الردود والدرجات السابقة.',
                )}
              </p>
            </div>
          </div>
        )}
        <div className="history-controls">
          <div className="history-date-wrap">
            <button
              className="button"
              onClick={() => setHistoryDateOpen(!historyDateOpen)}
              aria-expanded={historyDateOpen}
            >
              <img
                className="figma-icon"
                src="/assets/dashboard/overview/calendar-days.svg"
                alt=""
              />
              {historyStart === '2026-09-12' && historyEnd === '2026-10-09'
                ? '12 Sep – 9 Oct, 2026'
                : historyStart + ' – ' + historyEnd}
            </button>
            {historyDateOpen && (
              <section className="history-date-popover card">
                <label>
                  {L('From', 'من')}
                  <input
                    type="date"
                    value={historyStart}
                    max={historyEnd}
                    onChange={(e) => setHistoryStart(e.target.value)}
                  />
                </label>
                <label>
                  {L('To', 'إلى')}
                  <input
                    type="date"
                    value={historyEnd}
                    min={historyStart}
                    onChange={(e) => setHistoryEnd(e.target.value)}
                  />
                </label>
                <button className="button primary" onClick={() => setHistoryDateOpen(false)}>
                  {L('Apply', 'تطبيق')}
                </button>
              </section>
            )}
          </div>
          <label className="field history-survey">
            <span className="sr-only">{L('Survey', 'الاستبيان')}</span>
            {connected ? (
              <ChoiceMenu
                label={L('Survey', 'الاستبيان')}
                value={historySurvey}
                onChange={setHistorySurvey}
                options={[
                  { value: 'all', label: L('All surveys', 'كل الاستبيانات') },
                  ...(historySurveys.data?.surveys || []).map((survey) => ({
                    value: survey.id,
                    label: survey.title,
                  })),
                ]}
              />
            ) : (
              <PreviewSelect
                label={L('Survey', 'الاستبيان')}
                value={historySurvey}
                values={['Customer experience survey']}
                onChange={setHistorySurvey}
              />
            )}
          </label>
        </div>
        <div className="metrics">
          <Metric
            title={t('Responses')}
            value={connected ? (historyResource.data?.totalResponses ?? '—') : draft.responses}
            detail={connected ? historyStart + ' – ' + historyEnd : '12 Sep–9 Oct 2026'}
          />
          <Metric
            title={L('Positive sentiment', 'المشاعر الإيجابية')}
            value={
              connected
                ? historyResource.data?.analyzedResponses
                  ? (
                      ((historyResource.data.sentimentDistribution?.positive || 0) /
                        historyResource.data.analyzedResponses) *
                      100
                    ).toLocaleString(language, { maximumFractionDigits: 1 }) + '%'
                  : '—'
                : draft.responses
                  ? '77.9%'
                  : '—'
            }
          />
          <Metric
            title={L('Speed score', 'تقييم السرعة')}
            value={
              connected
                ? (historyResource.data?.aspectScores
                    ?.find((aspect) => /speed|wait|سرعة|انتظار/i.test(aspect.aspect))
                    ?.score?.toLocaleString(language, { maximumFractionDigits: 1 }) ?? '—')
                : draft.responses
                  ? '6.0 / 10'
                  : '—'
            }
          />
        </div>
        <div className="two-col">
          <section className="card">
            <h2>{L('Historical aspect scores', 'درجات الجوانب السابقة')}</h2>
            {connected ? (
              historyResource.data?.aspectScores?.length ? (
                historyResource.data.aspectScores.map((aspect) => (
                  <div className="score" key={aspect.aspect}>
                    <span>{aspect.aspect}</span>
                    <div>
                      <span
                        style={{ width: Math.max(0, Math.min(100, aspect.score * 10)) + '%' }}
                      />
                    </div>
                    <strong>
                      {aspect.score.toLocaleString(language, { maximumFractionDigits: 1 })}
                    </strong>
                  </div>
                ))
              ) : (
                <p>
                  {L(
                    'Aspect scores need analyzed feedback in this scope.',
                    'تحتاج درجات الجوانب آراء محللة ضمن هذا النطاق.',
                  )}
                </p>
              )
            ) : draft.responses ? (
              [
                ['Service', 'الخدمة', 8.3],
                ['Price', 'السعر', 6.6],
                ['Speed', 'السرعة', 6],
                ['Cleanliness', 'النظافة', 8.7],
                ['Product quality', 'جودة المنتج', 8.7],
              ].map(([en, arabic, n]) => (
                <div className="score" key={en}>
                  <span>{L(en, arabic)}</span>
                  <div>
                    <span style={{ width: n * 10 + '%' }} />
                  </div>
                  <strong>{n}</strong>
                </div>
              ))
            ) : (
              <p>
                {L('Scores appear after feedback is received.', 'تظهر الدرجات بعد وصول الردود.')}
              </p>
            )}
          </section>
          <section className="card">
            <h2>{t('Branch information')}</h2>
            <dl>
              <dt>{t('Branch name')}</dt>
              <dd>{draft.name}</dd>
              <dt>{t('Location')}</dt>
              <dd>
                {draft.address}, {draft.city}, {draft.country}
              </dd>
              <dt>{t('Business')}</dt>
              <dd>{biz.name}</dd>
            </dl>
          </section>
        </div>
      </>
    );
  else if (['settings', 'settings-personal'].includes(page))
    content = (
      <>
        {heading(
          page === 'settings-personal' ? 'Personal information' : 'Account settings',
          L(
            'Manage your personal information and how you appear in your workspace.',
            'أدر بياناتك الشخصية وطريقة ظهورك في مساحة العمل.',
          ),
        )}
        {settingsTabs}
        <div className="edit-layout">
          <div>
            <section className="card">
              <h2>{t('Personal information')}</h2>
              <p className="muted">
                {L(
                  'Your profile is visible to the people in your workspace.',
                  'ملفك مرئي للأشخاص في مساحة عملك.',
                )}
              </p>
              <div className="profile-summary">
                <span className="avatar large">
                  {account.photo ? <img src={account.photo} alt="" /> : <I name="user" />}
                </span>
                <div>
                  <h3>{account.name}</h3>
                  <p>{account.title}</p>
                </div>
                <span className="badge green">{t('Workspace owner')}</span>
              </div>
              <dl className="details-grid">
                {[
                  ['Full name', account.name],
                  [
                    'Member since',
                    connected
                      ? account.createdAt
                        ? new Date(account.createdAt).toLocaleDateString(language)
                        : '—'
                      : L('12 March 2025', '١٢ مارس ٢٠٢٥'),
                  ],
                  ['Email address', account.email],
                  ['Phone number', account.phone],
                  ['Country', account.country],
                  ['Your workspace', biz.name],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{t(k)}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="card-bottom">
                <span className="verified">
                  <I name="check" size={16} />
                  {L('Email verified', 'البريد مؤكد')}
                </span>
                {btn('Edit account details', editProfile)}
              </div>
            </section>
            {page !== 'settings-personal' && (
              <section className="card spaced">
                <h2>{t('Sign-in information')}</h2>
                <div className="setting-row">
                  <div>
                    <strong>{t('Email address')}</strong>
                    <p>{account.email}</p>
                  </div>
                  {btn('Change email', () => {
                    setDraft({ email: '', password: '' });
                    go('settings-email');
                  })}
                </div>
              </section>
            )}
          </div>
          {note(
            L('Your account, your identity', 'حسابك وهويتك'),
            L(
              'Keep your details up to date. Business information and branches are managed under Business.',
              'حافظ على بياناتك محدثة. أدر معلومات النشاط والفروع من صفحة النشاط التجاري.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-profile')
    content = (
      <>
        {heading(
          'Edit account details',
          L(
            'Update the details associated with your personal NUVIA account.',
            'حدّث البيانات المرتبطة بحسابك الشخصي.',
          ),
          null,
          ['Account settings', 'settings'],
        )}
        {settingsTabs}
        <div className="edit-layout">
          <form noValidate className="card" onSubmit={(e) => e.preventDefault()}>
            <h2>{t('Personal information')}</h2>
            <div className="photo-row">
              <span className="avatar large">
                {draft.photo ? <img src={draft.photo} alt="" /> : <I name="user" />}
              </span>
              <label className="button">
                {t('Upload photo')}
                <input
                  className="visually-hidden"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      !['image/png', 'image/jpeg'].includes(file.type) ||
                      file.size > 2 * 1024 * 1024
                    ) {
                      notify(
                        L('Choose JPG or PNG under 2 MB.', 'اختر JPG أو PNG أصغر من ٢ ميجابايت.'),
                      );
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const image = new Image();
                      image.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 128;
                        canvas.height = 128;
                        canvas.getContext('2d').drawImage(image, 0, 0, 128, 128);
                        setDraft((prev) => ({
                          ...prev,
                          photo: canvas.toDataURL('image/jpeg', 0.75),
                        }));
                      };
                      image.src = reader.result;
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {btn('Remove', () => setDraft({ ...draft, photo: '' }))}
            </div>
            <small className="muted">JPG / PNG · Max 2 MB</small>
            <div className="field-grid">
              {field('Phone number', 'phone', { type: 'tel' })}
              {field('Country', 'country', {
                values: [
                  'Egypt',
                  'Saudi Arabia',
                  'United Arab Emirates',
                  'United Kingdom',
                  'Other',
                ],
              })}
            </div>
            {field('Full name', 'name', { required: true })}
            {field('Job title', 'title')}
            {actions(async () => {
              if (validate(['name'])) {
                if (connected && !(await settings.saveProfile(draft))) return;
                setAccount({ ...draft });
                setDraft({});
                notify('Changes saved');
                go('settings');
              }
            }, 'settings')}
          </form>
          {note(
            L('Make your profile familiar', 'ملف شخصي يعرفه فريقك'),
            L(
              'Use the name your team knows you by. Changing your profile does not change your workspace role.',
              'استخدم الاسم الذي يعرفك به فريقك. تعديل الملف لا يغير دورك في مساحة العمل.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-email')
    content = (
      <>
        {heading(
          'Change email',
          L(
            'Keep your account connected to an email address you can access.',
            'اربط حسابك ببريد يمكنك الوصول إليه.',
          ),
          null,
          ['Account settings', 'settings'],
        )}
        {settingsTabs}
        <div className="edit-layout">
          <section className="card">
            <h2>{t('Email address')}</h2>
            <p>
              {account.email} <span className="badge green">{L('Verified', 'مؤكد')}</span>
            </p>
            {pending ? (
              <>
                <div className="info-strip">
                  <I name="mail" />
                  <div>
                    <strong>{L('Check your new inbox', 'تحقق من بريدك الجديد')}</strong>
                    <p>{pending}</p>
                    <p>
                      {L(
                        'Your email changes only after verification. Continue signing in with your current address.',
                        'يتغير البريد بعد التأكيد فقط. استمر بالدخول ببريدك الحالي.',
                      )}
                    </p>
                  </div>
                </div>
                <div className="inline-actions">
                  {btn(L('Resend verification email', 'إعادة إرسال رابط التأكيد'), () =>
                    connected
                      ? settings.resendEmail()
                      : notify(L('Preview only. No email sent.', 'معاينة فقط، لم يتم إرسال بريد.')),
                  )}
                  {btn(L('Cancel email change', 'إلغاء تغيير البريد'), async () => {
                    if (connected && !(await settings.cancelEmail())) return;
                    setPending('');
                  })}
                </div>
              </>
            ) : (
              <>
                {field('New email address', 'email', { type: 'email', required: true })}
                {field('Current password', 'password', { type: 'password', required: true })}
                {connected && twoFA && field(L('Authenticator code', 'رمز المصادقة'), 'code')}
                {actions(async () => {
                  if (!validate(['email', 'password'])) return;
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
                    setError({ email: L('Enter a valid email.', 'أدخل بريدًا صالحًا.') });
                    return;
                  }
                  if (
                    connected &&
                    !(await settings.changeEmail({
                      email: draft.email,
                      currentPassword: draft.password,
                      ...(draft.code ? { code: draft.code } : {}),
                    }))
                  )
                    return;
                  setPending(draft.email);
                  setDraft({});
                  notify(
                    L(
                      connected
                        ? 'Verification email requested.'
                        : 'Pending verification preview. No email sent.',
                      connected
                        ? 'تم طلب رسالة التأكيد.'
                        : 'معاينة انتظار التأكيد، لم يتم إرسال بريد.',
                    ),
                  );
                }, 'settings')}
              </>
            )}
          </section>
          {note(
            L('Your sign-in email', 'بريد تسجيل الدخول'),
            L(
              connected
                ? 'Your current email stays active until you verify the new address.'
                : 'This preview does not send emails or change your real account.',
              connected
                ? 'يبقى بريدك الحالي نشطًا حتى تأكيد البريد الجديد.'
                : 'هذه المعاينة لا ترسل بريدًا أو تغيّر حسابك الحقيقي.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-language')
    content = (
      <>
        {heading(
          'Language settings',
          L(
            'Choose the language and regional formats that feel right for you.',
            'اختر اللغة وتنسيقات المنطقة المناسبة لك.',
          ),
        )}
        {settingsTabs}
        <div className="edit-layout">
          <section className="card">
            <h2>{L('Language & region', 'اللغة والمنطقة')}</h2>
            {[
              [
                'Display language',
                'language',
                [
                  ['en', 'English'],
                  ['ar', 'العربية'],
                ],
              ],
              [
                'Region',
                'region',
                ['Egypt', 'United Kingdom', 'Saudi Arabia', 'United Arab Emirates'],
              ],
              ['Time zone', 'zone', ['Africa/Cairo', 'Europe/London', 'Asia/Riyadh', 'Asia/Dubai']],
              ['Date format', 'date', ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']],
              ['Time format', 'time', ['12-Hour', '24-Hour']],
            ].map(([label, key, opts]) => (
              <label className="field" key={key}>
                <span>{t(label)}</span>
                <PreviewSelect
                  label={t(label)}
                  value={prefDraft[key]}
                  values={opts}
                  onChange={(v) => setPrefDraft({ ...prefDraft, [key]: v })}
                />
              </label>
            ))}
            <div className="subtle-strip">
              <strong>{t('Format preview')}</strong>
              <p>
                {prefDraft.date === 'YYYY-MM-DD'
                  ? '2026-10-22'
                  : prefDraft.date === 'MM/DD/YYYY'
                    ? '10/22/2026'
                    : '22/10/2026'}{' '}
                ·{' '}
                {new Intl.DateTimeFormat(prefDraft.language, {
                  timeZone: prefDraft.zone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: prefDraft.time === '12-Hour',
                }).format(new Date('2026-10-22T07:30:00Z'))}{' '}
                ·{' '}
                {new Intl.NumberFormat(prefDraft.language, { minimumFractionDigits: 2 }).format(
                  1248.5,
                )}
              </p>
            </div>
            <div className="form-actions">
              <small>
                {L('Changes apply only after you save.', 'تطبق التغييرات بعد الحفظ فقط.')}
              </small>
              <div>
                {btn('Cancel', () => {
                  setPrefDraft(preferences);
                  go('settings');
                })}
                {btn(
                  'Save changes',
                  async () => {
                    if (connected && !(await settings.savePreferences(prefDraft))) return;
                    setPreferences(prefDraft);
                    setLang(prefDraft.language);
                    notify('Changes saved');
                  },
                  true,
                )}
              </div>
            </div>
          </section>
          {note(
            L('A workspace in your language', 'مساحة عمل بلغتك'),
            L(
              'These preferences change your interface and how dates, times and numbers are displayed.',
              'تغيّر هذه التفضيلات لغة الواجهة وطريقة عرض التواريخ والأوقات والأرقام.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-notifications')
    content = (
      <>
        {heading(
          'Notification settings',
          L(
            'Stay informed without the noise. Choose what you receive and where.',
            'ابقَ مطلعًا دون إزعاج. اختر ما يصلك وأين.',
          ),
        )}
        {settingsTabs}
        <div className="edit-layout">
          <section className="card">
            <h2>{L('Notification channels', 'قنوات الإشعارات')}</h2>
            <p className="muted">
              {L('Control how NUVIA reaches you.', 'تحكم في طريقة تواصل NUVIA معك.')}
            </p>
            <div className="channels-grid">
              {[
                ['email', 'Email notifications', 'settings-notifications-email'],
                ['inapp', 'In-app notifications', 'settings-notifications-inapp'],
              ].map(([key, label, dest]) => (
                <div className="channel-card" key={key}>
                  <button
                    className="switch"
                    type="button"
                    role="switch"
                    aria-label={t(label)}
                    aria-checked={switchDraft[key]}
                    onClick={() => setSwitchDraft({ ...switchDraft, [key]: !switchDraft[key] })}
                  >
                    <span />
                  </button>
                  <h3>{t(label)}</h3>
                  <p>
                    {L(
                      key === 'email'
                        ? 'Feedback, reports and workspace updates sent to your inbox.'
                        : 'Updates in your NUVIA notification centre while you work.',
                      key === 'email'
                        ? 'الآراء والتقارير وتحديثات مساحة العمل في بريدك.'
                        : 'تحديثات داخل مركز الإشعارات أثناء العمل.',
                    )}
                  </p>
                  <button
                    className="button action-arrow"
                    onClick={() => {
                      setSwitchDraft({ ...toggles });
                      go(dest);
                    }}
                  >
                    {t('Manage preferences')}
                    <UiArrow size={14} rtl={ar} />
                  </button>
                </div>
              ))}
            </div>
            <div className="subtle-strip">
              <strong className="action-arrow">
                <I name="info" />
                {L('Email delivery', 'إرسال البريد')}
              </strong>
              <p>
                {L('Notifications are sent to', 'ترسل الإشعارات إلى')} {account.email}
              </p>
            </div>
            <div className="form-actions">
              <small>
                {L('Changes apply only to your account.', 'تنطبق التغييرات على حسابك فقط.')}
              </small>
              <div>
                {btn('Cancel', () => {
                  setSwitchDraft({ ...toggles });
                  go('settings');
                })}
                {btn(
                  'Save changes',
                  async () => {
                    if (connected && !(await settings.saveNotifications(switchDraft, delivery)))
                      return;
                    setToggles({ ...switchDraft });
                    notify('Changes saved');
                  },
                  true,
                )}
              </div>
            </div>
          </section>
          {note(
            L('Stay in the loop', 'ابقَ على اطلاع'),
            L(
              'Choose the channels that fit your day. Fine-tune each one to focus on the updates that matter most. Security alerts and essential account notices always stay on.',
              'اختر القنوات التي تناسب يومك وخصص كل واحدة للتحديثات المهمة. تبقى تنبيهات الأمان والحساب الأساسية مفعلة.',
            ),
          )}
        </div>
      </>
    );
  else if (page.startsWith('settings-notifications-')) {
    const email = page.endsWith('email');
    content = (
      <>
        {heading(
          email ? 'Email notifications' : 'In-app notifications',
          L('Choose the updates that matter to you.', 'اختر التحديثات التي تهمك.'),
          null,
          ['Notification settings', 'settings-notifications'],
        )}
        {settingsTabs}
        <div className="edit-layout">
          <section className="card">
            <h2>{t(email ? 'Email notifications' : 'In-app notifications')}</h2>
            {(email
              ? [
                  ['feedback', 'New customer feedback'],
                  ['low', 'Low-rating alerts'],
                  ['weekly', 'Weekly performance report'],
                  ['news', 'Product news & tips'],
                  ['security', 'Account & security'],
                ]
              : [
                  ['feedback', 'New customer feedback'],
                  ['low', 'Low-rating alerts'],
                  ['reports', 'Reports ready to view'],
                  ['sound', 'Play a notification sound'],
                  ['popup', 'Show pop-up alerts'],
                ]
            ).map(([key, label]) =>
              toggle(
                label,
                key,
                switchDraft,
                setSwitchDraft,
                key === 'security'
                  ? L(
                      'Essential security notices are always enabled.',
                      'تنبيهات الأمان الأساسية مفعلة دائمًا.',
                    )
                  : key === 'low'
                    ? L(
                        'Ratings of 2 stars or below. Sent immediately.',
                        'تقييمات بنجمتين أو أقل. ترسل فورًا.',
                      )
                    : null,
                key === 'security',
              ),
            )}
            {email && (
              <label className="field">
                <span>{L('Routine feedback delivery', 'موعد إرسال ملخص الآراء')}</span>
                <PreviewSelect
                  label={L('Email delivery', 'إرسال البريد')}
                  value={delivery}
                  values={['Daily digest', 'Immediately', 'Weekly digest'].map((v) => [v, t(v)])}
                  onChange={setDelivery}
                />
                <small>
                  {L(
                    'Daily digest at 09:00. Low-rating alerts remain immediate.',
                    'الملخص اليومي الساعة ٠٩:٠٠. تنبيهات التقييم المنخفض فورية.',
                  )}
                </small>
              </label>
            )}
            <div className="form-actions">
              <small>{L('Changes apply only to your account.', 'التغييرات تخص حسابك فقط.')}</small>
              <div>
                {btn('Cancel', () => go('settings-notifications'))}
                {btn(
                  'Save changes',
                  async () => {
                    setToggles({ ...switchDraft });
                    notify('Changes saved');
                    go('settings-notifications');
                  },
                  true,
                )}
              </div>
            </div>
          </section>
          {note(
            L('A more useful inbox', 'تحديثات أكثر فائدة'),
            L(
              'Keep high-priority alerts immediate and use the digest for routine updates.',
              'اجعل التنبيهات المهمة فورية واستخدم الملخص للتحديثات المعتادة.',
            ),
          )}
        </div>
      </>
    );
  } else if (page === 'settings-security')
    content = (
      <>
        {heading(
          'Account security',
          L(
            'Protect your account and stay in control of where you are signed in.',
            'احمِ حسابك وتحكم في الأجهزة المسجل دخولها.',
          ),
        )}
        {settingsTabs}
        <div className="edit-layout">
          <div>
            <div className="security-banner">
              <I name="info" />
              <div>
                <strong>{L('Strengthen your account security', 'عزز أمان حسابك')}</strong>
                <p>
                  {L(
                    'Your email is verified. Add two-factor authentication for an extra layer of protection.',
                    'بريدك مؤكد. أضف المصادقة الثنائية لمزيد من الحماية.',
                  )}
                </p>
              </div>
            </div>
            <section className="card">
              <h2>{L('Sign-in & verification', 'تسجيل الدخول والتحقق')}</h2>
              <p className="muted">
                {L(
                  'Manage the credentials that keep your account safe.',
                  'أدر بيانات الدخول التي تحمي حسابك.',
                )}
              </p>
              <div className="setting-row">
                <div>
                  <strong>{L('Password', 'كلمة المرور')}</strong>
                  <p>
                    {connected
                      ? account.passwordChangedAt
                        ? L('Last changed: ', 'آخر تغيير: ') +
                          new Date(account.passwordChangedAt).toLocaleDateString(language)
                        : L('Protected by your account password', 'محمي بكلمة مرور حسابك')
                      : L('Last changed 14 September 2026', 'آخر تغيير: ١٤ سبتمبر ٢٠٢٦')}
                  </p>
                </div>
                {linkAction('Change password', 'settings-password')}
              </div>
              <div className="setting-row">
                <div>
                  <strong>{t('Two-factor authentication')}</strong>
                  <p>
                    {twoFA
                      ? L(
                          connected ? 'Enabled' : 'Enabled in preview',
                          connected ? 'مفعلة' : 'مفعلة في المعاينة',
                        )
                      : L(
                          'Not enabled · Use an authenticator app to secure your account.',
                          'غير مفعلة · استخدم تطبيق مصادقة لحماية الحساب.',
                        )}
                  </p>
                </div>
                {linkAction('Set up', 'settings-two-factor')}
              </div>
              {connected && (
                <div className="setting-row">
                  <div>
                    <strong>Google</strong>
                    <p>
                      {account.googleConnected
                        ? L('Connected to this account', 'مرتبط بهذا الحساب')
                        : L(
                            'Connect the Google identity matching your verified email.',
                            'اربط حساب Google المطابق لبريدك المؤكد.',
                          )}
                    </p>
                  </div>
                  {btn(
                    account.googleConnected
                      ? L('Disconnect Google', 'إلغاء ربط Google')
                      : L('Connect Google', 'ربط Google'),
                    () => {
                      setDraft({});
                      setError({});
                      setModal({ type: 'google' });
                    },
                  )}
                </div>
              )}
              <div className="setting-row">
                <div>
                  <strong>{L('Email verification', 'تأكيد البريد الإلكتروني')}</strong>
                  <p>{account.email}</p>
                </div>
                <div className="verification-actions">
                  <span className="badge green">{L('Verified', 'مؤكد')}</span>
                  {linkAction(L('Manage email', 'إدارة البريد'), 'settings-email')}
                </div>
              </div>
            </section>
            <section className="card spaced">
              <h2>{t('Devices & active sessions')}</h2>
              <div className="setting-row">
                <div>
                  <strong>
                    {sessions.length} {L('active sessions', 'جلسات نشطة')}
                  </strong>
                  <p>
                    {L(
                      'Review signed-in devices or sign out of all devices.',
                      'راجع الأجهزة المسجل دخولها أو اخرج من جميع الأجهزة.',
                    )}
                  </p>
                </div>
                {linkAction('Manage devices', 'settings-devices')}
              </div>
            </section>
          </div>
          {note(
            L('A little extra protection', 'حماية إضافية لحسابك'),
            L(
              'Turn on two-factor authentication to add a verification step whenever you sign in.',
              'فعّل المصادقة الثنائية لإضافة خطوة تحقق عند الدخول.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-password')
    content = (
      <>
        {heading(
          'Change password',
          L(
            'Choose a strong, unique password to protect your account.',
            'اختر كلمة مرور قوية وفريدة لحماية حسابك.',
          ),
          null,
          ['Account security', 'settings-security'],
        )}
        {settingsTabs}
        <div className="edit-layout">
          <form noValidate className="card" onSubmit={(e) => e.preventDefault()}>
            <h2>{t('Update password')}</h2>
            {field('Current password', 'current', { type: 'password', required: true })}
            {field('New password', 'password', {
              type: 'password',
              required: true,
              hint: L(
                'Use at least 12 characters, including a letter, number and symbol.',
                'استخدم ١٢ حرفًا على الأقل مع حرف ورقم ورمز.',
              ),
            })}
            {field('Confirm new password', 'confirm', { type: 'password', required: true })}
            {connected && twoFA && field(L('Authenticator code', 'رمز المصادقة'), 'code')}
            {actions(
              async () => {
                if (!validate(['current', 'password', 'confirm'])) return;
                const e = {};
                if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(draft.password))
                  e.password = L(
                    'Use 12+ characters with a letter, number and symbol.',
                    'استخدم ١٢ حرفًا على الأقل مع حرف ورقم ورمز.',
                  );
                if (draft.password !== draft.confirm)
                  e.confirm = L('Passwords do not match.', 'كلمتا المرور غير متطابقتين.');
                setError(e);
                if (!Object.keys(e).length) {
                  if (
                    connected &&
                    !(await settings.changePassword({
                      currentPassword: draft.current,
                      password: draft.password,
                      ...(draft.code ? { code: draft.code } : {}),
                    }))
                  )
                    return;
                  setDraft({});
                  notify(
                    L(
                      connected
                        ? 'Password updated.'
                        : 'Password update simulated. Your real password is unchanged.',
                      connected
                        ? 'تم تحديث كلمة المرور.'
                        : 'تمت محاكاة التغيير. كلمة مرورك الحقيقية لم تتغير.',
                    ),
                  );
                  go('settings-security');
                }
              },
              'settings-security',
              'Update password',
            )}
          </form>
          {note(
            L('Keep your password private', 'احتفظ بكلمة مرورك لنفسك'),
            L(
              connected
                ? 'Other sessions are revoked when your password changes.'
                : 'This preview does not save passwords or update real account credentials.',
              connected
                ? 'تنتهي الجلسات الأخرى عند تغيير كلمة المرور.'
                : 'هذه المعاينة لا تحفظ كلمات المرور أو تحدث بيانات حساب حقيقي.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-two-factor')
    content = (
      <>
        {heading(
          'Two-factor authentication',
          L(
            'Add an extra layer of security with an authenticator app.',
            'أضف طبقة حماية باستخدام تطبيق مصادقة.',
          ),
          null,
          ['Account security', 'settings-security'],
        )}
        {settingsTabs}
        <div className="edit-layout">
          <section className="card two-factor-card">
            {connected && settings.recoveryCodes.length > 0 && (
              <section
                className="subtle-strip"
                role="status"
                aria-label={L('Recovery codes', 'رموز الاسترداد')}
              >
                <h2>{L('Save your recovery codes', 'احفظ رموز الاسترداد')}</h2>
                <p>
                  {L(
                    'These codes are shown once. Keep them somewhere private. Each code replaces your authenticator once if you lose access.',
                    'تظهر هذه الرموز مرة واحدة. احفظها في مكان خاص. يُستخدم كل رمز بدل تطبيق المصادقة مرة واحدة عند فقد الوصول.',
                  )}
                </p>
                <ul>
                  {settings.recoveryCodes.map((value) => (
                    <li key={value}>
                      <code dir="ltr">{value}</code>
                    </li>
                  ))}
                </ul>
                <div className="inline-actions">
                  {btn(L('Download recovery codes', 'تنزيل رموز الاسترداد'), () => {
                    const blob = new Blob(
                      ['NUVIA recovery codes\n' + settings.recoveryCodes.join('\n')],
                      { type: 'text/plain;charset=utf-8' },
                    );
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'nuvia-recovery-codes.txt';
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 0);
                  })}
                  {btn(
                    L('I saved my codes', 'حفظت رموزي'),
                    () => {
                      settings.dismissRecoveryCodes();
                      go('settings-security');
                    },
                    true,
                  )}
                </div>
              </section>
            )}

            <h2>
              {L(
                connected && twoFA
                  ? 'Two-factor authentication is enabled'
                  : 'Connect your authenticator',
                connected && twoFA ? 'المصادقة الثنائية مفعلة' : 'اربط تطبيق المصادقة',
              )}
            </h2>
            <p>
              {L(
                connected && twoFA
                  ? 'Your sign-ins require an authenticator or an unused recovery code.'
                  : 'Complete both steps to enable two-factor authentication.',
                connected && twoFA
                  ? 'يتطلب الدخول رمز التطبيق أو رمز استرداد لم يُستخدم.'
                  : 'أكمل الخطوتين لتفعيل المصادقة الثنائية.',
              )}
            </p>
            {connected && (
              <div>
                {field('Current password', 'current', { type: 'password', required: true })}
                {twoFA && field(L('Authenticator code', 'رمز المصادقة'), 'existingCode')}
                {btn(
                  twoFA
                    ? L('Disable two-factor', 'إيقاف التحقق بخطوتين')
                    : L('Generate setup key', 'إنشاء مفتاح الإعداد'),
                  async () => {
                    if (twoFA) {
                      const result = await settings.enableTwoFA({
                        enabled: false,
                        currentPassword: draft.current,
                        code: draft.existingCode,
                      });
                      if (result) notify('Changes saved');
                    } else await settings.setupTwoFA(draft.current);
                  },
                  true,
                )}
              </div>
            )}
            {(!connected || !twoFA) && (
              <>
                <div className="two-factor-steps">
                  <span>{L('1 · Enrol your app', '١ · اربط التطبيق')}</span>
                  <UiArrow size={14} rtl={ar} />
                  <span className="muted">{L('2 · Verify & enable', '٢ · تأكيد وتفعيل')}</span>
                </div>
                <div className="enrolment-row">
                  <div className="enrolment-tile">
                    <img
                      src={
                        connected && enrollmentQr
                          ? enrollmentQr
                          : new URL('./assets/figma/smartphone.svg', import.meta.url).href
                      }
                      alt={connected ? 'Authenticator setup QR' : ''}
                      style={
                        connected && enrollmentQr
                          ? { width: 128, height: 128, flexShrink: 0 }
                          : undefined
                      }
                    />
                    <strong>
                      {L(
                        connected
                          ? 'Scan with your authenticator'
                          : 'Enrollment preview · Not a scannable QR code',
                        connected
                          ? 'امسح باستخدام تطبيق المصادقة'
                          : 'معاينة الإعداد · ليست شفرة QR قابلة للمسح',
                      )}
                    </strong>
                  </div>
                  <div className="enrolment-copy">
                    <h3>{L('1. Add NUVIA to your app', '١. أضف NUVIA إلى تطبيقك')}</h3>
                    <p>
                      {L(
                        'Open your authenticator and choose “Add account”. In the live app, scan the secure QR code shown here.',
                        'افتح تطبيق المصادقة واختر إضافة حساب. في التطبيق الفعلي، امسح شفرة QR الآمنة المعروضة هنا.',
                      )}
                    </p>
                    <small>
                      {L('Account: ', 'الحساب: ')}
                      {account.email} ·{' '}
                      {L(
                        connected
                          ? settings.enrollment?.secret || 'Generate your setup key first'
                          : 'Manual setup key: shown only during live setup',
                        connected
                          ? settings.enrollment?.secret || 'أنشئ مفتاح الإعداد أولًا'
                          : 'مفتاح الإعداد اليدوي: يظهر أثناء الإعداد الفعلي فقط',
                      )}
                    </small>
                  </div>
                </div>
                <div className="verification-step">
                  <h3>
                    {L(
                      '2. Enter your 6-digit verification code',
                      '٢. أدخل رمز التحقق المكون من ٦ أرقام',
                    )}
                  </h3>
                  <p>
                    {L(
                      'Use the current code from your authenticator app.',
                      'استخدم الرمز الحالي من تطبيق المصادقة.',
                    )}
                  </p>
                  <div className="code-digits">
                    {Array.from({ length: 6 }, (_, i) => (
                      <input
                        key={i}
                        aria-label={L('Code digit ', 'رقم الرمز ') + (i + 1)}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={1}
                        placeholder="–"
                        value={code[i] || ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(-1);
                          let next = code.padEnd(6, ' ').split('');
                          next[i] = v || ' ';
                          setCode(next.join(''));
                          if (v) e.target.nextElementSibling?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !e.currentTarget.value)
                            e.currentTarget.previousElementSibling?.focus();
                        }}
                      />
                    ))}
                  </div>
                  <small>
                    {L(
                      'Codes refresh every 30 seconds. Enter all 6 digits without spaces.',
                      'يتجدد الرمز كل ٣٠ ثانية. أدخل الأرقام الستة دون مسافات.',
                    )}
                  </small>
                </div>
                <div className="figma-information">
                  <I name="info" />
                  <div>
                    <strong>{L('Setup is not complete yet', 'لم يكتمل الإعداد بعد')}</strong>
                    <p>
                      {L(
                        'Two-factor authentication stays off until your verification code is accepted.',
                        'تظل المصادقة الثنائية غير مفعلة حتى قبول رمز التحقق.',
                      )}
                    </p>
                  </div>
                </div>
                <div className="form-actions">
                  <small>
                    {L(
                      'Keep your authenticator backup secure.',
                      'احتفظ بنسخة احتياطية آمنة لتطبيق المصادقة.',
                    )}
                  </small>
                  <div>
                    {btn('Cancel', () => go('settings-security'))}
                    {btn(
                      'Verify & enable',
                      async () => {
                        if (!/^\d{6}$/.test(code)) {
                          notify(L('Enter all six digits.', 'أدخل الأرقام الستة.'));
                          return;
                        }
                        let enabled;
                        if (connected) {
                          enabled = await settings.enableTwoFA({
                            enabled: true,
                            currentPassword: draft.current,
                            code,
                          });
                          if (!enabled) return;
                          setDraft((old) => ({ ...old, current: '', existingCode: '' }));
                        }
                        setTwoFA(true);
                        setCode('');
                        notify(
                          L(
                            connected
                              ? 'Two-factor authentication enabled.'
                              : 'Two-factor setup simulated in preview only.',
                            connected
                              ? 'تم تفعيل التحقق بخطوتين.'
                              : 'تمت محاكاة التفعيل داخل المعاينة فقط.',
                          ),
                        );
                        if (!connected || !enabled?.recoveryCodes?.length) go('settings-security');
                      },
                      true,
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
          {note(
            L('Secure sign-in, made simple', 'دخول آمن بخطوات بسيطة'),
            L(
              'Use Google Authenticator, Microsoft Authenticator, 1Password or another compatible authenticator app.',
              'استخدم Google Authenticator أو Microsoft Authenticator أو 1Password أو تطبيق مصادقة متوافق آخر.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'settings-devices')
    content = (
      <>
        {heading(
          'Devices & active sessions',
          L(
            'See where you are signed in and manage access to your account.',
            'اعرض الأجهزة المسجل دخولها وأدر الوصول لحسابك.',
          ),
          null,
          ['Account security', 'settings-security'],
        )}
        {settingsTabs}
        <div className="edit-layout">
          <div>
            <section className="card">
              <h2>
                {L('Active sessions', 'الجلسات النشطة')}{' '}
                <span className="badge neutral">{sessions.length}</span>
              </h2>
              {sessions.map((id) => (
                <div className="session-row" key={id}>
                  <span className="tile">
                    <I name="device" />
                  </span>
                  <div>
                    <strong>
                      {connected
                        ? settings.sessions.find((s) => s.id === id)?.userAgent ||
                          L('Signed-in session', 'جلسة مسجلة')
                        : ['Chrome on macOS', 'Safari on iOS', 'Edge on Windows'][id - 1]}
                    </strong>
                    <p>
                      {connected
                        ? new Date(
                            settings.sessions.find((s) => s.id === id)?.createdAt,
                          ).toLocaleString(language)
                        : [
                            'Cairo, Egypt · MacBook Pro',
                            'Cairo, Egypt · iPhone 14 Pro Max',
                            'Alexandria, Egypt · Windows PC',
                          ][id - 1]}
                    </p>
                    <small>
                      {(connected ? settings.sessions.find((s) => s.id === id)?.current : id === 1)
                        ? L('Active now', 'نشط الآن')
                        : L(
                            connected ? 'Active session' : 'Last active yesterday',
                            connected ? 'جلسة نشطة' : 'آخر نشاط أمس',
                          )}
                    </small>
                  </div>
                  {(
                    connected
                      ? settings.sessions.find((session) => session.id === id)?.current
                      : id === 1
                  ) ? (
                    <span className="badge green">{t('This device')}</span>
                  ) : (
                    btn('Sign out', () => setModal({ type: 'session', id }))
                  )}
                </div>
              ))}
              {!sessions.length && (
                <p>
                  {L(
                    connected ? 'No active sessions.' : 'No active sessions in this preview.',
                    connected ? 'لا توجد جلسات نشطة.' : 'لا توجد جلسات نشطة في المعاينة.',
                  )}
                </p>
              )}
            </section>
            <section className="card spaced">
              <div className="setting-row">
                <div>
                  <strong>{t('Sign out of all devices')}</strong>
                  <p>
                    {L(
                      'End all sessions, including this one.',
                      'إنهاء كل الجلسات، بما فيها الحالية.',
                    )}
                  </p>
                </div>
                {btn('Sign out of all devices', () => setModal({ type: 'sessions' }))}
              </div>
            </section>
          </div>
          {note(
            L('Recognize every device', 'تعرف على كل جهاز'),
            L(
              connected
                ? 'Only sessions belonging to this account appear here. Location is not tracked.'
                : 'Locations are approximate and may differ when using a VPN or mobile network. Devices shown are illustrative.',
              connected
                ? 'تظهر جلسات هذا الحساب فقط. لا نتتبع الموقع.'
                : 'المواقع تقريبية وقد تختلف مع VPN أو شبكة الهاتف. الأجهزة المعروضة توضيحية.',
            ),
          )}
        </div>
      </>
    );
  else if (page === 'notifications') {
    const notes = connected
      ? settings.notifications.map((n) => ({
          ...n,
          dest: (n.path || '/notifications').replace(/^\//, ''),
          icon: 'notifications',
          time: new Date(n.createdAt).toLocaleString(language),
        }))
      : [
          {
            id: 1,
            title: L('Your weekly report is ready', 'تقريرك الأسبوعي جاهز'),
            body: L(
              'See the latest customer experience trends for Bloom & Co.',
              'اطلع على أحدث اتجاهات تجربة العملاء.',
            ),
            icon: 'reports',
            time: L('10 min ago', 'منذ ١٠ دقائق'),
            dest: 'reports',
          },
          {
            id: 2,
            title: L('New feedback from Cairo', 'رأي جديد من فرع القاهرة'),
            body: L(
              'A customer shared their experience with your Cairo branch.',
              'شارك أحد العملاء تجربته مع فرع القاهرة.',
            ),
            icon: 'feedbacks',
            time: L('35 min ago', 'منذ ٣٥ دقيقة'),
            dest: 'feedbacks',
          },
          {
            id: 3,
            title: L('Welcome to NUVIA', 'مرحبًا بك في NUVIA'),
            body: L(
              'Your workspace is ready. Start with your first survey.',
              'مساحة عملك جاهزة. ابدأ باستبيانك الأول.',
            ),
            icon: 'assistant',
            time: L('Yesterday', 'أمس'),
            dest: 'surveys',
          },
        ];
    const visible = sample
      ? notes.filter((n) => notificationTab !== 'Unread' || !read.includes(n.id))
      : [];
    content = (
      <>
        {heading(
          'Notifications',
          L('Your workspace updates, all in one place.', 'تحديثات مساحة عملك في مكان واحد.'),
          btn('Notification preferences', () => go('settings-notifications'), false, 'settings'),
        )}
        <section className="card table-card">
          <div className="table-tools">
            <nav className="segmented">
              {['All', 'Unread'].map((s) => (
                <button
                  className={notificationTab === s ? 'selected' : ''}
                  key={s}
                  onClick={() => setNotificationTab(s)}
                >
                  {t(s)}
                  {s === 'Unread' && sample && (
                    <span>{notes.filter((n) => !read.includes(n.id)).length}</span>
                  )}
                </button>
              ))}
            </nav>
            <button
              className="text-link"
              disabled={!sample || notes.every((n) => read.includes(n.id))}
              onClick={async () => {
                if (connected && !(await settings.markRead())) return;
                setRead(notes.map((n) => n.id));
              }}
            >
              {t('Mark all as read')}
            </button>
          </div>
          {visible.length ? (
            visible.map((n) => (
              <button
                className={'notification-item ' + (!read.includes(n.id) ? 'unread' : '')}
                key={n.id}
                onClick={() => {
                  if (connected) settings.markRead([n.id]);
                  setRead((prev) => [...new Set([...prev, n.id])]);
                  go(n.dest);
                }}
              >
                <span className="tile">
                  <I name={n.icon} />
                </span>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{n.time}</small>
                </div>
                {!read.includes(n.id) && <i />}
              </button>
            ))
          ) : (
            <Empty
              icon="notifications"
              title={t(sample ? 'All caught up' : 'No notifications yet')}
              description={L(
                'Workspace updates, reports and important alerts will appear here.',
                'ستظهر تحديثات مساحة عملك والتقارير والتنبيهات المهمة هنا.',
              )}
              action={btn('Notification preferences', () => go('settings-notifications'))}
            />
          )}
        </section>
      </>
    );
  } else if (page === 'subscription')
    content = (
      <>
        {heading(
          'Subscription',
          L('Plans for every stage of your business.', 'باقات تناسب كل مرحلة من نمو نشاطك.'),
        )}
        <section className="card coming">
          <div className="coming-art">
            <I name="subscription" size={48} />
            <span>
              <I name="assistant" />
            </span>
          </div>
          <span className="badge blue">{t('Coming soon')}</span>
          <h2>{L('Room to grow with your business', 'مساحة لتنمو مع نشاطك')}</h2>
          <p>
            {L(
              'Plans and billing will be available soon.',
              'ستتوفر الباقات وإدارة الفواتير قريبًا.',
            )}
          </p>
          <p className="muted">
            {L(
              'We will share the details here when subscriptions become available.',
              'سنشارك التفاصيل هنا عند إتاحة الاشتراكات.',
            )}
          </p>
          {btn('Back to overview', () => go('overview'), true)}
        </section>
      </>
    );
  else if (['analytics', 'reports', 'surveys'].includes(page)) {
    const data = {
      analytics: [
        'Analytics',
        L('Understand the experience behind every response.', 'افهم التجربة وراء كل رأي.'),
        'No analytics yet',
        L(
          'Collect customer feedback to discover sentiment, topics and trends. Your insights will appear here.',
          'اجمع آراء العملاء لاكتشاف المشاعر والموضوعات والاتجاهات. ستظهر رؤاك هنا.',
        ),
        'Create survey',
        'survey-create',
      ],
      reports: [
        'Reports',
        L(
          'Turn customer feedback into a clear view of your business.',
          'حوّل آراء العملاء إلى رؤية واضحة لنشاطك.',
        ),
        'No reports yet',
        L(
          'Reports bring your feedback together into clear, useful insights. Collect your first responses to get started.',
          'تجمع التقارير آراء العملاء في رؤى واضحة ومفيدة. ابدأ بجمع ردودك الأولى.',
        ),
        'View feedbacks',
        'feedbacks',
      ],
      surveys: [
        'Surveys',
        L(
          'Create, manage and share feedback across your branches.',
          'أنشئ الاستبيانات وأدرها وشاركها عبر فروعك.',
        ),
        'No surveys yet',
        L(
          'Create your first survey and give your customers a simple way to share their experience.',
          'أنشئ استبيانك الأول وامنح عملاءك طريقة بسيطة لمشاركة تجربتهم.',
        ),
        'Create survey',
        'survey-create',
      ],
    };
    const [title, sub, empty, body, cta, dest] = data[page];
    content = (
      <>
        {heading(
          title,
          sub,
          page === 'surveys' ? btn('Create survey', () => go('survey-create'), true, 'plus') : null,
        )}
        {page === 'surveys' && (
          <div className="metrics">
            <Metric title={L('Total surveys', 'إجمالي الاستبيانات')} value={sample ? 6 : 0} />
            <Metric title={L('Live surveys', 'الاستبيانات النشطة')} value={sample ? 2 : 0} />
            <Metric title={t('Responses')} value={sample ? '1,248' : 0} />
          </div>
        )}
        {page === 'analytics' && (
          <nav className="tabs">
            {[
              ['Sentiment', 'المشاعر'],
              ['Aspects', 'الجوانب'],
              ['Topics', 'الموضوعات'],
              ['Trends', 'الاتجاهات'],
              ['Comparison', 'المقارنة'],
            ].map(([en, arabic]) => (
              <button
                className={(draft.analysisTab || 'Sentiment') === en ? 'selected' : ''}
                key={en}
                onClick={() => setDraft({ ...draft, analysisTab: en })}
              >
                {L(en, arabic)}
              </button>
            ))}
          </nav>
        )}
        <section className="card table-card">
          {sample ? (
            <div className="sample-list">
              {(page === 'surveys'
                ? [
                    L('Customer experience survey', 'استبيان تجربة العملاء'),
                    L('Service quality survey', 'استبيان جودة الخدمة'),
                    L('Visit follow-up', 'متابعة الزيارة'),
                  ]
                : page === 'reports'
                  ? [
                      L('September customer experience', 'تجربة العملاء في سبتمبر'),
                      L('Service & speed insights', 'رؤى الخدمة والسرعة'),
                      L('Branch comparison', 'مقارنة الفروع'),
                    ]
                  : [
                      L('Sentiment across 1,248 responses', 'المشاعر عبر ١٢٤٨ ردًا'),
                      L('Customer experience by aspect', 'تجربة العملاء حسب الجانب'),
                      L('Feedback trends', 'اتجاهات آراء العملاء'),
                    ]
              ).map((s, i) => (
                <div className="sample-row" key={s}>
                  <span className="tile">
                    <I name={page} />
                  </span>
                  <div>
                    <strong>{s}</strong>
                    <p>
                      {biz.name} · {i + 1} Oct 2026
                    </p>
                  </div>
                  <span className="badge green">
                    {page === 'surveys' ? t('Active') : L('Ready', 'جاهز')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              onSample={
                connected
                  ? undefined
                  : () => {
                      setSample(true);
                      setBranches(initialBranches);
                    }
              }
              icon={page}
              title={t(empty)}
              description={body}
              action={btn(cta, () => go(dest), true, 'plus')}
              steps={[t('Create survey'), t('Feedbacks'), t('Analytics')]}
            />
          )}
        </section>
      </>
    );
  } else
    content = (
      <>
        {heading('Business profile')}
        {btn('Business profile', () => go('business'))}
      </>
    );
  if (page === 'branches' && !branches.length)
    content = (
      <>
        {heading(
          'Branches',
          L(
            'Manage your locations and explore the experience behind each branch.',
            'أدر مواقعك وتعرف على تجربة العملاء في كل فرع.',
          ),
        )}
        {businessTabs}
        <section className="card table-card">
          <Empty
            title={L('Your first branch starts here', 'ابدأ بإضافة فرعك الأول')}
            description={L(
              'Add a branch to keep feedback organized by location. Your branches will appear here.',
              'أضف فرعًا لتنظيم الآراء حسب الموقع. ستظهر فروعك هنا.',
            )}
            action={btn('Add branch', () => editBranch(), true)}
            onSample={
              connected
                ? undefined
                : () => {
                    setSample(true);
                    setBranches(initialBranches);
                  }
            }
          />
        </section>
      </>
    );
  if (page === 'settings')
    content = (
      <>
        <div className="mobile-settings-home">
          {heading(
            'Settings',
            L('Manage your profile and account preferences.', 'أدر ملفك الشخصي وتفضيلات حسابك.'),
          )}
          <nav
            className="settings-home-list"
            aria-label={L('Settings sections', 'أقسام الإعدادات')}
          >
            {[
              [
                'Personal information',
                'settings-personal',
                'user',
                L('Your name, photo and contact details', 'اسمك وصورتك وبيانات التواصل'),
              ],
              [
                'Account settings',
                'settings-account',
                'mail',
                L('Manage your sign-in email', 'إدارة بريد تسجيل الدخول'),
              ],
              [
                'Language settings',
                'settings-language',
                'globe',
                L('Language, region and formats', 'اللغة والمنطقة والتنسيقات'),
              ],
              [
                'Notification settings',
                'settings-notifications',
                'notifications',
                L('Choose which updates you receive', 'اختر التحديثات التي تصلك'),
              ],
              [
                'Account security',
                'settings-security',
                'shield',
                L('Password, verification and devices', 'كلمة المرور والتحقق والأجهزة'),
              ],
            ].map(([label, dest, icon, desc]) => (
              <button key={dest} onClick={() => go(dest)}>
                <span className="settings-home-icon">
                  <I name={icon} />
                </span>
                <span className="settings-home-copy">
                  <strong>{t(label)}</strong>
                  <small>{desc}</small>
                </span>
              </button>
            ))}
          </nav>
        </div>
        <div className="desktop-settings-detail">{content}</div>
      </>
    );
  if (page === 'settings-account')
    content = (
      <>
        {heading(
          'Account settings',
          L('Manage how you sign in to NUVIA.', 'أدر طريقة تسجيل دخولك إلى NUVIA.'),
        )}
        {settingsTabs}
        <section className="card">
          <h2>{t('Sign-in information')}</h2>
          <div className="setting-row">
            <div>
              <strong>{t('Email address')}</strong>
              <p>{account.email}</p>
            </div>
            {linkAction('Change email', 'settings-email')}
          </div>
          <div className="setting-row">
            <div>
              <strong>{L('Password', 'كلمة المرور')}</strong>
              <p>{L('Keep your account protected.', 'حافظ على حماية حسابك.')}</p>
            </div>
            {linkAction('Change password', 'settings-password')}
          </div>
        </section>
      </>
    );
  return (
    <PreviewWorkspaceContext.Provider
      value={{
        biz,
        otherBusinesses,
        switchBusiness: async (next) => {
          if (connected) {
            const result = await branchMutation.run((signal) =>
              productApi.send(
                '/workspaces/' + encodeURIComponent(next.id) + '/select',
                {},
                'POST',
                signal,
              ),
            );
            if (result) {
              await auth.refresh();
              go('business');
            }
            return;
          }
          setOtherBusinesses((prev) => [
            ...prev.filter((b) => b.name !== next.name),
            { ...biz, branches: [...branches] },
          ]);
          setBiz({ name: next.name, industry: next.industry });
          setBranches(next.branches || []);
          go('business');
        },
      }}
    >
      <>
        <div style={{ display: 'contents' }} inert={Boolean(modal)}>
          {['action-board', 'evidence'].includes(page) ? (
            <ReferenceAction page={page} language={lang} setLanguage={setLang} />
          ) : page === 'feedback-details' ? (
            <ReferenceFeedbacks page="feedback-details" language={lang} setLanguage={setLang} />
          ) : page === 'assistant' ||
            page === 'report-details' ||
            (sample && page === 'reports') ? (
            <ReferenceReports
              page={page === 'assistant' ? 'nuvia-assistant' : page}
              language={lang}
              setLanguage={setLang}
            />
          ) : page.startsWith('survey-') || page === 'surveys' ? (
            <ReferenceSurveys
              page={page === 'surveys' ? (sample ? 'survey-all' : 'survey-empty') : page}
              language={lang}
              setLanguage={setLang}
            />
          ) : sample && page === 'analytics' ? (
            <ReferenceAnalytics
              page={
                location.hash.slice(2).split('?')[0].startsWith('analytics-')
                  ? location.hash.slice(2).split('?')[0]
                  : 'analytics-sentiment'
              }
              language={lang}
              setLanguage={setLang}
            />
          ) : page === 'overview' ? (
            sample ? (
              <ReferenceDashboard language={lang} setLanguage={setLang} />
            ) : (
              <ReferenceFrame
                page="overview"
                title="Overview"
                language={lang}
                setLanguage={setLang}
              >
                {heading(
                  'Overview',
                  L(
                    'Welcome back, Sara. Track your customer feedback here.',
                    'مرحبًا سارة. تابعي آراء عملائك هنا.',
                  ),
                )}
                <div className="ds-overview">
                  <OverviewEmpty />
                </div>
              </ReferenceFrame>
            )
          ) : page.startsWith('feedbacks-') ? (
            <ReferenceFeedbacks page={page} language={lang} setLanguage={setLang} />
          ) : page === 'feedbacks' ? (
            <ReferenceFeedbacks
              page={sample ? 'feedbacks' : 'feedbacks-empty'}
              language={lang}
              setLanguage={setLang}
            />
          ) : (
            <ReferenceFrame
              page={page}
              language={lang}
              setLanguage={setLang}
              title={
                businessPage
                  ? 'Business'
                  : settingsPage
                    ? 'Settings'
                    : (page === 'subscription'
                        ? 'Subscription'
                        : navigation.find((n) => n[1] === page)?.[0]) || 'Notifications'
              }
            >
              {connected && branchMutation.error && (
                <p className="error" role="alert">
                  {branchMutation.error.code === 'WORKSPACE_MIGRATION_REQUIRED'
                    ? L(
                        'This database needs the business upgrade before another business can be added.',
                        'تحتاج قاعدة البيانات تحديث دعم الأنشطة قبل إضافة نشاط آخر.',
                      )
                    : L(
                        'Could not save changes. Check the fields and try again.',
                        'تعذر حفظ التغييرات. راجع الحقول وحاول مرة أخرى.',
                      )}
                </p>
              )}
              {connected && branchResource.loading && businessPage && (
                <p role="status">{L('Loading…', 'جارٍ التحميل…')}</p>
              )}
              {connected && settings.error && (
                <p className="error" role="alert">
                  {L(
                    'Could not save or load account settings. Check your password, verification code and connection.',
                    'تعذر حفظ أو تحميل الإعدادات. راجع كلمة المرور ورمز التحقق والاتصال.',
                  )}
                </p>
              )}
              {connected && settings.busy && <p role="status">{L('Saving…', 'جارٍ الحفظ…')}</p>}
              {content}
            </ReferenceFrame>
          )}
          {toast && (
            <div className="toast" role="status">
              <I name="check" />
              {toast}
              <button className="icon-button" aria-label="Dismiss" onClick={() => setToast('')}>
                <I name="close" size={16} />
              </button>
            </div>
          )}
        </div>
        {modal && (
          <div
            className="modal-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModal(null);
            }}
          >
            <section
              className={'modal ' + (modal.type === 'archive' ? 'archive-dialog' : '')}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <button
                className="icon-button modal-close"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <I name="close" />
              </button>
              {modal.type === 'google' ? (
                <>
                  <h2 id="modal-title">
                    {account.googleConnected
                      ? L('Disconnect Google', 'إلغاء ربط Google')
                      : L('Connect Google', 'ربط Google')}
                  </h2>
                  <p>
                    {L(
                      'Confirm your account password before changing your sign-in method.',
                      'أكّد كلمة مرور حسابك قبل تغيير طريقة الدخول.',
                    )}
                  </p>
                  {field('Current password', 'googlePassword', {
                    type: 'password',
                    required: true,
                  })}
                  {twoFA && field(L('Authenticator code', 'رمز المصادقة'), 'googleCode')}
                  {settings.error && (
                    <p className="error" role="alert">
                      {L(
                        'Could not update Google sign-in. Check your credentials and provider configuration.',
                        'تعذر تحديث الدخول عبر Google. راجع بياناتك وإعدادات الخدمة.',
                      )}
                    </p>
                  )}
                  <div className="modal-actions">
                    {btn('Cancel', () => {
                      setDraft({});
                      setModal(null);
                    })}
                    {btn(
                      account.googleConnected
                        ? L('Disconnect Google', 'إلغاء ربط Google')
                        : L('Continue with Google', 'المتابعة عبر Google'),
                      async () => {
                        if (!validate(['googlePassword'])) return;
                        const body = {
                          currentPassword: draft.googlePassword,
                          ...(draft.googleCode ? { code: draft.googleCode } : {}),
                        };
                        const result = account.googleConnected
                          ? await settings.disconnectGoogle(body)
                          : await settings.connectGoogle(body);
                        if (result && account.googleConnected) {
                          setDraft({});
                          setModal(null);
                          notify('Changes saved');
                        }
                      },
                      true,
                    )}
                  </div>
                </>
              ) : modal.type === 'archive' ? (
                <>
                  <span className="tile">
                    <I name="archive" />
                  </span>
                  <h2 id="modal-title">
                    {L('Archive ' + modal.branch.name + '?', 'أرشفة ' + modal.branch.name + '؟')}
                  </h2>
                  <p>
                    {L(
                      'This branch has closed. Archiving keeps it out of active lists; it does not delete the branch or its history.',
                      'الأرشفة تخفي الفرع من القوائم النشطة ولا تحذف الفرع أو سجله.',
                    )}
                  </p>
                  <div className="subtle-strip">
                    <strong>{t('History retained')}</strong>
                    <p>
                      {modal.branch.responses}{' '}
                      {L('earlier responses retained', 'ردود سابقة محفوظة')}
                    </p>
                    <p>
                      {L(
                        'Past scores and analytics remain accessible.',
                        'الدرجات والتحليلات السابقة تبقى متاحة.',
                      )}
                    </p>
                  </div>
                  <div className="modal-actions">
                    {btn('Cancel', () => setModal(null))}
                    {btn('Archive branch', archiveBranch, true, 'archive')}
                  </div>
                </>
              ) : modal.type === 'discard' ? (
                <>
                  <h2 id="modal-title">
                    {L('Discard unsaved changes?', 'تجاهل التغييرات غير المحفوظة؟')}
                  </h2>
                  <p>{L('Your changes have not been saved.', 'لم يتم حفظ التغييرات.')}</p>
                  <div className="modal-actions">
                    {btn('Keep editing', () => setModal(null))}
                    {btn(
                      'Discard changes',
                      () => {
                        setDraft({});
                        go(modal.to);
                        setModal(null);
                      },
                      true,
                    )}
                  </div>
                </>
              ) : modal.type === 'search' ? (
                <>
                  <h2 id="modal-title">{t('Search your workspace')}</h2>
                  <label className="search">
                    <I name="search" />
                    <input
                      placeholder={t('Search')}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="search-results">
                    {[
                      ...navigation,
                      ...tabs,
                      ['Notifications', 'notifications'],
                      ['Branches', 'branches'],
                      ['Subscription', 'subscription'],
                    ]
                      .filter(([label]) =>
                        `${label} ${t(label)}`.toLowerCase().includes(query.toLowerCase()),
                      )
                      .map(([label, dest]) => (
                        <button
                          key={dest}
                          onClick={() => {
                            setModal(null);
                            go(dest);
                          }}
                        >
                          {t(label)} <span>→</span>
                        </button>
                      ))}
                  </div>
                </>
              ) : modal.type === 'filters' ? (
                <>
                  <h2 id="modal-title">{L('Filter your workspace', 'تصفية مساحة العمل')}</h2>
                  <p>
                    {L(
                      'No data is available to filter yet. Once responses arrive, date and language filters will help you explore them.',
                      'لا توجد بيانات للتصفية بعد. عند وصول الردود يمكنك استكشافها حسب التاريخ واللغة.',
                    )}
                  </p>
                  <div className="modal-actions">
                    {btn(L('Done', 'تم'), () => setModal(null), true)}
                  </div>
                </>
              ) : (
                <>
                  <span className="tile">
                    <I name="logout" />
                  </span>
                  <h2 id="modal-title">
                    {t(modal.type === 'sessions' ? 'Sign out of all devices' : 'Sign out')}
                  </h2>
                  <p>
                    {L(
                      connected
                        ? 'This ends the selected sessions. You can sign in again with your account credentials.'
                        : 'This action is simulated in the preview. Your real account and workspace data are not affected.',
                      connected
                        ? 'سيتم إنهاء الجلسات المحددة. يمكنك تسجيل الدخول مجددًا ببيانات حسابك.'
                        : 'هذا الإجراء محاكاة داخل المعاينة. حسابك الحقيقي وبياناتك لن تتأثر.',
                    )}
                  </p>
                  <div className="modal-actions">
                    {btn('Cancel', () => setModal(null))}
                    {btn(
                      'Sign out',
                      async () => {
                        if (connected) {
                          if (modal.type === 'session') {
                            if (!(await settings.revokeSession(modal.id))) return;
                          } else if (modal.type === 'sessions') {
                            await settings.revokeAll();
                            return;
                          } else {
                            await auth.logout();
                            return;
                          }
                          setModal(null);
                          notify('Changes saved');
                          return;
                        }
                        if (modal.type === 'session')
                          setSessions((prev) => prev.filter((id) => id !== modal.id));
                        else if (modal.type === 'sessions') setSessions([]);
                        setModal(null);
                        notify(L('Sign-out simulated in preview.', 'تمت محاكاة تسجيل الخروج.'));
                      },
                      true,
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </>
    </PreviewWorkspaceContext.Provider>
  );
}
function Metric({ title, value, detail }) {
  return (
    <section className="card metric">
      <p>{title}</p>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </section>
  );
}
function Empty({ title, description, action, footer, icon }) {
  return (
    <div className="feedback-empty">
      <img
        className="feedback-empty-icon"
        src={
          icon === 'analytics'
            ? '/assets/dashboard/overview/chart-no-axes-combined.svg'
            : icon === 'reports'
              ? '/assets/dashboard/overview/file-chart-column.svg'
              : '/assets/dashboard/feedbacks-empty/messages-square.svg'
        }
        alt=""
      />
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="feedback-empty-actions">
        {action &&
          React.cloneElement(
            action,
            { className: 'feedback-btn feedback-primary' },
            action.props.children,
          )}
      </div>
      <small>
        {footer ||
          (document.documentElement.lang === 'ar'
            ? 'تظهر البيانات هنا عند توفرها.'
            : 'Your workspace updates appear here when available.')}
      </small>
    </div>
  );
}

function PreviewSelect({ label, value, values, onChange }) {
  const options = values.map((item) => ({
    value: Array.isArray(item) ? item[0] : item,
    label: Array.isArray(item) ? item[1] : item,
  }));
  if (!options.some((item) => item.value === value))
    options.unshift({
      value: value ?? '',
      label: value || (document.documentElement.lang === 'ar' ? 'غير محدد' : 'Not set'),
    });
  return (
    <span className="preview-select">
      <ChoiceMenu
        label={label}
        value={value}
        onChange={onChange}
        icon={false}
        density="compact"
        options={options}
      />
      <img
        className="preview-select-chevron"
        src={new URL('./assets/figma/imgChevronDown.svg', import.meta.url).href}
        alt=""
      />
    </span>
  );
}
