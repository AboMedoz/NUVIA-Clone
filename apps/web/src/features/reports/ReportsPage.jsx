import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { canManage, requestFilters } from '../product/product-state.js';
import { EmptyState, ErrorNotice, ResourceState, Status } from '../product/ui.jsx';
import Filters from '../product/Filters.jsx';
import { EvidenceLinks } from '../analytics/AnalyticsPage.jsx';
import AiTaskState from '../product/AiTaskState.jsx';
import '../analytics/analytics-report.css';
export default function ReportsPage({ language, workspace }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    resource = useResource('/reports', { refreshInterval: 30000 }),
    mutation = useMutation(),
    [filters, setFilters] = useState({}),
    [selection, setSelected] = useState(() => {
      const id = new URLSearchParams(location.hash.split('?')[1]).get('id');
      return id ? { id } : null;
    }),
    [reportLocale, setReportLocale] = useState(language),
    [generationOpen, setGenerationOpen] = useState(false),
    [libraryLocale, setLibraryLocale] = useState(''),
    [sortOrder, setSortOrder] = useState('newest');
  const saved = useResource(selection?.id ? '/reports/' + selection.id : null, {
      refreshInterval: 30000,
    }),
    selected = saved.data?.report || selection;
  const reports = resource.data?.reports || [];
  const latest = reports[0];
  const shown = reports
    .filter((report) => !libraryLocale || report.locale === libraryLocale)
    .toSorted(
      (a, b) => (sortOrder === 'newest' ? -1 : 1) * (new Date(a.createdAt) - new Date(b.createdAt)),
    );
  const formatDate = (date) =>
    date
      ? new Date(date).toLocaleDateString(language, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';
  const title = (report) =>
    report.content?.title || report.title || t('Feedback report', 'تقرير الآراء');
  async function open(id) {
    const result = await mutation.run((signal) => productApi.get('/reports/' + id, signal));
    if (result) setSelected(result.report);
  }
  return (
    <div className="analytics-report-page reports-page">
      <div className="product-heading">
        <div>
          <h1>{t('AI Reports', 'تقارير الذكاء الاصطناعي')}</h1>
          <p>
            {t(
              'Turn customer feedback into a clear, evidence-backed plan for your business.',
              'حوّل آراء العملاء إلى خطة واضحة لنشاطك تدعمها الأدلة.',
            )}
          </p>
        </div>
        {canManage(workspace) && (
          <button
            className="primary"
            aria-expanded={generationOpen}
            aria-controls="report-generation"
            onClick={() => setGenerationOpen((open) => !open)}
          >
            {t('Generate new report', 'إنشاء تقرير جديد')}
          </button>
        )}
      </div>
      <section className="product-card report-snapshot-banner">
        <div>
          <p className="snapshot-eyebrow">
            <img src="/assets/figma-analytics-reports/insight.svg" alt="" aria-hidden="true" />
            {t('YOUR LATEST SNAPSHOT', 'أحدث لقطة لبياناتك')}
          </p>
          <h2>
            {t(
              'One view of what matters. Evidence behind every action.',
              'رؤية واضحة لما يهم. وأدلة وراء كل خطوة.',
            )}
          </h2>
          <p>
            {latest
              ? t(
                  'Based on the saved evidence in your latest report.',
                  'بناءً على الأدلة المحفوظة في أحدث تقرير لك.',
                )
              : t(
                  'Create your first report from the feedback you collect.',
                  'أنشئ تقريرك الأول من الآراء التي تجمعها.',
                )}
          </p>
        </div>
        <div className="snapshot-number">
          <strong>{latest?.metrics?.totalResponses?.toLocaleString(language) ?? '—'}</strong>
          <span>{t('responses in snapshot', 'ردود في اللقطة')}</span>
        </div>
        <div className="snapshot-number">
          <strong>{latest?.metrics?.comparisons?.length?.toLocaleString(language) ?? '—'}</strong>
          <span>{t('branches represented', 'فروع ممثلة')}</span>
        </div>
      </section>
      <div
        id="report-generation"
        className="report-generation-panel"
        hidden={!generationOpen || !canManage(workspace)}
      >
        <Filters {...{ filters, setFilters, workspace, language }} />
        <div className="product-card product-inline report-generation-actions">
          <label className="product-field">
            {t('Report language', 'لغة التقرير')}
            <select value={reportLocale} onChange={(e) => setReportLocale(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          {canManage(workspace) && (
            <button
              className="primary"
              disabled={mutation.busy}
              onClick={async () => {
                const result = await mutation.run((signal) =>
                  productApi.send(
                    '/reports',
                    {
                      locale: reportLocale,
                      filters: requestFilters(filters, workspace?.reportingTimezone),
                    },
                    'POST',
                    signal,
                  ),
                );
                if (result) {
                  setSelected(result.report);
                  resource.reload();
                }
              }}
            >
              {t('Create report', 'إنشاء تقرير')}
            </button>
          )}
        </div>
      </div>
      <ErrorNotice error={mutation.error} language={language} />
      <ResourceState resource={resource} language={language} />
      <div className="report-library-toolbar">
        <label>
          {t('Language', 'اللغة')}
          <select value={libraryLocale} onChange={(event) => setLibraryLocale(event.target.value)}>
            <option value="">{t('All languages', 'كل اللغات')}</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <span>
          {shown.length.toLocaleString(language)} {t('reports', 'تقارير')}
        </span>
        <label className="report-sort">
          {t('Sort reports', 'ترتيب التقارير')}
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="newest">{t('Newest first', 'الأحدث أولًا')}</option>
            <option value="oldest">{t('Oldest first', 'الأقدم أولًا')}</option>
          </select>
        </label>
      </div>
      <div className="report-library">
        {shown.map((report) => (
          <article
            className={
              'product-card report-library-card' +
              (report.id === latest?.id ? ' latest-report' : '')
            }
            key={report.id}
            aria-label={title(report)}
          >
            <header>
              <span className="report-symbol">
                <img src="/assets/figma-analytics-reports/report.svg" alt="" aria-hidden="true" />
              </span>
              <div>
                <h2 dir={report.locale === 'ar' ? 'rtl' : 'ltr'} lang={report.locale || language}>
                  {title(report)}
                </h2>
                <p>
                  {t('Created', 'تاريخ الإنشاء')} {formatDate(report.createdAt)}
                </p>
              </div>
              <Status value={report.status} language={language} />
            </header>
            <p
              className="report-card-summary"
              dir={report.locale === 'ar' ? 'rtl' : 'ltr'}
              lang={report.locale || language}
            >
              {report.content?.summary ||
                report.summary ||
                t(
                  'An evidence snapshot is saved. Generated findings will appear when analysis is complete.',
                  'تم حفظ لقطة من الأدلة. تظهر النتائج المولّدة بعد اكتمال التحليل.',
                )}
            </p>
            <dl className="report-card-metadata">
              <div>
                <dt>{t('Period covered', 'الفترة المشمولة')}</dt>
                <dd>
                  {report.filters?.from || report.filters?.to
                    ? `${formatDate(report.filters.from)} — ${formatDate(report.filters.to)}`
                    : t('All available dates', 'كل التواريخ المتاحة')}
                </dd>
              </div>
              <div>
                <dt>{t('Language', 'اللغة')}</dt>
                <dd>{report.locale === 'ar' ? 'العربية' : 'English'}</dd>
              </div>
              <div>
                <dt>{t('Responses', 'الردود')}</dt>
                <dd>{report.metrics?.totalResponses?.toLocaleString(language) ?? '—'}</dd>
              </div>
            </dl>
            <footer>
              <button
                className={report.id === latest?.id ? 'primary' : undefined}
                disabled={mutation.busy}
                onClick={() => open(report.id)}
              >
                {t('Open report', 'فتح التقرير')}
              </button>
              <a className="product-button" href={'/api/v1/reports/' + report.id + '/export'}>
                {t('Download PDF', 'تنزيل PDF')}
              </a>
            </footer>
          </article>
        ))}
        {resource.data && !resource.data.reports?.length && (
          <EmptyState title={t('No reports yet', 'لا توجد تقارير بعد')} />
        )}
        {reports.length > 0 && !shown.length && (
          <EmptyState title={t('No reports match this language', 'لا توجد تقارير بهذه اللغة')} />
        )}
      </div>
      <p className="report-library-note">
        {t(
          'Reports include saved evidence and links to the original feedback.',
          'تتضمن التقارير أدلة محفوظة وروابط للآراء الأصلية.',
        )}
      </p>
      {selected && (
        <section className="product-card selected-report">
          <div className="product-heading">
            <h2 dir={selected.locale === 'ar' ? 'rtl' : 'ltr'} lang={selected.locale || language}>
              {selected.content?.title || selected.title || t('Feedback report', 'تقرير الآراء')}
            </h2>
            <a href={'/api/v1/reports/' + selected.id + '/export'}>
              {t('Download PDF', 'تنزيل PDF')}
            </a>
          </div>
          <Status value={selected.status} language={language} />
          <ResourceState resource={saved} language={language} />
          {selected.content || selected.summary ? (
            <div
              className="report-document"
              dir={selected.locale === 'ar' ? 'rtl' : 'ltr'}
              lang={selected.locale || language}
            >
              {typeof selected.content === 'string' ? (
                selected.content
              ) : (
                <>
                  <p>{selected.content?.summary || selected.summary}</p>
                  {(selected.content?.sections || []).map((section, index) => (
                    <section key={index}>
                      <h3>{section.title || section.heading}</h3>
                      <p>{section.text || section.body || section.content}</p>
                      <EvidenceLinks
                        evidence={
                          section.evidence ||
                          (selected.content.evidence || []).filter((item) =>
                            (section.evidenceIds || []).includes(item.id),
                          )
                        }
                        language={language}
                      />
                    </section>
                  ))}
                </>
              )}
            </div>
          ) : (
            <AiTaskState
              status={selected.status}
              language={language}
              busy={mutation.busy}
              onRetry={
                canManage(workspace)
                  ? async () => {
                      const result = await mutation.run((signal) =>
                        productApi.send(
                          '/analysis/retry',
                          { filters: selected.filters || {} },
                          'POST',
                          signal,
                        ),
                      );
                      if (result) {
                        await open(selected.id);
                        resource.reload();
                      }
                    }
                  : undefined
              }
            />
          )}
          <h3>{t('Source evidence', 'الأدلة الأصلية')}</h3>
          <EvidenceLinks
            evidence={selected.evidence || selected.evidenceSnapshot || []}
            language={language}
          />
        </section>
      )}
    </div>
  );
}
