import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useResource, useMutation } from '../../product/useResource.js';
import { productApi } from '../../product/api.js';
import { canManage } from '../../product/product-state.js';
import { useProductView } from '../product/ProductContext.jsx';
import { feedbackRow } from '../product/connected-data.js';
import ChoiceMenu from '../components/ChoiceMenu.jsx';
import { PreviewArrow } from '../product/preview/PreviewControls.jsx';

const statuses = [
  ['todo', 'Not started'],
  ['progress', 'In progress'],
  ['done', 'Completed'],
];
const priorityLabels = { high: 'High priority', medium: 'Medium', opportunity: 'Opportunity' };
function Notice({ resource }) {
  const { language } = useProductView();
  if (!resource.loading && !resource.error) return null;
  return (
    <div className="action-card" role={resource.error ? 'alert' : 'status'}>
      <p>
        {resource.error
          ? language === 'ar'
            ? 'تعذر تحميل البيانات.'
            : 'Unable to load data.'
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

export function ConnectedActionBoard() {
  const { tr, language, formatNumber } = useProductView(),
    auth = useAuth(),
    ar = language === 'ar',
    t = (en, arabic) => (ar ? arabic : en);
  const resource = useResource('/actions'),
    mutation = useMutation();
  const feedback = useResource('/feedback?pageSize=100');
  const [filter, setFilter] = useState('all'),
    [drafts, setDrafts] = useState({}),
    [saved, setSaved] = useState(null),
    [creating, setCreating] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(null);
  const [draft, setDraft] = useState({
    title: '',
    summary: '',
    branch: 'all',
    responseIds: [],
    priority: 'medium',
  });
  const actions = resource.data?.actions || [],
    writable = canManage(auth.workspace),
    branches = auth.workspace?.branches || [];
  const dirty =
    Object.keys(drafts).length > 0 || (creating && Boolean(draft.title || draft.summary));
  useEffect(() => {
    if (!dirty) return;
    const unload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', unload);
    return () => removeEventListener('beforeunload', unload);
  }, [dirty]);
  const visible = actions.filter(
    (item) => filter === 'all' || (drafts[item.id]?.status || item.status) === filter,
  );
  const update = (id, patch) => {
    setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
    setSaved(null);
  };
  async function save(item) {
    const result = await mutation.run((signal) =>
      productApi.send(
        '/actions/' + encodeURIComponent(item.id),
        { ...drafts[item.id], version: item.version },
        'PATCH',
        signal,
      ),
    );
    if (result) {
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      setSaved(item.id);
      resource.reload();
    }
  }
  async function create(event) {
    event.preventDefault();
    if (!draft.title.trim() || !branches.length) return;
    const result = await mutation.run((signal) =>
      productApi.send(
        '/actions',
        {
          title: draft.title,
          summary: draft.summary,
          branchIds: draft.branch === 'all' ? branches.map((branch) => branch.id) : [draft.branch],
          responseIds: draft.responseIds,
          priority: draft.priority,
        },
        'POST',
        signal,
      ),
    );
    if (result) {
      setDraft({ title: '', summary: '', branch: 'all', responseIds: [], priority: 'medium' });
      setCreating(false);
      resource.reload();
    }
  }
  async function remove(item) {
    const result = await mutation.run((signal) =>
      productApi
        .send('/actions/' + item.id, { version: item.version }, 'DELETE', signal)
        .then(() => true),
    );
    if (result) {
      setConfirmDelete(null);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      resource.reload();
    }
  }
  return (
    <section className="feedback-screen action-screen">
      <button
        className="feedback-text-btn action-back"
        onClick={() => {
          location.hash = '/dashboard';
        }}
      >
        <PreviewArrow direction="back" />
        {tr('Back to Overview')}
      </button>
      <div className="feedback-heading">
        <div>
          <h1>{tr('Action board')}</h1>
          <p>{tr('Turn recommendations into clear next steps.')}</p>
        </div>
        {writable && (
          <button
            className="feedback-btn feedback-primary"
            onClick={() => setCreating((open) => !open)}
          >
            {t('Create action', 'إنشاء إجراء')}
          </button>
        )}
      </div>
      <div className="action-summary">
        <span>
          {formatNumber(actions.length)} {tr('actions')}
        </span>
        <span>
          {formatNumber(actions.filter((item) => item.status === 'done').length)} {tr('completed')}
        </span>
        <ChoiceMenu
          value={filter}
          onChange={setFilter}
          icon={false}
          density="compact"
          label={tr('Status')}
          options={[['all', 'All actions'], ...statuses].map(([value, label]) => ({
            value,
            label: tr(label),
          }))}
        />
      </div>
      {creating && (
        <form className="action-card" noValidate onSubmit={create}>
          <h2>{t('Create action', 'إنشاء إجراء')}</h2>
          <div className="action-fields">
            <label>
              <span>{t('Action title', 'عنوان الإجراء')}</span>
              <input
                aria-label={t('Action title', 'عنوان الإجراء')}
                required
                maxLength={200}
                value={draft.title}
                onChange={(event) => setDraft((old) => ({ ...old, title: event.target.value }))}
              />
            </label>
            <label>
              <span>{t('Summary', 'الملخص')}</span>
              <input
                aria-label={t('Summary', 'الملخص')}
                maxLength={5000}
                value={draft.summary}
                onChange={(event) => setDraft((old) => ({ ...old, summary: event.target.value }))}
              />
            </label>
            <label>
              <span>{tr('Branch')}</span>
              <ChoiceMenu
                value={draft.branch}
                onChange={(branch) => setDraft((old) => ({ ...old, branch, responseIds: [] }))}
                label={tr('Branch')}
                options={[
                  { value: 'all', label: tr('All branches') },
                  ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
                ]}
              />
            </label>
          </div>
          <fieldset>
            <legend>{t('Supporting customer feedback', 'آراء العملاء الداعمة')}</legend>
            {(feedback.data?.responses || [])
              .filter((response) => draft.branch === 'all' || response.branchId === draft.branch)
              .map((response) => (
                <label key={response.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={draft.responseIds.includes(response.id)}
                    onChange={(event) =>
                      setDraft((old) => ({
                        ...old,
                        responseIds: event.target.checked
                          ? [...old.responseIds, response.id]
                          : old.responseIds.filter((id) => id !== response.id),
                      }))
                    }
                  />{' '}
                  <span dir="auto">{response.text || response.surveyTitle}</span>
                </label>
              ))}
            {!feedback.loading && !feedback.data?.responses?.length && (
              <p>
                {t(
                  'No saved feedback yet. You can add an action without linked evidence.',
                  'لا توجد آراء محفوظة بعد. يمكنك إنشاء إجراء بدون أدلة مرتبطة.',
                )}
              </p>
            )}
            <Notice resource={feedback} />
          </fieldset>
          <button
            className="feedback-btn feedback-primary"
            disabled={mutation.busy || !draft.title.trim() || !branches.length}
          >
            {mutation.busy ? t('Saving…', 'جارٍ الحفظ…') : t('Save action', 'حفظ الإجراء')}
          </button>
        </form>
      )}
      <Notice resource={resource} />
      {mutation.error && (
        <p className="action-card" role="alert">
          {mutation.error.code === 'VERSION_CONFLICT'
            ? t(
                'This action changed elsewhere. Refresh before saving again.',
                'تم تغيير هذا الإجراء في مكان آخر. حدّث البيانات قبل الحفظ مرة أخرى.',
              )
            : t(
                'Unable to save this action. Your changes are still here.',
                'تعذر حفظ الإجراء. تغييراتك ما زالت موجودة.',
              )}
          <button className="feedback-btn" onClick={resource.reload}>
            {t('Refresh', 'تحديث')}
          </button>
        </p>
      )}
      <div className="action-cards">
        {visible.map((item) => {
          const values = { ...item, ...drafts[item.id] };
          return (
            <article className="action-card" key={item.id}>
              <div className="action-card-heading">
                <h2>{item.title}</h2>
                <span
                  className={'feedback-badge ' + (item.priority === 'high' ? 'negative' : 'info')}
                >
                  {tr(priorityLabels[item.priority])}
                </span>
              </div>
              <p>{item.summary}</p>
              <div className="action-meta">
                <small>
                  {item.branchIds
                    .map(
                      (id) =>
                        branches.find((branch) => branch.id === id)?.name ||
                        t('Archived branch', 'فرع مؤرشف'),
                    )
                    .join(' · ')}
                </small>
                <span className="action-status" data-status={values.status}>
                  {tr(statuses.find(([value]) => value === values.status)?.[1] || 'Not started')}
                </span>
                {drafts[item.id] && <small>{t('Unsaved changes', 'تغييرات غير محفوظة')}</small>}
              </div>
              <div className="action-fields">
                <label>
                  <span>{tr('Status')}</span>
                  <ChoiceMenu
                    value={values.status}
                    disabled={!writable || mutation.busy}
                    onChange={(status) => update(item.id, { status })}
                    icon={false}
                    density="compact"
                    label={tr('Status')}
                    options={statuses.map(([value, label]) => ({ value, label: tr(label) }))}
                  />
                </label>
                <label>
                  <span>{tr('Owner')}</span>
                  <input
                    value={values.owner}
                    maxLength={120}
                    disabled={!writable || mutation.busy}
                    placeholder={tr('Unassigned')}
                    aria-label={tr('Owner') + ' — ' + item.title}
                    onChange={(event) => update(item.id, { owner: event.target.value })}
                  />
                </label>
                <label>
                  <span>{tr('Due date')}</span>
                  <input
                    className="action-date"
                    type="date"
                    lang={language}
                    value={values.due}
                    disabled={!writable || mutation.busy}
                    aria-label={tr('Due date') + ' — ' + item.title}
                    onChange={(event) => update(item.id, { due: event.target.value })}
                  />
                </label>
              </div>
              <div className="action-card-footer">
                <div className="action-save-row">
                  {writable && (
                    <button
                      className="feedback-btn feedback-primary"
                      disabled={mutation.busy || !drafts[item.id]}
                      onClick={() => save(item)}
                    >
                      {tr('Save changes')}
                    </button>
                  )}
                  <span role="status">
                    {saved === item.id ? t('Changes saved', 'تم حفظ التغييرات') : ''}
                  </span>
                </div>
                <a
                  className="feedback-btn action-evidence-button"
                  href={'#/evidence?action=' + item.id}
                >
                  {tr('View evidence')}
                  <PreviewArrow />
                </a>
                {writable && (
                  <button
                    className="feedback-text-btn"
                    disabled={mutation.busy}
                    onClick={() => setConfirmDelete(item.id)}
                  >
                    {t('Delete action', 'حذف الإجراء')}
                  </button>
                )}
              </div>
              {confirmDelete === item.id && (
                <div className="action-card-footer">
                  <p>{t('Delete this action?', 'هل تريد حذف هذا الإجراء؟')}</p>
                  <button
                    className="feedback-btn"
                    disabled={mutation.busy}
                    onClick={() => setConfirmDelete(null)}
                  >
                    {tr('Cancel')}
                  </button>
                  <button
                    className="feedback-btn"
                    disabled={mutation.busy}
                    onClick={() => remove(item)}
                  >
                    {t('Confirm delete', 'تأكيد الحذف')}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!resource.loading && !resource.error && !visible.length && (
        <p className="action-empty">
          {actions.length
            ? tr('No actions match this status.')
            : t(
                'No actions yet. Create your first next step from customer feedback.',
                'لا توجد إجراءات بعد. أنشئ خطوتك التالية من آراء العملاء.',
              )}
        </p>
      )}
    </section>
  );
}

export function ConnectedEvidence() {
  const { tr, language, formatNumber } = useProductView(),
    id = new URLSearchParams(location.hash.split('?')[1]).get('action');
  const resource = useResource(id ? '/actions/' + encodeURIComponent(id) + '/evidence' : null),
    rows = (resource.data?.responses || []).map((response) => feedbackRow(response, language));
  return (
    <section className="feedback-screen action-screen">
      <a className="feedback-text-btn action-back" href="#/action-board">
        <PreviewArrow direction="back" />
        {tr('Action board')}
      </a>
      <div className="feedback-heading">
        <div>
          <h1>{tr('Supporting Evidence')}</h1>
          <p>{resource.data?.action?.title}</p>
        </div>
      </div>
      <div className="action-summary">
        <span>
          {formatNumber(rows.length)} {tr('matching responses')}
        </span>
      </div>
      <Notice resource={resource} />
      <div className="action-cards">
        {rows.map((row) => (
          <article className="action-card evidence-card" key={row.id}>
            <div className="action-card-heading">
              <small>
                {row.branch} · {new Date(row.createdAt).toLocaleDateString(language)}
              </small>
              <span className="feedback-badge info">{tr(row.sentiment)}</span>
            </div>
            <blockquote lang={row.language === 'Arabic' ? 'ar' : 'en'} dir="auto">
              {row.text}
            </blockquote>
            <small>{row.aspects.map(tr).join(' · ')}</small>
            <a
              className="feedback-btn action-evidence-button"
              href={'#/feedback-details?id=' + encodeURIComponent(row.id)}
            >
              {tr('Open Response')}
              <PreviewArrow />
            </a>
          </article>
        ))}
      </div>
      {!resource.loading && !resource.error && !rows.length && (
        <p className="action-empty">
          {language === 'ar'
            ? 'لا توجد ردود مرتبطة بهذا الإجراء.'
            : 'No saved responses are linked to this action.'}
        </p>
      )}
    </section>
  );
}
