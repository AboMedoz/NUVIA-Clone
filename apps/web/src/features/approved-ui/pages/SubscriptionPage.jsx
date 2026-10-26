import React from 'react';
import { useResource, useMutation } from '../../product/useResource.js';
import { productApi } from '../../product/api.js';
export default function SubscriptionPage({ language }) {
  const { data, error, loading, reload } = useResource('/billing');
  const mutation = useMutation(),
    ar = language === 'ar';
  const open = async (path, body) => {
    const result = await mutation.run((signal) => productApi.send(path, body, 'POST', signal));
    if (result?.url) location.assign(result.url);
  };
  return (
    <section className="feedback-screen">
      <header className="feedback-heading">
        <div>
          <h1>{ar ? 'الاشتراك' : 'Subscription'}</h1>
          <p>{ar ? 'إدارة الخطة والاستخدام والفواتير' : 'Manage your plan, usage and billing'}</p>
        </div>
      </header>
      {loading ? (
        <p role="status">{ar ? 'جارٍ التحميل' : 'Loading'}</p>
      ) : error ? (
        <p role="alert">
          {ar ? 'تعذر تحميل الاشتراك' : 'Unable to load subscription'}{' '}
          <button onClick={reload}>{ar ? 'إعادة المحاولة' : 'Retry'}</button>
        </p>
      ) : (
        <>
          <div className="card">
            <h2>{data.plan.name}</h2>
            <p>
              {data.usage.responses} {ar ? 'رد محفوظ' : 'saved responses'}
            </p>
            <p>{data.subscription?.status || (ar ? 'الخطة المجانية' : 'Free plan')}</p>
            {!data.configured && (
              <p role="status">
                {ar
                  ? 'ربط الدفع جاهز ويحتاج إعداد مفاتيح مزود الدفع وأسعار الخطط.'
                  : 'Payment integration requires provider keys and configured plan prices.'}
              </p>
            )}
          </div>
          <div className="card">
            {data.plans.map((plan) => (
              <div key={plan.id}>
                <h3>{plan.name}</h3>
                <button
                  className="feedback-btn feedback-primary"
                  disabled={!plan.available || mutation.busy}
                  onClick={() => open('/billing/checkout', { plan: plan.id })}
                >
                  {ar ? 'اختيار الخطة' : 'Choose plan'}
                </button>
              </div>
            ))}
          </div>
          <button
            className="feedback-btn"
            disabled={!data.subscription?.customerId || mutation.busy}
            onClick={() => open('/billing/portal', {})}
          >
            {ar ? 'إدارة الفواتير' : 'Manage billing'}
          </button>
        </>
      )}
      {mutation.error && (
        <p role="alert">{ar ? 'تعذر الاتصال بمزود الدفع' : 'Unable to contact billing provider'}</p>
      )}
    </section>
  );
}
