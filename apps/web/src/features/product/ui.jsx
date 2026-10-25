import React from 'react';
export function ErrorNotice({ error, language = 'en', retry }) {
  if (!error) return null;
  const ar = language === 'ar';
  const conflict = ['REVISION_CONFLICT', 'SURVEY_CONFLICT', 'SURVEY_CHANGED', 'CONFLICT'].includes(
    error.code,
  );
  return (
    <div className="product-error" role="alert">
      {conflict
        ? ar
          ? 'تم تعديل هذا السجل. أعد تحميله قبل الحفظ.'
          : 'This record changed. Reload it before saving.'
        : ar
          ? 'تعذر إكمال الطلب. احتفظنا بمدخلاتك؛ حاول مرة أخرى.'
          : 'Could not complete the request. Your entries are retained; please try again.'}
      {retry && (
        <button type="button" onClick={retry}>
          {ar ? 'إعادة المحاولة' : 'Retry'}
        </button>
      )}
    </div>
  );
}
export function ResourceState({ resource, language }) {
  if (resource.loading)
    return <p role="status">{language === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>;
  return <ErrorNotice error={resource.error} language={language} retry={resource.reload} />;
}
export function EmptyState({ title, children }) {
  return (
    <div className="product-empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Status({ value, language }) {
  const labels = {
    insufficient_evidence: ['Insufficient evidence', 'أدلة غير كافية'],
    awaiting_analysis: ['Awaiting analysis', 'بانتظار التحليل'],
    partial: ['Partially analyzed', 'محلل جزئيًا'],
    positive: ['Positive', 'إيجابي'],
    negative: ['Negative', 'سلبي'],
    neutral: ['Neutral', 'محايد'],
    mixed: ['Mixed', 'مختلط'],
    waiting_for_model: ['Waiting for model', 'بانتظار النموذج'],
    waiting: ['Waiting for model', 'بانتظار النموذج'],
    model_unavailable: ['Model unavailable', 'النموذج غير متاح'],
    queued: ['Queued', 'في الانتظار'],
    running: ['Processing', 'قيد المعالجة'],
    succeeded: ['Complete', 'مكتمل'],
    failed: ['Failed', 'فشل'],
    draft: ['Draft', 'مسودة'],
    published: ['Published', 'منشور'],
    closed: ['Closed', 'مغلق'],
    pending: ['Pending', 'في الانتظار'],
  };
  return (
    <span className={'product-status ' + (value || 'pending')}>
      {labels[value]?.[language === 'ar' ? 1 : 0] || value || '—'}
    </span>
  );
}
export function DataTable({ headings, children }) {
  return (
    <div className="product-table-wrap">
      <table className="product-table">
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
