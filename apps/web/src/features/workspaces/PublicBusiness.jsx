import React from 'react';
import { LanguageMenu } from '../../components/ui/ChoiceMenu.jsx';
import { useResource } from '../product/useResource.js';
import { ResourceState } from '../product/ui.jsx';
import { publicLink } from '../product/product-state.js';
import '../product/product.css';
export default function PublicBusiness({ language, setLanguage }) {
  const slug = location.hash.split('?')[0].split('/')[2],
    resource = useResource('/public/business/' + encodeURIComponent(slug)),
    data = resource.data,
    page = data?.page || data?.businessPage || data,
    t = (a, b) => (language === 'ar' ? b : a);
  return (
    <main className="public-feedback">
      <header>
        <a className="public-wordmark" href="#/landing">
          NUVIA
        </a>
        <LanguageMenu value={language} onChange={setLanguage} />
      </header>
      <ResourceState resource={resource} language={language} />
      {data && (
        <>
          <h1>{page.title || data.business?.name || page.businessName}</h1>
          {data.business?.logoUrl && (
            <img src={data.business.logoUrl} alt="" className="public-business-logo" />
          )}
          <p>{page.description || data.business?.description}</p>
          {data.business?.contactUrl && (
            <a href={data.business.contactUrl} rel="noreferrer">
              {t('Contact this business', 'تواصل مع النشاط')}
            </a>
          )}
          {(data.surveys || page.surveys || page.links || []).map((survey, index) => (
            <section className="product-card" key={survey.id || index}>
              <h2>{survey.title || survey.surveyTitle}</h2>
              <p>{survey.branchName || survey.branch?.name}</p>
              <a href={survey.url || publicLink(survey.token)}>
                {t('Share your feedback', 'شارك رأيك')}
              </a>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
