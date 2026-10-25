import React, { useState } from 'react';
import { useResource } from '../product/useResource.js';
import { queryString } from '../product/product-state.js';
import { DataTable, EmptyState, ResourceState, Status } from '../product/ui.jsx';
import Filters from '../product/Filters.jsx';
import { FeedbackList } from './FeedbackScreens.jsx';
import { useProductView } from '../../app/providers/ProductProvider.jsx';
export default function ConnectedFeedback({ page, language, workspace }) {
  const ar = language === 'ar',
    t = (a, b) => (ar ? b : a),
    ui = useProductView(),
    [filters, setFilters] = useState({}),
    [paginationQuery, setPaginationQuery] = useState(ui.query);
  // Reset before request effects commit, so a new query never uses the old page.
  if (paginationQuery !== ui.query) {
    setPaginationQuery(ui.query);
    setFilters((old) => ({ ...old, page: 1 }));
  }
  const id = new URLSearchParams(location.hash.split('?')[1]).get('id');
  const resource = useResource(
    page === 'feedback-details' && id
      ? '/feedback/' + encodeURIComponent(id)
      : '/feedback' +
          queryString({ ...filters, search: ui.query, pageSize: 20 }, workspace?.reportingTimezone),
    { refreshInterval: 30000 },
  );
  const detail = resource.data?.response,
    rows = resource.data?.responses || [],
    total = resource.data?.total || 0;
  if (resource.loading || resource.error)
    return (
      <>
        <h1>
          {page === 'feedback-details'
            ? t('Feedback details', 'تفاصيل الرأي')
            : t('Feedback', 'آراء العملاء')}
        </h1>
        {page !== 'feedback-details' && (
          <Filters {...{ filters, setFilters, workspace, language }} />
        )}
        <ResourceState resource={resource} language={language} />
      </>
    );
  if (detail)
    return (
      <>
        <div className="product-heading">
          <div>
            <h1>{t('Feedback details', 'تفاصيل الرأي')}</h1>
            <p>
              {detail.surveyTitle} · {detail.branchName}
            </p>
          </div>
          <a href="#/feedbacks">{t('Back to feedback', 'العودة للآراء')}</a>
        </div>
        <section className="product-card">
          <p>{new Date(detail.createdAt).toLocaleString(language)}</p>
          <Status value={detail.analysisStatus} language={language} />
          <h2 style={{ marginTop: 20 }}>{t('Original response', 'الرد الأصلي')}</h2>
          <blockquote className="product-evidence">
            {detail.text || t('Structured answers', 'إجابات منظمة')}
          </blockquote>
          {detail.answers?.map((answer, index) => (
            <div key={answer.questionId || index} className="product-card">
              <strong>
                {answer.label ||
                  answer.questionLabel ||
                  detail.questions?.find((q) => q.id === answer.questionId)?.label ||
                  answer.questionId}
              </strong>
              <p>{Array.isArray(answer.value) ? answer.value.join(' · ') : String(answer.value)}</p>
            </div>
          ))}
        </section>
        <section className="product-card">
          <h2>{t('Analysis & evidence', 'التحليل والأدلة')}</h2>
          {detail.analysis ? (
            <>
              <p>
                {t('Sentiment', 'المشاعر')}:{' '}
                {detail.analysis.sentiment?.label || detail.analysis.sentiment || '—'}
              </p>
              {(detail.analysis.sentiment?.sentences || []).map((s, index) => (
                <blockquote className="product-evidence" key={s.id || index}>
                  {
                    detail.preprocessing?.sentences?.find(
                      (sentence) => sentence.id === s.sentenceId,
                    )?.text
                  }
                  <p>
                    <Status value={s.label} language={language} />
                  </p>
                </blockquote>
              ))}
              {(detail.analysis.aspects?.mentions || []).map((aspect, index) => (
                <blockquote className="product-evidence" key={index}>
                  <q>{aspect.quote}</q>
                  <p>
                    {aspect.aspect || aspect.name}:{' '}
                    <Status
                      value={aspect.label || aspect.polarity || aspect.sentiment}
                      language={language}
                    />
                  </p>
                </blockquote>
              ))}
              <p>
                {t('Model version', 'إصدار النموذج')}:{' '}
                {[detail.analysis.sentiment?.modelVersion, detail.analysis.aspects?.modelVersion]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </>
          ) : (
            <p className="product-notice">
              {t(
                'This response is saved. Analysis is waiting for a compatible model.',
                'تم حفظ هذا الرد. التحليل بانتظار نموذج متوافق.',
              )}
            </p>
          )}
        </section>
      </>
    );
  const unfiltered = !Object.entries(filters).some(([, v]) => Boolean(v)) && !ui.query;
  if (!rows.length && unfiltered) return <FeedbackList empty />;
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('Feedback', 'آراء العملاء')}</h1>
          <p>
            {total.toLocaleString(language)} {t('responses', 'ردود')}
          </p>
        </div>
        <a
          className="product-button"
          href={
            '/api/v1/feedback/export' +
            queryString({ ...filters, search: ui.query }, workspace?.reportingTimezone)
          }
        >
          {t('Export CSV', 'تصدير CSV')}
        </a>
      </div>
      <Filters {...{ filters, setFilters, workspace, language }} />
      <section className="product-card">
        <DataTable
          headings={[
            t('Response', 'الرد'),
            t('Survey / branch', 'الاستبيان / الفرع'),
            t('Analysis', 'التحليل'),
            t('Date', 'التاريخ'),
          ]}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <a href={'#/feedback-details?id=' + row.id}>
                  {row.text || t('View structured answers', 'عرض الإجابات')}
                </a>
              </td>
              <td>
                {row.surveyTitle}
                <p>{row.branchName}</p>
              </td>
              <td>
                <Status value={row.analysisStatus} language={language} />
              </td>
              <td>{new Date(row.createdAt).toLocaleDateString(language)}</td>
            </tr>
          ))}
        </DataTable>
        {!rows.length && (
          <EmptyState title={t('No responses match your filters', 'لا توجد ردود تطابق الفلاتر')} />
        )}
        <div className="product-pagination">
          <button
            disabled={(filters.page || 1) === 1}
            onClick={() => setFilters((old) => ({ ...old, page: (old.page || 1) - 1 }))}
          >
            {t('Previous', 'السابق')}
          </button>
          <span>{filters.page || 1}</span>
          <button
            disabled={(filters.page || 1) * 20 >= total}
            onClick={() => setFilters((old) => ({ ...old, page: (old.page || 1) + 1 }))}
          >
            {t('Next', 'التالي')}
          </button>
        </div>
      </section>
    </>
  );
}
