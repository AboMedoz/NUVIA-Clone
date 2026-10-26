import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProductView } from './ProductContext.jsx';
import { buildSearchIndex, searchIndex } from './search-index.js';
import './global-search.css';
import { productApi } from '../../product/api.js';
const emptyItems = [];
export default function GlobalSearch() {
  const { connected, workspace, dashboard, workspaceQuery, setWorkspaceQuery, language } =
    useProductView();
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState({}),
    popup = useRef(null);
  const [remote, setRemote] = useState({
    items: [],
    query: '',
    scope: '',
    loading: false,
    error: false,
  });
  const [composing, setComposing] = useState(false),
    [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const query = workspaceQuery.trim().slice(0, 200);
  const branchId =
    dashboard?.filters?.branch && dashboard.filters.branch !== 'all'
      ? dashboard.filters.branch
      : undefined;
  const scope = JSON.stringify([
    workspace?.id,
    workspace?.role,
    workspace?.allowedBranchIds,
    branchId,
  ]);
  useEffect(() => {
    const input = document.querySelector('[data-workspace-search]');
    if (!input) return;
    input.maxLength = 200;
    const start = () => setComposing(true),
      end = () => setComposing(false);
    input.addEventListener('compositionstart', start);
    input.addEventListener('compositionend', end);
    return () => {
      input.removeEventListener('compositionstart', start);
      input.removeEventListener('compositionend', end);
    };
  }, []);
  useEffect(() => {
    const current = ++generation.current,
      controller = new AbortController();
    setRemote({
      items: [],
      query,
      scope,
      loading: Boolean(connected && query && !composing),
      error: false,
    });
    if (!connected || !query || composing) return () => controller.abort();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, ...(branchId ? { branchId } : {}) });
      productApi.get('/search?' + params, controller.signal).then(
        (data) => {
          if (current === generation.current && !controller.signal.aborted)
            setRemote({ items: data.results || [], query, scope, loading: false, error: false });
        },
        (error) => {
          if (
            current === generation.current &&
            !controller.signal.aborted &&
            error.name !== 'AbortError'
          )
            setRemote({ items: [], query, scope, loading: false, error: true });
        },
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [connected, query, scope, branchId, composing, retry]);
  const ar = language === 'ar';
  const localResults = useMemo(
    () =>
      searchIndex(
        connected
          ? buildSearchIndex(language).filter(
              (entry) =>
                (!entry.id.startsWith('report-') &&
                  !entry.id.startsWith('feedback-') &&
                  !entry.id.startsWith('survey-')) ||
                entry.path === '#/survey-all' ||
                entry.path === '#/survey-create' ||
                entry.path === '#/survey-ai',
            )
          : buildSearchIndex(language, localStorage),
        workspaceQuery,
      ),
    [connected, workspaceQuery, language],
  );
  const currentRemote =
    remote.query === query && remote.scope === scope
      ? remote
      : { items: [], loading: Boolean(connected && query), error: false };
  const remoteItems = remote.query === query && remote.scope === scope ? remote.items : emptyItems;
  const results = useMemo(
    () =>
      [
        ...remoteItems.map((item) => ({
          ...item,
          section: ar
            ? { Feedbacks: 'آراء العملاء', Surveys: 'الاستبيانات', Reports: 'التقارير' }[
                item.section
              ] || item.section
            : item.section,
        })),
        ...localResults,
      ]
        .filter(
          (item, index, items) => items.findIndex((other) => other.path === item.path) === index,
        )
        .slice(0, 12),
    [remoteItems, ar, localResults],
  );
  const choose = useCallback(
    (result) => {
      setOpen(false);
      setWorkspaceQuery('');
      location.hash = result.path.slice(1);
    },
    [setWorkspaceQuery],
  );
  useEffect(() => {
    setOpen(!!workspaceQuery.trim());
    setActive(0);
  }, [workspaceQuery]);
  useEffect(() => {
    const input = document.querySelector('[data-workspace-search]');
    if (!input) return;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', String(open));
    input.setAttribute('aria-controls', 'workspace-search-results');
    if (open && results[active])
      input.setAttribute('aria-activedescendant', 'workspace-search-option-' + active);
    else input.removeAttribute('aria-activedescendant');
    const place = () => {
      const box = input.closest('[data-name="Search"]').getBoundingClientRect(),
        width = Math.min(460, innerWidth - 24);
      setPosition({
        top: box.bottom + 8,
        left: Math.max(12, Math.min(box.left, innerWidth - width - 12)),
        width,
        maxHeight: Math.max(120, innerHeight - box.bottom - 28),
      });
    };
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        setOpen(!!workspaceQuery.trim());
        return;
      }
      if (e.target !== input || e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(!!workspaceQuery.trim());
        setActive((value) =>
          results.length
            ? (value + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
            : 0,
        );
      }
      if (e.key === 'Enter' && open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      } else if (e.key === 'Enter' && connected && workspaceQuery.trim()) {
        e.preventDefault();
        setOpen(false);
        location.hash = '/feedbacks?search=' + encodeURIComponent(workspaceQuery.trim());
      }
    };
    const outside = (e) => {
      if (
        !input.closest('[data-name="Search"]').contains(e.target) &&
        !popup.current?.contains(e.target)
      )
        setOpen(false);
    };
    const focus = () => setOpen(!!workspaceQuery.trim());
    place();
    input.addEventListener('focus', focus);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => {
      input.removeEventListener('focus', focus);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      removeEventListener('resize', place);
      removeEventListener('scroll', place, true);
    };
  }, [open, workspaceQuery, active, language, results, choose, connected]);
  return open && workspaceQuery.trim()
    ? createPortal(
        <section
          className="workspace-search-popup"
          ref={popup}
          style={position}
          dir={ar ? 'rtl' : 'ltr'}
        >
          <p className="workspace-search-caption">
            {ar ? 'نتائج من صفحات مساحة العمل' : 'Results across your workspace'}
          </p>
          {connected && currentRemote.loading && (
            <p className="workspace-search-empty" role="status">
              {ar ? 'جارٍ البحث في البيانات المحفوظة…' : 'Searching saved data…'}
            </p>
          )}
          {connected && currentRemote.error && (
            <p className="workspace-search-empty" role="alert">
              {ar ? 'تعذر البحث في البيانات المحفوظة.' : 'Could not search saved data.'}{' '}
              <button type="button" onClick={() => setRetry((value) => value + 1)}>
                {ar ? 'إعادة المحاولة' : 'Retry'}
              </button>
            </p>
          )}
          <div
            role="listbox"
            id="workspace-search-results"
            aria-label={ar ? 'نتائج البحث' : 'Search results'}
          >
            {results.map((result, index) => (
              <button
                type="button"
                role="option"
                id={'workspace-search-option-' + index}
                aria-selected={active === index}
                key={result.id}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
              >
                <strong dir="auto">{result.title}</strong>
                <small>
                  {result.section}
                  {result.description ? ' · ' + result.description : ''}
                </small>
              </button>
            ))}
          </div>
          {!results.length && !currentRemote.loading && !currentRemote.error && (
            <p className="workspace-search-empty" role="status">
              {ar
                ? 'لا توجد نتائج مطابقة. جرّبي كلمة أخرى.'
                : 'No matching results. Try another word.'}
            </p>
          )}
        </section>,
        document.body,
      )
    : null;
}
