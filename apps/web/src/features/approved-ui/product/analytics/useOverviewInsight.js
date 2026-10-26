import { useResource, useMutation } from '../../../product/useResource.js';
import { productApi } from '../../../product/api.js';
import { canManage } from '../../../product/product-state.js';
import { analyticsQuery, matchingOverviewReport } from './connected-data.js';
import { useEffect, useState } from 'react';

export default function useOverviewInsight(connected, workspace, filters, locale, total) {
  const resource = useResource(connected ? '/reports' : null, { refreshInterval: 30000 });
  const mutation = useMutation();
  const requestFilters = Object.fromEntries(
    new URLSearchParams(analyticsQuery(filters, {}, workspace?.reportingTimezone)),
  );
  const requestKey = locale + ':' + JSON.stringify(requestFilters);
  const [attemptKey, setAttemptKey] = useState(null);
  useEffect(() => setAttemptKey(null), [requestKey]);
  const generationError = attemptKey === requestKey ? mutation.error : null;
  const report = matchingOverviewReport(
    resource.data?.reports || [],
    requestFilters,
    locale,
    total,
  );
  const generate = async () => {
    if (!canManage(workspace) || mutation.busy) return;
    setAttemptKey(requestKey);
    const result = await mutation.run((signal) =>
      productApi.send('/reports', { locale, filters: requestFilters }, 'POST', signal),
    );
    if (result) resource.reload();
  };
  return {
    report,
    loading: resource.loading,
    error: resource.error || generationError,
    busy: mutation.busy,
    editable: canManage(workspace),
    generate,
    reload: generationError ? generate : resource.reload,
  };
}
