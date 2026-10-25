import React, { useState } from 'react';
import { useMutation, useResource } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { ErrorNotice, ResourceState } from '../product/ui.jsx';
import Filters from '../product/Filters.jsx';
import { requestFilters } from '../product/product-state.js';
import { EvidenceLinks } from '../analytics/AnalyticsPage.jsx';
import AiTaskState from '../product/AiTaskState.jsx';
export default function AssistantPage({ language, workspace }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    [message, setMessage] = useState(''),
    [filters, setFilters] = useState({}),
    [messages, setMessages] = useState([]),
    mutation = useMutation(),
    capabilities = useResource('/ai/capabilities');
  async function requestAnswer(body, index) {
    const result = await mutation.run((signal) =>
      productApi.send('/assistant/messages', body, 'POST', signal),
    );
    if (result) {
      setMessages((old) =>
        index === undefined
          ? [...old, { question: body.message, request: body, ...result }]
          : old.map((item, i) =>
              i === index ? { question: body.message, request: body, ...result } : item,
            ),
      );
      if (result.status === 'succeeded') setMessage('');
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (message.trim())
      await requestAnswer({
        message,
        locale: language,
        filters: requestFilters(filters, workspace?.reportingTimezone),
      });
  }
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('NUVIA Assistant', 'مساعد NUVIA')}</h1>
          <p>
            {t(
              'Ask questions about your authorized customer feedback.',
              'اسأل عن آراء العملاء المسموح لك بالوصول إليها.',
            )}
          </p>
        </div>
      </div>
      <Filters {...{ filters, setFilters, workspace, language }} />
      <ResourceState resource={capabilities} language={language} />
      <p className="product-notice">
        {t(
          'Answers require a compatible model and sufficient saved evidence. Sources open the original responses.',
          'تتطلب الإجابات نموذجًا متوافقًا وأدلة محفوظة كافية. تفتح المصادر الردود الأصلية.',
        )}
      </p>
      {messages.map((item, index) => (
        <section className="product-card" key={index}>
          <h2>{item.question}</h2>
          {item.answer ? (
            <p style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</p>
          ) : (
            <AiTaskState
              status={item.status}
              language={language}
              busy={mutation.busy}
              onRetry={() => requestAnswer(item.request, index)}
            />
          )}
          <EvidenceLinks evidence={item.evidence} language={language} />
        </section>
      ))}
      <form className="product-card product-form" onSubmit={submit}>
        <label>
          {t('Your question', 'سؤالك')}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder={t(
              'What are customers saying about our service?',
              'ماذا يقول العملاء عن خدمتنا؟',
            )}
          />
        </label>
        <ErrorNotice error={mutation.error} language={language} />
        <button className="primary" disabled={mutation.busy || !message.trim()}>
          {mutation.busy ? t('Thinking…', 'جارٍ المعالجة…') : t('Ask assistant', 'اسأل المساعد')}
        </button>
      </form>
    </>
  );
}
