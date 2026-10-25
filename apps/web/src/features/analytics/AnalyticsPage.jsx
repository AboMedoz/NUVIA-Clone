import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { canManage, queryString, requestFilters } from '../product/product-state.js';
import { DataTable, EmptyState, ErrorNotice, ResourceState, Status } from '../product/ui.jsx';
import Filters from '../product/Filters.jsx';
import { AspectScoreChart, SentimentChart, TrendChart } from './ChartVisuals.jsx';
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
  return (
    <>
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
        <a className="product-button" href="#/surveys">
          {t('Share a survey', 'مشاركة استبيان')}
        </a>
      </div>
      <Filters {...{ filters, setFilters, workspace, language }} />
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
          <div className="product-grid">
            {[
              [t('Total responses', 'إجمالي الردود'), data.totalResponses],
              [t('Analyzed responses', 'الردود المحللة'), data.analyzedResponses],
              [t('Pending analysis', 'بانتظار التحليل'), data.pendingResponses],
            ].map(([label, value]) => (
              <section key={label} className="product-card product-metric">
                <p>{label}</p>
                <strong>{Number(value || 0).toLocaleString(language)}</strong>
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
          {tab === 'sentiment' && (
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
          {tab === 'aspects' && (
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
          {tab === 'topics' && (
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
          {tab === 'trends' && (
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
          {tab === 'comparisons' && (
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
    </>
  );
}
