import { apiRequest } from '../../lib/http/client.js';
import { queryString } from './product-state.js';
export const productApi = {
  get: (path, signal) => apiRequest(path, { signal }),
  send: (path, body, method = 'POST', signal) => apiRequest(path, { body, method, signal }),
  publicSurvey: (token, signal) =>
    apiRequest('/public/surveys/' + encodeURIComponent(token), { signal }),
  submitResponse: (token, body, signal) =>
    apiRequest('/public/surveys/' + encodeURIComponent(token) + '/responses', {
      method: 'POST',
      body,
      signal,
    }),
  feedback: (filters, signal) => apiRequest('/feedback' + queryString(filters), { signal }),
};
