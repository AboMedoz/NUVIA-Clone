import React from 'react';
const colors = ['#1e68ef', '#b54750', '#557b9d', '#8f70b9', '#087f70', '#b76e18'];
const labels = {
  positive: ['Positive', 'إيجابي'],
  negative: ['Negative', 'سلبي'],
  neutral: ['Neutral', 'محايد'],
  mixed: ['Mixed', 'مختلط'],
};
export function AspectScoreChart({ rows = [], language }) {
  const data = rows.filter((row) => Number.isFinite(row.score)),
    ar = language === 'ar';
  if (!data.length) return null;
  return (
    <figure
      className="aspect-score-chart"
      role="img"
      aria-label={ar ? 'تقييم الجوانب من ١٠' : 'Aspect scores out of 10'}
    >
      {data.map((row) => (
        <div className="aspect-chart-row" key={row.aspect}>
          <div>
            <strong>{row.aspect}</strong>
            <span>{row.score} / 10</span>
          </div>
          <div className="aspect-chart-track">
            <span style={{ width: Math.max(0, Math.min(100, row.score * 10)) + '%' }} />
          </div>
          <small>
            {row.mentions} {ar ? 'إشارات' : 'mentions'}
            {row.lowSample ? ' · ' + (ar ? 'عينة صغيرة' : 'small sample') : ''}
          </small>
        </div>
      ))}
    </figure>
  );
}
export function SentimentChart({ distribution = {}, language }) {
  const ar = language === 'ar',
    rows = Object.entries(distribution).filter(([, value]) => Number.isFinite(value) && value > 0),
    total = rows.reduce((n, [, value]) => n + value, 0);
  let position = 0;
  if (!total) return null;
  const stops = rows
    .map(([, value], index) => {
      const start = position;
      position += (value / total) * 100;
      return `${colors[index % colors.length]} ${start}% ${position}%`;
    })
    .join(',');
  return (
    <figure
      className="sentiment-chart"
      role="img"
      aria-label={
        ar ? 'توزيع المشاعر للردود المحللة' : 'Sentiment distribution for analyzed responses'
      }
    >
      <div className="sentiment-donut" style={{ background: `conic-gradient(${stops})` }}>
        <div>
          <strong>{total.toLocaleString(language)}</strong>
          <span>{ar ? 'ردود محللة' : 'analyzed responses'}</span>
        </div>
      </div>
      <figcaption>
        {rows.map(([label, value], index) => (
          <div key={label}>
            <i style={{ background: colors[index % colors.length] }} />
            <span>{labels[label]?.[ar ? 1 : 0] || label}</span>
            <strong>{((value / total) * 100).toFixed(1)}%</strong>
            <small>{value.toLocaleString(language)}</small>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
function adjacentPeriod(previous, current, interval) {
  if (!previous || !current) return false;
  if (interval === 'month') {
    const [year, month] = previous.split('-').map(Number),
      [nextYear, nextMonth] = current.split('-').map(Number);
    return nextYear * 12 + nextMonth === year * 12 + month + 1;
  }
  const elapsed =
    Date.parse(current.slice(0, 10) + 'T00:00:00Z') -
    Date.parse(previous.slice(0, 10) + 'T00:00:00Z');
  return elapsed === (interval === 'week' ? 7 : 1) * 86400000;
}
export function TrendChart({ rows = [], language, interval = 'day' }) {
  const ar = language === 'ar',
    aspects = [
      ...new Set(
        rows.flatMap((row) =>
          (row.aspectScores || []).filter((a) => Number.isFinite(a.score)).map((a) => a.aspect),
        ),
      ),
    ],
    width = 640,
    height = 270,
    left = 35,
    right = 20,
    top = 18,
    bottom = 45;
  if (!rows.length || !aspects.length) return null;
  const periodPosition = (date) =>
    interval === 'month'
      ? Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
      : Date.parse(date.slice(0, 10) + 'T00:00:00Z') / 86400000;
  const start = periodPosition(rows[0].date),
    span = Math.max(periodPosition(rows.at(-1).date) - start, 1);
  const x = (index) =>
      left + ((periodPosition(rows[index].date) - start) / span) * (width - left - right),
    y = (score) => top + (1 - score / 10) * (height - top - bottom);
  return (
    <figure className="trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ar ? 'تقييم الجوانب بمرور الوقت من ١٠' : 'Aspect scores over time out of 10'}
      >
        {[0, 5, 10].map((score) => (
          <g key={score}>
            <line x1={left} x2={width - right} y1={y(score)} y2={y(score)} stroke="#dfe7f2" />
            <text x={left - 10} y={y(score) + 4} textAnchor="end">
              {score}
            </text>
          </g>
        ))}
        {aspects.map((aspect, index) => {
          let active = false;
          const d = rows
            .map((row, i) => {
              const value = row.aspectScores?.find((a) => a.aspect === aspect)?.score;
              if (!Number.isFinite(value)) {
                active = false;
                return '';
              }
              const command =
                active && adjacentPeriod(rows[i - 1]?.date, row.date, interval) ? 'L' : 'M';
              active = true;
              return `${command}${x(i)},${y(value)}`;
            })
            .join(' ');
          return (
            <g key={aspect}>
              <path
                data-aspect={aspect}
                d={d}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="2.5"
              />
              {rows.map((row, i) => {
                const score = row.aspectScores?.find((a) => a.aspect === aspect)?.score;
                return Number.isFinite(score) ? (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(score)}
                    r="4"
                    fill={colors[index % colors.length]}
                  >
                    <title>
                      {row.date}: {aspect} {score}/10
                    </title>
                  </circle>
                ) : null;
              })}
            </g>
          );
        })}
        {rows
          .filter((_, i) => i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2))
          .map((row) => (
            <text
              key={row.date}
              x={x(rows.indexOf(row))}
              y={height - 15}
              textAnchor={
                rows.indexOf(row) === 0
                  ? 'start'
                  : rows.indexOf(row) === rows.length - 1
                    ? 'end'
                    : 'middle'
              }
            >
              {row.date}
            </text>
          ))}
      </svg>
      <figcaption>
        {aspects.map((aspect, index) => (
          <span key={aspect}>
            <i style={{ background: colors[index % colors.length] }} />
            {aspect}
          </span>
        ))}
      </figcaption>
      <p>
        {ar
          ? 'الفجوات تعني عدم وجود تقييم في تلك الفترة. التفاصيل في الجدول أدناه.'
          : 'Gaps indicate periods without a score. Exact values appear in the table below.'}
      </p>
    </figure>
  );
}
