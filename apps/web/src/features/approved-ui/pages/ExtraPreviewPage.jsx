import { defaultScopeDates } from '../product/connected-data.js';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { getReport } from '../product/preview/report-library.js';
import Assistant from '../product/Assistant.jsx';
import '../product/assistant.css';
import { OverviewDateDialog } from '../product/OverviewControls.jsx';
import arabic from '../product/ar.json';
import useWorkspaceScale from '../product/useWorkspaceScale.js';
import React, { useState, useEffect } from 'react';
import { ProductProvider } from '../product/ProductContext.jsx';
import FeedbackShell from '../product/FeedbackShell.jsx';
import AssistantScreen from '../product/preview/AssistantScreen.jsx';
import ReportsScreen from '../product/preview/ReportsScreen.jsx';
import ReportDetailsScreen from '../product/preview/ReportDetailsScreen.jsx';
export default function ExtraPreviewPage({ page, language, setLanguage }) {
  useWorkspaceScale();
  const auth = useAuth();
  const [filters, setFilters] = useState(() =>
    auth?.preview
      ? { branch: 'all', start: '2026-09-01', end: '2026-09-30' }
      : defaultScopeDates(auth?.workspace?.reportingTimezone || 'UTC'),
  );
  const [dateOpen, setDateOpen] = useState(false);
  const dashboard = { filters, setFilters, openDate: () => setDateOpen(true) };
  const tr = (text) => (language === 'ar' ? (arabic[text] ?? text) : text);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuOpen(false);
  }, [page]);
  return (
    <ProductProvider
      dashboard={dashboard}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      onNavigate={() => setMenuOpen(false)}
    >
      <div className="product-page extra-preview-page" data-menu-open={menuOpen}>
        <button
          className="product-mobile-toggle"
          aria-label={language === 'ar' ? 'قائمة التنقل' : 'Navigation menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        {menuOpen && (
          <button
            className="product-menu-backdrop"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <FeedbackShell
          title={
            page === 'nuvia-assistant'
              ? 'NUVIA Assistant'
              : page === 'report-details' && auth?.preview
                ? tr('Reports') +
                  ' / ' +
                  tr(
                    getReport(
                      new URLSearchParams(location.hash.split('?')[1]).get('id') || 'september',
                    ).title,
                  )
                : 'Reports'
          }
        >
          {page === 'nuvia-assistant' ? (
            <AssistantScreen />
          ) : page === 'reports' ? (
            <ReportsScreen />
          ) : (
            <ReportDetailsScreen />
          )}
        </FeedbackShell>
        {page !== 'nuvia-assistant' && <Assistant />}
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
