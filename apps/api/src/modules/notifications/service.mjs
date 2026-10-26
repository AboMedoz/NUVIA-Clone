import { randomUUID } from 'node:crypto';
import { encryptPayload } from '../mail/crypto.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { digest } from '../auth/sessions.mjs';
async function enqueue(user, notifications, deps, session) {
  const id = randomUUID();
  await deps.models.MailOutbox.insertOne(
    {
      _id: id,
      userId: user._id,
      kind: 'notification',
      tokenDigest: digest(id),
      payload: encryptPayload(
        {
          to: user.email,
          essential: notifications.some((note) => note.kind === 'security'),
          subject: user.locale === 'ar' ? 'تحديثات NUVIA' : 'NUVIA updates',
          text: notifications
            .map((n) => `${n.title}\n${n.body}\n${deps.config.appOrigin}/#${n.path}`)
            .join('\n\n'),
        },
        deps.config.mailKey,
      ),
      expiresAt: new Date(deps.now().getTime() + 7 * 86400000),
      status: 'pending',
      attempts: 0,
      createdAt: deps.now(),
      nextAttemptAt: deps.now(),
    },
    { session },
  );
  await deps.models.Notification.updateMany(
    { _id: { $in: notifications.map((n) => n._id) }, userId: user._id },
    { $set: { emailedAt: deps.now() } },
    { session },
  );
}
export async function emitUserNotification(
  userId,
  { type = 'security', title, body, path = '/settings-security' },
  deps,
) {
  const user = await deps.models.User.findOne({ _id: userId, verifiedAt: { $ne: null } }).lean();
  if (!user) return;
  const prefs = user.notificationPreferences || {};
  if (
    type !== 'security' &&
    (prefs[type] === false || (prefs.inapp === false && prefs.email === false))
  )
    return;
  const note = {
    _id: randomUUID(),
    userId,
    title,
    body,
    path,
    kind: type,
    inapp: type === 'security' || prefs.inapp !== false,
    createdAt: deps.now(),
    readAt: null,
    emailedAt: null,
  };
  await transaction(deps, async (session) => {
    await deps.models.Notification.insertOne(note, { session });
    if (
      type === 'security' ||
      (prefs.email !== false && user.notificationDelivery === 'Immediately')
    )
      await enqueue(user, [note], deps, session);
  });
}
export async function emitWorkspaceNotification(
  workspaceId,
  { type = 'feedback', title, body, path = '/notifications', branchId, branchIds },
  deps,
) {
  const workspace = await deps.models.Workspace.findById(workspaceId).lean();
  if (!workspace) return;
  const members = await deps.models.Membership.find({
    workspaceId,
    revokedAt: null,
    ...(branchIds?.length
      ? { branchIds: { $all: branchIds } }
      : branchId
        ? { branchIds: branchId }
        : {}),
  }).lean();
  const users = await deps.models.User.find({
    _id: { $in: [...new Set([workspace.ownerUserId, ...members.map((m) => m.userId)])] },
    verifiedAt: { $ne: null },
  }).lean();
  for (const user of users) {
    const prefs = user.notificationPreferences || {};
    if (
      type !== 'security' &&
      (prefs[type] === false || (prefs.inapp === false && prefs.email === false))
    )
      continue;
    const note = {
      _id: randomUUID(),
      userId: user._id,
      workspaceId,
      ...(branchIds?.length ? { branchIds } : branchId ? { branchIds: [branchId] } : {}),
      title,
      body,
      path: (() => {
        const [pathname, query] = path.split('?');
        const params = new URLSearchParams(query);
        params.set('workspace', workspaceId);
        return pathname + '?' + params;
      })(),
      kind: type,
      inapp: type === 'security' || prefs.inapp !== false,
      createdAt: deps.now(),
      readAt: null,
      emailedAt: null,
    };
    await transaction(deps, async (session) => {
      await deps.models.Notification.insertOne(note, { session });
      if (
        type === 'security' ||
        (prefs.email !== false && (user.notificationDelivery === 'Immediately' || type === 'low'))
      )
        await enqueue(user, [note], deps, session);
    });
  }
}
export async function scheduleNotificationDigests(deps) {
  const users = await deps.models.User.find({
    'notificationPreferences.email': { $ne: false },
    verifiedAt: { $ne: null },
  })
    .limit(1000)
    .lean();
  for (const user of users) {
    if (user.notificationDelivery === 'Immediately') continue;
    const now = deps.now(),
      zone = user.preferences?.zone || 'UTC';
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: zone,
      hour: 'numeric',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now);
    if (Number(parts.find((p) => p.type === 'hour').value) !== 9) continue;
    const weekly = user.notificationDelivery === 'Weekly digest';
    if (weekly && parts.find((p) => p.type === 'weekday').value !== 'Mon') continue;
    if (
      user.notificationLastDigestAt &&
      now - user.notificationLastDigestAt < (weekly ? 6 : 0.8) * 86400000
    )
      continue;
    await transaction(deps, async (session) => {
      const claimed = await deps.models.User.updateOne(
        { _id: user._id, notificationLastDigestAt: user.notificationLastDigestAt || null },
        { $set: { notificationLastDigestAt: now } },
        { session },
      );
      if (!claimed.modifiedCount) return;
      const notes = await deps.models.Notification.find(
        { userId: user._id, emailedAt: null },
        null,
        { session },
      )
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();
      if (notes.length) await enqueue(user, notes, deps, session);
    });
  }
}
