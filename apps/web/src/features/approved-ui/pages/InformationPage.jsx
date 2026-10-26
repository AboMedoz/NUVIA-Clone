import React from 'react';
import { useResource } from '../../product/useResource.js';
import { LanguageMenu } from '../components/ChoiceMenu.jsx';
export default function InformationPage({ page, language, setLanguage }) {
  const ar = language === 'ar',
    resource = useResource('/public/content/' + page);
  const titles = {
    help: ['Help center', 'مركز المساعدة'],
    about: ['About NUVIA', 'عن NUVIA'],
    security: ['Account security', 'أمان الحساب'],
    status: ['Service status', 'حالة الخدمة'],
    terms: ['Terms of service', 'شروط الاستخدام'],
    privacy: ['Privacy policy', 'سياسة الخصوصية'],
    stories: ['Customer stories', 'قصص العملاء'],
    pricing: ['Plans and pricing', 'الخطط والأسعار'],
  };
  const help = ar
    ? 'أنشئ حسابك وأكّد البريد، ثم احفظ بيانات النشاط والفرع. أنشئ استبيانًا وانشره، ثم شارك رابط الفرع أو رمز QR. تظهر الردود المحفوظة في آراء العملاء. التحليل والتقارير تعتمد على جاهزية نماذج الذكاء الاصطناعي.'
    : 'Create an account and verify your email, then save your business and branch. Create and publish a survey, and share its branch link or QR. Saved responses appear in Feedbacks. Analysis and reports depend on available AI models.';
  const description =
    page === 'help'
      ? help
      : page === 'about'
        ? ar
          ? 'NUVIA يجمع آراء العملاء بالعربية والإنجليزية ويربط القرارات بالأدلة المحفوظة.'
          : 'NUVIA collects Arabic and English customer feedback and connects decisions to saved evidence.'
        : page === 'security'
          ? ar
            ? 'أكّد بريدك، واستخدم كلمة مرور قوية، وفعّل تطبيق المصادقة من إعدادات الأمان. يمكنك مراجعة جلساتك وتسجيل خروج الأجهزة الأخرى.'
            : 'Verify your email, choose a strong password, and enable an authenticator in security settings. Review your active sessions and sign out other devices.'
          : page === 'stories'
            ? ar
              ? 'لم تُنشر قصص عملاء بعد.'
              : 'No customer stories have been published yet.'
            : page === 'pricing'
              ? ar
                ? 'تظهر الخطط المتاحة وإدارة الفواتير داخل حسابك.'
                : 'Available plans and billing management appear in your account.'
              : ar
                ? 'لم ينشر الفريق محتوى هذه الصفحة بعد.'
                : 'The team has not published this page content yet.';
  return (
    <main
      className="auth-panel"
      style={{ maxWidth: 900, margin: 'auto', minHeight: '100dvh', padding: 32 }}
    >
      <header>
        <a className="brand" href="#/landing">
          NUVIA
        </a>
        <LanguageMenu value={language} onChange={setLanguage} />
      </header>
      <div className="auth-content" style={{ maxWidth: 720 }}>
        <h1>{titles[page]?.[ar ? 1 : 0]}</h1>
        {resource.loading ? (
          <p role="status">{ar ? 'جارٍ التحميل' : 'Loading'}</p>
        ) : resource.error ? (
          <p role="alert">
            {ar ? 'تعذر تحميل الصفحة' : 'Unable to load page'}{' '}
            <button onClick={resource.reload}>{ar ? 'إعادة المحاولة' : 'Retry'}</button>
          </p>
        ) : (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {page === 'status'
              ? resource.data?.database === 'available'
                ? ar
                  ? 'الخدمة متاحة.'
                  : 'The service is available.'
                : ar
                  ? 'واجهة التطبيق متاحة، وتوجد مشكلة في الاتصال بالبيانات.'
                  : 'The application is reachable, but the data service is unavailable.'
              : resource.data?.published
                ? resource.data.text
                : description}
          </p>
        )}
        <p>
          <a href="#/landing">{ar ? 'العودة إلى الموقع' : 'Back to website'}</a>
          {page === 'pricing' && (
            <>
              {' '}
              · <a href="#/subscription">{ar ? 'إدارة الاشتراك' : 'Manage subscription'}</a>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
