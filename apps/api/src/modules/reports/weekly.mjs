import { createReport } from './service.mjs';
import { emitWorkspaceNotification } from '../notifications/service.mjs';

function midnight(date, timezone) {
  const wall = Date.parse(date + 'T00:00:00.000Z');
  let utc = wall;
  for (let index = 0; index < 4; index++) {
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date(utc))
      .find((part) => part.type === 'timeZoneName')
      .value.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = offset
      ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1)
      : 0;
    const next = wall - minutes * 60000;
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

export function weeklyReportWindow(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  if (get('weekday') !== 'Mon' || Number(get('hour')) !== 9) return null;
  const week = get('year') + '-' + get('month') + '-' + get('day');
  const previous = new Date(week + 'T12:00:00Z');
  previous.setUTCDate(previous.getUTCDate() - 7);
  return {
    week,
    timezone,
    from: midnight(previous.toISOString().slice(0, 10), timezone).toISOString(),
    to: new Date(midnight(week, timezone).getTime() - 1).toISOString(),
    interval: 'day',
  };
}

// Runs in the existing owned mail worker. Only a deliberate notification Save opts in.
export async function scheduleWeeklyReports(deps, { maxNewReports = 20 } = {}) {
  const result = { created: 0, skipped: 0, failed: 0 };
  const owners = await deps.models.User.find({
    weeklyReportsEnabled: true,
    verifiedAt: { $ne: null },
  })
    .sort({ weeklyReportsLastCheckedAt: 1, _id: 1 })
    .limit(100)
    .lean();
  for (const owner of owners) {
    if (result.created >= maxNewReports) break;
    await deps.models.User.updateOne(
      { _id: owner._id },
      { $set: { weeklyReportsLastCheckedAt: deps.now() } },
    );
    let window;
    try {
      window = weeklyReportWindow(deps.now(), owner.preferences?.zone || 'UTC');
    } catch {
      result.failed++;
      continue;
    }
    if (!window || owner.notificationPreferences?.weekly === false) continue;
    const workspaces = await deps.models.Workspace.find({ ownerUserId: owner._id })
      .sort({ weeklyReportCheckedAt: 1, createdAt: 1, _id: 1 })
      .limit(50)
      .lean();
    for (const workspace of workspaces) {
      if (result.created >= maxNewReports) break;
      await deps.models.Workspace.updateOne(
        { _id: workspace._id },
        { $set: { weeklyReportCheckedAt: deps.now() } },
      );
      const scheduleKey = 'weekly:' + workspace._id + ':' + window.week;
      if (await deps.models.Report.exists({ scheduleKey })) {
        result.skipped++;
        continue;
      }
      try {
        const report = await createReport(
          {
            userId: owner._id,
            locale: owner.locale,
            filters: { from: window.from, to: window.to, interval: window.interval },
            scheduleKey,
            schedule: { kind: 'weekly', week: window.week, timezone: window.timezone },
          },
          { workspace, role: 'owner', branchIds: null },
          deps,
        );
        result.created++;
        const saved = await deps.models.Report.findById(report.id).select('branchIds').lean();
        const body =
          report.status === 'waiting_for_model'
            ? 'Your weekly feedback snapshot is saved and waiting for a compatible model.'
            : report.status === 'queued'
              ? 'Your weekly feedback snapshot is queued for analysis.'
              : 'Your weekly feedback snapshot is saved. No feedback evidence was available for this period.';
        await emitWorkspaceNotification(
          workspace._id,
          {
            type: 'weekly',
            title:
              owner.locale === 'ar'
                ? 'تم حفظ لقطة التقرير الأسبوعي'
                : 'Weekly report snapshot saved',
            body:
              owner.locale === 'ar'
                ? report.status === 'waiting_for_model'
                  ? 'تم حفظ لقطة الآراء الأسبوعية وهي بانتظار نموذج متوافق.'
                  : report.status === 'queued'
                    ? 'لقطة الآراء الأسبوعية في قائمة انتظار التحليل.'
                    : 'تم حفظ التقرير، ولا توجد أدلة من الآراء لهذه الفترة.'
                : body,
            path: '/report-details?id=' + report.id,
            branchIds: saved.branchIds,
          },
          deps,
        );
      } catch (error) {
        if (error.code === 11000) result.skipped++;
        else result.failed++;
      }
    }
  }
  return result;
}
