import { randomUUID, randomBytes } from 'node:crypto';
import { digest } from '../auth/sessions.mjs';
import { assertBranches, requireWrite } from './access.mjs';
import { ApiError } from '../../middleware/errors.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { encryptPayload } from '../mail/crypto.mjs';
export const invitationView = (i) => ({
  id: i._id,
  email: i.email,
  role: i.role,
  branchIds: i.branchIds,
  createdAt: i.createdAt,
  expiresAt: i.expiresAt,
  acceptedAt: i.acceptedAt,
  revokedAt: i.revokedAt,
});
export async function listTeam(access, deps) {
  requireWrite(access, true);
  const members = await deps.models.Membership.find({
    workspaceId: access.workspace._id,
    revokedAt: null,
  }).lean();
  const users = await deps.models.User.find({ _id: { $in: members.map((m) => m.userId) } }).lean();
  const owner = await deps.models.User.findOne({ _id: access.workspace.ownerUserId }).lean();
  return {
    members: [
      {
        id: owner._id,
        userId: owner._id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        branchIds: null,
      },
      ...members.map((m) => ({
        id: m._id,
        userId: m.userId,
        role: m.role,
        branchIds: m.branchIds,
        name: users.find((u) => u._id === m.userId)?.name,
        email: users.find((u) => u._id === m.userId)?.email,
      })),
    ],
    invitations: (
      await deps.models.Invitation.find({
        workspaceId: access.workspace._id,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { $gt: deps.now() },
      }).lean()
    ).map(invitationView),
  };
}
export async function invite(input, access, deps) {
  requireWrite(access, true);
  await assertBranches(access, input.branchIds, deps);
  const owner = await deps.models.User.findOne({ _id: access.workspace.ownerUserId }).lean();
  if (input.email === owner.email) throw new ApiError(409, 'OWNER_ALREADY_MEMBER');
  const token = randomBytes(32).toString('hex');
  const record = await transaction(deps, async (session) => {
    await deps.models.Invitation.updateMany(
      { workspaceId: access.workspace._id, email: input.email, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: deps.now() } },
      { session },
    );
    const invitation = await deps.models.Invitation.insertOne(
      {
        _id: randomUUID(),
        workspaceId: access.workspace._id,
        ...input,
        tokenDigest: digest(token),
        createdAt: deps.now(),
        expiresAt: new Date(deps.now().getTime() + 7 * 86400000),
        revokedAt: null,
        acceptedAt: null,
      },
      { session },
    );
    await deps.models.MailOutbox.insertOne(
      {
        _id: randomUUID(),
        invitationId: invitation._id,
        kind: 'invitation',
        tokenDigest: digest(token),
        expiresAt: invitation.expiresAt,
        payload: encryptPayload(
          {
            token,
            email: input.email,
            locale: access.workspace.locale,
            businessName: access.workspace.name,
          },
          deps.config.mailKey,
        ),
        status: 'pending',
        attempts: 0,
        createdAt: deps.now(),
        nextAttemptAt: deps.now(),
      },
      { session },
    );
    return invitation;
  });
  // Only the owner receives the newly issued link. Raw invitation tokens are never persisted.
  return {
    ...invitationView(record),
    acceptUrl: `${deps.config.appOrigin}/#/team/accept?token=${token}`,
  };
}
export async function acceptInvitation(token, user, deps, { invitationDigest, sessionId } = {}) {
  const tokenDigest = token ? digest(token) : invitationDigest;
  if (!/^[a-f0-9]{64}$/.test(tokenDigest || '')) throw new ApiError(400, 'INVALID_TOKEN');
  return transaction(deps, async (session) => {
    const invitation = await deps.models.Invitation.findOneAndUpdate(
      {
        tokenDigest,
        email: user.email,
        expiresAt: { $gt: deps.now() },
        acceptedAt: null,
        revokedAt: null,
      },
      { $set: { acceptedAt: deps.now() } },
      { returnDocument: 'after', session },
    ).lean();
    if (!invitation) throw new ApiError(400, 'INVALID_TOKEN');
    const existingWorkspace = await deps.models.Workspace.findOne({ ownerUserId: user.id }, null, {
      session,
    }).lean();
    const existingMembership = await deps.models.Membership.findOne(
      { userId: user.id, workspaceId: { $ne: invitation.workspaceId }, revokedAt: null },
      null,
      { session },
    ).lean();
    if (existingWorkspace || existingMembership)
      throw new ApiError(409, 'WORKSPACE_ALREADY_SELECTED');
    await deps.models.Membership.updateOne(
      { workspaceId: invitation.workspaceId, userId: user.id },
      {
        $set: {
          role: invitation.role,
          branchIds: invitation.branchIds,
          revokedAt: null,
          updatedAt: deps.now(),
        },
        $setOnInsert: { _id: randomUUID(), createdAt: deps.now() },
      },
      { upsert: true, session },
    );
    if (sessionId)
      await deps.models.Session.updateOne(
        { _id: sessionId, userId: user.id },
        { $set: { pendingInvitationDigest: null } },
        { session },
      );
    return { status: 'accepted', workspaceId: invitation.workspaceId };
  });
}
export async function updateMember(id, input, access, deps) {
  requireWrite(access, true);
  if (input.branchIds) await assertBranches(access, input.branchIds, deps);
  const member = await deps.models.Membership.findOneAndUpdate(
    { _id: id, workspaceId: access.workspace._id, revokedAt: null },
    { $set: { ...input, updatedAt: deps.now() } },
    { returnDocument: 'after' },
  ).lean();
  if (!member) throw new ApiError(404, 'NOT_FOUND');
  return { id: member._id, userId: member.userId, role: member.role, branchIds: member.branchIds };
}
export async function revoke(kind, id, access, deps) {
  requireWrite(access, true);
  const model = kind === 'member' ? deps.models.Membership : deps.models.Invitation;
  const result = await model.updateOne(
    { _id: id, workspaceId: access.workspace._id, revokedAt: null },
    { $set: { revokedAt: deps.now() } },
  );
  if (!result.matchedCount) throw new ApiError(404, 'NOT_FOUND');
}
