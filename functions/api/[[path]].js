export async function onRequest({ request }) {
  const url = new URL(request.url);

  url.hostname = 'nuviaapi-production.up.railway.app';
  url.protocol = 'https:';

  return fetch(new Request(url, request));
}
