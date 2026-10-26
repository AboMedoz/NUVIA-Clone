import PreviewWorkspaceContext from './PreviewWorkspaceContext.jsx';
import { useRouteState } from './navigation.js';
import GlobalSearch from './GlobalSearch.jsx';
import { routeForAction } from './navigation.js';
import HeaderMenus from './HeaderMenus.jsx';
import React, { createContext, useContext, useEffect, useState } from 'react';
import arabic from './ar.json';
import { arabicUiNumbers } from './number-format.js';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { productApi } from '../../product/api.js';
import { useResource, useMutation } from '../../product/useResource.js';
const englishCopy = {
  Feedbacks: 'Feedbacks',
  'All feedbacks': 'All feedbacks',
  'Cafe &workspace': 'Café & workspace',
};
const ProductContext = createContext(null);
export function useProductView() {
  return useContext(ProductContext);
}
export function ProductProvider({
  language,
  setLanguage,
  children,
  onNavigate,
  menuOpen,
  dashboard,
  analytics,
}) {
  const auth = useAuth();
  const connected = Boolean(auth && !auth.preview);
  const billing = useResource(
    connected && (!auth.workspace?.role || auth.workspace.role === 'owner') ? '/billing' : null,
  );
  const branchResource = useResource(
    connected && auth.workspace ? '/workspaces/' + auth.workspace.id + '/branches' : null,
  );
  const workspaceResource = useResource(connected ? '/workspaces' : null);
  const notifications = useResource(connected ? '/account/notifications' : null, {
    refreshInterval: 30000,
  });
  const workspaceMutation = useMutation();
  const switchWorkspace = async (id) =>
    workspaceMutation.run(async (signal) => {
      const result = await productApi.send(
        '/workspaces/' + encodeURIComponent(id) + '/select',
        {},
        'POST',
        signal,
      );
      if (signal.aborted) return null;
      await auth.refresh();
      if (!signal.aborted) location.hash = '/business';
      return result;
    });
  const [notice, setNotice] = useState('');
  const notify = (message) => setNotice(message);
  const workspace = auth?.workspace;
  const previewWorkspace = useContext(PreviewWorkspaceContext);
  const [query, updateQuery] = useRouteState('feedback-search', () =>
    connected ? new URLSearchParams(location.hash.split('?')[1]).get('search') || '' : '',
  );
  const [workspaceQuery, setWorkspaceQuery] = useState(() => query);
  const setQuery = (value) => {
    updateQuery(value);
    if (connected) {
      const [route, raw] = location.hash.split('?'),
        params = new URLSearchParams(raw);
      if (value) params.set('search', value);
      else params.delete('search');
      history.replaceState(
        history.state,
        '',
        location.pathname + location.search + route + (params.size ? '?' + params : ''),
      );
    }
  };
  const clearSearch = () => {
    setWorkspaceQuery('');
    setQuery('');
  };
  const [topbarMenu, setTopbarMenu] = useState(null);
  const openTopbar = (kind, anchor) =>
    setTopbarMenu((old) => (old?.kind === kind ? null : { kind, anchor }));
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 850);
  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth <= 850);
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  const formatNumber = (value) => (language === 'ar' ? arabicUiNumbers(value) : String(value));
  const tr = (text) => {
    if (connected) {
      const saved = {
        'Bloom & Co.': workspace?.businessName || workspace?.name || '',
        'Sara Ahmed': auth.user?.name || '',
        'Workspace owner':
          language === 'ar'
            ? { owner: 'مالك مساحة العمل', manager: 'مدير', viewer: 'مشاهد' }[workspace?.role] ||
              'عضو'
            : { owner: 'Workspace owner', manager: 'Manager', viewer: 'Viewer' }[workspace?.role] ||
              'Member',
        'Food & Beverage': workspace?.industry || '',
        'Food & beverage': workspace?.industry || '',
        'Cafe &workspace': workspace?.industry || '',
        'Growth plan':
          billing.data?.plan?.name || (language === 'ar' ? 'الخطة المجانية' : 'Free plan'),
        '1,248 / 5,000 responses': billing.data?.usage
          ? `${formatNumber(billing.data.usage.responses)} ${language === 'ar' ? 'رد محفوظ' : 'saved responses'}`
          : '—',
      };
      if (text in saved) return saved[text];
    }
    if (text === 'Bloom & Co.' && previewWorkspace?.biz) return previewWorkspace.biz.name;
    return language === 'ar' ? formatNumber(arabic[text] ?? text) : (englishCopy[text] ?? text);
  };
  const navigateLabel = (label) => {
    const route = routeForAction(label, tr);
    if (!route) return false;
    onNavigate?.();
    location.hash = route.slice(1);
    return true;
  };
  const action = (label) => {
    if (connected && ['Export report', 'Export report →'].includes(label)) {
      location.hash = '/reports?generate=1';
      return;
    }
    if (connected && ['Help center', 'Help Center', 'Help', 'Support'].includes(label)) {
      location.hash = '/help';
      return;
    }
    if (navigateLabel(label)) return;
    if (label === 'NUVIA Assistant') {
      onNavigate?.();
      location.hash = '/nuvia-assistant';
      return;
    }
    if (label === 'Analytics') {
      onNavigate?.();
      location.hash = '/analytics-sentiment';
      return;
    }
    if (label === 'Reports') {
      onNavigate?.();
      location.hash = '/reports';
      return;
    }
    const feedbackLabels = [
      'Feedbacks',
      'Feedbacks 12',
      'All responses →',
      'Explore all 1,250 reviews →',
      'All feedbacks',
    ];
    if (label === 'Overview' || feedbackLabels.includes(label)) {
      onNavigate?.();
      location.hash = label === 'Overview' ? '/dashboard' : '/feedbacks';
      return;
    }
    if (label === 'View evidence ↗') {
      onNavigate?.();
      location.hash = '/feedback-details?id=1248';
      return;
    }
    if (label === 'Export report') {
      const r = dashboard?.report,
        f = dashboard?.filters;
      const rows = r
        ? [
            ['Data', 'Illustrative preview data'],
            ['Branch', f.branch],
            ['Start date', f.start],
            ['End date', f.end],
            ['Total responses', r.total],
            ['Positive sentiment', Math.round(r.positivePercent) + '%'],
            ['Customer satisfaction', r.rating === null ? '' : r.rating.toFixed(1) + '/5'],
            ['Completion rate', r.completion === null ? '' : Math.round(r.completion) + '%'],
          ]
        : [
            ['Total responses', 1248],
            ['Positive sentiment', '78%'],
            ['Customer satisfaction', '4.6/5'],
            ['Completion rate', '86%'],
          ];
      const csv =
        '\uFEFFMetric,Value\n' +
        rows
          .map((row) =>
            row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(','),
          )
          .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NUVIA-demo-overview.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }
    notify(
      language === 'ar'
        ? 'هذه معاينة محلية لبيانات التصميم. هذا الإجراء لم يُربط بخدمة بعد.'
        : 'This is a local preview of the design data. This action is not connected to a service yet.',
    );
  };
  return (
    <ProductContext.Provider
      value={{
        previewWorkspace,
        connected,
        workspace,
        user: auth?.user,
        onLogout: auth?.logout,
        branches: branchResource.data?.branches || branchResource.data || [],
        billing: billing.data,
        unreadNotifications: notifications.data?.unreadCount || 0,
        unreadFeedback: notifications.data?.feedbackUnreadCount || 0,
        workspaces: workspaceResource.data?.workspaces || [],
        switchWorkspace,
        switchingWorkspace: workspaceMutation.busy,
        workspaceSwitchError: workspaceMutation.error,
        notify,
        topbarMenu,
        setTopbarMenu,
        openTopbar,
        dashboard,
        analytics,
        activeDestination: location.hash.startsWith('#/subscription')
          ? 'Subscription'
          : location.hash.startsWith('#/settings')
            ? 'Settings'
            : location.hash.startsWith('#/business') || location.hash.startsWith('#/branch')
              ? 'Business'
              : location.hash.startsWith('#/analytics')
                ? 'Analytics'
                : location.hash.startsWith('#/report')
                  ? 'Reports'
                  : location.hash.startsWith('#/nuvia-assistant')
                    ? 'NUVIA Assistant'
                    : location.hash.startsWith('#/feedback')
                      ? 'Feedbacks'
                      : location.hash.startsWith('#/survey')
                        ? 'Surveys'
                        : 'Overview',
        language,
        setLanguage,
        tr,
        formatNumber,
        query,
        setQuery,
        clearSearch,
        workspaceQuery,
        setWorkspaceQuery,
        action,
        navigateLabel,
        isMobile,
        menuOpen,
        matches: (text) => {
          const normalize = (x) =>
            x
              .normalize('NFKC')
              .replace(/[\u064b-\u065f]/g, '')
              .toLowerCase();
          const localized = Object.keys(arabic)
            .filter((k) => text.includes(k))
            .map((k) => arabic[k])
            .join(' ');
          return normalize(text + ' ' + localized).includes(normalize(query));
        },
      }}
    >
      {children}
      <GlobalSearch />
      <HeaderMenus />
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label={language === 'ar' ? 'إغلاق' : 'Close'} onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
    </ProductContext.Provider>
  );
}
