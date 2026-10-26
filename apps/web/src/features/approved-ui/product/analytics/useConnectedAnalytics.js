import { useAuth } from '../../../../app/providers/AuthProvider.jsx';
import { useResource } from '../../../product/useResource.js';
import { analyticsQuery, overviewFromAnalytics } from './connected-data.js';

export default function useConnectedAnalytics(filters, extra) {
  const auth = useAuth();
  const connected = auth && !auth.preview;
  const resource = useResource(
    connected
      ? '/analytics' + analyticsQuery(filters, extra, auth.workspace?.reportingTimezone)
      : null,
    { refreshInterval: 30000 },
  );
  const branches = useResource(
    connected && auth.workspace ? '/workspaces/' + auth.workspace.id + '/branches' : null,
  );
  const surveys = useResource(connected ? '/surveys' : null);
  return {
    connected,
    resource,
    report: overviewFromAnalytics(resource.data),
    branches: Array.isArray(branches.data?.branches)
      ? branches.data.branches
      : Array.isArray(branches.data)
        ? branches.data
        : [],
    surveys: surveys.data?.surveys || [],
    workspace: auth?.workspace,
  };
}
