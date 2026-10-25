import React, { useEffect, useState } from 'react';
import { ProductProvider } from '../../app/providers/ProductProvider.jsx';
import WorkspaceShell from '../../components/layout/WorkspaceShell.jsx';
import { useWorkspaceScale } from '../../hooks/useWorkspaceScale.js';
import { asset } from '../../lib/assets.js';
import SurveysPage from '../surveys/SurveysPage.jsx';
import SurveyBuilder from '../surveys/SurveyBuilder.jsx';
import ConnectedFeedback from '../feedback/ConnectedFeedback.jsx';
import AnalyticsPage from '../analytics/AnalyticsPage.jsx';
import ReportsPage from '../reports/ReportsPage.jsx';
import TeamPage from '../team/TeamPage.jsx';
import BranchesPage from '../workspaces/BranchesPage.jsx';
import AssistantPage from '../ai-analysis/AssistantPage.jsx';
import BusinessPageSettings from '../workspaces/BusinessPageSettings.jsx';
import './product.css';
const titles = {
  surveys: 'Surveys',
  'survey-builder': 'Surveys',
  analytics: 'Analytics',
  dashboard: 'Overview',
  'dashboard-empty': 'Overview',
  reports: 'Reports',
  team: 'Business & Teams',
  branches: 'Branches',
  assistant: 'NUVIA Assistant',
  settings: 'Settings',
  feedbacks: 'Feedbacks',
  'feedbacks-empty': 'Feedbacks',
  'feedback-details': 'Feedback details',
  'team-accept': 'Business & Teams',
};
export default function ProductWorkspace({ page, language, setLanguage, workspace, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useWorkspaceScale();
  useEffect(() => {
    window.scrollTo(0, 0);
    const close = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, []);
  const props = { language, workspace },
    component =
      page === 'surveys' ? (
        <SurveysPage {...props} />
      ) : page === 'survey-builder' ? (
        <SurveyBuilder {...props} />
      ) : page.startsWith('feedback') ? (
        <ConnectedFeedback page={page} {...props} />
      ) : ['dashboard', 'dashboard-empty', 'analytics'].includes(page) ? (
        <AnalyticsPage overview={page !== 'analytics'} {...props} />
      ) : page === 'reports' ? (
        <ReportsPage {...props} />
      ) : ['team', 'team-accept'].includes(page) ? (
        <TeamPage page={page} {...props} />
      ) : page === 'branches' ? (
        <BranchesPage {...props} />
      ) : page === 'assistant' ? (
        <AssistantPage {...props} />
      ) : (
        <BusinessPageSettings {...props} />
      );
  return (
    <ProductProvider
      {...{ language, setLanguage, workspace, onLogout, menuOpen }}
      onNavigate={() => setMenuOpen(false)}
    >
      <div
        className="product-page connected-page"
        data-menu-open={menuOpen}
        data-account-backed="true"
      >
        <button
          className="product-mobile-toggle"
          aria-label={language === 'ar' ? 'قائمة التنقل' : 'Navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
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
        <WorkspaceShell title={titles[page]}>
          <div className="connected-product" data-product-route={page}>
            {component}
          </div>
        </WorkspaceShell>
      </div>
    </ProductProvider>
  );
}
