import React, { useEffect, useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { isOwner } from '../product/product-state.js';
import { ErrorNotice, ResourceState } from '../product/ui.jsx';
export default function BusinessPageSettings({ language, workspace }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    resource = useResource(isOwner(workspace) ? '/business-page' : null),
    mutation = useMutation(),
    [initialized, setInitialized] = useState(false),
    [draft, setDraft] = useState({
      enabled: false,
      slug: '',
      description: '',
      logoUrl: '',
      contactUrl: '',
    });
  useEffect(() => {
    if (resource.data && !initialized) {
      setDraft((old) => ({
        ...old,
        ...(resource.data.page || resource.data.businessPage || resource.data),
      }));
      setInitialized(true);
    }
  }, [resource.data, initialized]);
  const editable = isOwner(workspace) && initialized && !resource.loading && !resource.error;
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('Settings', 'الإعدادات')}</h1>
          <p>
            {t(
              'Manage your optional public business page.',
              'إدارة الصفحة العامة الاختيارية للنشاط.',
            )}
          </p>
        </div>
        <a href="#/business-information">{t('Business information', 'معلومات النشاط')}</a>
      </div>
      <div className="product-actions" style={{ marginBottom: 20 }}>
        <a href="#/branches">{t('Branches', 'الفروع')}</a>
        <a href="#/team">{t('Team access', 'صلاحيات الفريق')}</a>
      </div>
      <ResourceState resource={resource} language={language} />
      <form
        className="product-card product-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!editable) return;
          await mutation.run((signal) =>
            productApi.send(
              '/business-page',
              {
                enabled: draft.enabled,
                slug: draft.slug,
                description: draft.description,
                logoUrl: draft.logoUrl || '',
                contactUrl: draft.contactUrl || '',
              },
              'PUT',
              signal,
            ),
          );
        }}
      >
        <fieldset disabled={!editable || mutation.busy}>
          <legend>{t('Public business page', 'الصفحة العامة للنشاط')}</legend>
          <div className="product-form">
            <label className="product-check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((old) => ({ ...old, enabled: e.target.checked }))}
              />
              {t('Enable public page', 'تفعيل الصفحة العامة')}
            </label>
            <label>
              {t('Page address', 'عنوان الصفحة')}
              <input
                required
                pattern="[a-z0-9-]+"
                value={draft.slug}
                onChange={(e) => setDraft((old) => ({ ...old, slug: e.target.value }))}
                placeholder="my-business"
                maxLength={80}
              />
            </label>
            <label>
              {t('Logo URL (HTTPS, optional)', 'رابط الشعار (HTTPS، اختياري)')}
              <input
                type="url"
                value={draft.logoUrl || ''}
                onChange={(e) => setDraft((old) => ({ ...old, logoUrl: e.target.value }))}
                maxLength={2000}
              />
            </label>
            <label>
              {t('Contact URL (HTTPS, optional)', 'رابط التواصل (HTTPS، اختياري)')}
              <input
                type="url"
                value={draft.contactUrl || ''}
                onChange={(e) => setDraft((old) => ({ ...old, contactUrl: e.target.value }))}
              />
            </label>
            <label>
              {t('Description', 'الوصف')}
              <textarea
                value={draft.description || ''}
                onChange={(e) => setDraft((old) => ({ ...old, description: e.target.value }))}
                maxLength={2000}
              />
            </label>
          </div>
        </fieldset>
        <ErrorNotice error={mutation.error} language={language} />
        {mutation.success && (
          <p role="status">{t('Page settings saved.', 'تم حفظ إعدادات الصفحة.')}</p>
        )}
        <button className="primary" disabled={!editable || mutation.busy}>
          {t('Save page settings', 'حفظ إعدادات الصفحة')}
        </button>
        {draft.enabled && draft.slug && (
          <a href={'#/b/' + draft.slug} target="_blank" rel="noreferrer">
            {t('Open public page', 'فتح الصفحة العامة')}
          </a>
        )}
      </form>
    </>
  );
}
