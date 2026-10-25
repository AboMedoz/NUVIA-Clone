import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { isOwner } from '../product/product-state.js';
import { DataTable, ErrorNotice, ResourceState } from '../product/ui.jsx';
function BranchRow({ branch, language, editable, mutation, onSave }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    [name, setName] = useState(branch.name);
  return (
    <tr>
      <td>
        {editable ? (
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
            <button
              disabled={mutation.busy || !name.trim() || name === branch.name}
              onClick={() => onSave(branch.id, { name })}
            >
              {t('Save name', 'حفظ الاسم')}
            </button>
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
    [name, setName] = useState('');
  async function save(id, body) {
    const result = await mutation.run((signal) =>
      productApi.send(path + '/' + id, body, 'PATCH', signal),
    );
    if (result) {
      resource.reload();
      window.dispatchEvent(new Event('nuvia:session-expired'));
    }
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
        <a href="#/team">{t('Team access', 'صلاحيات الفريق')}</a>
      </div>
      <ResourceState resource={resource} language={language} />
      <ErrorNotice error={mutation.error} language={language} />
      <section className="product-card">
        <DataTable
          headings={[t('Branch', 'الفرع'), t('Status', 'الحالة'), t('Actions', 'الإجراءات')]}
        >
          {(resource.data?.branches || resource.data || []).map((branch) => (
            <BranchRow
              key={branch.id}
              {...{ branch, language, mutation }}
              editable={isOwner(workspace)}
              onSave={save}
            />
          ))}
        </DataTable>
      </section>
      {isOwner(workspace) && (
        <form
          className="product-card product-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await mutation.run((signal) =>
              productApi.send(path, { name }, 'POST', signal),
            );
            if (result) {
              setName('');
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
        </form>
      )}
    </>
  );
}
