import React from 'react';
import { useProductView } from './ProductContext.jsx';
import { overviewDateLabel } from './OverviewControls.jsx';
import AiTaskState from '../../product/AiTaskState.jsx';
import { EvidenceLinks } from '../../analytics/AnalyticsPage.jsx';
export default function ScopedInsights({ kind, children }) {
  const { dashboard, language, tr, formatNumber } = useProductView();
  if (dashboard?.connected) return <ConnectedInsights {...{ dashboard, language, kind }} />;
  if (!dashboard?.isFiltered) return children;
  const ar = language === 'ar',
    r = dashboard.report,
    f = dashboard.filters,
    n = (value) =>
      new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 }).format(value),
    pct = (value) => n(Math.round(value)) + (ar ? '٪' : '%');
  const titles = {
    daily: tr('AI Daily Insight'),
    aspects: tr('Aspect scores'),
    insights: tr('Key insights'),
    recommendations: tr('What to do next'),
    branches: ar ? 'أداء الفرع' : 'Branch performance',
  };
  const descriptions = {
    daily: ar
      ? 'ملخص الذكاء الاصطناعي غير متاح لهذا الاختيار في المعاينة. يمكنك مراجعة آراء العملاء المتاحة.'
      : 'An AI summary is not available for this selection. You can review the available customer feedback.',
    aspects: ar
      ? 'لا تتوفر تقييمات تفصيلية للجوانب ضمن هذه الفترة في بيانات المعاينة.'
      : 'Detailed aspect scores are unavailable for this period in the preview data.',
    insights: ar
      ? 'لا تتوفر رؤى تفصيلية لهذا الفرع والفترة في بيانات المعاينة.'
      : 'Detailed insights are unavailable for this branch and period in the preview data.',
    recommendations: ar
      ? 'لا توجد توصيات مرتبطة بهذا الاختيار في بيانات المعاينة.'
      : 'No recommendations are available for this selection in the preview data.',
  };
  const empty = !r.total;
  return (
    <>
      <div className="scope-heading">
        <h2>{titles[kind]}</h2>
        <p>
          {tr(f.branch === 'all' ? 'All 3 branches' : f.branch)} · {overviewDateLabel(f, language)}
        </p>
      </div>
      {kind === 'branches' && !empty ? (
        <div className="scoped-branch-rows">
          {r.branches.map((branch) => (
            <div key={branch.branch}>
              <div>
                <strong>{tr(branch.branch)}</strong>
                <b>{pct(branch.positivePercent)}</b>
              </div>
              <p>
                {n(branch.total)} {tr('responses')} · {tr('Positive sentiment')}
              </p>
              <div className="scoped-branch-track">
                <span style={{ width: branch.positivePercent + '%' }} />
              </div>
              <small>
                {tr('Customer satisfaction')}:{' '}
                {branch.rating === null
                  ? '—'
                  : formatNumber(branch.rating.toFixed(1)) + ' / ' + formatNumber(5)}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <div className="scoped-insight-empty">
          <span className="scoped-empty-mark" aria-hidden="true">
            —
          </span>
          <strong>
            {empty
              ? ar
                ? 'لا توجد ردود في هذه الفترة'
                : 'No responses in this period'
              : ar
                ? 'لا تتوفر بيانات تفصيلية'
                : 'Detailed data unavailable'}
          </strong>
          <p>
            {empty
              ? ar
                ? 'اختر فرعًا أو فترة أخرى لعرض البيانات.'
                : 'Choose another branch or period to see available data.'
              : descriptions[kind]}
          </p>
        </div>
      )}
      <p className="scoped-data-note">
        {ar
          ? 'بيانات معاينة تجريبية للفرع والفترة المحددين'
          : 'Preview data for the selected branch and period'}
      </p>
    </>
  );
}

function ConnectedInsights({ dashboard, language, kind }) {
  const ar = language === 'ar';
  const t = (en, arabic) => (ar ? arabic : en);
  const n = (value) =>
    Number(value).toLocaleString(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 1 });
  const data = dashboard.report.raw;
  const titles = {
    daily: t('AI Daily Insight', 'رؤية الذكاء الاصطناعي اليومية'),
    aspects: t('Aspect scores', 'تقييم الجوانب'),
    insights: t('Key insights', 'أهم الرؤى'),
    recommendations: t('What to do next', 'خطوتك التالية'),
    branches: t('Branch performance', 'أداء الفروع'),
  };
  const aspects = data?.aspectScores || [];
  const alerts = data?.alerts || [];
  const insight = dashboard.insight;
  const report = insight?.report;
  const sections = report?.content?.sections || [];
  return (
    <>
      <div className="scope-heading">
        <h2>{titles[kind]}</h2>
        <p>{overviewDateLabel(dashboard.filters, language)}</p>
      </div>
      {dashboard.resource.loading ? (
        <p role="status">{t('Loading saved feedback…', 'جارٍ تحميل الآراء المحفوظة…')}</p>
      ) : dashboard.resource.error ? (
        <p role="alert">{t('Could not load this data.', 'تعذر تحميل هذه البيانات.')}</p>
      ) : ['daily', 'recommendations'].includes(kind) && insight ? (
        <div className="scoped-branch-rows" onClick={(event) => event.stopPropagation()}>
          {insight.loading ? (
            <p role="status">{t('Loading insights…', 'جارٍ تحميل الرؤى…')}</p>
          ) : insight.error ? (
            <p role="alert">
              {t('Could not load insights. Please retry.', 'تعذر تحميل الرؤى. حاول مرة أخرى.')}{' '}
              <button onClick={insight.reload}>{t('Retry', 'إعادة المحاولة')}</button>
            </p>
          ) : report?.status === 'succeeded' && report.content ? (
            <>
              {kind === 'daily' ? (
                <p>{report.content.summary}</p>
              ) : (
                sections.map((section, index) => (
                  <div key={index}>
                    <strong>{section.title}</strong>
                    <p>{section.text}</p>
                    <EvidenceLinks
                      evidence={(report.content.evidence || []).filter((item) =>
                        section.evidenceIds?.includes(item.id),
                      )}
                      language={language}
                    />
                  </div>
                ))
              )}
              <a href={'#/report-details?id=' + encodeURIComponent(report.id)}>
                {t('View saved report and evidence', 'عرض التقرير المحفوظ والأدلة')}
              </a>
              {report.createdAt && (
                <small>
                  {t('Report saved', 'حُفظ التقرير')}:{' '}
                  {new Date(report.createdAt).toLocaleDateString(language)}
                </small>
              )}
            </>
          ) : report ? (
            <AiTaskState status={report.status} language={language} />
          ) : (
            <p>
              {data?.totalResponses
                ? t(
                    'Generate insights from the feedback in this branch and period.',
                    'أنشئ رؤى من آراء هذا الفرع والفترة.',
                  )
                : t('No responses in this period', 'لا توجد ردود في هذه الفترة')}
            </p>
          )}
          {insight.editable &&
            data?.totalResponses > 0 &&
            !['queued', 'running', 'waiting_for_model'].includes(report?.status) && (
              <button
                type="button"
                className="button"
                disabled={insight.busy}
                onClick={insight.generate}
              >
                {insight.busy
                  ? t('Generating…', 'جارٍ الإنشاء…')
                  : t('Generate insights', 'إنشاء الرؤى')}
              </button>
            )}
          {kind === 'recommendations' &&
            data?.atRiskAspects?.map((aspect, index) => (
              <div key={index}>
                <strong>
                  {t('Review low-scoring feedback', 'راجع الآراء منخفضة التقييم')}: {aspect.aspect}
                </strong>
                <a href={'#/feedbacks?aspect=' + encodeURIComponent(aspect.aspect)}>
                  {t('View feedback', 'عرض الآراء')}
                </a>
              </div>
            ))}
          {kind === 'daily' &&
            alerts.map((alert, index) => (
              <div key={index}>
                <strong>{alert.aspect}</strong>
                <p>
                  {t('Observed score change', 'التغير المرصود في التقييم')}: {n(alert.change)} ·{' '}
                  {alert.from} – {alert.to}
                </p>
                <a href={'#/feedbacks?aspect=' + encodeURIComponent(alert.aspect)}>
                  {t('Review feedback', 'مراجعة الآراء')}
                </a>
              </div>
            ))}
        </div>
      ) : kind === 'aspects' && aspects.length ? (
        <div className="scoped-branch-rows">
          {aspects.map((row) => (
            <div key={row.aspect}>
              <div>
                <strong>{row.aspect}</strong>
                <b>
                  {n(row.score)} / {n(10)}
                </b>
              </div>
              <p>
                {n(row.mentions)} {t('mentions', 'إشارات')}
                {row.lowSample ? ' · ' + t('Small sample', 'عينة صغيرة') : ''}
              </p>
              <div className="scoped-branch-track">
                <span style={{ width: row.score * 10 + '%' }} />
              </div>
              <a href={'#/feedbacks?aspect=' + encodeURIComponent(row.aspect)}>
                {t('View related feedback', 'عرض الآراء المرتبطة')}
              </a>
            </div>
          ))}
        </div>
      ) : kind === 'branches' && data?.comparisons?.length ? (
        <div className="scoped-branch-rows">
          {data.comparisons.map((row) => (
            <div key={row.branchId}>
              <strong>{row.branchName}</strong>
              <p>
                {n(row.totalResponses)} {t('responses', 'ردود')}
              </p>
            </div>
          ))}
        </div>
      ) : ['daily', 'insights'].includes(kind) && alerts.length ? (
        <div className="scoped-branch-rows">
          {alerts.map((alert, index) => (
            <div key={index}>
              <strong>{alert.aspect}</strong>
              <p>
                {t('Observed score change', 'التغير المرصود في التقييم')}: {n(alert.change)} ·{' '}
                {alert.from} – {alert.to}
              </p>
              <a href={'#/feedbacks?aspect=' + encodeURIComponent(alert.aspect)}>
                {t('Review feedback', 'مراجعة الآراء')}
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="scoped-insight-empty">
          <span className="scoped-empty-mark" aria-hidden="true">
            —
          </span>
          <strong>
            {!data?.totalResponses
              ? t('No responses in this period', 'لا توجد ردود في هذه الفترة')
              : kind === 'aspects'
                ? t('Awaiting aspect analysis', 'بانتظار تحليل الجوانب')
                : kind === 'recommendations'
                  ? t('Generate an evidence-backed report', 'أنشئ تقريرًا مدعومًا بالأدلة')
                  : t('Explore the evidence behind your results', 'استكشف الأدلة وراء نتائجك')}
          </strong>
          <p>
            {t(
              'Findings and recommendations use saved feedback and validated model results.',
              'تعتمد النتائج والتوصيات على الآراء المحفوظة ونتائج النماذج المتحققة.',
            )}
          </p>
          <a href={kind === 'recommendations' ? '#/reports?generate=1' : '#/feedbacks'}>
            {kind === 'recommendations'
              ? t('Generate report', 'إنشاء تقرير')
              : t('View feedback', 'عرض الآراء')}
          </a>
        </div>
      )}
      <p className="scoped-data-note">
        {t(
          'Saved feedback for the selected branch and period',
          'الآراء المحفوظة للفرع والفترة المحددين',
        )}
      </p>
    </>
  );
}
