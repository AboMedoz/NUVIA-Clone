import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { productApi } from '../product/api.js';
import { useMutation } from '../product/useResource.js';
import { canManage, publicLink } from '../product/product-state.js';
import { ErrorNotice, Status } from '../product/ui.jsx';
function ShareLink({ link, links, language, workspace, onSelect }) {
  const t = (en, ar) => (language === 'ar' ? ar : en);
  const [qr, setQr] = useState(''),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false),
    [qrError, setQrError] = useState(false);
  const url = link.url || publicLink(link.token);
  const branchName = (item) =>
    item.branchName ||
    item.branch?.name ||
    workspace?.branches?.find((b) => b.id === item.branchId)?.name ||
    '';
  useEffect(() => {
    let current = true;
    setQr('');
    setQrError(false);
    setCopied(false);
    setCopyError(false);
    QRCode.toDataURL(url, { width: 600, margin: 4, errorCorrectionLevel: 'M' }).then(
      (value) => {
        if (current) setQr(value);
      },
      () => {
        if (current) setQrError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [url]);
  return (
    <div className="survey-sharing-layout">
      <section className="product-card sharing-qr-card">
        <h3>{t('Let customers scan & share', 'دع العملاء يمسحون الرمز ويشاركون رأيهم')}</h3>
        <p>
          {t(
            'Place this branch QR code on tables, receipts or at checkout.',
            'ضع رمز هذا الفرع على الطاولات أو الإيصالات أو عند الدفع.',
          )}
        </p>
        <div className="sharing-qr-poster">
          <strong>{workspace?.businessName}</strong>
          <p>{branchName(link)}</p>
          {qr ? (
            <img
              className="product-qr"
              src={qr}
              alt={t('Survey link QR code', 'رمز QR لرابط الاستبيان')}
            />
          ) : (
            <p role={qrError ? 'alert' : 'status'}>
              {qrError
                ? t(
                    'QR generation failed. You can still use the link.',
                    'تعذر إنشاء الرمز. ما زال بإمكانك استخدام الرابط.',
                  )
                : t('Preparing QR code…', 'جارٍ تجهيز رمز QR…')}
            </p>
          )}
          <p>{t('Scan to share your feedback', 'امسح الرمز لمشاركة رأيك')}</p>
        </div>
        {qr && (
          <a className="product-button primary" href={qr} download="nuvia-survey-qr.png">
            {t('Download QR PNG', 'تنزيل QR بصيغة PNG')}
          </a>
        )}
      </section>
      <div className="sharing-link-column">
        <section className="product-card">
          <h3>
            {t('One branch link. More customer voices.', 'رابط لكل فرع. آراء أكثر من العملاء.')}
          </h3>
          <p>
            {t(
              'Share the selected branch link with your customers.',
              'شارك رابط الفرع المحدد مع عملائك.',
            )}
          </p>
          <strong>{branchName(link)}</strong>
          <a className="sharing-selected-link" href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
          <div className="product-actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setCopyError(false);
                } catch {
                  setCopyError(true);
                }
              }}
            >
              {copied ? t('Copied', 'تم النسخ') : t('Copy link', 'نسخ الرابط')}
            </button>
            <a href={url} target="_blank" rel="noreferrer">
              {t('Open survey', 'فتح الاستبيان')}
            </a>
          </div>
          {copyError && (
            <p role="alert">
              {t(
                'Copy was blocked. Select and copy the link above.',
                'تعذر النسخ. حدد الرابط أعلاه وانسخه يدويًا.',
              )}
            </p>
          )}
        </section>
        <section className="product-card">
          <h3>{t('Know which branch the feedback is for', 'اعرف الفرع المرتبط بكل رد')}</h3>
          <p>
            {t(
              'Each link and QR code identifies its branch automatically.',
              'يحدد كل رابط ورمز QR فرعه تلقائيًا.',
            )}
          </p>
          <div className="sharing-branch-list">
            {links.map((item) => (
              <div
                key={item.id || item.token}
                className="sharing-branch-row"
                data-selected={item.token === link.token}
              >
                <div>
                  <strong>{branchName(item)}</strong>
                  <a href={item.url || publicLink(item.token)} target="_blank" rel="noreferrer">
                    {item.url || publicLink(item.token)}
                  </a>
                </div>
                <button
                  type="button"
                  aria-pressed={item.token === link.token}
                  aria-label={t('Show QR for ', 'عرض رمز QR لفرع ') + branchName(item)}
                  onClick={() => onSelect(item.id || item.token)}
                >
                  {t('Show QR', 'عرض QR')}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
export default function SurveySharing({
  survey,
  workspace,
  language,
  onChange,
  onClose,
  onNotice,
}) {
  const t = (en, ar) => (language === 'ar' ? ar : en);
  const mutation = useMutation();
  const [branchIds, setBranchIds] = useState([]),
    [notice, setNotice] = useState(''),
    [selectedLinkId, setSelectedLinkId] = useState('');
  const editable = canManage(workspace);
  const showNotice = (message) => {
    setNotice(message);
    onNotice?.(message);
  };
  useEffect(() => {
    setBranchIds([]);
    setNotice('');
    setSelectedLinkId('');
  }, [survey.id]);
  async function publish() {
    const result = await mutation.run((signal) =>
      productApi.send('/surveys/' + survey.id + '/publish', { branchIds }, 'POST', signal),
    );
    if (result) {
      showNotice(
        t(
          'Survey published. Share a branch link below.',
          'تم نشر الاستبيان. شارك رابط الفرع أدناه.',
        ),
      );
      onChange?.(result.survey);
    }
  }
  const activeLinks = (survey.links || []).filter(
    (link) => link.enabled !== false && link.active !== false && !link.closedAt,
  );
  const selectedLink =
    activeLinks.find((link) => (link.id || link.token) === selectedLinkId) || activeLinks[0];
  return (
    <section className="product-card survey-sharing" data-status={survey.status}>
      <div className="product-heading sharing-status-banner">
        <div>
          <h2>{survey.title}</h2>
          <p>
            {survey.questions?.length || 0} {t('questions', 'أسئلة')} ·{' '}
            {survey.locale === 'ar' ? 'العربية' : 'English'}
          </p>
        </div>
        <Status value={survey.status} language={language} />
        {onClose && <button onClick={onClose}>{t('Close panel', 'إغلاق اللوحة')}</button>}
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
                    disabled={mutation.busy}
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
                    showNotice(
                      t(
                        'Collection closed. Existing responses are preserved.',
                        'تم إغلاق جمع الردود مع الاحتفاظ بالردود السابقة.',
                      ),
                    );
                    onChange?.(result.survey);
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
      {notice && !onNotice && <p role="status">{notice}</p>}
      {selectedLink ? (
        <ShareLink
          link={selectedLink}
          links={activeLinks}
          language={language}
          workspace={workspace}
          onSelect={setSelectedLinkId}
        />
      ) : (
        <p className="product-notice">
          {t(
            'This survey is not collecting responses. Choose branches and publish when you are ready.',
            'هذا الاستبيان لا يجمع ردودًا. اختر الفروع وانشر عندما تكون مستعدًا.',
          )}
        </p>
      )}
    </section>
  );
}
