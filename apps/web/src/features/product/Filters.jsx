import React from 'react';
import { useResource } from './useResource.js';
export default function Filters({ filters, setFilters, workspace, language }) {
  const surveys = useResource('/surveys');
  const segmentQuestions = (surveys.data?.surveys || []).flatMap((s) =>
    s.questions.filter((q) => q.segment).map((q) => ({ ...q, surveyTitle: s.title })),
  );
  const ar = language === 'ar',
    t = (a, b) => (ar ? b : a),
    update = (key, value) => setFilters((old) => ({ ...old, [key]: value, page: 1 }));
  return (
    <section className="product-card product-filter-card" aria-label={t('Filters', 'الفلاتر')}>
      <div className="product-heading">
        <h2>{t('Filters', 'الفلاتر')}</h2>
        <button onClick={() => setFilters({})}>{t('Clear filters', 'مسح الفلاتر')}</button>
      </div>
      <div className="product-filters">
        <label>
          {t('From', 'من')}
          <input
            type="date"
            value={filters.from || ''}
            onChange={(e) => update('from', e.target.value)}
          />
        </label>
        <label>
          {t('To', 'إلى')}
          <input
            type="date"
            value={filters.to || ''}
            min={filters.from}
            onChange={(e) => update('to', e.target.value)}
          />
        </label>
        <label>
          {t('Branch', 'الفرع')}
          <select
            value={filters.branchId || ''}
            onChange={(e) => update('branchId', e.target.value)}
          >
            <option value="">{t('All branches', 'كل الفروع')}</option>
            {workspace?.branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Language', 'اللغة')}
          <select
            value={filters.language || ''}
            onChange={(e) => update('language', e.target.value)}
          >
            <option value="">{t('All languages', 'كل اللغات')}</option>
            <option value="ar">العربية</option>
            <option value="en">English</option>
            <option value="mixed">{t('Mixed language', 'لغة مختلطة')}</option>
            <option value="unknown">{t('Unknown language', 'لغة غير محددة')}</option>
          </select>
        </label>
        <label>
          {t('Sentiment', 'المشاعر')}
          <select
            value={filters.sentiment || ''}
            onChange={(e) => update('sentiment', e.target.value)}
          >
            <option value="">{t('All sentiments', 'كل المشاعر')}</option>
            {[
              ['positive', t('Positive', 'إيجابي')],
              ['negative', t('Negative', 'سلبي')],
              ['neutral', t('Neutral', 'محايد')],
              ['mixed', t('Mixed', 'مختلط')],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Aspect', 'الجانب')}
          <input
            value={filters.aspect || ''}
            onChange={(e) => update('aspect', e.target.value)}
            placeholder={t('All aspects', 'كل الجوانب')}
          />
        </label>
      </div>
      <details
        className="product-advanced-filters"
        open={filters.surveyId || filters.segmentKey || filters.interval ? true : undefined}
      >
        <summary>
          {t('More filters', 'فلاتر إضافية')}
          {filters.surveyId || filters.segmentKey || filters.interval
            ? t(' · Active', ' · نشطة')
            : ''}
        </summary>
        <div className="product-filters">
          <label>
            {t('Survey', 'الاستبيان')}
            <select
              value={filters.surveyId || ''}
              onChange={(e) => update('surveyId', e.target.value)}
            >
              <option value="">{t('All surveys', 'كل الاستبيانات')}</option>
              {(surveys.data?.surveys || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Customer segment', 'شريحة العملاء')}
            <select
              value={filters.segmentKey || ''}
              onChange={(e) =>
                setFilters((old) => ({
                  ...old,
                  segmentKey: e.target.value,
                  segmentValue: '',
                  page: 1,
                }))
              }
            >
              <option value="">{t('All segments', 'كل الشرائح')}</option>
              {segmentQuestions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.surveyTitle} · {q.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Group by', 'التجميع حسب')}
            <select
              value={filters.interval || 'day'}
              onChange={(e) => update('interval', e.target.value)}
            >
              <option value="day">{t('Day', 'اليوم')}</option>
              <option value="week">{t('Week', 'الأسبوع')}</option>
              <option value="month">{t('Month', 'الشهر')}</option>
            </select>
          </label>
          <label>
            {t('Segment value', 'قيمة الشريحة')}
            <input
              disabled={!filters.segmentKey}
              type={
                ['rating', 'nps'].includes(
                  segmentQuestions.find((q) => q.id === filters.segmentKey)?.type,
                )
                  ? 'number'
                  : 'text'
              }
              value={filters.segmentValue ?? ''}
              onChange={(e) =>
                update(
                  'segmentValue',
                  e.target.type === 'number' && e.target.value !== ''
                    ? Number(e.target.value)
                    : e.target.value,
                )
              }
            />
          </label>
        </div>
        <small>
          {t(
            'Dates follow the workspace reporting timezone: ',
            'التواريخ حسب المنطقة الزمنية للنشاط: ',
          )}
          {workspace?.reportingTimezone || 'UTC'}
        </small>
      </details>
    </section>
  );
}
