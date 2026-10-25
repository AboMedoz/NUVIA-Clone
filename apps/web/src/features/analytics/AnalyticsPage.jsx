import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { canManage, queryString, requestFilters } from '../product/product-state.js';
import { DataTable, EmptyState, ErrorNotice, ResourceState, Status } from '../product/ui.jsx';
import Filters from '../product/Filters.jsx';
import {
  AspectScoreChart,
  SentimentChart,
  TrendChart,
  ResponseTrendChart,
} from './ChartVisuals.jsx';
import './analytics-report.css';
const asRows = (value) =>
  Array.isArray(value)
    ? value
    : Object.entries(value || {}).map(([label, count]) => ({ label, count }));
export function EvidenceLinks({ evidence = [], language }) {
  return (
    <div className="product-actions">
      {evidence.map((item, index) => (
        <a
          key={item.responseId || item.id || index}
          href={'#/feedback-details?id=' + encodeURIComponent(item.responseId || item.id)}
        >
          {item.quote || item.text ? (
            <q>{item.quote || item.text}</q>
          ) : language === 'ar' ? (
            'عرض الرد الأصلي'
          ) : (
            'View original response'
          )}
        </a>
      ))}
    </div>
  );
}
export default function AnalyticsPage({ language, workspace, overview }) {
  const ar = language === 'ar',
    t = (a, b) => (ar ? b : a),
    [filters, setFilters] = useState({}),
    [tab, setTab] = useState('sentiment'),
    resource = useResource('/analytics' + queryString(filters, workspace?.reportingTimezone), {
      refreshInterval: 30000,
    }),
    jobs = useResource('/analysis/jobs', { refreshInterval: 30000 }),
    mutation = useMutation();
  const data = resource.data;
  const sentimentCount = Object.values(data?.sentimentDistribution || {}).reduce(
    (sum, value) => sum + value,
    0,
  );
  const positiveShare = sentimentCount
    ? Math.round(((data.sentimentDistribution.positive || 0) / sentimentCount) * 100)
    : null;
  return (
    <div className={'analytics-report-page ' + (overview ? 'overview-page' : 'analytics-page')}>
      <div className="product-heading">
        <div>
          <h1>{overview ? t('Overview', 'نظرة عامة') : t('Analytics', 'التحليلات')}</h1>
          <p>
            {t(
              'Understand your customer feedback with traceable evidence.',
              'افهم آراء العملاء مع أدلة يمكن الرجوع إليها.',
            )}
          </p>
        </div>
        <div className="product-actions">
          <a className="product-button" href="#/reports">
            {t('View reports', 'عرض التقارير')}
          </a>
          <a className="product-button primary" href="#/surveys">
            {t('Share a survey', 'مشاركة استبيان')}
          </a>
        </div>
      </div>
      <details className="analytics-filter-disclosure">
        <summary>
          {t('Filter feedback', 'تصفية الآراء')}
          {Object.values(filters).some(Boolean) ? t(' · Active', ' · نشطة') : ''}
        </summary>
        <Filters {...{ filters, setFilters, workspace, language }} />
      </details>
      <ResourceState resource={resource} language={language} />
      {data && (
        <>
          {overview && data.totalResponses === 0 && (
            <EmptyState title={t('No responses yet', 'لا توجد ردود بعد')}>
              <p>
                {t(
                  'Create a survey and share a branch link to collect your first response.',
                  'أنشئ استبيانًا وشارك رابط الفرع لجمع أول رد.',
                )}
              </p>
            </EmptyState>
          )}
          <div className="overview-metrics">
            {[
              [
                t('Total responses', 'إجمالي الردود'),
                Number(data.totalResponses || 0).toLocaleString(language),
                'response',
                t('Saved customer feedback', 'آراء العملاء المحفوظة'),
              ],
              [
                t('Positive sentiment', 'المشاعر الإيجابية'),
                positiveShare === null ? '—' : positiveShare.toLocaleString(language) + '%',
                'sentiment',
                t('Of responses with sentiment analysis', 'من الردود التي تم تحليل مشاعرها'),
              ],
              [
                t('Analyzed responses', 'الردود المحللة'),
                Number(data.analyzedResponses || 0).toLocaleString(language),
                'analyzed',
                t('Sentiment and aspects complete', 'اكتمل تحليل المشاعر والجوانب'),
              ],
              [
                t('Pending analysis', 'بانتظار التحليل'),
                Number(data.pendingResponses || 0).toLocaleString(language),
                'pending',
                t('Awaiting complete analysis', 'في انتظار اكتمال التحليل'),
              ],
            ].map(([label, value, icon, description]) => (
              <section key={label} className="product-card product-metric">
                <div className="metric-heading">
                  <p>{label}</p>
                  <img
                    src={'/assets/figma-analytics-reports/' + icon + '.svg'}
                    alt=""
                    aria-hidden="true"
                  />
                </div>
                <strong>{value}</strong>
                <small>{description}</small>
              </section>
            ))}
          </div>
          {!data.analyzedResponses && (
            <p className="product-notice">
              {t(
                'Responses are collected and saved. Sentiment, aspects, topics and forecasts will appear after compatible models produce validated analysis.',
                'يتم جمع الردود وحفظها. تظهر المشاعر والجوانب والموضوعات والتوقعات بعد تحليلها بنماذج متوافقة.',
              )}
            </p>
          )}
          {overview && (
            <>
              <div className="overview-chart-grid">
                <section className="product-card overview-trend-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t('Response & sentiment trends', 'اتجاهات الردود والمشاعر')}</h2>
                      <p>
                        {t(
                          'Saved responses and their observed sentiment.',
                          'الردود المحفوظة ومشاعرها المرصودة.',
                        )}
                      </p>
                    </div>
                    <a href="#/analytics">{t('Analytics →', 'التحليلات ←')}</a>
                  </div>
                  <ResponseTrendChart
                    rows={data.trends}
                    language={language}
                    interval={data.interval || filters.interval || 'day'}
                  />
                  {!data.trends?.length && (
                    <EmptyState
                      title={t('No trend observations yet', 'لا توجد ملاحظات للاتجاهات بعد')}
                    />
                  )}
                </section>
                <section className="product-card overview-sentiment-panel">
                  <h2>{t('How customers feel', 'كيف يشعر العملاء')}</h2>
                  <p className="panel-description">
                    {t('Sentiment across analyzed feedback', 'المشاعر في الآراء المحللة')}
                  </p>
                  <SentimentChart distribution={data.sentimentDistribution} language={language} />
                  {!sentimentCount && (
                    <EmptyState
                      title={t('No analyzed sentiment yet', 'لا يوجد تحليل للمشاعر بعد')}
                    />
                  )}
                </section>
              </div>
              <div className="overview-evidence-grid">
                <section className="product-card overview-evidence-panel">
                  <div className="panel-heading">
                    <h2>
                      <img
                        src="/assets/figma-analytics-reports/insight.svg"
                        alt=""
                        aria-hidden="true"
                      />
                      {t('From feedback to action', 'من الآراء إلى خطوات عملية')}
                    </h2>
                    <span className="product-status">{t('Evidence-led', 'قائم على الأدلة')}</span>
                  </div>
                  <h3>
                    {t('Explore the evidence behind your results.', 'استكشف الأدلة وراء نتائجك.')}
                  </h3>
                  <p>
                    {t(
                      'Open a saved report for its findings and quoted feedback, or ask a question about your current customer responses.',
                      'افتح تقريرًا محفوظًا للاطلاع على نتائجه واقتباساته، أو اسأل عن آراء عملائك الحالية.',
                    )}
                  </p>
                  <div className="product-actions">
                    <a href="#/reports">{t('View reports →', 'عرض التقارير ←')}</a>
                    <a href="#/assistant">{t('Ask NUVIA', 'اسأل نوفيا')}</a>
                  </div>
                </section>
                <section className="product-card overview-aspect-panel">
                  <h2>{t('Aspect scores', 'تقييم الجوانب')}</h2>
                  <p className="panel-description">
                    {t(
                      'Observed scores out of 10 · Mention counts',
                      'تقييمات مرصودة من ١٠ · عدد الإشارات',
                    )}
                  </p>
                  <AspectScoreChart rows={data.aspectScores} language={language} />
                  {!data.aspectScores?.length && (
                    <EmptyState title={t('No aspect evidence yet', 'لا توجد أدلة للجوانب بعد')} />
                  )}
                </section>
              </div>
            </>
          )}
          {!overview && (
            <div className="product-tabs">
              {[
                ['sentiment', t('Sentiment', 'المشاعر')],
                ['aspects', t('Aspects', 'الجوانب')],
                ['topics', t('Topics', 'الموضوعات')],
                ['trends', t('Trends', 'الاتجاهات')],
                ['comparisons', t('Comparisons', 'المقارنات')],
              ].map(([key, label]) => (
                <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {!overview && tab === 'sentiment' && (
            <section className="product-card">
              <h2>{t('Sentiment distribution', 'توزيع المشاعر')}</h2>
              <SentimentChart distribution={data.sentimentDistribution} language={language} />
              {asRows(data.sentimentDistribution).length ? (
                <DataTable headings={[t('Sentiment', 'المشاعر'), t('Responses', 'الردود')]}>
                  {asRows(data.sentimentDistribution).map((row) => (
                    <tr key={row.label || row.sentiment}>
                      <td>{row.label || row.sentiment}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </DataTable>
              ) : (
                <EmptyState title={t('No analyzed sentiment yet', 'لا يوجد تحليل للمشاعر بعد')} />
              )}
            </section>
          )}
          {!overview && tab === 'aspects' && (
            <section className="product-card">
              <h2>{t('Aspect scores', 'تقييم الجوانب')}</h2>
              <AspectScoreChart rows={data.aspectScores} language={language} />
              <DataTable
                headings={[
                  t('Aspect', 'الجانب'),
                  t('Score / 10', 'التقييم / ١٠'),
                  t('Mentions', 'الإشارات'),
                  t('Evidence', 'الأدلة'),
                ]}
              >
                {asRows(data.aspectScores).map((row, index) => (
                  <tr key={row.aspect || row.name || index}>
                    <td>{row.aspect || row.name || row.label}</td>
                    <td>{row.score ?? '—'}</td>
                    <td>
                      {row.mentions ?? row.count ?? row.mentionCount ?? 0}
                      {(row.mentions ?? row.count ?? row.mentionCount ?? 0) < 10 && (
                        <p>{t('Small sample — interpret with care', 'عينة صغيرة — فسّر بحذر')}</p>
                      )}
                    </td>
                    <td>
                      <EvidenceLinks evidence={row.evidence} language={language} />
                    </td>
                  </tr>
                ))}
              </DataTable>
              {!asRows(data.aspectScores).length && (
                <EmptyState title={t('No aspect evidence yet', 'لا توجد أدلة للجوانب بعد')} />
              )}
            </section>
          )}
          {!overview && tab === 'topics' && (
            <section className="product-card">
              <h2>{t('Topics & emerging issues', 'الموضوعات والقضايا الناشئة')}</h2>
              {asRows(data.topics).map((row, index) => (
                <article key={row.id || index} className="product-card">
                  <h3>{row.summaryTitle || row.title || row.label}</h3>
                  {row.emerging && (
                    <span className="product-status">{t('Emerging issue', 'قضية ناشئة')}</span>
                  )}
                  <p>{row.summary}</p>
                  {row.summaryStatus && row.summaryStatus !== 'succeeded' && (
                    <Status value={row.summaryStatus} language={language} />
                  )}
                  <p>
                    {row.count || row.responseCount} {t('responses', 'ردود')}
                  </p>
                  <EvidenceLinks evidence={row.evidence} language={language} />
                  {row.summary && (
                    <EvidenceLinks evidence={row.summaryEvidence || []} language={language} />
                  )}
                </article>
              ))}
              {!asRows(data.topics).length && (
                <EmptyState
                  title={t(
                    'Topics await model analysis and enough observations',
                    'الموضوعات بانتظار التحليل وتوفر ملاحظات كافية',
                  )}
                />
              )}
            </section>
          )}
          {!overview && tab === 'trends' && (
            <section className="product-card">
              <h2>{t('Feedback over time', 'الآراء عبر الزمن')}</h2>
              <TrendChart
                rows={data.trends}
                language={language}
                interval={data.interval || filters.interval || 'day'}
              />
              <DataTable
                headings={[t('Period', 'الفترة'), t('Responses', 'الردود'), t('Score', 'التقييم')]}
              >
                {asRows(data.trends).map((row, index) => (
                  <tr key={row.date || index}>
                    <td>{row.date || row.period || row.label}</td>
                    <td>{row.count ?? row.totalResponses ?? '—'}</td>
                    <td>
                      {row.aspectScores?.length
                        ? row.aspectScores.map((a) => (
                            <p key={a.aspect}>
                              {a.aspect}: {a.score}/10{' '}
                              {a.lowSample ? t('(small sample)', '(عينة صغيرة)') : ''}
                            </p>
                          ))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </DataTable>
              {!asRows(data.trends).length && (
                <EmptyState
                  title={t('No trend observations yet', 'لا توجد ملاحظات للاتجاهات بعد')}
                />
              )}
              <h3>{t('Forecast', 'التوقعات')}</h3>
              {(data.forecasts || []).map((forecast, index) => (
                <section key={index}>
                  <p>
                    {t('Sample count', 'حجم العينة')}: {forecast.sampleCount}
                  </p>
                  <p>
                    {forecast.uncertainty ||
                      t(
                        'No uncertainty interval was supplied by the model.',
                        'لم يوفّر النموذج نطاقًا لعدم اليقين.',
                      )}
                  </p>
                  <DataTable
                    headings={[
                      t('Date', 'التاريخ'),
                      t('Forecast', 'التوقع'),
                      t('Lower bound', 'الحد الأدنى'),
                      t('Upper bound', 'الحد الأعلى'),
                    ]}
                  >
                    {forecast.points?.map((point) => (
                      <tr key={point.date}>
                        <td>{point.date}</td>
                        <td>{point.value}</td>
                        <td>{point.lower ?? '—'}</td>
                        <td>{point.upper ?? '—'}</td>
                      </tr>
                    ))}
                  </DataTable>
                  <p>
                    {t('Model version', 'إصدار النموذج')}: {forecast.modelVersion}
                  </p>
                </section>
              ))}
              {!data.forecasts?.length && (
                <p className="product-notice">
                  {t(
                    'Forecasts require a ready model and sufficient historical observations.',
                    'تتطلب التوقعات نموذجًا جاهزًا وسجلًا كافيًا من الملاحظات.',
                  )}
                </p>
              )}
              {data.capabilityStates?.forecasting && (
                <p>
                  <Status value={data.capabilityStates.forecasting.status} language={language} />{' '}
                  {t('Observed periods', 'الفترات المرصودة')}:{' '}
                  {data.capabilityStates.forecasting.sampleCount ??
                    data.capabilityStates.forecasting.periodCount ??
                    0}
                </p>
              )}
            </section>
          )}
          {!overview && tab === 'comparisons' && (
            <section className="product-card">
              <h2>{t('Branch & period comparison', 'مقارنة الفروع والفترات')}</h2>
              <DataTable
                headings={[
                  t('Branch / period', 'الفرع / الفترة'),
                  t('Responses', 'الردود'),
                  t('Score', 'التقييم'),
                ]}
              >
                {asRows(data.comparisons).map((row, index) => (
                  <tr key={row.branchId || index}>
                    <td>{row.branchName || row.name || row.label || row.period}</td>
                    <td>{row.count ?? row.totalResponses ?? '—'}</td>
                    <td>
                      {row.aspectScores?.length
                        ? row.aspectScores.map((a) => (
                            <p key={a.aspect}>
                              {a.aspect}: {a.score}/10{' '}
                              {a.lowSample ? t('(small sample)', '(عينة صغيرة)') : ''}
                            </p>
                          ))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </DataTable>
              {!asRows(data.comparisons).length && (
                <EmptyState
                  title={t(
                    'Choose filters to compare available evidence',
                    'اختر الفلاتر لمقارنة الأدلة المتاحة',
                  )}
                />
              )}
              {data.segmentComparisons?.length > 0 && (
                <>
                  <h3>{t('Customer segments', 'شرائح العملاء')}</h3>
                  <DataTable headings={[t('Segment', 'الشريحة'), t('Responses', 'الردود')]}>
                    {data.segmentComparisons.map((segment, index) => (
                      <tr key={index}>
                        <td>{segment.value}</td>
                        <td>{segment.totalResponses}</td>
                      </tr>
                    ))}
                  </DataTable>
                </>
              )}
            </section>
          )}
          {asRows(data.alerts).length > 0 && (
            <section className="product-card">
              <h2>{t('Alerts & risks', 'التنبيهات والمخاطر')}</h2>
              {data.alerts.map((alert, index) => (
                <article key={alert.id || index}>
                  <h3>{alert.title || alert.aspect}</h3>
                  <p>
                    {alert.message ||
                      alert.summary ||
                      `${alert.from} → ${alert.to}: ${alert.change}`}
                  </p>
                  <EvidenceLinks evidence={alert.evidence} language={language} />
                </article>
              ))}
            </section>
          )}
          {data.atRiskAspects?.length > 0 && (
            <section className="product-card">
              <h2>{t('Aspects needing attention', 'جوانب تحتاج الانتباه')}</h2>
              <p>
                {t(
                  'Observed scores below 4/10, with at least 10 mentions. These are current observations.',
                  'تقييمات مرصودة أقل من ٤/١٠ مع ١٠ إشارات على الأقل. هذه ملاحظات حالية.',
                )}
              </p>
              {data.atRiskAspects.map((aspect) => (
                <p key={aspect.aspect}>
                  {aspect.aspect}: {aspect.score}/10 · {aspect.mentions} {t('mentions', 'إشارات')}
                </p>
              ))}
            </section>
          )}
        </>
      )}
      <details className="analysis-queue-disclosure">
        <summary>{t('Analysis queue', 'قائمة التحليل')}</summary>
        <section className="product-card">
          <div className="product-heading">
            <h2>{t('Analysis queue', 'قائمة التحليل')}</h2>
            {canManage(workspace) && (
              <button
                disabled={mutation.busy}
                onClick={async () => {
                  const result = await mutation.run((signal) =>
                    productApi.send(
                      '/analysis/retry',
                      { filters: requestFilters(filters, workspace?.reportingTimezone) },
                      'POST',
                      signal,
                    ),
                  );
                  if (result) {
                    jobs.reload();
                    resource.reload();
                  }
                }}
              >
                {t('Retry eligible analysis', 'إعادة محاولة التحليل المتاح')}
              </button>
            )}
          </div>
          <ErrorNotice error={mutation.error} language={language} />
          <ResourceState resource={jobs} language={language} />
          {(jobs.data?.jobs || []).slice(0, 10).map((job) => (
            <div className="product-inline" key={job.id}>
              <a href={job.reportId ? '#/reports' : '#/feedback-details?id=' + job.responseId}>
                {job.reportId ? t('Report', 'التقرير') : t('Response', 'الرد')}{' '}
                {job.responseId?.slice(0, 8)}
              </a>
              <Status value={job.status} language={language} />
              <p>{job.capability}</p>
            </div>
          ))}
          {jobs.data && !jobs.data.jobs?.length && (
            <p>{t('No analysis jobs yet.', 'لا توجد مهام تحليل بعد.')}</p>
          )}
        </section>
      </details>
      {overview && (
        <section className="product-card overview-quick-actions">
          <div>
            <h2>{t('Quick actions', 'إجراءات سريعة')}</h2>
            <p>
              {t(
                'Turn customer feedback into your next move.',
                'حوّل آراء العملاء إلى خطوتك التالية.',
              )}
            </p>
          </div>
          <div className="product-actions">
            <a className="product-button" href="#/feedbacks">
              {t('View all responses', 'عرض كل الردود')}
            </a>
            <a className="product-button" href="#/reports">
              {t('View reports', 'عرض التقارير')}
            </a>
            {canManage(workspace) && (
              <a className="product-button primary" href="#/survey-builder">
                {t('Create survey', 'إنشاء استبيان')}
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
