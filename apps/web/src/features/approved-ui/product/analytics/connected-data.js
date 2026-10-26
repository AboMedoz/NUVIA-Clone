import { queryString } from '../../../product/product-state.js';

export function connectedDefaults(now = new Date(), timezone = 'Africa/Cairo') {
  const end = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = new Date(end + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - 29);
  return { branch: 'all', start: start.toISOString().slice(0, 10), end };
}

export function analyticsQuery(filters, extra = {}, timezone) {
  return queryString(
    {
      branchId: filters.branch,
      from: filters.start,
      to: filters.end,
      language: { English: 'en', Arabic: 'ar' }[extra.language],
      surveyId: extra.surveyId,
      interval: extra.interval || 'day',
      sentiment: extra.sentiment,
    },
    timezone,
  );
}

function totals(data = {}) {
  const distribution = data.sentimentDistribution || {};
  const analyzed = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  return {
    total: data.totalResponses || 0,
    analyzed,
    positive: distribution.positive || 0,
    negative: distribution.negative || 0,
    neutral: distribution.neutral || 0,
    mixed: distribution.mixed || 0,
    positivePercent: analyzed ? (100 * (distribution.positive || 0)) / analyzed : null,
    rating: data.averageRating ?? null,
    completion:
      data.startedSessions > 0 && data.completionRate != null ? data.completionRate * 100 : null,
  };
}

export function overviewFromAnalytics(data) {
  return {
    ...totals(data || {}),
    ready: Boolean(data),
    raw: data,
    periods: (data?.trends || []).map((row) => ({
      ...totals(row),
      start: row.date.length === 7 ? row.date + '-01' : row.date,
      end: row.date.length === 7 ? row.date + '-01' : row.date,
    })),
    branches: (data?.comparisons || []).map((row) => ({
      ...totals(row),
      branch: row.branchName,
      id: row.branchId,
    })),
    responses: [],
  };
}
