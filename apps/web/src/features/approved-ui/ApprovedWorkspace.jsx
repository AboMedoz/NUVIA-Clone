import React, { lazy, Suspense, useEffect, useState } from 'react';
import { ProductProvider } from './product/ProductContext.jsx';
import FeedbackShell from './product/FeedbackShell.jsx';
import { useAuth } from '../../app/providers/AuthProvider.jsx';
const Dashboard = lazy(() => import('./pages/DashboardPage.jsx'));
const Feedback = lazy(() => import('./pages/FeedbacksPage.jsx'));
const Analytics = lazy(() => import('./pages/AnalyticsPage.jsx'));
const Surveys = lazy(() => import('./surveys/SurveyPage.jsx'));
const Workspace = lazy(() => import('./features/workspace/WorkspacePages.jsx'));
const Extra = lazy(() => import('./pages/ExtraPreviewPage.jsx'));
const Actions = lazy(() => import('./pages/ActionEvidencePage.jsx'));
const Team = lazy(() => import('../team/TeamPage.jsx'));
const BusinessPage = lazy(() => import('../workspaces/BusinessPageSettings.jsx'));
const Subscription = lazy(() => import('./pages/SubscriptionPage.jsx'));
export default function ApprovedWorkspace({ page, language, setLanguage }) {
  const props = { page, language, setLanguage };
  return (
    <div className="workspace-extension">
      <Suspense
        fallback={
          <main className="session-state" role="status">
            {language === 'ar' ? 'جارٍ التحميل' : 'Loading'}
          </main>
        }
      >
        {['dashboard', 'dashboard-empty', 'overview'].includes(page) ? (
          <Dashboard {...props} />
        ) : page.startsWith('feedback') ? (
          <Feedback {...props} />
        ) : page.startsWith('analytics') ? (
          <Analytics {...props} page={page === 'analytics' ? 'analytics-sentiment' : page} />
        ) : page === 'surveys' || page.startsWith('survey-') ? (
          <Surveys
            {...props}
            page={
              page === 'survey-builder' ? 'survey-create' : page === 'surveys' ? 'survey-all' : page
            }
          />
        ) : ['assistant', 'nuvia-assistant', 'reports', 'report-details'].includes(page) ? (
          <Extra {...props} page={page === 'assistant' ? 'nuvia-assistant' : page} />
        ) : ['action-board', 'evidence'].includes(page) ? (
          <Actions {...props} />
        ) : page === 'subscription' ? (
          <AccountShell {...props} title="Subscription">
            <Subscription {...props} />
          </AccountShell>
        ) : page === 'team' ? (
          <AccountShell {...props} title="Business & Teams">
            <Team {...props} workspace={null} />
          </AccountShell>
        ) : page === 'business-page' ? (
          <AccountShell {...props} title="Business">
            <BusinessPage {...props} />
          </AccountShell>
        ) : (
          <Workspace {...props} />
        )}
      </Suspense>
    </div>
  );
}
export function AccountShell({ language, setLanguage, title, children }) {
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const escape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  }, []);
  return (
    <ProductProvider {...{ language, setLanguage, menuOpen }} onNavigate={() => setMenuOpen(false)}>
      <div className="product-page" data-menu-open={menuOpen}>
        <button
          className="product-mobile-toggle"
          aria-label={language === 'ar' ? 'قائمة التنقل' : 'Navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        {menuOpen && (
          <button
            className="product-menu-backdrop"
            aria-label={language === 'ar' ? 'إغلاق القائمة' : 'Close navigation'}
            onClick={() => setMenuOpen(false)}
          />
        )}
        <FeedbackShell title={title}>
          <div className="connected-product">
            {React.isValidElement(children)
              ? React.cloneElement(children, { workspace: auth.workspace })
              : children}
          </div>
        </FeedbackShell>
      </div>
    </ProductProvider>
  );
}
