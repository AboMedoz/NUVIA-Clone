export const routes = [
  'landing',
  'dashboard',
  'dashboard-empty',
  'feedbacks',
  'feedbacks-empty',
  'feedback-details',
  'login',
  'signup',
  'forgot',
  'reset',
  'verify-email',
  'business-information',
  'business-error',
  'business-setup',
  'get-started',
  'surveys',
  'survey-builder',
  'analytics',
  'reports',
  'team',
  'branches',
  'assistant',
  'settings',
  'team-accept',
];
export const currentRoute = () => {
  const value = location.hash.slice(2).split('?')[0];
  if (value === 'team/accept') return 'team-accept';
  if (value.startsWith('s/')) return 'public-survey';
  if (value.startsWith('b/')) return 'public-business';
  return routes.includes(value) ? value : 'landing';
};
