import React, { useEffect, useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { isOwner } from '../product/product-state.js';
import { ErrorNotice, ResourceState } from '../product/ui.jsx';
import AutoGrowTextarea from '../../components/ui/AutoGrowTextarea.jsx';
export default function BusinessPageSettings({ language, workspace }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    resource = useResource(isOwner(workspace) ? '/business-page' : null),
    mutation = useMutation(),
    [initialized, setInitialized] = useState(false),
    [errors, setErrors] = useState({}),
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
  const update = (field, value) => {
    setDraft((old) => ({ ...old, [field]: value }));
    setErrors((old) => ({ ...old, [field]: undefined }));
  };
  const validate = () => {
    const next = {};
    if (!/^[a-z0-9-]{3,80}$/.test(draft.slug)) next.slug = 'slug';
    for (const field of ['logoUrl', 'contactUrl']) {
      if (!draft[field]) continue;
      try {
        const url = new URL(draft[field]);
        if (url.protocol !== 'https:' || url.username || url.password || draft[field].length > 2000)
          throw new Error('invalid');
      } catch {
        next[field] = 'url';
      }
    }
    if ((draft.description || '').length > 2000) next.description = 'length';
    return next;
  };
  const messages = {
    slug: t(
      'Use 3–80 lowercase letters, numbers or hyphens.',
      'استخدم من ٣ إلى ٨٠ حرفًا إنجليزيًا صغيرًا أو رقمًا أو شرطة.',
    ),
    url: t(
      'Enter an HTTPS URL without a username or password.',
      'أدخل رابط HTTPS بدون اسم مستخدم أو كلمة مرور.',
    ),
    length: t('Use 2,000 characters or fewer.', 'استخدم ٢٠٠٠ حرف أو أقل.'),
  };
  const errorFor = (field) =>
    errors[field] && (
      <span id={`business-page-${field}-error`} role="alert">
        {messages[errors[field]]}
      </span>
    );
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
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!editable || mutation.busy) return;
          const next = validate();
          setErrors(next);
          const invalid = Object.keys(next)[0];
          if (invalid) {
            e.currentTarget.elements.namedItem(invalid)?.focus();
            return;
          }
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
                name="slug"
                pattern="[a-z0-9-]+"
                aria-invalid={!!errors.slug || undefined}
                aria-describedby={errors.slug ? 'business-page-slug-error' : undefined}
                value={draft.slug}
                onChange={(e) => update('slug', e.target.value)}
                placeholder="my-business"
                maxLength={80}
              />
              {errorFor('slug')}
            </label>
            <label>
              {t('Logo URL (HTTPS, optional)', 'رابط الشعار (HTTPS، اختياري)')}
              <input
                type="url"
                name="logoUrl"
                aria-invalid={!!errors.logoUrl || undefined}
                aria-describedby={errors.logoUrl ? 'business-page-logoUrl-error' : undefined}
                value={draft.logoUrl || ''}
                onChange={(e) => update('logoUrl', e.target.value)}
                maxLength={2000}
              />
              {errorFor('logoUrl')}
            </label>
            <label>
              {t('Contact URL (HTTPS, optional)', 'رابط التواصل (HTTPS، اختياري)')}
              <input
                type="url"
                name="contactUrl"
                maxLength={2000}
                aria-invalid={!!errors.contactUrl || undefined}
                aria-describedby={errors.contactUrl ? 'business-page-contactUrl-error' : undefined}
                value={draft.contactUrl || ''}
                onChange={(e) => update('contactUrl', e.target.value)}
              />
              {errorFor('contactUrl')}
            </label>
            <label>
              {t('Description', 'الوصف')}
              <AutoGrowTextarea
                name="description"
                rows={4}
                aria-invalid={!!errors.description || undefined}
                aria-describedby={
                  errors.description ? 'business-page-description-error' : undefined
                }
                value={draft.description || ''}
                onChange={(e) => update('description', e.target.value)}
                maxLength={2000}
              />
              {errorFor('description')}
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
