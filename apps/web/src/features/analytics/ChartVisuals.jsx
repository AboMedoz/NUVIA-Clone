import React from 'react';
const colors = ['#1e68ef', '#b54750', '#557b9d', '#8f70b9', '#087f70', '#b76e18'];
const sentimentColors = {
  positive: '#1e68ef',
  neutral: '#a7bfe2',
  negative: '#b54750',
  mixed: '#8f70b9',
};
const labels = {
  positive: ['Positive', 'إيجابي'],
  negative: ['Negative', 'سلبي'],
  neutral: ['Neutral', 'محايد'],
  mixed: ['Mixed', 'مختلط'],
};
function periodLabel(value, language, interval) {
  // Period keys already use the workspace calendar: format without shifting the date.
  const date = new Date(
    `${value.slice(0, interval === 'month' ? 7 : 10)}${interval === 'month' ? '-01' : ''}T00:00:00Z`,
  );
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', {
    calendar: 'gregory',
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    ...(interval === 'month' ? {} : { day: 'numeric' }),
  }).format(date);
}
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
    rows = Object.keys(sentimentColors).map((label) => [
      label,
      Number.isFinite(distribution[label]) ? Math.max(0, distribution[label]) : 0,
    ]),
    total = rows.reduce((n, [, value]) => n + value, 0);
  let position = 0;
  if (!total) return null;
  const stops = rows
    .map(([label, value]) => {
      const start = position;
      position += (value / total) * 100;
      return `${sentimentColors[label]} ${start}% ${position}%`;
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
        {rows.map(([label, value]) => (
          <div key={label}>
            <i style={{ background: sentimentColors[label] }} />
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
export function ResponseTrendChart({ rows = [], language, interval = 'day' }) {
  const ar = language === 'ar';
  if (!rows.length) return null;
  const width = 640,
    height = 210,
    left = 34,
    right = 45,
    bottom = 38,
    top = 20;
  const maximum = Math.max(1, ...rows.map((row) => row.totalResponses || 0));
  const dateValue = (date) =>
    interval === 'month'
      ? Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
      : Date.parse(date.slice(0, 10) + 'T00:00:00Z') / 86400000;
  const start = dateValue(rows[0].date),
    span = Math.max(1, dateValue(rows.at(-1).date) - start);
  const x = (index) =>
    rows.length === 1
      ? width / 2
      : left + 28 + ((dateValue(rows[index].date) - start) / span) * (width - left - right - 56);
  const y = (value) => top + (1 - value) * (height - top - bottom);
  const barWidth = Math.max(3, Math.min(52, (width - left - right) / (rows.length * 2)));
  const positive = rows.map((row) => {
    const total = Object.values(row.sentimentDistribution || {}).reduce(
      (sum, value) => sum + value,
      0,
    );
    return total ? (row.sentimentDistribution.positive || 0) / total : null;
  });
  let active = false;
  const line = rows
    .map((row, index) => {
      if (positive[index] === null) {
        active = false;
        return '';
      }
      const command =
        active && adjacentPeriod(rows[index - 1]?.date, row.date, interval) ? 'L' : 'M';
      active = true;
      return `${command}${x(index)},${y(positive[index])}`;
    })
    .join(' ');
  return (
    <figure className="response-trend-chart">
      <figcaption>
        <span>
          <i />
          {ar ? 'الردود' : 'Responses'}
        </span>
        <span>
          <i />
          {ar ? 'نسبة المشاعر الإيجابية' : 'Positive sentiment'}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          ar
            ? 'عدد الردود ونسبة المشاعر الإيجابية عبر الزمن'
            : 'Response count and positive sentiment over time'
        }
      >
        {[0, 0.5, 1].map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#edf1f7" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end">
              {Math.round(maximum * value).toLocaleString(language)}
            </text>
            <text x={width - right + 8} y={y(value) + 4}>
              {(value * 100).toLocaleString(language)}%
            </text>
          </g>
        ))}
        {rows.map((row, index) => (
          <g key={row.date}>
            <rect
              x={x(index) - barWidth / 2}
              y={y((row.totalResponses || 0) / maximum)}
              width={barWidth}
              height={y(0) - y((row.totalResponses || 0) / maximum)}
              fill="#eaf2ff"
              rx="2"
            >
              <title>
                {periodLabel(row.date, language, interval)}: {row.totalResponses}{' '}
                {ar ? 'ردود' : 'responses'}
              </title>
            </rect>
            <line
              x1={x(index) - barWidth / 2}
              x2={x(index) + barWidth / 2}
              y1={y((row.totalResponses || 0) / maximum)}
              y2={y((row.totalResponses || 0) / maximum)}
              stroke="#1e68ef"
              strokeWidth="2.5"
            />
            {rows.length <= 8 && (
              <text x={x(index)} y={y((row.totalResponses || 0) / maximum) - 7} textAnchor="middle">
                {row.totalResponses}
              </text>
            )}
          </g>
        ))}
        <path
          d={line}
          fill="none"
          stroke="#218269"
          strokeWidth="2.5"
          data-series="positive-sentiment"
        />
        {rows.map(
          (row, index) =>
            positive[index] !== null && (
              <circle key={row.date} cx={x(index)} cy={y(positive[index])} r="3.5" fill="#218269">
                <title>
                  {periodLabel(row.date, language, interval)}: {(positive[index] * 100).toFixed(1)}%{' '}
                  {ar ? 'إيجابي' : 'positive'}
                </title>
              </circle>
            ),
        )}
        {rows
          .filter(
            (_, index) =>
              rows.length <= 4 ||
              index === 0 ||
              index === rows.length - 1 ||
              index === Math.floor(rows.length / 2),
          )
          .map((row) => (
            <text key={row.date} x={x(rows.indexOf(row))} y={height - 12} textAnchor="middle">
              {periodLabel(row.date, language, interval)}
            </text>
          ))}
      </svg>
    </figure>
  );
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
                      {periodLabel(row.date, language, interval)}: {aspect} {score}/10
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
              {periodLabel(row.date, language, interval)}
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
