import { PreviewFilter } from './PreviewControls.jsx';
import React, { useState } from 'react';
import { useAuth } from '../../../../app/providers/AuthProvider.jsx';
import { useResource, useMutation } from '../../../product/useResource.js';
import { productApi } from '../../../product/api.js';
import { canManage, requestFilters } from '../../../product/product-state.js';
import { useProductView } from '../ProductContext.jsx';
import { scopeFilters, taskMessage } from '../connected-data.js';
import ChoiceMenu from '../../components/ChoiceMenu.jsx';
import HeadingBack from '../HeadingBack.jsx';
import WorkspaceScopeControls from '../WorkspaceScopeControls.jsx';
import { asset } from '../../assets.js';

export function ReportEvidence({ items = [] }) {
  const { language } = useProductView();
  return items.map((item, index) => (
    <blockquote className="pv136" key={item.id || item.responseId || index}>
      <p dir="auto">{item.quote || item.text}</p>
      <a
        className="feedback-text-btn"
        href={'#/feedback-details?id=' + encodeURIComponent(item.responseId || item.id)}
      >
        {language === 'ar' ? 'عرض الرد الأصلي' : 'View original feedback'} ↗
      </a>
    </blockquote>
  ));
}

function ResourceNotice({ resource }) {
  const { language } = useProductView();
  if (!resource.loading && !resource.error) return null;
  return (
    <div className="pv77" role={resource.error ? 'alert' : 'status'}>
      <p>
        {resource.error
          ? language === 'ar'
            ? 'تعذر تحميل التقارير.'
            : 'Unable to load reports.'
          : language === 'ar'
            ? 'جارٍ التحميل…'
            : 'Loading…'}
      </p>
      {resource.error && (
        <button className="feedback-btn" onClick={resource.reload}>
          {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
        </button>
      )}
    </div>
  );
}

export default function ConnectedReports({ detail = false }) {
  const ui = useProductView(),
    { language, tr, dashboard } = ui,
    auth = useAuth(),
    ar = language === 'ar';
  const t = (en, arabic) => (ar ? arabic : en);
  const id = new URLSearchParams(location.hash.split('?')[1]).get('id');
  const resource = useResource(detail && id ? '/reports/' + encodeURIComponent(id) : '/reports', {
    refreshInterval: 30000,
  });
  const [generate, setGenerate] = useState(
    () => new URLSearchParams(location.hash.split('?')[1]).get('generate') === '1',
  );
  const [locale, setLocale] = useState(language),
    [libraryLocale, setLibraryLocale] = useState('all'),
    [order, setOrder] = useState('newest');
  const mutation = useMutation(),
    reports = resource.data?.reports || [],
    report = detail ? resource.data?.report : reports[0];
  const title = (item) =>
    item?.content?.title || t('Customer feedback report', 'تقرير آراء العملاء');
  const formatDate = (date) => (date ? new Date(date).toLocaleDateString(language) : '—');
  const exportReport = (reportId) =>
    window.location.assign('/api/v1/reports/' + encodeURIComponent(reportId) + '/export');
  const statusLabel = (status) =>
    ({
      succeeded: t('Ready', 'جاهز'),
      queued: t('Queued', 'في الانتظار'),
      running: t('Generating', 'جارٍ الإنشاء'),
      waiting_for_model: t('Waiting', 'بانتظار النموذج'),
      failed: t('Failed', 'فشل'),
      insufficient_evidence: t('No evidence', 'لا توجد أدلة'),
    })[status] || status;
  const shown = reports
    .filter((item) => libraryLocale === 'all' || item.locale === libraryLocale)
    .toSorted(
      (a, b) => (order === 'newest' ? -1 : 1) * (new Date(a.createdAt) - new Date(b.createdAt)),
    );
  async function create() {
    const result = await mutation.run((signal) =>
      productApi.send(
        '/reports',
        {
          locale,
          filters: requestFilters(
            scopeFilters(dashboard, auth.workspace),
            auth.workspace?.reportingTimezone,
          ),
        },
        'POST',
        signal,
      ),
    );
    if (result) {
      setGenerate(false);
      location.hash = '/report-details?id=' + encodeURIComponent(result.report.id);
      resource.reload();
    }
  }
  const generation = generate && (
    <section className="pv77" aria-label={t('Generate report', 'إنشاء تقرير')}>
      <h2>{t('Generate new report', 'إنشاء تقرير جديد')}</h2>
      <div className="ds-overview preview-shared-scope">
        <WorkspaceScopeControls />
      </div>
      <ChoiceMenu
        label={t('Report language', 'لغة التقرير')}
        value={locale}
        onChange={setLocale}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ar', label: 'العربية' },
        ]}
      />
      <p>
        {t(
          'A saved snapshot keeps the evidence used to generate this report.',
          'تحتفظ لقطة محفوظة بالأدلة المستخدمة لإنشاء التقرير.',
        )}
      </p>
      {mutation.error && (
        <p role="alert">
          {t('Unable to create report. Try again.', 'تعذر إنشاء التقرير. أعد المحاولة.')}
        </p>
      )}
      <div className="pv1">
        <button
          className="feedback-btn"
          onClick={() => setGenerate(false)}
          disabled={mutation.busy}
        >
          {tr('Cancel')}
        </button>
        <button
          className="feedback-btn feedback-primary"
          disabled={mutation.busy || !canManage(auth.workspace)}
          onClick={create}
        >
          {mutation.busy ? t('Creating…', 'جارٍ الإنشاء…') : t('Create report', 'إنشاء تقرير')}
        </button>
      </div>
    </section>
  );
  if (detail)
    return (
      <div className="figma-preview report-details">
        <div className="pv0" data-name="Page content">
          <nav className="pv1" data-name="Report navigation">
            <a className="feedback-back" href="#/reports">
              ← {tr('Back to reports')}
            </a>
            <button
              className="feedback-btn feedback-primary ui-export"
              disabled={!report}
              onClick={() => exportReport(id)}
            >
              {t('Export PDF', 'تصدير PDF')}
            </button>
          </nav>
          <ResourceNotice resource={resource} />
          {report && (
            <>
              <div className="pv98" data-name="Report introduction">
                <div className="pv99">
                  <span className="feedback-badge info">{taskMessage(report.status, ar)}</span>
                  <span>{report.locale === 'ar' ? 'العربية' : 'English'}</span>
                </div>
                <h1 className="pv101">{title(report)}</h1>
                <p className="pv103">
                  {formatDate(report.createdAt)} · {auth.workspace?.businessName}
                </p>
              </div>
              <section className="pv77" data-name="Report coverage">
                <strong>{report.metrics?.totalResponses?.toLocaleString(language) || 0}</strong>
                <p>{t('responses in this snapshot', 'ردود في هذه اللقطة')}</p>
              </section>
              <section className="pv77">
                <h2>{t('Executive Summary', 'الملخص التنفيذي')}</h2>
                <p className="pv108" dir="auto">
                  {report.content?.summary || taskMessage(report.status, ar)}
                </p>
              </section>
              {(report.content?.sections || []).map((section, index) => (
                <section className="pv77" key={index}>
                  <h2>{section.title}</h2>
                  <p dir="auto">{section.body || section.text}</p>
                  <ReportEvidence
                    items={
                      section.evidence ||
                      (report.content.evidence || []).filter((item) =>
                        (section.evidenceIds || []).includes(item.id),
                      )
                    }
                  />
                </section>
              ))}
              <section className="pv77">
                <h2>{t('Source evidence', 'الأدلة الأصلية')}</h2>
                <ReportEvidence items={report.evidence || []} />
                {!report.evidence?.length && (
                  <p>
                    {t('No source evidence in this snapshot.', 'لا توجد أدلة أصلية في هذه اللقطة.')}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    );
  return (
    <div className="figma-preview reports-library">
      <div className="pv0" data-name="Page content">
        <div className="pv1" data-name="Page introduction">
          <div className="pv2" data-name="Introduction">
            <p role="heading" aria-level={1} className="pv3 workspace-heading">
              <HeadingBack />
              <span>{tr('AI Reports')}</span>
            </p>
            <p className="pv4">
              {tr('Turn customer feedback into a clear, evidence-backed plan for your business.')}
            </p>
          </div>
          {canManage(auth.workspace) && (
            <button type="button" className="pv63" onClick={() => setGenerate((open) => !open)}>
              <div className="pv6">
                <img className="pv7" src={asset('preview/reports-imgSparkles.svg')} alt="" />
              </div>
              <p className="pv64">{t('Generate new report', 'إنشاء تقرير جديد')}</p>
            </button>
          )}
        </div>
        <div className="pv65" data-name="Reporting context">
          <div className="pv66" data-name="Reporting promise">
            <p className="pv67">{t('YOUR LATEST SNAPSHOT', 'أحدث لقطة لبياناتك')}</p>
            <p className="pv68">{tr('One view of what matters. Evidence behind every action.')}</p>
            <p className="pv39">
              {report
                ? title(report)
                : t(
                    'Create your first report from saved customer feedback.',
                    'أنشئ تقريرك الأول من آراء العملاء المحفوظة.',
                  )}
            </p>
          </div>

          <div className="pv69" data-name="Review coverage">
            <p className="pv70">{report?.metrics?.totalResponses?.toLocaleString(language) || 0}</p>
            <p className="pv71">{t('responses in snapshot', 'ردود في اللقطة')}</p>
          </div>
          <div className="pv72" data-name="Divider" />
          <div className="pv73" data-name="Branch coverage">
            <p className="pv70">
              {report?.metrics?.comparisons?.length?.toLocaleString(language) || 0}
            </p>
            <p className="pv71">{t('branches', 'فروع')}</p>
          </div>
        </div>
        {generation}
        <ResourceNotice resource={resource} />
        <div className="pv1" data-name="Report filters" data-node-id="299:891">
          <div className="pv9" data-name="Filter controls" data-node-id="299:892">
            <PreviewFilter
              kind="language"
              currentValue={{ en: 'English', ar: 'Arabic', all: 'all' }[libraryLocale]}
              onChange={(value) =>
                setLibraryLocale({ English: 'en', Arabic: 'ar' }[value] || 'all')
              }
            />
            <p className="pv39">
              {shown.length.toLocaleString(language)} {t('reports', 'تقارير')}
            </p>
          </div>
          <PreviewFilter kind="sort" currentValue={order} onChange={setOrder} />
        </div>
        <div className="pv75" data-name="Report library">
          {shown.map((item) => (
            <div className="pv76" key={item.id} data-name="Report row">
              <article
                className="pv77"
                data-name="Previous report"
                data-report-card="true"
                data-report-id={item.id}
              >
                <div className="pv78" data-name="Report identity">
                  <div className="pv79" data-name="Report symbol">
                    <div className="pv80">
                      <img
                        className="pv7"
                        src={asset('preview/reports-imgFileChartColumn.svg')}
                        alt=""
                      />
                    </div>
                  </div>
                  <div className="pv81" data-name="Report title">
                    <p className="pv82" role="heading" aria-level={2}>
                      {title(item)}
                    </p>
                    <p className="pv53">{formatDate(item.createdAt)}</p>
                  </div>
                  <div className="pv83" data-name="Status">
                    <p className="pv84">{statusLabel(item.status)}</p>
                  </div>
                </div>
                <div className="pv85" data-name="Report overview">
                  <p className="pv86" dir="auto">
                    {item.content?.summary || taskMessage(item.status, ar)}
                  </p>
                </div>
                <div className="pv87" data-name="Report metadata">
                  <div className="pv88" data-name="Period covered">
                    <p className="pv89">{t('PERIOD COVERED', 'الفترة المشمولة')}</p>
                    <p className="pv90">
                      {formatDate(item.filters?.from)} – {formatDate(item.filters?.to)}
                    </p>
                  </div>
                  <div className="pv91" data-name="Report language">
                    <p className="pv89">{t('LANGUAGE', 'اللغة')}</p>
                    <p className="pv90">{item.locale === 'ar' ? 'العربية' : 'English'}</p>
                  </div>
                  <div className="pv92" data-name="Report scope">
                    <p className="pv89">{t('RESPONSES', 'الردود')}</p>
                    <p className="pv90">
                      {item.metrics?.totalResponses?.toLocaleString(language) || 0}
                    </p>
                  </div>
                </div>
                <div className="pv27" data-name="Divider" />
                <div className="pv1" data-name="Report actions">
                  <a className="pv93" href={'#/report-details?id=' + encodeURIComponent(item.id)}>
                    <p className="pv64">{tr('View Report')} ↗</p>
                  </a>
                  <button
                    type="button"
                    className="pv94 ui-control ui-export"
                    onClick={() => exportReport(item.id)}
                  >
                    <p className="pv8">{t('Export PDF', 'تصدير PDF')}</p>
                  </button>
                </div>
              </article>
            </div>
          ))}
          {!resource.loading && !resource.error && !shown.length && (
            <section className="pv77" data-name="Previous report">
              <h2>{t('No reports yet', 'لا توجد تقارير بعد')}</h2>
              <p>
                {t(
                  'Create a report from the feedback you collect.',
                  'أنشئ تقريرًا من الآراء التي تجمعها.',
                )}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
