import ConnectedAnalytics from '../product/analytics/ConnectedAnalytics.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import useConnectedAnalytics from '../product/analytics/useConnectedAnalytics.js';
import { connectedDefaults } from '../product/analytics/connected-data.js';
import { useRouteState } from '../product/navigation.js';
import React, { useState } from 'react';
import useWorkspaceScale from '../product/useWorkspaceScale.js';
import { ProductProvider } from '../product/ProductContext.jsx';
import FeedbackShell from '../product/FeedbackShell.jsx';
import Assistant from '../product/Assistant.jsx';
import { OverviewDateDialog } from '../product/OverviewControls.jsx';
import { defaultOverviewFilters } from '../product/overview-report.js';
import arabic from '../product/ar.json';
import SentimentAnalytics from '../product/analytics/SentimentAnalytics.jsx';
import AspectsAnalytics from '../product/analytics/AspectsAnalytics.jsx';
import TopicsAnalytics from '../product/analytics/TopicsAnalytics.jsx';
import TrendsAnalytics from '../product/analytics/TrendsAnalytics.jsx';
import ComparisonAnalytics from '../product/analytics/ComparisonAnalytics.jsx';
const screens = {
  sentiment: SentimentAnalytics,
  aspects: AspectsAnalytics,
  topics: TopicsAnalytics,
  trends: TrendsAnalytics,
  comparison: ComparisonAnalytics,
};
export default function AnalyticsPage({ page, language, setLanguage }) {
  useWorkspaceScale();
  const auth = useAuth();
  const connected = auth && !auth.preview;
  const [defaults] = useState(() =>
    connected
      ? connectedDefaults(new Date(), auth.workspace?.reportingTimezone)
      : { ...defaultOverviewFilters },
  );
  const requestedKind = page.replace('analytics-', '');
  const kind = Object.hasOwn(screens, requestedKind) ? requestedKind : 'sentiment';
  const [menuOpen, setMenuOpen] = useState(false),
    [filters, setFilters] = useRouteState('analytics-scope', () => ({ ...defaults })),
    [extra, setExtra] = useRouteState('analytics-extra', { language: 'All languages' }),
    [dateOpen, setDateOpen] = useState(false);
  const live = useConnectedAnalytics(filters, extra);
  const tr = (text) => (language === 'ar' ? (arabic[text] ?? text) : text);
  const Screen = connected ? ConnectedAnalytics : screens[kind] || SentimentAnalytics;
  const dashboard = {
    filters,
    setFilters,
    defaults,
    reset: () => setFilters({ ...defaults }),
    openDate: () => setDateOpen(true),
    connected,
    resource: live.resource,
    report: live.report,
    branches: live.branches,
    surveys: live.surveys,
  };
  const analytics = {
    kind,
    connected,
    resource: live.resource,
    data: live.resource.data,
    filters: extra,
    setFilters: setExtra,
    changed:
      filters.branch !== 'all' ||
      filters.start !== defaultOverviewFilters.start ||
      filters.end !== defaultOverviewFilters.end ||
      extra.language !== 'All languages' ||
      (kind === 'comparison' && extra.branches && extra.branches.length !== 3),
  };
  return (
    <ProductProvider
      dashboard={dashboard}
      analytics={analytics}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      onNavigate={() => setMenuOpen(false)}
    >
      <div className="product-page" data-menu-open={menuOpen}>
        <button
          className="product-mobile-toggle"
          aria-label={tr('Navigation menu')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        {menuOpen && (
          <button
            className="product-menu-backdrop"
            aria-label={tr('Close navigation')}
            onClick={() => setMenuOpen(false)}
          />
        )}
        <FeedbackShell title="Analytics">
          <Screen />
        </FeedbackShell>
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
