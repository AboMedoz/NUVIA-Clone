import React, { useState } from 'react';
import { useProductView } from '../ProductContext.jsx';
import { AnalyticsTabs, AnalyticsFilters } from './AnalyticsControls.jsx';
import HeadingBack from '../HeadingBack.jsx';
import ControlIcon from '../../components/ControlIcon.jsx';
import ChoiceMenu from '../../components/ChoiceMenu.jsx';
import { ScopeSentiment, ScopeTrend } from '../OverviewScope.jsx';
import '../overview-scope.css';
import './analytics.css';

const titles = {
  sentiment: ['Sentiment Analysis', 'تحليل المشاعر'],
  aspects: ['Aspect-Based Analysis', 'تحليل الجوانب'],
  topics: ['Topics & Complaints', 'الموضوعات والشكاوى'],
  trends: ['Trends & Signals', 'الاتجاهات والإشارات'],
  comparison: ['Branch Comparison', 'مقارنة الفروع'],
};

export function analyticsExportRows(data, kind) {
  if (!data) return [];
  if (kind === 'aspects')
    return [
      ['Aspect', 'Score / 10', 'Mentions'],
      ...data.aspectScores.map((row) => [row.aspect, row.score, row.mentions]),
    ];
  if (kind === 'topics')
    return [
      ['Topic', 'Responses', 'Summary'],
      ...data.topics.map((row) => [
        row.summaryTitle || row.label || row.id,
        row.count,
        row.summary || '',
      ]),
    ];
  if (kind === 'trends')
    return [
      ['Date', 'Responses', 'Positive', 'Negative', 'Neutral', 'Mixed'],
      ...data.trends.map((row) => [
        row.date,
        row.totalResponses,
        ...['positive', 'negative', 'neutral', 'mixed'].map(
          (tone) => row.sentimentDistribution?.[tone] || 0,
        ),
      ]),
    ];
  if (kind === 'comparison')
    return [
      ['Branch', 'Responses', 'Positive', 'Negative', 'Neutral', 'Mixed'],
      ...data.comparisons.map((row) => [
        row.branchName,
        row.totalResponses,
        ...['positive', 'negative', 'neutral', 'mixed'].map(
          (tone) => row.sentimentDistribution?.[tone] || 0,
        ),
      ]),
    ];
  return [['Sentiment', 'Responses'], ...Object.entries(data.sentimentDistribution)];
}

