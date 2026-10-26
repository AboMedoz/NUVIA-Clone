import { randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { hashPassword, verifyPassword, dummyHash } from './passwords.mjs';
import {
  digest,
  userView,
  revokeSession,
  createSession,
  bootstrapSession,
  resolveSession,
} from './sessions.mjs';
import { enqueueAuthMail } from '../mail/outbox.mjs';
import { verifySecondFactor } from '../account/recovery.mjs';

async function issueToken(userId, purpose, deps, session) {
  const issuedTo = await deps.models.User.findOne({ _id: userId }, null, { session })
    .select('credentialsVersion')
    .lean();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(
    deps.now().getTime() + (purpose === 'verify' ? 24 * 3600000 : 30 * 60000),
  );
  await deps.models.AuthToken.updateOne(
    { userId, purpose },
    {
      $set: {
        digest: digest(token),
        credentialsVersion: issuedTo.credentialsVersion,
        expiresAt,
        createdAt: deps.now(),
      },
    },
    { upsert: true, session },
  );
  await enqueueAuthMail({ userId, kind: purpose, token, expiresAt }, deps, session);
}
export async function registerOwner(input, deps) {
  const user = {
    _id: randomUUID(),
    name: input.name,
    email: input.email,
    locale: input.locale,
    passwordHash: await hashPassword(input.password),
    credentialsVersion: 1,
    verifiedAt: null,
    termsAcceptedAt: deps.now(),
    createdAt: deps.now(),
    updatedAt: deps.now(),
  };
  try {
    await transaction(deps, async (session) => {
      await deps.models.User.insertOne(user, { session });
      await issueToken(user._id, 'verify', deps, session);
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'EMAIL_USED');
    throw error;
  }
  return userView(user);
}
export async function getSessionView(req, res, deps) {
  const view = await bootstrapSession(req, res, deps);
  let workspace = null;
  if (view.user?.emailVerified) {
    const { getWorkspace } = await import('../workspaces/service.mjs');
    try {
      workspace = await getWorkspace(view.user.id, deps);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  return { ...view, workspace };
}
export async function loginOwner(input, req, res, deps) {
  const user = await deps.models.User.findOne({ email: input.email }).lean();
  if (!(await verifyPassword(input.password, user?.passwordHash || dummyHash)) || !user)
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  if (!user.verifiedAt) throw new ApiError(403, 'EMAIL_VERIFICATION_REQUIRED');
  if (user.twoFactorEnabled) {
    if (!input.code) throw new ApiError(401, 'TWO_FACTOR_REQUIRED');
    if (!(await verifySecondFactor(user, input.code, deps)))
      throw new ApiError(401, 'INVALID_TWO_FACTOR');
  }
  const previous = await resolveSession(req, deps);
  await revokeSession(req, res, deps, { clearCookie: false });
  const { csrfToken } = await createSession(
    res,
    {
      userId: user._id,
      remember: input.remember,
      credentialsVersion: user.credentialsVersion,
      workspaceId: previous?.user?._id === user._id ? previous.session.workspaceId || null : null,
      pendingInvitationDigest: previous?.session.pendingInvitationDigest || null,
    },
    deps,
  );
  return { user: userView(user), csrfToken };
}
export async function requestVerification({ email }, deps) {
  await transaction(deps, async (session) => {
    const user = await deps.models.User.findOne({ email, verifiedAt: null }, null, {
      session,
    }).lean();
    if (user) {
      await deps.models.User.updateOne(
        { _id: user._id },
        { $set: { updatedAt: deps.now() } },
        { session },
      );
      await issueToken(user._id, 'verify', deps, session);
    }
  });
}
export async function requestPasswordReset({ email }, deps) {
  await transaction(deps, async (session) => {
    const user = await deps.models.User.findOne({ email, verifiedAt: { $ne: null } }, null, {
      session,
    }).lean();
    if (user) {
      await deps.models.User.updateOne(
        { _id: user._id },
        { $set: { updatedAt: deps.now() } },
        { session },
      );
      await issueToken(user._id, 'reset', deps, session);
    }
  });
}
async function consumeToken(token, purpose, deps, apply) {
  await transaction(deps, async (session) => {
    const record = await deps.models.AuthToken.findOneAndDelete(
      { digest: digest(token), purpose, expiresAt: { $gt: deps.now() } },
      { session },
    ).lean();
    if (!record) throw new ApiError(400, 'INVALID_TOKEN');
    if (record.credentialsVersion != null) {
      const current = await deps.models.User.findOne({ _id: record.userId }, null, { session })
        .select('credentialsVersion')
        .lean();
      if (!current || current.credentialsVersion !== record.credentialsVersion)
        throw new ApiError(400, 'INVALID_TOKEN');
    }
    await apply(record.userId, session, record);
    await deps.models.MailOutbox.updateMany(
      { userId: record.userId, kind: purpose, tokenDigest: record.digest },
      { $set: { status: 'expired' }, $unset: { payload: '' } },
      { session },
    );
  });
}
export async function verifyEmail({ token }, deps) {
  const change = await deps.models.AuthToken.findOne({
    digest: digest(token),
    purpose: 'change-email',
    expiresAt: { $gt: deps.now() },
  }).lean();
  if (change) {
    try {
      await consumeToken(token, 'change-email', deps, async (userId, session, record) => {
        if (!Number.isInteger(record.credentialsVersion)) throw new ApiError(400, 'INVALID_TOKEN');
        const result = await deps.models.User.updateOne(
          {
            _id: userId,
            pendingEmail: record.targetEmail,
            credentialsVersion: record.credentialsVersion,
          },
          {
            $set: { email: record.targetEmail, verifiedAt: deps.now(), updatedAt: deps.now() },
            $unset: { pendingEmail: '' },
            $inc: { credentialsVersion: 1 },
          },
          { session },
        );
        if (!result.modifiedCount) throw new ApiError(400, 'INVALID_TOKEN');
        await deps.models.Session.updateMany(
          { userId, revokedAt: null },
          { $set: { revokedAt: deps.now() } },
          { session },
        );
      });
    } catch (error) {
      if (error.code === 11000) throw new ApiError(409, 'EMAIL_USED');
      throw error;
    }
    return;
  }
  await consumeToken(token, 'verify', deps, async (userId, session) => {
    await deps.models.User.updateOne(
      { _id: userId },
      { $set: { verifiedAt: deps.now(), updatedAt: deps.now() } },
      { session },
    );
  });
}
export async function resetPassword({ token, password }, deps) {
  const passwordHash = await hashPassword(password);
  await consumeToken(token, 'reset', deps, async (userId, session) => {
    await deps.models.User.updateOne(
      { _id: userId },
      {
        $set: { passwordHash, passwordChangedAt: deps.now(), updatedAt: deps.now() },
        $unset: { pendingEmail: '', twoFactorPending: '' },
        $inc: { credentialsVersion: 1 },
      },
      { session },
    );
    await deps.models.Session.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: deps.now() } },
      { session },
    );
    await deps.models.AuthToken.deleteOne({ userId, purpose: 'change-email' }, { session });
    await deps.models.MailOutbox.updateMany(
      { userId, kind: 'change-email' },
      { $set: { status: 'expired' }, $unset: { payload: '' } },
      { session },
    );
  });
}
