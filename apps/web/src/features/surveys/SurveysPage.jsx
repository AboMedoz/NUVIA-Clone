import React, { useState } from 'react';
import { useResource } from '../product/useResource.js';
import { canManage } from '../product/product-state.js';
import { DataTable, EmptyState, ResourceState, Status } from '../product/ui.jsx';
import { asset } from '../../lib/assets.js';
import SurveySharing from './SurveySharing.jsx';
export default function SurveysPage({ language, workspace }) {
  const ar = language === 'ar',
    t = (en, arabic) => (ar ? arabic : en),
    resource = useResource('/surveys');
  const [status, setStatus] = useState('all'),
    [search, setSearch] = useState('');
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState(
    new URLSearchParams(location.hash.split('?')[1]).get('selected') || '',
  );
  const surveys = resource.data?.surveys || [],
    survey = surveys.find((s) => s.id === selected),
    editable = canManage(workspace);
  const visibleSurveys = surveys.filter(
    (s) =>
      (status === 'all' || s.status === status) &&
      (!search || s.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('Manage surveys', 'إدارة الاستبيانات')}</h1>
          <p>
            {t(
              'Collect customer feedback with a survey for every branch.',
              'اجمع آراء العملاء باستبيان لكل فرع.',
            )}
          </p>
        </div>
        {editable && (
          <a className="product-button primary" href="#/survey-builder">
            <img src={asset('dashboard/surveys/plus.svg')} alt="" />
            {t('Create survey', 'إنشاء استبيان')}
          </a>
        )}
      </div>
      <ResourceState resource={resource} language={language} />
      {resource.data && (
        <div className="product-grid survey-metrics">
          {[
            [t('Total surveys', 'إجمالي الاستبيانات'), surveys.length],
            [
              t('Live surveys', 'الاستبيانات المنشورة'),
              surveys.filter((s) => s.status === 'published').length,
            ],
            [t('Drafts', 'المسودات'), surveys.filter((s) => s.status === 'draft').length],
            [
              t('Closed surveys', 'الاستبيانات المغلقة'),
              surveys.filter((s) => s.status === 'closed').length,
            ],
          ].map(([label, value]) => (
            <section className="product-card product-metric" key={label}>
              <p>{label}</p>
              <strong>{value.toLocaleString(language)}</strong>
            </section>
          ))}
        </div>
      )}
      {!resource.loading && !resource.error && (
        <section className="product-card product-list-card survey-list-card">
          <div className="product-tabs">
            {[
              ['all', t('All surveys', 'كل الاستبيانات')],
              ['published', t('Live', 'منشور')],
              ['draft', t('Drafts', 'مسودات')],
              ['closed', t('Closed', 'مغلق')],
            ].map(([key, label]) => (
              <button aria-pressed={status === key} key={key} onClick={() => setStatus(key)}>
                {label}{' '}
                <small>
                  {key === 'all' ? surveys.length : surveys.filter((s) => s.status === key).length}
                </small>
              </button>
            ))}
          </div>
          <div className="product-list-toolbar">
            <input
              className="product-list-search"
              aria-label={t('Search surveys', 'البحث في الاستبيانات')}
              placeholder={t('Search surveys by name…', 'ابحث باسم الاستبيان…')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <small>{t('Last updated', 'آخر تحديث')}</small>
          </div>
          <DataTable
            headings={[
              t('Survey', 'الاستبيان'),
              t('Status', 'الحالة'),
              t('Branches', 'الفروع'),
              t('Updated', 'آخر تحديث'),
              t('Actions', 'الإجراءات'),
            ]}
          >
            {visibleSurveys.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong className="survey-name">
                    <img src={asset('dashboard/surveys/icon6.svg')} alt="" />
                    {s.title}
                  </strong>
                  <p>
                    {s.questions?.length || 0} {t('questions', 'أسئلة')}
                  </p>
                </td>
                <td>
                  <Status value={s.status} language={language} />
                </td>
                <td>
                  {[
                    ...new Set(
                      (s.links || [])
                        .filter(
                          (link) =>
                            link.enabled !== false && link.active !== false && !link.closedAt,
                        )
                        .map(
                          (link) => workspace?.branches?.find((b) => b.id === link.branchId)?.name,
                        )
                        .filter(Boolean),
                    ),
                  ].join(', ') || '—'}
                </td>
                <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString(language) : '—'}</td>
                <td>
                  <div className="product-actions">
                    <button
                      onClick={() => {
                        setSelected(s.id);
                        setNotice(null);
                      }}
                    >
                      {t('Share & manage', 'مشاركة وإدارة')}
                    </button>
                    <a href={'#/survey-builder?id=' + s.id}>
                      {editable ? t('Edit', 'تعديل') : t('View', 'عرض')}
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
          {!surveys.length && (
            <EmptyState title={t('Your first survey starts here', 'ابدأ بأول استبيان')}>
              <p>
                {t(
                  'Create a survey, choose your branches, and share its link with customers.',
                  'أنشئ استبيانًا واختر الفروع وشارك الرابط مع العملاء.',
                )}
              </p>
            </EmptyState>
          )}
          {!!surveys.length && !visibleSurveys.length && (
            <EmptyState
              title={t('No surveys match your filters', 'لا توجد استبيانات تطابق الفلاتر')}
            />
          )}
          {!!visibleSurveys.length && (
            <div className="product-list-toolbar">
              <small>
                {visibleSurveys.length.toLocaleString(language)}{' '}
                {t('surveys shown', 'استبيانات معروضة')}
              </small>
            </div>
          )}
        </section>
      )}
      {survey && (
        <SurveySharing
          survey={survey}
          workspace={workspace}
          language={language}
          onChange={() => resource.reload()}
          onNotice={(message) => setNotice({ workspaceId: workspace?.id, message })}
          onClose={() => {
            setSelected('');
            setNotice(null);
          }}
        />
      )}
      {notice?.workspaceId === workspace?.id && notice?.message && (
        <p role="status">{notice.message}</p>
      )}
    </>
  );
}
