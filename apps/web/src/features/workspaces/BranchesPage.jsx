import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { isOwner } from '../product/product-state.js';
import { DataTable, ErrorNotice, ResourceState } from '../product/ui.jsx';
function BranchRow({ branch, language, editable, mutation, onSave }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    [name, setName] = useState(branch.name),
    [editing, setEditing] = useState(false);
  return (
    <tr>
      <td>
        {editable && editing ? (
          <input
            aria-label={t('Branch name: ', 'اسم الفرع: ') + branch.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        ) : (
          branch.name
        )}
      </td>
      <td>
        {branch.isPrimary
          ? t('Primary branch', 'الفرع الرئيسي')
          : branch.archivedAt
            ? t('Archived', 'مؤرشف')
            : t('Active', 'نشط')}
      </td>
      <td>
        {editable && (
          <div className="product-actions">
            <button onClick={() => setEditing((value) => !value)}>
              {editing ? t('Cancel edit', 'إلغاء التعديل') : t('Edit', 'تعديل')}
            </button>
            {editing && (
              <button
                disabled={mutation.busy || !name.trim() || name === branch.name}
                onClick={async () => {
                  if (await onSave(branch.id, { name })) setEditing(false);
                }}
              >
                {t('Save name', 'حفظ الاسم')}
              </button>
            )}
            {!branch.isPrimary && !branch.archivedAt && (
              <button
                disabled={mutation.busy}
                onClick={() => onSave(branch.id, { isPrimary: true })}
              >
                {t('Make primary', 'تعيين كرئيسي')}
              </button>
            )}
            {!branch.isPrimary && (
              <button
                disabled={mutation.busy}
                onClick={() => onSave(branch.id, { archived: !branch.archivedAt })}
              >
                {branch.archivedAt ? t('Restore', 'استعادة') : t('Archive', 'أرشفة')}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
export default function BranchesPage({ language, workspace }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    path = '/workspaces/' + workspace.id + '/branches',
    resource = useResource(path + '?includeArchived=true'),
    mutation = useMutation(),
    [name, setName] = useState(''),
    [tab, setTab] = useState('active'),
    [search, setSearch] = useState(''),
    [adding, setAdding] = useState(false);
  const branches = resource.data?.branches || resource.data || [];
  const visibleBranches = branches.filter(
    (branch) =>
      Boolean(branch.archivedAt) === (tab === 'archived') &&
      (!search || branch.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  async function save(id, body) {
    const result = await mutation.run((signal) =>
      productApi.send(path + '/' + id, body, 'PATCH', signal),
    );
    if (result) {
      resource.reload();
      window.dispatchEvent(new Event('nuvia:session-expired'));
    }
    return Boolean(result);
  }
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('Branches', 'الفروع')}</h1>
          <p>
            {t(
              'Branch history stays connected to its original feedback.',
              'يبقى سجل الفروع مرتبطًا بالآراء الأصلية.',
            )}
          </p>
        </div>
        {isOwner(workspace) && (
          <button className="primary" onClick={() => setAdding(true)}>
            {t('Add branch', 'إضافة فرع')}
          </button>
        )}
      </div>
      <nav className="product-section-tabs" aria-label={t('Business sections', 'أقسام النشاط')}>
        <a href="#/settings">{t('Business profile', 'ملف النشاط')}</a>
        <span aria-current="page">{t('Branches', 'الفروع')}</span>
        <a href="#/team">{t('Team access', 'صلاحيات الفريق')}</a>
      </nav>
      <ResourceState resource={resource} language={language} />
      <ErrorNotice error={mutation.error} language={language} />
      {resource.data && (
        <div className="product-grid">
          {[
            [
              t('Active branches', 'الفروع النشطة'),
              branches.filter((branch) => !branch.archivedAt).length,
            ],
            [
              t('Archived branches', 'الفروع المؤرشفة'),
              branches.filter((branch) => branch.archivedAt).length,
            ],
            [
              t('Primary branch', 'الفرع الرئيسي'),
              branches.find((branch) => branch.isPrimary)?.name || '—',
            ],
          ].map(([label, value]) => (
            <section className="product-card product-metric" key={label}>
              <p>{label}</p>
              <strong>{typeof value === 'number' ? value.toLocaleString(language) : value}</strong>
            </section>
          ))}
        </div>
      )}
      <div className="product-list-toolbar branch-list-toolbar">
        <div className="product-actions">
          {[
            ['active', t('Active branches', 'الفروع النشطة')],
            ['archived', t('Archived', 'المؤرشفة')],
          ].map(([key, label]) => (
            <button aria-pressed={tab === key} key={key} onClick={() => setTab(key)}>
              {label} ·{' '}
              {
                branches.filter((branch) => Boolean(branch.archivedAt) === (key === 'archived'))
                  .length
              }
            </button>
          ))}
        </div>
        <input
          className="product-list-search"
          aria-label={t('Search branches', 'البحث في الفروع')}
          placeholder={t('Search branches', 'ابحث في الفروع')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <section className="product-card product-list-card">
        <DataTable
          headings={[t('Branch', 'الفرع'), t('Status', 'الحالة'), t('Actions', 'الإجراءات')]}
        >
          {visibleBranches.map((branch) => (
            <BranchRow
              key={branch.id}
              {...{ branch, language, mutation }}
              editable={isOwner(workspace)}
              onSave={save}
            />
          ))}
        </DataTable>
        {!resource.loading && !visibleBranches.length && (
          <p className="product-empty">
            {t('No branches match this view.', 'لا توجد فروع في هذا العرض.')}
          </p>
        )}
      </section>
      <section className="product-card">
        <h2>{t('Closed a location? Keep its history.', 'أغلقت أحد الفروع؟ احتفظ بسجله.')}</h2>
        <p>
          {t(
            'Archiving removes a branch from active lists without deleting its earlier responses.',
            'تزيل الأرشفة الفرع من القوائم النشطة دون حذف ردوده السابقة.',
          )}
        </p>
      </section>
      {isOwner(workspace) && adding && (
        <form
          className="product-card product-form"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await mutation.run((signal) =>
              productApi.send(path, { name }, 'POST', signal),
            );
            if (result) {
              setName('');
              setAdding(false);
              resource.reload();
              window.dispatchEvent(new Event('nuvia:session-expired'));
            }
          }}
        >
          <h2>{t('Add branch', 'إضافة فرع')}</h2>
          <label>
            {t('Branch name', 'اسم الفرع')}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </label>
          <button className="primary" disabled={mutation.busy || !name.trim()}>
            {t('Create branch', 'إنشاء فرع')}
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            {t('Cancel', 'إلغاء')}
          </button>
        </form>
      )}
    </>
  );
}
