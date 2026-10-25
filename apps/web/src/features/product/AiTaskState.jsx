import React from 'react';
export default function AiTaskState({ status, language, onRetry, busy = false }) {
  const t = (a, b) => (language === 'ar' ? b : a);
  const failed = status === 'failed';
  const message = failed
    ? t('The model request failed. Please retry.', 'فشل طلب النموذج. يرجى إعادة المحاولة.')
    : ['busy', 'service_busy'].includes(status)
      ? t(
          'The model service is busy. Please retry shortly.',
          'خدمة النموذج مشغولة. حاول مرة أخرى قريبًا.',
        )
      : status === 'insufficient_evidence'
        ? t(
            'There is not enough saved evidence for this request.',
            'لا توجد أدلة محفوظة كافية لهذا الطلب.',
          )
        : ['queued', 'running'].includes(status)
          ? t(
              'This request is queued or processing. Refresh to see its latest status.',
              'هذا الطلب في الانتظار أو قيد المعالجة. حدّث الصفحة لمتابعة حالته.',
            )
          : ['waiting_for_model', 'model_unavailable', 'unavailable', 'waiting'].includes(status)
            ? t('A compatible model is not available yet.', 'لا يتوفر نموذج متوافق بعد.')
            : t('No result is available for this request.', 'لا توجد نتيجة متاحة لهذا الطلب.');
  return (
    <div className={failed ? 'product-error' : 'product-notice'} role={failed ? 'alert' : 'status'}>
      <p>{message}</p>
      {onRetry && !['queued', 'running'].includes(status) && (
        <button type="button" disabled={busy} onClick={onRetry}>
          {t('Retry request', 'إعادة المحاولة')}
        </button>
      )}
    </div>
  );
}
