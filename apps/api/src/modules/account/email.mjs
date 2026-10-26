import { randomBytes } from 'node:crypto';
import { digest } from '../auth/sessions.mjs';
import { enqueueAuthMail } from '../mail/outbox.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { ApiError } from '../../middleware/errors.mjs';
export async function requestEmailChange(user, address, deps) {
  if (address === user.email || (await deps.models.User.exists({ email: address })))
    throw new ApiError(409, 'EMAIL_USED');
  await transaction(deps, async (session) => {
    const token = randomBytes(32).toString('hex'),
      expiresAt = new Date(deps.now().getTime() + 1800000);
    const updated = await deps.models.User.updateOne(
      { _id: user._id, credentialsVersion: user.credentialsVersion },
      { $set: { pendingEmail: address, updatedAt: deps.now() } },
      { session },
    );
    if (!updated.matchedCount) throw new ApiError(409, 'STALE_CREDENTIALS');
    await deps.models.AuthToken.updateOne(
      { userId: user._id, purpose: 'change-email' },
      {
        $set: {
          digest: digest(token),
          credentialsVersion: user.credentialsVersion,
          targetEmail: address,
          expiresAt,
          createdAt: deps.now(),
        },
      },
      { upsert: true, session },
    );
    await enqueueAuthMail(
      { userId: user._id, kind: 'change-email', token, expiresAt },
      deps,
      session,
    );
  });
  return { status: 'verification_required' };
}
export async function cancelEmailChange(userId, deps) {
  await transaction(deps, async (session) => {
    await deps.models.User.updateOne(
      { _id: userId },
      { $unset: { pendingEmail: '' } },
      { session },
    );
    await deps.models.AuthToken.deleteOne({ userId, purpose: 'change-email' }, { session });
    await deps.models.MailOutbox.updateMany(
      { userId, kind: 'change-email' },
      { $set: { status: 'expired' }, $unset: { payload: '' } },
      { session },
    );
  });
  return { status: 'cancelled' };
}
