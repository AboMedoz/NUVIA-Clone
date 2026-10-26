import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import useConnectedAnalytics from '../product/analytics/useConnectedAnalytics.js';
import useOverviewInsight from '../product/analytics/useOverviewInsight.js';
import { connectedDefaults } from '../product/analytics/connected-data.js';
import { useRouteState } from '../product/navigation.js';
import useWorkspaceScale from '../product/useWorkspaceScale.js';
import React, { useEffect, useState } from 'react';
import { asset } from '../assets.js';
import { ProductProvider } from '../product/ProductContext.jsx';
import OverviewDesign from '../product/designs/OverviewDesign.jsx';
import Assistant from '../product/Assistant.jsx';
import '../product/assistant.css';
import '../product/product.css';
import { OverviewDateDialog } from '../product/OverviewControls.jsx';
import { defaultOverviewFilters, getOverviewReport } from '../product/overview-report.js';
import arabic from '../product/ar.json';
export default function DashboardPage({ language, setLanguage }) {
  useWorkspaceScale();
  const auth = useAuth();
  const connected = auth && !auth.preview;
  const [defaults] = useState(() =>
    connected
      ? connectedDefaults(new Date(), auth.workspace?.reportingTimezone)
      : { ...defaultOverviewFilters },
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [filters, setFilters] = useRouteState('overview-scope', () => ({
    ...defaults,
  }));
  const live = useConnectedAnalytics(filters);
  const insight = useOverviewInsight(
    connected,
    auth?.workspace,
    filters,
    language,
    live.resource.data?.totalResponses,
  );
  const [dateOpen, setDateOpen] = useState(false);
  const filtered =
    filters.branch !== 'all' ||
    filters.start !== defaultOverviewFilters.start ||
    filters.end !== defaultOverviewFilters.end;
  const dashboard = {
    isFiltered: connected || filtered,
    connected,
    resource: live.resource,
    insight,
    branches: live.branches,
    surveys: live.surveys,
    reset: () => setFilters({ ...defaults }),
    filters,
    setFilters,
    report: connected ? live.report : getOverviewReport(filters),
    openDate: () => setDateOpen(true),
  };
  const tr = (text) => (language === 'ar' ? (arabic[text] ?? text) : text);

  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, []);
  return (
    <ProductProvider
      dashboard={dashboard}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      onNavigate={() => setMenuOpen(false)}
    >
      <div className="product-page" data-menu-open={menuOpen}>
        <button
          className="product-mobile-toggle"
          aria-label={language === 'ar' ? 'قائمة التنقل' : 'Navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <img src={asset('dashboard/overview/layout-dashboard.svg')} alt="" />
        </button>
        {menuOpen && (
          <button
            className="product-menu-backdrop"
            aria-label={language === 'ar' ? 'إغلاق القائمة' : 'Close navigation'}
            onClick={() => setMenuOpen(false)}
          />
        )}
        <OverviewDesign />
        <Assistant />
        <OverviewDateDialog
          open={dateOpen}
          onClose={() => setDateOpen(false)}
          filters={filters}
          onApply={(range) => setFilters((old) => ({ ...old, ...range }))}
          language={language}
          tr={tr}
        />
      </div>
    </ProductProvider>
  );
}
