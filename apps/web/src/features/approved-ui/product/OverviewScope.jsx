import React from 'react';
import { asset } from '../assets.js';
import { useProductView } from './ProductContext.jsx';
import { overviewDateLabel } from './OverviewControls.jsx';
const colors = { Positive: '#1e68ef', Neutral: '#bac8dc', Negative: '#d66b72', Mixed: '#b5801b' };
function useScope() {
  const ui = useProductView(),
    ar = ui.language === 'ar';
  const n = (v) =>
      new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 }).format(v),
    pct = (v) => (v == null ? '—' : n(Math.round(v)) + (ar ? '٪' : '%'));
  return { ...ui, ar, n, pct, r: ui.dashboard.report, f: ui.dashboard.filters };
}
function Heading({ title, subtitle }) {
  return (
    <div className="scope-heading">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
function Empty({ title, body }) {
  return (
    <div className="scope-empty">
      <img src={asset('dashboard/overview/message-square.svg')} alt="" />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
export function OverviewScopeStatus() {
  const { ar, n, r, f, tr, dashboard } = useScope();
  return (
    <div className="overview-scope-status" role="status">
      <span>
        {dashboard.connected
          ? dashboard.resource.loading
            ? ar
              ? 'جارٍ تحميل البيانات'
              : 'Loading saved data'
            : dashboard.resource.error
              ? ar
                ? 'تعذر تحميل البيانات'
                : 'Could not load data'
              : ar
                ? 'آراء العملاء المحفوظة'
                : 'Saved customer feedback'
          : ar
            ? 'بيانات تجريبية'
            : 'Demo data'}{' '}
        ·{' '}
        {tr(
          f.branch === 'all'
            ? 'All branches'
            : dashboard.branches?.find((branch) => branch.id === f.branch)?.name || f.branch,
        )}{' '}
        · {r.ready === false ? '—' : n(r.total)} {tr('responses')}
        {!dashboard.isFiltered &&
          (ar
            ? ' · الأقسام الإضافية لقطة تصميم توضيحية'
            : ' · Supplementary cards are illustrative design snapshots')}
      </span>
      {dashboard.resource?.error && (
        <button onClick={dashboard.resource.reload}>{ar ? 'إعادة المحاولة' : 'Retry'}</button>
      )}
      {dashboard.isFiltered && <button onClick={dashboard.reset}>{tr('Reset filters')}</button>}
    </div>
  );
}
export function ScopeMetric({ kind, children }) {
  const s = useScope(),
    { ar, r, n, pct, tr, dashboard } = s;
  if (!dashboard.isFiltered) return children;
  const data = {
    total: ['Total responses', r.ready === false ? '—' : n(r.total), 'message-square1'],
    positive: ['Positive sentiment', pct(r.positivePercent), 'smile-metric'],
    rating: [
      'Customer satisfaction',
      r.rating === null ? '—' : s.formatNumber(r.rating.toFixed(1)) + ' / ' + s.formatNumber(5),
      'star-metric',
    ],
    completion: [
      'Completion rate',
      r.completion === null ? '—' : pct(r.completion),
      'circle-check-metric',
    ],
  }[kind];
  const missing =
    r.ready === false ||
    (kind === 'positive' && r.positivePercent === null) ||
    (kind === 'rating' && r.rating === null) ||
    (kind === 'completion' && r.completion === null);
  return (
    <>
      <div className="f58" data-name="Metric heading">
        <p className="f36">{tr(data[0])}</p>
        <img width="20" height="20" src={asset('dashboard/overview/' + data[2] + '.svg')} alt="" />
      </div>
      <div className="f74" data-name="Metric value">
        <p className="f75 scope-number" dir="ltr">
          {data[1]}
        </p>
      </div>
      <p className="f12 scope-metric-note">
        {kind === 'completion' && dashboard.connected && r.raw?.startedSessions > 0
          ? n(r.raw.completedSessions) +
            ' / ' +
            n(r.raw.startedSessions) +
            ' ' +
            (ar ? 'جلسات استبيان بدأت ثم اكتملت' : 'started survey sessions completed')
          : missing
            ? ar
              ? 'لا تتوفر بيانات لهذا المؤشر خلال الفترة'
              : 'This metric is unavailable for this period'
            : ar
              ? 'حسب الفرع والفترة المحددين'
              : 'Selected branch and date range'}
      </p>
    </>
  );
}
export function ScopeTrend({ children }) {
  const { ar, n, pct, r, f, dashboard, isMobile } = useScope();
  if (!dashboard.isFiltered && !isMobile) return children;
  if (!r?.total)
    return (
      <Empty
        title={ar ? 'لا توجد ردود في هذه الفترة' : 'No responses in this period'}
        body={ar ? 'جرّب فرعًا أو فترة أخرى.' : 'Try another branch or date range.'}
      />
    );
  const W = isMobile ? 320 : 676,
    barWidth = Math.min(
      isMobile ? 32 : 58,
      ((isMobile ? 225 : 510) / Math.max(1, r.periods.length)) * 0.7,
    );
  const p = r.periods,
    max = Math.max(1, ...p.map((v) => v.total)),
    ceiling = Math.max(10, Math.ceil(max / 100) * 100),
    x = (i) => (isMobile ? 45 : 75) + i * ((isMobile ? 225 : 510) / Math.max(1, p.length - 1)),
    y = (v) => 145 - (v / 100) * 120,
    line = p
      .map((v, i) =>
        v.positivePercent === null
          ? ''
          : (i && p[i - 1].positivePercent !== null ? 'L' : 'M') +
            x(i) +
            ' ' +
            y(v.positivePercent),
      )
      .join(' '),
    short = (d) =>
      new Date(d + 'T12:00:00').toLocaleDateString(ar ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
      });
  return (
    <svg
      className="scope-trend"
      viewBox={'0 0 ' + W + ' 190'}
      role="img"
      aria-label={
        (ar ? 'اتجاهات الردود والانطباعات' : 'Response and sentiment trends') +
        ' · ' +
        overviewDateLabel(f, ar ? 'ar' : 'en')
      }
    >
      <title>{n(r.total) + ' ' + (ar ? 'ردود' : 'responses')}</title>
      {[0, 0.5, 1].map((k) => (
        <g key={k}>
          <line
            x1={isMobile ? 24 : 38}
            x2={isMobile ? 290 : 622}
            y1={145 - k * 120}
            y2={145 - k * 120}
            stroke="#edf1f7"
          />
          <text x={isMobile ? 20 : 30} y={149 - k * 120} textAnchor="end">
            {n(ceiling * k)}
          </text>
          <text x={isMobile ? 294 : 635} y={149 - k * 120}>
            {pct(k * 100)}
          </text>
        </g>
      ))}
      {p.map((v, i) => {
        const h = (v.total / ceiling) * 120;
        return (
          <g key={v.start}>
            <rect
              x={x(i) - barWidth / 2}
              y={145 - h}
              width={barWidth}
              height={h}
              fill="#eaf2ff"
              rx="4"
            />
            <path
              d={'M' + (x(i) - barWidth / 2) + ' ' + (145 - h) + 'h' + barWidth}
              stroke="#1e68ef"
              strokeWidth="2"
            />
            <text
              x={x(i)}
              y={Math.max(12, 137 - h)}
              textAnchor="middle"
              className="scope-bar-count"
            >
              {n(v.total)}
            </text>
            <text x={x(i)} y="171" textAnchor="middle">
              {short(v.start)}
            </text>
          </g>
        );
      })}
      <path d={line} fill="none" stroke="#218269" strokeWidth="2.5" />
      {p.map(
        (v, i) =>
          v.positivePercent !== null && (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v.positivePercent)}
              r="3"
              stroke="#218269"
              strokeWidth="2"
              fill="#fff"
            />
          ),
      )}
    </svg>
  );
}
export function ScopeSentiment({ children }) {
  const { ar, n, pct, r, tr, dashboard } = useScope();
  if (!dashboard.isFiltered) return children;
  const analyzed = dashboard.connected ? r.analyzed : r.total;
  if (dashboard.connected && !analyzed)
    return (
      <Empty
        title={ar ? 'لا يوجد تحليل للمشاعر بعد' : 'No analyzed sentiment yet'}
        body={
          ar
            ? 'تظهر المشاعر بعد اكتمال تحليل الردود بنموذج جاهز.'
            : 'Sentiment appears after a ready model completes response analysis.'
        }
      />
    );
  const tones = ['Positive', 'Neutral', 'Negative', 'Mixed'].filter(
      (t) => t !== 'Mixed' || r.mixed,
    ),
    circ = 2 * Math.PI * 63;
  let offset = 0;
  return (
    <>
      <Heading title={tr('How customers feel')} subtitle={n(analyzed) + ' ' + tr('responses')} />
      <div className="scope-sentiment">
        <svg
          viewBox="0 0 160 160"
          className="scope-donut"
          role="img"
          aria-label={tr('Positive sentiment') + ': ' + pct(r.positivePercent)}
        >
          <circle cx="80" cy="80" r="63" fill="none" stroke="#edf1f7" strokeWidth="17" />
          {tones.map((t) => {
            const share = analyzed ? r[t.toLowerCase()] / analyzed : 0,
              from = offset;
            offset += share;
            return (
              <circle
                key={t}
                cx="80"
                cy="80"
                r="63"
                fill="none"
                stroke={colors[t]}
                strokeWidth="17"
                strokeDasharray={`${share * circ} ${circ}`}
                strokeDashoffset={-from * circ}
                transform="rotate(-90 80 80)"
              />
            );
          })}
          <text x="80" y="79" textAnchor="middle" className="scope-donut-value">
            {pct(r.positivePercent)}
          </text>
          <text x="80" y="99" textAnchor="middle">
            {tr('Positive')}
          </text>
        </svg>
        <div className="scope-sentiment-legend">
          {tones.map((t) => (
            <div key={t}>
              <i style={{ background: colors[t] }} />
              <span>
                {tr(t)}
                <small>
                  {n(r[t.toLowerCase()])} {tr('responses')}
                </small>
              </span>
              <b>{pct(analyzed ? (100 * r[t.toLowerCase()]) / analyzed : null)}</b>
            </div>
          ))}
        </div>
      </div>
      <p className="scope-note">
        {r.total
          ? ar
            ? 'توزيع الردود في الفرع والفترة المحددين'
            : 'Distribution for the selected branch and period'
          : ar
            ? 'لا توجد ردود ضمن هذا الاختيار.'
            : 'No responses for this selection.'}
      </p>
    </>
  );
}
