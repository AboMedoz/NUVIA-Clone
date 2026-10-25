import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { canManage, publicLink } from '../product/product-state.js';
import { DataTable, EmptyState, ErrorNotice, ResourceState, Status } from '../product/ui.jsx';
import { useProductView } from '../../app/providers/ProductProvider.jsx';
function ShareLink({ link, language, branchName }) {
  const [qr, setQr] = useState(''),
    [copied, setCopied] = useState(false);
  const url = link.url || publicLink(link.token);
  useEffect(() => {
    let current = true;
    QRCode.toDataURL(url, { width: 600, margin: 4, errorCorrectionLevel: 'M' }).then((value) => {
      if (current) setQr(value);
    });
    return () => {
      current = false;
    };
  }, [url]);
  return (
    <div className="product-share product-card">
      <strong>{link.branchName || link.branch?.name || branchName}</strong>
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      <div className="product-actions">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {language === 'ar'
            ? copied
              ? 'تم النسخ'
              : 'نسخ الرابط'
            : copied
              ? 'Copied'
              : 'Copy link'}
        </button>
        {qr && (
          <a href={qr} download="nuvia-survey-qr.png">
            {language === 'ar' ? 'تنزيل QR بصيغة PNG' : 'Download QR PNG'}
          </a>
        )}
      </div>
      {qr && (
        <img
          className="product-qr"
          src={qr}
          alt={language === 'ar' ? 'رمز QR لرابط الاستبيان' : 'Survey link QR code'}
        />
      )}
    </div>
  );
}
export default function SurveysPage({ language, workspace }) {
  const ar = language === 'ar',
    t = (en, arabic) => (ar ? arabic : en),
    resource = useResource('/surveys'),
    mutation = useMutation();
  const ui = useProductView(),
    [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split('?')[1]).get('selected') || '',
    ),
    [branchIds, setBranchIds] = useState([]),
    [notice, setNotice] = useState('');
  const surveys = resource.data?.surveys || [],
    survey = surveys.find((s) => s.id === selected),
    editable = canManage(workspace);
  const visibleSurveys = surveys.filter(
    (s) =>
      (status === 'all' || s.status === status) &&
      (!ui?.query || s.title.toLocaleLowerCase().includes(ui.query.toLocaleLowerCase())),
  );
  async function publish() {
    const result = await mutation.run((signal) =>
      productApi.send('/surveys/' + survey.id + '/publish', { branchIds }, 'POST', signal),
    );
    if (result) {
      setNotice(
        t(
          'Survey published. Share a branch link below.',
          'تم نشر الاستبيان. شارك رابط الفرع أدناه.',
        ),
      );
      resource.reload();
    }
  }
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
        <section className="product-card">
          <div className="product-tabs">
            {[
              ['all', t('All surveys', 'كل الاستبيانات')],
              ['published', t('Live', 'منشور')],
              ['draft', t('Drafts', 'مسودات')],
              ['closed', t('Closed', 'مغلق')],
            ].map(([key, label]) => (
              <button aria-pressed={status === key} key={key} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>
          <DataTable
            headings={[
              t('Survey', 'الاستبيان'),
              t('Status', 'الحالة'),
              t('Updated', 'آخر تحديث'),
              t('Actions', 'الإجراءات'),
            ]}
          >
            {visibleSurveys.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.title}</strong>
                  <p>
                    {s.questions?.length || 0} {t('questions', 'أسئلة')}
                  </p>
                </td>
                <td>
                  <Status value={s.status} language={language} />
                </td>
                <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString(language) : '—'}</td>
                <td>
                  <div className="product-actions">
                    <button
                      onClick={() => {
                        setSelected(s.id);
                        setBranchIds([]);
                        setNotice('');
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
        </section>
      )}
      {survey && (
        <section className="product-card">
          <div className="product-heading">
            <h2>{survey.title}</h2>
            <button onClick={() => setSelected('')}>{t('Close panel', 'إغلاق اللوحة')}</button>
          </div>
          <p>
            {t(
              'Publish the saved draft for the selected branches. Each link identifies its branch automatically.',
              'انشر المسودة المحفوظة للفروع المحددة. يحدد كل رابط فرعه تلقائيًا.',
            )}
          </p>
          {editable && (
            <>
              <div className="product-actions">
                {(workspace?.branches || [])
                  .filter((b) => !b.archivedAt)
                  .map((branch) => (
                    <label className="product-check" key={branch.id}>
                      <input
                        type="checkbox"
                        checked={branchIds.includes(branch.id)}
                        onChange={(e) =>
                          setBranchIds((old) =>
                            e.target.checked
                              ? [...old, branch.id]
                              : old.filter((id) => id !== branch.id),
                          )
                        }
                      />
                      {branch.name}
                    </label>
                  ))}
              </div>
              <div className="product-actions" style={{ marginTop: 18 }}>
                <button
                  className="primary"
                  disabled={mutation.busy || !branchIds.length}
                  onClick={publish}
                >
                  {t('Publish survey', 'نشر الاستبيان')}
                </button>
                {survey.status === 'published' && (
                  <button
                    disabled={mutation.busy}
                    onClick={async () => {
                      const result = await mutation.run((signal) =>
                        productApi.send('/surveys/' + survey.id + '/close', {}, 'POST', signal),
                      );
                      if (result) {
                        setNotice(
                          t(
                            'Collection closed. Existing responses are preserved.',
                            'تم إغلاق جمع الردود مع الاحتفاظ بالردود السابقة.',
                          ),
                        );
                        resource.reload();
                      }
                    }}
                  >
                    {t('Close collection', 'إغلاق جمع الردود')}
                  </button>
                )}
              </div>
            </>
          )}
          <ErrorNotice error={mutation.error} language={language} />
          {notice && <p role="status">{notice}</p>}
          <div style={{ marginTop: 20 }}>
            {(survey.links || [])
              .filter((link) => link.enabled !== false && link.active !== false && !link.closedAt)
              .map((link) => (
                <ShareLink
                  key={link.id || link.token}
                  link={link}
                  language={language}
                  branchName={workspace?.branches?.find((b) => b.id === link.branchId)?.name}
                />
              ))}
          </div>
        </section>
      )}
    </>
  );
}
