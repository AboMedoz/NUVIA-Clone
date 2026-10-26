import { useCallback, useState } from 'react';
import { useAuth } from '../../../../app/providers/AuthProvider.jsx';
import { useResource, useMutation } from '../../../product/useResource.js';
import { productApi } from '../../../product/api.js';
const empty = [];
export default function useAccountSettings() {
  const auth = useAuth(),
    connected = !auth.preview;
  const resource = useResource(connected ? '/account' : null),
    devices = useResource(connected ? '/account/sessions' : null),
    notices = useResource(connected ? '/account/notifications' : null);
  const mutation = useMutation();
  const [enrollment, setEnrollment] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const clearEnrollment = useCallback(() => setEnrollment(null), []);
  const dismissRecoveryCodes = useCallback(() => setRecoveryCodes([]), []);
  const run = async (path, body, method = 'POST') => {
    const result = await mutation.run((signal) =>
      productApi.send('/account' + path, body, method, signal),
    );
    if (result) {
      if (path === '' || path === '/preferences') await auth.refresh().catch(() => {});
      resource.reload();
      devices.reload();
      notices.reload();
    }
    return result;
  };
  return {
    account: resource.data,
    preferences: resource.data?.preferences,
    toggles: resource.data?.toggles,
    delivery: resource.data?.delivery,
    sessions: devices.data?.sessions || empty,
    twoFA: Boolean(resource.data?.twoFA),
    notifications: notices.data?.notifications || empty,
    ready: !resource.loading,
    error: mutation.error || resource.error || devices.error || notices.error,
    busy: mutation.busy,
    enrollment,
    recoveryCodes,
    dismissRecoveryCodes,
    clearEnrollment,
    connectGoogle: async (body) => {
      const result = await mutation.run((signal) =>
        productApi.send(
          '/auth/google/start',
          { ...body, link: true, locale: auth.user?.locale || 'en' },
          'POST',
          signal,
        ),
      );
      if (result?.url) location.assign(result.url);
      return result;
    },
    disconnectGoogle: async (body) => {
      const result = await mutation.run((signal) =>
        productApi.send('/auth/google/unlink', body, 'POST', signal),
      );
      if (result) resource.reload();
      return result;
    },
    saveProfile: (profile) =>
      run(
        '',
        Object.fromEntries(
          ['name', 'title', 'phone', 'country', 'photo'].map((k) => [k, profile[k] || '']),
        ),
        'PATCH',
      ),
    savePreferences: (preferences) => run('/preferences', preferences, 'PUT'),
    saveNotifications: (toggles, delivery) => run('/notifications', { toggles, delivery }, 'PUT'),
    resendEmail: () => run('/email/resend', {}),
    cancelEmail: () => run('/email', undefined, 'DELETE'),
    changePassword: (body) => run('/password', body),
    changeEmail: (body) => run('/email', body),
    setupTwoFA: async (currentPassword, code) => {
      const result = await run('/two-factor/setup', { currentPassword, ...(code ? { code } : {}) });
      if (result) setEnrollment(result);
      return result;
    },
    enableTwoFA: async (body) => {
      const result = await run('/two-factor', body);
      if (result) {
        setEnrollment(null);
        setRecoveryCodes(result.recoveryCodes || []);
      }
      return result;
    },
    revokeSession: (id) => run('/sessions/' + encodeURIComponent(id), undefined, 'DELETE'),
    revokeAll: async () => {
      const result = await mutation.run((signal) =>
        productApi.send('/account/sessions', undefined, 'DELETE', signal),
      );
      if (result) auth.clearSession();
      return result;
    },
    markRead: (ids) => run('/notifications/read', ids ? { ids } : {}),
  };
}
