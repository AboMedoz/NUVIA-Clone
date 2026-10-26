import { createRecoveryCodes, verifySecondFactor, secondFactorPattern } from './recovery.mjs';
import { emitUserNotification } from '../notifications/service.mjs';
import { resolveAccess } from '../team/access.mjs';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, parse, name, email, password } from '../../shared/validation.mjs';
import { requireVerifiedUser, resolveSession, createSession } from '../auth/sessions.mjs';
import { hashPassword, verifyPassword } from '../auth/passwords.mjs';
import { csrfMiddleware } from '../../middleware/security.mjs';
import { createLimiter } from '../../middleware/rate-limits.mjs';
import { ApiError } from '../../middleware/errors.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { encryptPayload, decryptPayload } from '../mail/crypto.mjs';
import { requestEmailChange, cancelEmailChange } from './email.mjs';
import { newTotpSecret, verifyTotp } from './totp.mjs';

const short = z.string().trim().max(160);
const profileInput = z
  .object({
    name,
    title: short.default(''),
    phone: short.default(''),
    country: short.default(''),
    photo: z
      .string()
      .max(16000)
      .regex(/^(?:|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/)
      .default(''),
  })
  .strict();
const preferencesInput = z
  .object({
    language: z.enum(['en', 'ar']),
    region: short,
    zone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    date: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
    time: z.enum(['12-Hour', '24-Hour']),
  })
  .strict();
const togglesInput = z
  .object(
    Object.fromEntries(
      [
        'email',
        'inapp',
        'feedback',
        'low',
        'weekly',
        'news',
        'security',
        'reports',
        'sound',
        'popup',
      ].map((key) => [key, key === 'security' ? z.literal(true) : z.boolean()]),
    ),
  )
  .strict();
export const defaultPreferences = {
  language: 'en',
  region: '',
  zone: 'UTC',
  date: 'DD/MM/YYYY',
  time: '12-Hour',
};
export const defaultToggles = {
  email: true,
  inapp: true,
  feedback: true,
  low: true,
  weekly: true,
  news: false,
  security: true,
  reports: true,
  sound: false,
  popup: true,
};
function accountView(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    pendingEmail: user.pendingEmail || null,
    title: user.profile?.title || '',
    phone: user.profile?.phone || '',
    country: user.profile?.country || '',
    photo: user.profile?.photo || '',
    createdAt: user.createdAt,
    passwordChangedAt: user.passwordChangedAt || null,
    googleConnected: Boolean(user.googleSubject),
    preferences: { ...defaultPreferences, language: user.locale, ...user.preferences },
    toggles: {
      ...defaultToggles,
      ...user.notificationPreferences,
      security: true,
      weekly: user.weeklyReportsEnabled === true && user.notificationPreferences?.weekly !== false,
    },
    delivery: user.notificationDelivery || 'Daily digest',
    twoFA: Boolean(user.twoFactorEnabled),
  };
}
async function notificationFilter(userId, deps) {
  let access = null;
  try {
    access = await resolveAccess(userId, deps);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  return {
    userId,
    inapp: { $ne: false },
    $or: [
      { workspaceId: null },
      ...(access
        ? [
            {
              workspaceId: access.workspace._id,
              ...(access.branchIds
                ? { branchIds: { $not: { $elemMatch: { $nin: access.branchIds } } } }
                : {}),
            },
          ]
        : []),
    ],
  };
}
export function accountRoutes(deps) {
  const router = Router(),
    limit = createLimiter(deps);
  router.use(async (req, res, next) => {
    req.user = await requireVerifiedUser(req, deps);
    if (!['GET', 'HEAD'].includes(req.method))
      await new Promise((resolve, reject) =>
        csrfMiddleware(deps)(req, res, (error) => (error ? reject(error) : resolve())),
      );
    const reading = ['GET', 'HEAD'].includes(req.method);
    limit(`account:${reading ? 'read' : 'write'}:${req.user.id}`, reading ? 600 : 120, 900000, res);
    next();
  });
  const currentUser = (req) => deps.models.User.findOne({ _id: req.user.id }).lean();
  async function authorizeSensitive(req, body, res) {
    limit(`account:sensitive:${req.user.id}`, 10, 900000, res);
    const user = await currentUser(req);
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash)))
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    if (user.twoFactorEnabled && !(await verifySecondFactor(user, body.code, deps)))
      throw new ApiError(401, 'INVALID_TWO_FACTOR');
    return user;
  }
  router.get('/', async (req, res) => res.json(accountView(await currentUser(req))));
  router.patch('/', async (req, res) => {
    const input = parse(profileInput, req.body);
    await deps.models.User.updateOne(
      { _id: req.user.id },
      {
        $set: {
          name: input.name,
          profile: {
            title: input.title,
            phone: input.phone,
            country: input.country,
            photo: input.photo,
          },
          updatedAt: deps.now(),
        },
      },
    );
    res.json(accountView(await currentUser(req)));
  });
  router.put('/preferences', async (req, res) => {
    const input = parse(preferencesInput, req.body);
    await deps.models.User.updateOne(
      { _id: req.user.id },
      { $set: { preferences: input, locale: input.language, updatedAt: deps.now() } },
    );
    res.json(input);
  });
  router.put('/notifications', async (req, res) => {
    const input = parse(
      z
        .object({
          toggles: togglesInput,
          delivery: z.enum(['Daily digest', 'Immediately', 'Weekly digest']),
        })
        .strict(),
      req.body,
    );
    await deps.models.User.updateOne(
      { _id: req.user.id },
      {
        $set: {
          notificationPreferences: input.toggles,
          notificationDelivery: input.delivery,
          weeklyReportsEnabled: input.toggles.weekly,
          updatedAt: deps.now(),
        },
      },
    );
    res.json(input);
  });
  router.get('/notifications', async (req, res) => {
    const filter = await notificationFilter(req.user.id, deps);
    const [records, unreadCount, feedbackUnreadCount] = await Promise.all([
      deps.models.Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
      deps.models.Notification.countDocuments({ ...filter, readAt: null }),
      deps.models.Notification.countDocuments({ ...filter, readAt: null, kind: 'feedback' }),
    ]);
    res.json({
      unreadCount,
      feedbackUnreadCount,
      notifications: records.map(({ _id, title, body, readAt, createdAt, path, workspaceId }) => ({
        id: _id,
        title,
        body,
        readAt,
        createdAt,
        path,
        workspaceId: workspaceId || null,
      })),
    });
  });
  router.post('/notifications/read', async (req, res) => {
    const { ids } = parse(
      z.object({ ids: z.array(z.uuid()).max(100).optional() }).strict(),
      req.body,
    );
    await deps.models.Notification.updateMany(
      { ...(await notificationFilter(req.user.id, deps)), ...(ids ? { _id: { $in: ids } } : {}) },
      { $set: { readAt: deps.now() } },
    );
    res.json({ status: 'saved' });
  });
  router.get('/sessions', async (req, res) => {
    const current = await resolveSession(req, deps);
    const records = await deps.models.Session.find({
      userId: req.user.id,
      revokedAt: null,
      expiresAt: { $gt: deps.now() },
      credentialsVersion: current.user.credentialsVersion,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({
      sessions: records.map((s) => ({
        id: s._id,
        current: s._id === current.session._id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        userAgent: s.userAgent || '',
      })),
    });
  });
  router.delete('/sessions/:id', async (req, res) => {
    const id = parse(z.uuid(), req.params.id);
    const current = await resolveSession(req, deps);
    if (id === current.session._id) throw new ApiError(400, 'CURRENT_SESSION');
    await deps.models.Session.updateOne(
      { _id: id, userId: req.user.id },
      { $set: { revokedAt: deps.now() } },
    );
    res.json({ status: 'revoked' });
  });
  router.delete('/sessions', async (req, res) => {
    await deps.models.Session.updateMany(
      { userId: req.user.id, revokedAt: null },
      { $set: { revokedAt: deps.now() } },
    );
    res.json({ status: 'revoked' });
  });
  const sensitive = {
    currentPassword: z.string().min(1).max(128),
    code: z.string().regex(secondFactorPattern).optional(),
  };
  router.post('/password', async (req, res) => {
    const input = parse(z.object({ ...sensitive, password }).strict(), req.body);
    const user = await authorizeSensitive(req, input, res);
    const active = await resolveSession(req, deps);
    const passwordHash = await hashPassword(input.password);
    await transaction(deps, async (session) => {
      const result = await deps.models.User.updateOne(
        { _id: user._id, credentialsVersion: user.credentialsVersion },
        {
          $set: { passwordHash, passwordChangedAt: deps.now(), updatedAt: deps.now() },
          $unset: { pendingEmail: '', twoFactorPending: '' },
          $inc: { credentialsVersion: 1 },
        },
        { session },
      );
      if (!result.modifiedCount) throw new ApiError(409, 'STALE_CREDENTIALS');
      await deps.models.AuthToken.deleteOne(
        { userId: user._id, purpose: 'change-email' },
        { session },
      );
      await deps.models.MailOutbox.updateMany(
        { userId: user._id, kind: 'change-email' },
        { $set: { status: 'expired' }, $unset: { payload: '' } },
        { session },
      );
      await deps.models.Session.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: deps.now() } },
        { session },
      );
    });
    const session = await createSession(
      res,
      {
        userId: user._id,
        credentialsVersion: user.credentialsVersion + 1,
        workspaceId: active?.session.workspaceId || null,
        pendingInvitationDigest: active?.session.pendingInvitationDigest || null,
      },
      deps,
    );
    await emitUserNotification(
      user._id,
      {
        title: 'Password changed',
        body: 'Your NUVIA password was changed. Other sessions have been signed out.',
      },
      deps,
    ).catch(() => {});
    res.json({ status: 'password_changed', ...session });
  });
  router.post('/email', async (req, res) => {
    const input = parse(z.object({ ...sensitive, email }).strict(), req.body);
    const user = await authorizeSensitive(req, input, res);
    res.status(202).json(await requestEmailChange(user, input.email, deps));
  });
  router.post('/email/resend', async (req, res) => {
    parse(z.object({}).strict(), req.body);
    const user = await currentUser(req);
    if (!user.pendingEmail) throw new ApiError(400, 'NO_PENDING_EMAIL');
    res.status(202).json(await requestEmailChange(user, user.pendingEmail, deps));
  });
  router.delete('/email', async (req, res) => {
    res.json(await cancelEmailChange(req.user.id, deps));
  });
  router.post('/two-factor/setup', async (req, res) => {
    const input = parse(z.object(sensitive).strict(), req.body);
    const user = await authorizeSensitive(req, input, res);
    if (user.twoFactorEnabled) throw new ApiError(409, 'ALREADY_ENABLED');
    const secret = newTotpSecret();
    const enrolled = await deps.models.User.updateOne(
      {
        _id: user._id,
        credentialsVersion: user.credentialsVersion,
        twoFactorEnabled: { $ne: true },
      },
      {
        $set: {
          twoFactorPending: encryptPayload(
            { secret, expiresAt: deps.now().getTime() + 600000 },
            deps.config.mailKey,
          ),
        },
      },
    );
    if (!enrolled.modifiedCount) throw new ApiError(409, 'STALE_CREDENTIALS');
    res.json({
      secret,
      uri: `otpauth://totp/NUVIA:${encodeURIComponent(user.email)}?secret=${secret}&issuer=NUVIA&algorithm=SHA1&digits=6&period=30`,
    });
  });
  router.post('/two-factor', async (req, res) => {
    const input = parse(z.object({ ...sensitive, enabled: z.boolean() }).strict(), req.body);
    const user = await authorizeSensitive(req, input, res);
    const active = await resolveSession(req, deps);
    let secret;
    const recovery = input.enabled ? createRecoveryCodes() : null;
    if (input.enabled) {
      if (user.twoFactorEnabled) throw new ApiError(409, 'ALREADY_ENABLED');
      if (!user.twoFactorPending) throw new ApiError(400, 'SETUP_REQUIRED');
      const pending = decryptPayload(user.twoFactorPending, deps.config.mailKey);
      if (
        pending.expiresAt <= deps.now().getTime() ||
        !verifyTotp(pending.secret, input.code, deps.now().getTime())
      )
        throw new ApiError(400, 'INVALID_TWO_FACTOR');
      secret = pending.secret;
    } else if (!user.twoFactorEnabled) throw new ApiError(409, 'ALREADY_DISABLED');
    await transaction(deps, async (session) => {
      const filter = {
        _id: user._id,
        credentialsVersion: user.credentialsVersion,
        twoFactorEnabled: user.twoFactorEnabled ? true : { $ne: true },
        ...(input.enabled
          ? { 'twoFactorPending.ciphertext': user.twoFactorPending.ciphertext }
          : {}),
      };
      const updated = await deps.models.User.updateOne(
        filter,
        {
          $set: {
            twoFactorEnabled: input.enabled,
            twoFactorRecoveryHashes: recovery?.hashes || [],
            updatedAt: deps.now(),
            ...(input.enabled
              ? { twoFactorSecret: encryptPayload({ secret }, deps.config.mailKey) }
              : {}),
          },
          $unset: { twoFactorPending: '', ...(!input.enabled ? { twoFactorSecret: '' } : {}) },
          $inc: { credentialsVersion: 1 },
        },
        { session },
      );
      if (!updated.modifiedCount) throw new ApiError(409, 'STALE_CREDENTIALS');
      await deps.models.Session.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: deps.now() } },
        { session },
      );
      await deps.models.AuthToken.deleteOne(
        { userId: user._id, purpose: 'change-email' },
        { session },
      );
      await deps.models.User.updateOne(
        { _id: user._id },
        { $unset: { pendingEmail: '' } },
        { session },
      );
    });
    const refreshed = await createSession(
      res,
      {
        userId: user._id,
        credentialsVersion: user.credentialsVersion + 1,
        workspaceId: active?.session.workspaceId || null,
        pendingInvitationDigest: active?.session.pendingInvitationDigest || null,
      },
      deps,
    );
    await emitUserNotification(
      user._id,
      {
        title: input.enabled
          ? 'Two-factor authentication enabled'
          : 'Two-factor authentication disabled',
        body: 'Your account security settings changed. Other sessions have been signed out.',
      },
      deps,
    ).catch(() => {});
    res.json({
      enabled: input.enabled,
      ...(recovery ? { recoveryCodes: recovery.codes } : {}),
      ...refreshed,
    });
  });
  router.post('/notifications/test', async (req, res) => {
    parse(z.object({}).strict(), req.body);
    const user = await currentUser(req);
    await deps.models.Notification.insertOne({
      _id: randomUUID(),
      userId: user._id,
      title: 'Notifications enabled',
      body: 'Your notification preferences are saved.',
      path: '/settings-notifications',
      createdAt: deps.now(),
      readAt: null,
    });
    res.status(201).json({ status: 'created' });
  });
  return router;
}
