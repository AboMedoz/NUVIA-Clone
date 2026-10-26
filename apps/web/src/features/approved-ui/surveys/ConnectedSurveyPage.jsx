import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { productApi } from '../../product/api.js';
import { useMutation, useResource } from '../../product/useResource.js';
import { canManage } from '../../product/product-state.js';
import { ProductProvider } from '../product/ProductContext.jsx';
import FeedbackShell from '../product/FeedbackShell.jsx';
import useWorkspaceScale from '../product/useWorkspaceScale.js';
import { SurveyRuntimeContext } from './SurveyRuntimeContext.js';
import { SurveyEditorContext, SurveySelectionContext } from './SurveyPrimitives.jsx';
import {
  addEditorQuestion,
  copyEditorQuestion,
  removeEditorQuestion,
  createStartingQuestions,
  updateEditorQuestion,
  moveEditorQuestion,
} from './survey-editor.js';
import { toSurveyInput, fromSurvey } from './survey-contract.js';
import All from './all.jsx';
import Create from './create.jsx';
import Questions from './questions.jsx';
import Share from './share.jsx';
import AI from './ai.jsx';
import AIReview from './ai-review.jsx';
import arabic from '../product/ar.json';
import ChoiceMenu from '../components/ChoiceMenu.jsx';
import './figma-surveys.css';
import './surveys.css';
const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const freshDraft = () => ({
  title: '',
  description: '',
  anonymous: true,
  questions: createStartingQuestions('scratch'),
});
export default function ConnectedSurveyPage({ page, language, setLanguage }) {
  const auth = useAuth(),
    workspace = auth.workspace,
    editable = canManage(workspace),
    ar = language === 'ar';
  useWorkspaceScale();
  const t = (en, arabicText) => (ar ? arabicText : en),
    tr = (text) => (ar ? arabic[text] || text : text);
  const kind =
    page === 'surveys' ? 'all' : page === 'survey-builder' ? 'create' : page.replace('survey-', '');
  const params = new URLSearchParams(location.hash.split('?')[1]),
    id = params.get('id') || params.get('selected');
  const storeKey = 'nuvia-draft:' + auth.user.id + ':' + workspace.id;
  const [draft, setDraft] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storeKey)) || freshDraft();
    } catch {
      return freshDraft();
    }
  });
  const [loadedId, setLoadedId] = useState(null),
    [survey, setSurvey] = useState(null),
    [question, setQuestion] = useState(1),
    [editorLanguage, setEditorLanguage] = useState(
      draft.editorLanguage || draft.locale || language,
    ),
    [enabledLanguages, setEnabledLanguages] = useState(draft.enabledLanguages || ['en', 'ar']),
    [menu, setMenu] = useState(false),
    [notice, setNotice] = useState(''),
    [query, setQuery] = useState(''),
    [order, setOrder] = useState('newest'),
    [selected, setSelected] = useState(new Set()),
    [branchIds, setBranchIds] = useState(() =>
      workspace.branches.filter((b) => !b.archivedAt).map((b) => b.id),
    ),
    [branchFilter, setBranchFilter] = useState('all'),
    [preview, setPreview] = useState(false),
    [goal, setGoal] = useState(''),
    [qr, setQr] = useState(''),
    [suggestions, setSuggestions] = useState(draft.generatedQuestions || null);
  const resource = useResource('/surveys'),
    summary = useResource('/analytics'),
    detail = useResource(id ? '/surveys/' + encodeURIComponent(id) : null),
    mutation = useMutation(),
    generator = useMutation();
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
  }, [kind, goal, editorLanguage]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => setNotice(''), [kind]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    sessionStorage.setItem(storeKey, JSON.stringify(draft));
  }, [draft, storeKey]);
  useEffect(() => {
    if (detail.data?.survey && loadedId !== detail.data.survey.id) {
      setSurvey(detail.data.survey);
      const keepLocal =
        draft.id === detail.data.survey.id && draft.revision >= detail.data.survey.revision;
      if (!keepLocal) setDraft(fromSurvey(detail.data.survey));
      setLoadedId(detail.data.survey.id);
      if (!keepLocal) {
        setEnabledLanguages(detail.data.survey.enabledLanguages || ['en', 'ar']);
        setEditorLanguage(detail.data.survey.locale);
      }
    }
  }, [detail.data, loadedId, draft.id, draft.revision]);
  useEffect(() => {
    if (!enabledLanguages.includes(editorLanguage)) {
      setEditorLanguage(enabledLanguages[0]);
      return;
    }
    setDraft((old) => ({ ...old, editorLanguage, enabledLanguages }));
  }, [editorLanguage, enabledLanguages]);
  const all = resource.data?.surveys || [];
  const status = { live: 'published', drafts: 'draft', paused: 'paused', closed: 'closed' }[kind];
  const visible = all
    .filter(
      (s) =>
        (!status || s.status === status) &&
        (!query || s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
        (branchFilter === 'all' || s.links.some((l) => l.branchId === branchFilter)),
    )
    .sort(
      (a, b) => (order === 'newest' ? -1 : 1) * (new Date(a.updatedAt) - new Date(b.updatedAt)),
    );
  const activeLink = survey?.links?.find((l) => l.enabled),
    link = activeLink?.url || '';
  useEffect(() => {
    let current = true;
    if (!link) {
      setQr('');
      return;
    }
    QRCode.toDataURL(link + '?channel=qr', { width: 1024, margin: 2 }).then((value) => {
      if (current) setQr(value);
    });
    return () => {
      current = false;
    };
  }, [link]);
  const go = (next, surveyId = draft.id) => {
    location.hash = '/survey-' + next + (surveyId ? '?id=' + encodeURIComponent(surveyId) : '');
  };
  const updateQuestion = (key, patch) => {
    if (!editable) return;
    setNotice('');
    setDraft((old) => ({ ...old, questions: updateEditorQuestion(old.questions, key, patch) }));
  };
  const requireTitle = () => {
    if (draft.title.trim()) return true;
    setNotice(t('Add a survey name.', 'أضف اسم الاستبيان.'));
    document.querySelector('[data-node-id="259:4683"] input')?.focus();
    return false;
  };
  async function saveDraft(next) {
    if (!editable || mutation.busy) return null;
    let body;
    try {
      body = toSurveyInput(draft, enabledLanguages[0] || language);
    } catch {
      setNotice(t('Complete the survey details and questions.', 'أكمل بيانات الاستبيان والأسئلة.'));
      return null;
    }
    if (!body.title || !body.questions.length || body.questions.some((q) => !q.label)) {
      setNotice(t('Add a survey name and question text.', 'أضف اسم الاستبيان ونصوص الأسئلة.'));
      return null;
    }
    const result = await mutation.run((signal) =>
      productApi.send(
        '/surveys' + (draft.id ? '/' + draft.id : ''),
        { ...body, ...(draft.id ? { revision: draft.revision } : {}) },
        draft.id ? 'PATCH' : 'POST',
        signal,
      ),
    );
    if (!result?.survey) return null;
    setSurvey(result.survey);
    setDraft(fromSurvey(result.survey));
    setLoadedId(result.survey.id);
    resource.reload();
    setNotice(t('Draft saved', 'تم حفظ المسودة'));
    if (next) go(next, result.survey.id);
    return result.survey;
  }
  async function publish() {
    const saved = await saveDraft();
    if (!saved) return;
    const result = await mutation.run((signal) =>
      productApi.send('/surveys/' + saved.id + '/publish', { branchIds }, 'POST', signal),
    );
    if (result?.survey) {
      setSurvey(result.survey);
      setNotice(t('Survey published', 'تم نشر الاستبيان'));
      resource.reload();
      go('share', saved.id);
    }
  }
  async function mutateSurvey(item, action) {
    if (!editable) return false;
    const result = await mutation.run((signal) =>
      productApi.send('/surveys/' + item.id + '/' + action, {}, 'POST', signal),
    );
    if (!result) return false;
    resource.reload();
    if (result.survey && item.id === survey?.id) setSurvey(result.survey);
    return true;
  }
  const rowAction = (item, action) => {
    if (action === 'View results') {
      location.hash = '/feedbacks?surveyId=' + item.id;
      return;
    }
    setSurvey(item);
    setDraft(fromSurvey(item));
    setLoadedId(item.id);
    go(/Share|QR/.test(action) ? 'share' : 'questions', item.id);
  };
  async function generate() {
    if (generator.busy) return;
    if (!goal.trim()) {
      setNotice(t('Add a survey goal.', 'أضف هدف الاستبيان.'));
      document.querySelector('[aria-label="' + t('Survey goal', 'هدف الاستبيان') + '"]')?.focus();
      return;
    }
    const current = ++generation.current;
    const result = await generator.run((signal) =>
      productApi.send(
        '/surveys/suggest',
        { businessType: workspace.industry, goal: goal.trim(), locale: editorLanguage },
        'POST',
        signal,
      ),
    );
    if (current !== generation.current) return;
    if (result?.status === 'succeeded') {
      setSuggestions(result.suggestions);
      setDraft((old) => ({ ...old, generatedQuestions: result.suggestions, generatedGoal: goal }));
      go('ai-review');
    } else if (result)
      setNotice(
        result.status === 'failed'
          ? t('Survey generation failed. Please retry.', 'فشل إنشاء الأسئلة. حاول مرة أخرى.')
          : t(
              'Survey generation is waiting for a compatible AI model.',
              'إنشاء الأسئلة ينتظر موديل ذكاء اصطناعي متوافق.',
            ),
      );
  }
  const action = async (event) => {
    const target = event.target.closest(
      '[data-survey-action],[data-name="Template option"],[data-name="Generate action"]',
    );
    if (!target) return;
    const label = (target.dataset.surveyAction || target.textContent).replace(/\s+/g, ' ').trim(),
      name = target.dataset.name;
    if (name === 'Status tab') {
      go(
        /Live/.test(label)
          ? 'live'
          : /Draft/.test(label)
            ? 'drafts'
            : /Paused/.test(label)
              ? 'paused'
              : /Closed/.test(label)
                ? 'closed'
                : 'all',
        null,
      );
      return;
    }
    if (/Create survey/.test(label)) {
      setDraft(freshDraft());
      setSurvey(null);
      setLoadedId(null);
      go('create', null);
      return;
    }
    if (/All surveys|Back to Surveys|Done, back|^Cancel$/.test(label)) {
      go('all', null);
      return;
    }
    if (name === 'Template option') {
      if (!requireTitle()) return;
      if (target.dataset.nodeId === '262:12005') {
        go('ai');
        return;
      }
      const template =
        target.dataset.nodeId === '259:4752'
          ? 'quick'
          : target.dataset.nodeId === '259:4759'
            ? 'scratch'
            : 'customer';
      const qs = createStartingQuestions(template);
      for (const q of Object.values(qs)) {
        q.text.en = q.text.en.replaceAll('Bloom & Co.', workspace.businessName);
        q.text.ar = q.text.ar.replaceAll('بلوم آند كو', workspace.businessName);
      }
      setDraft((old) => ({ ...old, startingPoint: template, questions: qs }));
      setQuestion(1);
      go('questions');
      return;
    }
    if (/Continue to questions|Build questions/.test(label)) {
      if (!requireTitle()) return;
      go('questions');
      return;
    }
    if (/Continue to sharing|3 Share survey/.test(label)) {
      await saveDraft('share');
      return;
    }
    if (/Survey details|Edit survey details/.test(label)) {
      go('create');
      return;
    }
    if (/Save as draft|Save & close|Save changes|Publish changes/.test(label)) {
      await saveDraft(/close/.test(label) ? 'all' : undefined);
      return;
    }
    if (/Publish survey/.test(label)) {
      await publish();
      return;
    }
    if (/Generate with|NUVIA AI/.test(label)) {
      if (!requireTitle()) return;
      go('ai');
      return;
    }
    if (name === 'Generate action' || /Generate Questions/.test(label)) {
      await generate();
      return;
    }
    if (/Regenerate/.test(label)) {
      go('ai');
      return;
    }
    if (/Add question/.test(label)) {
      const added = addEditorQuestion(draft.questions);
      setDraft((old) => ({ ...old, questions: added.questions }));
      setQuestion(added.id);
      go('questions');
      return;
    }
    if (label === 'question-copy' || label === 'question-delete') {
      const change =
        label === 'question-copy'
          ? copyEditorQuestion(draft.questions, question)
          : removeEditorQuestion(draft.questions, question);
      setDraft((old) => ({ ...old, questions: change.questions }));
      setQuestion(change.id);
      return;
    }
    if (name === 'Question item' || name === 'Question summary') {
      setQuestion(Number(label.match(/^\d+/)?.[0] || 1));
      return;
    }
    if (name === 'Language option') {
      const lang = label === 'English' ? 'en' : 'ar';
      setEnabledLanguages((old) =>
        old.includes(lang)
          ? old.length === 1
            ? old
            : old.filter((l) => l !== lang)
          : [...old, lang],
      );
      return;
    }
    if (/Preview|Open survey/.test(label)) {
      if (link && /Open/.test(label)) {
        window.open(link, '_blank', 'noopener');
        return;
      }
      setPreview(true);
      return;
    }
    if (/View responses|View results/.test(label)) {
      location.hash = '/feedbacks' + (draft.id ? '?surveyId=' + draft.id : '');
      return;
    }
    if (/Download all branch QR codes/.test(label)) {
      const links = (survey?.links || []).filter((l) => l.enabled);
      if (!links.length) {
        setNotice(t('Publish your survey first.', 'انشر الاستبيان أولًا.'));
        return;
      }
      const tiles = await Promise.all(
        links.map(async (l, index) => {
          const svg = await QRCode.toString(l.url + '?channel=qr', {
            type: 'svg',
            width: 296,
            margin: 2,
          });
          const body = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
          const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 100 100';
          const name = workspace.branches.find((b) => b.id === l.branchId)?.name || '';
          const escape = (value) =>
            String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          return (
            '<g transform="translate(0 ' +
            index * 350 +
            ')"><text x="20" y="30" font-family="sans-serif" font-size="18">' +
            escape(name) +
            '</text><svg x="20" y="45" width="296" height="296" viewBox="' +
            viewBox +
            '">' +
            body +
            '</svg></g>'
          );
        }),
      );
      download(
        'survey-branch-qr-codes.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="336" height="' +
          links.length * 350 +
          '">' +
          tiles.join('') +
          '</svg>',
        'image/svg+xml',
      );
      return;
    }
    if (/WhatsApp|Email/.test(label)) {
      if (!link) {
        setNotice(t('Publish your survey first.', 'انشر الاستبيان أولًا.'));
        return;
      }
      const message = workspace.businessName + ' — ' + draft.title + '\n' + link;
      if (label === 'WhatsApp')
        window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank', 'noopener');
      else
        location.href =
          'mailto:?subject=' +
          encodeURIComponent(draft.title) +
          '&body=' +
          encodeURIComponent(message);
      return;
    }
    if (/Copy/.test(label)) {
      if (!link) {
        setNotice(t('Publish your survey first.', 'انشر الاستبيان أولًا.'));
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        setNotice(t('Link copied', 'تم نسخ الرابط'));
      } catch {
        setNotice(link);
      }
      return;
    }
    if (label === 'Export') {
      const rows = [
        ['Survey', 'Status', 'Responses'],
        ...visible.map((s) => [s.title, s.status, s.responseCount || 0]),
      ];
      download(
        'surveys.csv',
        '\uFEFF' +
          rows
            .map((r) => r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','))
            .join('\n'),
        'text/csv;charset=utf-8',
      );
      return;
    }
    if (/Last updated/.test(label)) {
      setNotice(t('Surveys are ordered by latest update.', 'الاستبيانات مرتبة حسب آخر تحديث.'));
      return;
    }
  };
  const runtime = {
    order,
    setOrder,
    link,
    anonymous: draft.anonymous !== false,
    setAnonymous: (value) => setDraft((old) => ({ ...old, anonymous: value })),
    reorderTo: (from, to) => {
      const result = moveEditorQuestion(draft.questions, from, to);
      setDraft((old) => ({ ...old, questions: result.questions }));
      setQuestion(result.id);
    },
    suggestions,
    updateSuggestion: (index, label) =>
      setSuggestions((old) => ({
        ...old,
        questions: old.questions.map((q, i) => (i === index ? { ...q, label } : q)),
      })),
    acceptSuggestions: (chosen) => {
      const incoming = {
        title: draft.title || suggestions?.title || t('Customer feedback', 'آراء العملاء'),
        description: draft.description,
        locale: editorLanguage,
        questions: (suggestions?.questions || [])
          .filter((q, i) => chosen[i])
          .map((q) => ({ ...q, id: crypto.randomUUID() })),
      };
      setDraft(fromSurvey(incoming));
      go('questions');
    },
    surveys: visible,
    branches: workspace.branches,
    language,
    tr,
    editable,
    busy: mutation.busy,
    rowAction,
    mutateSurvey,
    copy: {
      '258:1874': all.length,
      '258:1875': workspace.branches.length + ' ' + tr('Branches'),
      '259:4715': branchIds.length + ' ' + t('branches selected', 'فروع محددة'),
      '258:1882': all.filter((s) => s.status === 'published').length,
      '258:1890': all.reduce((sum, s) => sum + (s.responseCount || 0), 0),
      '258:1891': '—',
      '258:1898': summary.data?.startedSessions
        ? Math.round(summary.data.completionRate * 100) + '%'
        : '—',
      '258:1886': tr('Responses'),
      '258:1899': '—',
      '258:2070': visible.length + ' ' + tr('Surveys'),
      '262:11794': draft.title,
      '262:11912': survey?.responsesByChannel?.qr ?? 0,
      '262:11919': survey?.responsesByChannel?.link ?? 0,
      '262:10925': enabledLanguages
        .map((lang) => (lang === 'ar' ? 'العربية' : 'English'))
        .join(' + '),
      '262:10928': branchIds.length + ' ' + tr('Branches'),
      '262:10931':
        draft.anonymous !== false
          ? tr('Anonymous')
          : t('Optional contact details', 'بيانات تواصل اختيارية'),
      '262:11796':
        survey?.status === 'published'
          ? t('Live and accepting responses', 'منشور ويستقبل الردود')
          : t('Draft — publish when ready', 'مسودة — انشر عندما تكون مستعدًا'),
      '298:747': workspace.industry,
      '298:748': draft.generatedGoal || goal,
      '298:751': editorLanguage.toUpperCase(),
      '298:752': (suggestions?.questions?.length || 0) + ' ' + tr('Questions'),
      '262:11795': Object.keys(draft.questions).length + ' ' + tr('Questions'),
      '262:11803': workspace.businessName,
    },
    fieldLabel: (multiline) =>
      kind === 'ai'
        ? t('Survey goal', 'هدف الاستبيان')
        : multiline
          ? t('Description', 'الوصف')
          : t('Survey title', 'عنوان الاستبيان'),
    field: (key, multiline) =>
      kind === 'ai'
        ? multiline
          ? goal
          : workspace.industry
        : multiline
          ? draft.description
          : draft.title,
    setField: (key, value, multiline) => {
      setNotice('');
      if (kind === 'ai') {
        if (multiline) setGoal(value);
        return;
      }
      setDraft((old) => ({ ...old, [multiline ? 'description' : 'title']: value }));
    },
  };
  const hydrate = (nodes) =>
    React.Children.map(nodes, (node) => {
      if (!React.isValidElement(node)) return node;
      const name = node.props['data-name'];
      if (node.props['data-survey-action'] === 'All 3 branches')
        return (
          <div className={node.props.className} style={{ position: 'relative' }}>
            <span>
              {branchFilter === 'all'
                ? tr('All branches')
                : workspace.branches.find((b) => b.id === branchFilter)?.name}
            </span>
            <ChoiceMenu
              overlay
              icon={false}
              label={tr('Branches')}
              value={branchFilter}
              options={[
                { value: 'all', label: tr('All branches') },
                ...workspace.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
              onChange={setBranchFilter}
            />
          </div>
        );

      if (name === 'Language option') {
        const lang = node.props['data-survey-action'] === 'English' ? 'en' : 'ar';
        return React.cloneElement(
          node,
          { 'aria-pressed': enabledLanguages.includes(lang) },
          hydrate(node.props.children),
        );
      }
      if (name === 'Selected branches')
        return React.cloneElement(
          node,
          {},
          workspace.branches
            .filter((b) => !b.archivedAt)
            .map((b) => (
              <button
                type="button"
                className="sv245"
                key={b.id}
                aria-pressed={branchIds.includes(b.id)}
                onClick={() =>
                  setBranchIds((old) =>
                    old.includes(b.id) ? old.filter((id) => id !== b.id) : [...old, b.id],
                  )
                }
              >
                {b.name}
              </button>
            )),
        );
      if (name === 'Branch links') {
        const template = React.Children.toArray(node.props.children)[0];
        return React.cloneElement(
          node,
          {},
          (survey?.links || [])
            .filter((l) => l.enabled)
            .map((l) => {
              const branch = workspace.branches.find((b) => b.id === l.branchId);
              const adapt = (children) =>
                React.Children.map(children, (child) => {
                  if (!React.isValidElement(child)) return child;
                  if (child.props.className === 'sv237')
                    return React.cloneElement(child, {}, branch?.name || '');
                  if (child.props.className === 'sv238')
                    return React.cloneElement(
                      child,
                      {
                        title: l.url,
                        style: {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      },
                      l.url,
                    );
                  if (child.props.className === 'sv316')
                    return React.cloneElement(
                      child,
                      { style: { minWidth: 0, flex: 1 } },
                      adapt(child.props.children),
                    );
                  if (child.props['data-name'] === 'copy')
                    return (
                      <button
                        type="button"
                        className={child.props.className}
                        aria-label={t('Copy link for ', 'نسخ رابط ') + (branch?.name || '')}
                        onClick={async (event) => {
                          event.stopPropagation();
                          try {
                            await navigator.clipboard.writeText(l.url);
                            setNotice(t('Link copied', 'تم نسخ الرابط'));
                          } catch {
                            setNotice(l.url);
                          }
                        }}
                      >
                        {child.props.children}
                      </button>
                    );
                  if (child.props['data-survey-action'] === 'QR code')
                    return React.cloneElement(
                      child,
                      {
                        onClick: async (event) => {
                          event.stopPropagation();
                          const svg = await QRCode.toString(l.url + '?channel=qr', { type: 'svg' });
                          download('branch-qr-' + l.branchId + '.svg', svg, 'image/svg+xml');
                        },
                      },
                      child.props.children,
                    );
                  return child.props.children
                    ? React.cloneElement(child, {}, adapt(child.props.children))
                    : child;
                });
              return React.cloneElement(template, { key: l.id }, adapt(template.props.children));
            }),
        );
      }
      if (name === 'Survey QR code')
        return React.cloneElement(
          node,
          {},
          qr ? (
            <img
              src={qr}
              className="sv7"
              width={296}
              height={296}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              alt={tr('QR code')}
            />
          ) : (
            <p>{t('Publish to create a QR code', 'انشر لإنشاء رمز QR')}</p>
          ),
        );
      if (name === 'Status tab')
        return React.cloneElement(
          node,
          {
            'aria-pressed': /Live/.test(node.props['data-survey-action'])
              ? kind === 'live'
              : undefined,
          },
          hydrate(node.props.children),
        );
      if (node.type === 'input' && node.props.className === 'survey-search-input')
        return React.cloneElement(node, {
          value: query,
          placeholder: t('Search surveys by name…', 'ابحث باسم الاستبيان…'),
          'aria-label': t('Search surveys', 'البحث في الاستبيانات'),
          onChange: (e) => setQuery(e.target.value),
        });
      if (typeof node.props.children === 'string') {
        let text = node.props.children;
        if (kind === 'share' && text.trim() === 'Live')
          text =
            survey?.status === 'published'
              ? 'Live'
              : survey?.status === 'closed'
                ? 'Closed'
                : 'Draft';
        if (text.includes('nuvia.link')) text = link || t('Not published yet', 'لم يُنشر بعد');
        if (text.includes('Bloom & Co.'))
          text = text.replaceAll('Bloom & Co.', workspace.businessName);
        if (text.includes('main link lets customers'))
          text = t('Each published link is bound to its branch.', 'كل رابط منشور مرتبط بفرعه.');
        if (/^Showing \d/.test(text.trim())) text = visible.length + ' ' + tr('Surveys');
        if (/^All \d+ branches$/.test(text.trim()))
          text = workspace.branches.length + ' ' + tr('Branches');
        if (/^All(?: surveys)?\s+\d+$/.test(text.trim()))
          text = tr('All surveys') + ' ' + all.length;
        if (/^Live\s+\d+$/.test(text.trim()))
          text = tr('Live') + ' ' + all.filter((s) => s.status === 'published').length;
        if (/^Drafts\s+\d+$/.test(text.trim()))
          text = tr('Drafts') + ' ' + all.filter((s) => s.status === 'draft').length;
        if (/^Paused\s+\d+$/.test(text.trim()))
          text = tr('Paused') + ' ' + all.filter((s) => s.status === 'paused').length;
        if (/^Closed\s+\d+$/.test(text.trim()))
          text = tr('Closed') + ' ' + all.filter((s) => s.status === 'closed').length;
        return React.cloneElement(node, {}, text);
      }
      return node.props.children
        ? React.cloneElement(node, {}, hydrate(node.props.children))
        : node;
    });
  const list = ['all', 'empty', 'live', 'drafts', 'paused', 'closed', 'results'].includes(kind);
  const questionId = draft.questions[question] ? question : Number(Object.keys(draft.questions)[0]);
  return (
    <ProductProvider
      language={language}
      setLanguage={setLanguage}
      menuOpen={menu}
      onNavigate={() => setMenu(false)}
    >
      <SurveyRuntimeContext.Provider value={runtime}>
        <SurveyEditorContext.Provider
          value={{
            startingPoint: draft.startingPoint || 'scratch',
            question: questionId,
            language: editorLanguage,
            viewMode: editorLanguage,
            setLanguage: (value) => setEditorLanguage(value === 'both' ? 'en' : value),
            enabledLanguages,
            questions: draft.questions,
            updateQuestion,
          }}
        >
          <SurveySelectionContext.Provider
            value={{ selected, setSelected, visibleIds: visible.map((s) => s.id) }}
          >
            <div className="product-page" data-menu-open={menu}>
              <button
                className="product-mobile-toggle"
                aria-label={tr('Navigation menu')}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                ☰
              </button>
              <FeedbackShell title="Surveys">
                <div className="surveys-content" data-survey-page={kind} onClick={action}>
                  {(resource.loading || (id && detail.loading)) && (
                    <p role="status">{t('Loading…', 'جارٍ التحميل…')}</p>
                  )}
                  {(resource.error || detail.error || mutation.error || generator.error) && (
                    <p className="error" role="alert">
                      {t(
                        'Could not complete the request. Check your connection, access and survey fields.',
                        'تعذر إكمال الطلب. راجع الاتصال والصلاحيات وحقول الاستبيان.',
                      )}{' '}
                      <button
                        onClick={() => {
                          resource.reload();
                          detail.reload();
                        }}
                      >
                        {tr('Retry')}
                      </button>
                    </p>
                  )}
                  {list ? (
                    hydrate(All())
                  ) : kind === 'create' ? (
                    hydrate(Create())
                  ) : kind === 'share' ? (
                    <>
                      {hydrate(Share())}
                      <div className="survey-branch-actions">
                        <button
                          type="button"
                          className="survey-primary"
                          disabled={!editable || mutation.busy || !branchIds.length}
                          onClick={publish}
                        >
                          {t('Publish survey', 'نشر الاستبيان')}
                        </button>
                        {survey?.status === 'published' && (
                          <button
                            disabled={!editable || mutation.busy}
                            onClick={() => mutateSurvey(survey, 'close')}
                          >
                            {t('Close collection', 'إغلاق جمع الردود')}
                          </button>
                        )}
                      </div>
                    </>
                  ) : kind === 'ai' ? (
                    hydrate(AI())
                  ) : kind === 'ai-review' ? (
                    <AIReview />
                  ) : (
                    <Questions question={questionId} />
                  )}
                  {list && !resource.loading && !visible.length && (
                    <p className="survey-branch-empty" role="status">
                      {t(
                        'No surveys match this view. Create your first survey.',
                        'لا توجد استبيانات في هذا العرض. أنشئ أول استبيان.',
                      )}
                    </p>
                  )}
                </div>
              </FeedbackShell>
              {notice && (
                <div className="survey-toast" role="status">
                  {notice}
                  <button aria-label={tr('Close')} onClick={() => setNotice('')}>
                    ×
                  </button>
                </div>
              )}
              {preview && (
                <div className="survey-modal-backdrop">
                  <section
                    className="survey-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label={tr('Preview')}
                  >
                    <button
                      className="survey-modal-close"
                      aria-label={tr('Close')}
                      onClick={() => setPreview(false)}
                    >
                      ×
                    </button>
                    <h2>{draft.title}</h2>
                    <p>{draft.description}</p>
                    {Object.values(draft.questions).map((q, i) => (
                      <p key={i}>{q.text[editorLanguage] || q.text.en || q.text.ar}</p>
                    ))}
                  </section>
                </div>
              )}
            </div>
          </SurveySelectionContext.Provider>
        </SurveyEditorContext.Provider>
      </SurveyRuntimeContext.Provider>
    </ProductProvider>
  );
}
