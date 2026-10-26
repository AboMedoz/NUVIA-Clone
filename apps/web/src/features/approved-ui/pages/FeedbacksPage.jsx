import useWorkspaceScale from '../product/useWorkspaceScale.js';
import React, { useEffect, useState } from 'react';
import { asset } from '../assets.js';
import { ProductProvider } from '../product/ProductContext.jsx';
import FeedbackShell from '../product/FeedbackShell.jsx';
import Assistant from '../product/Assistant.jsx';
import '../product/assistant.css';
import { FeedbackList, FeedbackDetail } from '../product/FeedbackScreens.jsx';
export default function FeedbacksPage({ page, language, setLanguage }) {
  useWorkspaceScale();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, []);
  return (
    <ProductProvider
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
        <FeedbackShell title={page === 'feedback-details' ? 'Feedback details' : 'Feedbacks'}>
          {page === 'feedback-details' ? (
            <FeedbackDetail key={location.hash} />
          ) : (
            <FeedbackList
              key={page}
              empty={page === 'feedbacks-empty'}
              loading={page === 'feedbacks-loading'}
              noResults={page === 'feedbacks-no-results'}
            />
          )}
        </FeedbackShell>
        <Assistant />
      </div>
    </ProductProvider>
  );
}
