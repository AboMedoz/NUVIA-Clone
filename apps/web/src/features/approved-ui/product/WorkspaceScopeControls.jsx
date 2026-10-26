import React from 'react';
import ControlIcon from '../components/ControlIcon.jsx';
import { asset } from '../assets.js';
import { useProductView } from './ProductContext.jsx';
import { OverviewBranchSelect, overviewDateLabel } from './OverviewControls.jsx';

export default function WorkspaceScopeControls() {
  const { tr, language, dashboard } = useProductView();
  const image = (name) => asset('dashboard/overview/' + name + '.svg');
  return (
    <>
      <div className="f62" data-name="Dashboard filter">
        <div className="f35" data-name="store">
          <ControlIcon name="branch" />
        </div>
        <p className="f63">
          {tr(
            dashboard.filters.branch === 'all'
              ? 'All branches'
              : dashboard.branches?.find((b) => b.id === dashboard.filters.branch)?.name ||
                  'All branches',
          )}
        </p>
        <OverviewBranchSelect />
        <div className="f13" data-name="chevron-down">
          <img alt="" className="f5" src={image('chevron-down1')} />
        </div>
      </div>
      <button
        className="f64"
        data-name="Workspace date filter"
        aria-label={tr('Choose date range') + ': ' + overviewDateLabel(dashboard.filters, language)}
        title={overviewDateLabel(dashboard.filters, language)}
        type="button"
        onClick={dashboard.openDate}
      >
        <div className="f35" data-name="calendar-days">
          <ControlIcon name="date" />
        </div>
        <p className="f65">{overviewDateLabel(dashboard.filters, language)}</p>
        <span className="workspace-date-short-label">{tr('Date')}</span>
      </button>
    </>
  );
}
