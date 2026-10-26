import { queryString } from '../../product/product-state.js';

export function feedbackRow(response, language = 'en', timezone) {
  const date = new Date(response.createdAt);
  const label = response.analysis?.sentiment?.label;
  return {
    ...response,
    survey: response.surveyTitle || '—',
    branch: response.branchName || '—',
    text:
      response.text ||
      (response.answers || [])
        .map(
          (answer) =>
            `${answer.label || answer.questionId}: ${Array.isArray(answer.value) ? answer.value.join(', ') : answer.value}`,
        )
        .join('\n'),
    sentiment: label
      ? label[0].toUpperCase() + label.slice(1)
      : response.analysisStatus || 'Pending',
    language:
      { ar: 'Arabic', en: 'English', mixed: 'Mixed', unknown: 'Unknown' }[response.language] ||
      'Unknown',
    date: Number.isFinite(date.getTime())
      ? date.toLocaleDateString('en-CA', { ...(timezone ? { timeZone: timezone } : {}) })
      : '',
    time: Number.isFinite(date.getTime())
      ? date.toLocaleTimeString(language, {
          hour: '2-digit',
          minute: '2-digit',
          ...(timezone ? { timeZone: timezone } : {}),
        })
      : '—',
    aspects: [...new Set((response.analysis?.aspects?.mentions || []).map((item) => item.aspect))],
    segment: Object.values(response.segments || {}).join(' · ') || 'Not specified',
  };
}

export function feedbackFilters(filters, query, now = new Date()) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - Number(filters.date || 30));
  return {
    from: from.toISOString(),
    search: query || undefined,
    sentiment: filters.sentiment === 'all' ? undefined : filters.sentiment?.toLowerCase(),
    language: { English: 'en', Arabic: 'ar', Mixed: 'mixed', Unknown: 'unknown' }[filters.language],
    aspect: filters.aspect === 'all' ? undefined : filters.aspect,
    branchId: filters.branch === 'all' ? undefined : filters.branch,
    segmentKey: filters.segmentKey || undefined,
    segmentValue: filters.segmentValue ?? '',
  };
}

export function scopeFilters(dashboard, workspace) {
  const scope = dashboard?.filters || {};
  const branch = (workspace?.branches || []).find(
    (item) => item.id === scope.branch || item.name === scope.branch,
  );
  return {
    ...(scope.start ? { from: scope.start } : {}),
    ...(scope.end ? { to: scope.end } : {}),
    ...(branch ? { branchId: branch.id } : {}),
  };
}

export function feedbackExportUrl(filters, workspaceId) {
  return (
    '/api/v1/feedback/export' +
    queryString({ ...filters, ...(workspaceId ? { expectedWorkspaceId: workspaceId } : {}) })
  );
}

export function taskMessage(status, ar = false) {
  const messages = {
    succeeded: ['Analysis complete', 'اكتمل التحليل'],
    queued: ['Queued for analysis', 'في انتظار التحليل'],
    running: ['Analyzing your feedback…', 'جارٍ تحليل آراء العملاء…'],
    model_unavailable: ['Waiting for a compatible AI model', 'بانتظار نموذج ذكاء اصطناعي متوافق'],
    waiting_for_model: ['Waiting for a compatible AI model', 'بانتظار نموذج ذكاء اصطناعي متوافق'],
    insufficient_evidence: [
      'There is not enough saved feedback to answer yet.',
      'لا توجد آراء محفوظة كافية للإجابة بعد.',
    ],
    failed: ['Analysis failed. Try again.', 'تعذر التحليل. أعد المحاولة.'],
  };
  return (messages[status] || ['Analysis is not available yet.', 'التحليل غير متاح بعد.'])[
    ar ? 1 : 0
  ];
}

export function defaultScopeDates(timezone = 'UTC', now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return {
    branch: 'all',
    start: date.format(new Date(now.getTime() - 30 * 86400000)),
    end: date.format(now),
  };
}