function download(data, kind) {
  const csv =
    '\uFEFF' +
    analyticsExportRows(data, kind)
      .map((row) =>
        row.map((value) => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(','),
      )
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'NUVIA-analytics-' + kind + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Panel({ title, children }) {
  return (
    <section className="analytics-summary-card analytics-filtered">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Evidence({ rows = [], t }) {
  return rows.map((row, index) => (
    <a
      key={row.responseId || row.id || index}
      href={'#/feedback-details?id=' + encodeURIComponent(row.responseId || row.id)}
    >
      <blockquote>
        {row.quote || row.text || t('View original response', 'عرض الرد الأصلي')}
      </blockquote>
    </a>
  ));
}

export default function ConnectedAnalytics() {
  const { analytics, dashboard, language, tr } = useProductView();
  const { kind, resource } = analytics;
  const data = resource.data;
  const ar = language === 'ar';
  const t = (en, arabic) => (ar ? arabic : en);
  const n = (value) =>
    value == null
      ? '—'
      : Number(value).toLocaleString(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 1 });
  const [aspect, setAspect] = useState('all');
  const [selectedBranches, setSelectedBranches] = useState([]);
  const report = dashboard.report;
  const branchRows = (data?.comparisons || []).filter(
    (row) => !selectedBranches.length || selectedBranches.includes(row.branchId),
  );
  const aspects = (data?.aspectScores || []).filter(
    (row) => aspect === 'all' || row.aspect === aspect,
  );
  const readiness = data?.capabilityStates || {};
  const pending = t(
    'Awaiting model analysis and enough observations.',
    'بانتظار تحليل النموذج وتوفر ملاحظات كافية.',
  );
  const readyStatus = (state) =>
    ({
      waiting_for_model: t('Waiting for model', 'بانتظار النموذج'),
      insufficient_evidence: t('Insufficient evidence', 'الأدلة غير كافية'),
      failed: t('Analysis failed', 'تعذر التحليل'),
      queued: t('Queued', 'في قائمة الانتظار'),
      running: t('Analyzing', 'جارٍ التحليل'),
    })[state] || pending;
  const metrics =
    kind === 'topics'
      ? [
          [t('Topics', 'الموضوعات'), data?.topics?.length],
          [t('Responses', 'الردود'), report.total],
          [
            t('Emerging themes', 'موضوعات حديثة'),
            data?.topics?.filter((row) => row.emerging).length,
          ],
          [t('Analyzed responses', 'الردود المحللة'), data?.analyzedResponses],
        ]
      : kind === 'aspects'
        ? [
            [t('Aspects', 'الجوانب'), data?.aspectScores?.length],
            [
              t('Mentions', 'الإشارات'),
              data?.aspectScores?.reduce((sum, row) => sum + row.mentions, 0),
            ],
            [t('Responses', 'الردود'), report.total],
            [t('Pending analysis', 'بانتظار التحليل'), data?.pendingResponses],
          ]
        : [
            [t('Positive', 'إيجابي'), report.analyzed ? n(report.positivePercent) + '%' : null],
            [
              t('Negative', 'سلبي'),
              report.analyzed ? n((100 * report.negative) / report.analyzed) + '%' : null,
            ],
            [
              t('Neutral', 'محايد'),
              report.analyzed ? n((100 * report.neutral) / report.analyzed) + '%' : null,
            ],
            [
              t('Mixed', 'مختلط'),
              report.analyzed ? n((100 * report.mixed) / report.analyzed) + '%' : null,
            ],
          ];
  return (
    <div
      className="figma-preview analytics-preview"
      data-analytics-kind={kind}
      data-account-backed="true"
    >
      <div className={kind === 'trends' ? 'an223' : 'an0'} data-name="Page content">
        <div className="an1" data-name="Page introduction">
          <div className="an2" data-name="Introduction">
            <h1 className="an3" data-workspace-heading="true">
              <HeadingBack />
              <span>{titles[kind]?.[ar ? 1 : 0]}</span>
            </h1>
            <p className="an4">
              {t(
                'Understand your customer feedback with traceable evidence.',
                'افهم آراء العملاء مع أدلة يمكن الرجوع إليها.',
              )}
            </p>
          </div>
          <button
            type="button"
            className="an5 ui-control ui-export"
            disabled={!data || resource.loading || Boolean(resource.error)}
            onClick={() => download(data, kind)}
          >
            <ControlIcon name="export" />
            <span className="an9">{tr('Export data')}</span>
          </button>
        </div>
        <AnalyticsTabs />
        <AnalyticsFilters />
        <div className="an10" role="status">
          <p className="an13">
            {resource.loading
              ? t('Loading saved feedback…', 'جارٍ تحميل الآراء المحفوظة…')
              : resource.error
                ? t(
                    'Could not load analytics. Your saved feedback has not changed.',
                    'تعذر تحميل التحليلات. لم تتغير الآراء المحفوظة.',
                  )
                : t('Saved customer feedback', 'آراء العملاء المحفوظة') +
                  ' · ' +
                  n(report.total) +
                  ' ' +
                  t('responses', 'ردود')}
          </p>
          {resource.error && (
            <button className="an5" onClick={resource.reload}>
              {t('Retry', 'إعادة المحاولة')}
            </button>
          )}
        </div>
        {data && !resource.error && (
          <>
            <div className="an16">
              {metrics.map(([label, value]) => (
                <section className="an17" key={label}>
                  <div className="an18">
                    <p className="an19">{label}</p>
                  </div>
                  <strong className="an21">{typeof value === 'string' ? value : n(value)}</strong>
                  <p className="an22">
                    {t('Selected branch and date range', 'حسب الفرع والفترة المحددين')}
                  </p>
                </section>
              ))}
            </div>
            {data.totalResponses === 0 && (
              <div className="analytics-empty">
                <h2>{t('No responses in this period', 'لا توجد ردود في هذه الفترة')}</h2>
                <p>
                  {t(
                    'Share a survey or choose another period.',
                    'شارك استبيانًا أو اختر فترة أخرى.',
                  )}
                </p>
                <a href="#/survey-all">{t('View surveys', 'عرض الاستبيانات')}</a>
              </div>
            )}
            {kind === 'sentiment' && (
              <>
                <Panel title={t('How customers feel', 'كيف يشعر العملاء')}>
                  <ScopeSentiment />
                </Panel>
                <Panel title={t('Sentiment over time', 'المشاعر عبر الزمن')}>
                  <ScopeTrend />
                </Panel>
              </>
            )}
            {kind === 'aspects' && (
              <Panel title={t('Aspect performance', 'أداء الجوانب')}>
                <ChoiceMenu
                  label={t('Aspect', 'الجانب')}
                  value={aspect}
                  options={[
                    { value: 'all', label: t('All aspects', 'كل الجوانب') },
                    ...(data.aspectScores || []).map((row) => ({
                      value: row.aspect,
                      label: row.aspect,
                    })),
                  ]}
                  onChange={setAspect}
                />
                {aspects.map((row) => (
                  <div className="analytics-branch-result" key={row.aspect}>
                    <strong>{row.aspect}</strong>
                    <span>
                      {n(row.score)} / {n(10)} · {n(row.mentions)} {t('mentions', 'إشارات')}
                    </span>
                    <div>
                      <i style={{ width: row.score * 10 + '%' }} />
                    </div>
                    {row.lowSample && (
                      <small>
                        {t('Small sample — interpret with care', 'عينة صغيرة — فسّر بحذر')}
                      </small>
                    )}
                    <a href={'#/feedbacks?aspect=' + encodeURIComponent(row.aspect)}>
                      {t('View related responses →', 'عرض الردود المرتبطة ←')}
                    </a>
                    <Evidence rows={row.evidence} t={t} />
                  </div>
                ))}
                {!aspects.length && <p>{pending}</p>}
              </Panel>
            )}
            {kind === 'topics' && (
              <Panel title={t('Recurring topics', 'الموضوعات المتكررة')}>
                {(data.topics || []).map((row) => (
                  <article className="analytics-branch-result" key={row.id}>
                    <strong>{row.summaryTitle || row.label || row.id}</strong>
                    <span>
                      {n(row.count)} {t('responses', 'ردود')}
                    </span>
                    {row.emerging && <small>{t('Emerging theme', 'موضوع حديث')}</small>}
                    <p>{row.summary || readyStatus(row.summaryStatus)}</p>
                    <Evidence
                      rows={row.summaryEvidence?.length ? row.summaryEvidence : row.evidence}
                      t={t}
                    />
                  </article>
                ))}
                {!data.topics?.length && <p>{readyStatus(readiness.clustering?.status)}</p>}
              </Panel>
            )}
            {kind === 'trends' && (
              <>
                <Panel title={t('Observed response trends', 'اتجاهات الردود المرصودة')}>
                  <ChoiceMenu
                    label={t('Aggregation', 'التجميع')}
                    value={analytics.filters.interval || 'day'}
                    options={[
                      ['day', t('Daily', 'يومي')],
                      ['week', t('Weekly', 'أسبوعي')],
                      ['month', t('Monthly', 'شهري')],
                    ].map(([value, label]) => ({ value, label }))}
                    onChange={(interval) => analytics.setFilters((old) => ({ ...old, interval }))}
                  />
                  <ScopeTrend />
                  {(data.alerts || []).map((row, index) => (
                    <p key={index}>
                      {row.aspect}: {n(row.change)} · {row.from} – {row.to}
                    </p>
                  ))}
                </Panel>
                <Panel title={t('Forecast', 'التوقعات')}>
                  {(data.forecasts || []).map((forecast, index) => (
                    <article key={index}>
                      <p>
                        {t('Sample count', 'حجم العينة')}: {n(forecast.sampleCount)}
                      </p>
                      <p>
                        {forecast.uncertainty ||
                          t(
                            'No uncertainty interval was supplied by the model.',
                            'لم يوفّر النموذج نطاقًا لعدم اليقين.',
                          )}
                      </p>
                      <div className="analytics-dimension-results">
                        <table>
                          <thead>
                            <tr>
                              {[
                                t('Date', 'التاريخ'),
                                t('Forecast', 'التوقع'),
                                t('Lower bound', 'الحد الأدنى'),
                                t('Upper bound', 'الحد الأعلى'),
                              ].map((label) => (
                                <th key={label}>{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {forecast.points?.map((point) => (
                              <tr key={point.date}>
                                <td>{point.date}</td>
                                <td>{n(point.value)}</td>
                                <td>{n(point.lower)}</td>
                                <td>{n(point.upper)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <small>{forecast.modelVersion}</small>
                    </article>
                  ))}
                  {!data.forecasts?.length && <p>{readyStatus(readiness.forecasting?.status)}</p>}
                </Panel>
              </>
            )}
            {kind === 'comparison' && (
              <Panel title={t('Branch Comparison', 'مقارنة الفروع')}>
                <div className="comparison-branch-chips">
                  {(data.comparisons || []).map((row) => (
                    <button
                      key={row.branchId}
                      aria-pressed={
                        !selectedBranches.length || selectedBranches.includes(row.branchId)
                      }
                      onClick={() =>
                        setSelectedBranches((old) =>
                          old.includes(row.branchId)
                            ? old.filter((id) => id !== row.branchId)
                            : [...old, row.branchId],
                        )
                      }
                    >
                      {row.branchName}
                    </button>
                  ))}
                </div>
                <div className="analytics-dimension-results">
                  <table>
                    <thead>
                      <tr>
                        {[
                          t('Branch', 'الفرع'),
                          t('Responses', 'الردود'),
                          t('Positive', 'إيجابي'),
                          t('Negative', 'سلبي'),
                          t('Neutral', 'محايد'),
                          t('Mixed', 'مختلط'),
                        ].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {branchRows.map((row) => (
                        <tr key={row.branchId}>
                          <td>{row.branchName}</td>
                          <td>{n(row.totalResponses)}</td>
                          {['positive', 'negative', 'neutral', 'mixed'].map((tone) => (
                            <td key={tone}>{n(row.sentimentDistribution?.[tone] || 0)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!branchRows.length && (
                  <p>{t('No branch observations yet.', 'لا توجد ملاحظات للفروع بعد.')}</p>
                )}
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
