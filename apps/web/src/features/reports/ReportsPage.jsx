import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { canManage, requestFilters } from '../product/product-state.js';
import { DataTable, EmptyState, ErrorNotice, ResourceState, Status } from '../product/ui.jsx';
import Filters from '../product/Filters.jsx';
import { EvidenceLinks } from '../analytics/AnalyticsPage.jsx';
import AiTaskState from '../product/AiTaskState.jsx';
export default function ReportsPage({ language, workspace }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    resource = useResource('/reports', { refreshInterval: 30000 }),
    mutation = useMutation(),
    [filters, setFilters] = useState({}),
    [selection, setSelected] = useState(null),
    [reportLocale, setReportLocale] = useState(language);
  const saved = useResource(selection?.id ? '/reports/' + selection.id : null, {
      refreshInterval: 30000,
    }),
    selected = saved.data?.report || selection;
  async function open(id) {
    const result = await mutation.run((signal) => productApi.get('/reports/' + id, signal));
    if (result) setSelected(result.report);
  }
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('Reports', 'التقارير')}</h1>
          <p>
            {t(
              'Saved evidence snapshots and bilingual reports.',
              'لقطات أدلة محفوظة وتقارير باللغتين.',
            )}
          </p>
        </div>
      </div>
      <Filters {...{ filters, setFilters, workspace, language }} />
      <div className="product-card product-inline">
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
      <ErrorNotice error={mutation.error} language={language} />
      <ResourceState resource={resource} language={language} />
      <section className="product-card">
        <DataTable
          headings={[
            t('Report', 'التقرير'),
            t('Status', 'الحالة'),
            t('Created', 'تاريخ الإنشاء'),
            t('Actions', 'الإجراءات'),
          ]}
        >
          {(resource.data?.reports || []).map((report) => (
            <tr key={report.id}>
              <td>{report.title || t('Feedback report', 'تقرير الآراء')}</td>
              <td>
                <Status value={report.status} language={language} />
              </td>
              <td>{new Date(report.createdAt).toLocaleDateString(language)}</td>
              <td>
                <button disabled={mutation.busy} onClick={() => open(report.id)}>
                  {t('Open report', 'فتح التقرير')}
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
        {resource.data && !resource.data.reports?.length && (
          <EmptyState title={t('No reports yet', 'لا توجد تقارير بعد')} />
        )}
      </section>
      {selected && (
        <section className="product-card">
          <div className="product-heading">
            <h2>
              {selected.content?.title || selected.title || t('Feedback report', 'تقرير الآراء')}
            </h2>
            <a href={'/api/v1/reports/' + selected.id + '/export'}>
              {t('Download PDF', 'تنزيل PDF')}
            </a>
          </div>
          <Status value={selected.status} language={language} />
          <ResourceState resource={saved} language={language} />
          {selected.content || selected.summary ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
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
    </>
  );
}
