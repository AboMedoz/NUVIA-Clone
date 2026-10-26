import { Router } from 'express';
import { randomBytes, randomUUID, createHash, createPublicKey, verify } from 'node:crypto';
import { z, parse, locale } from '../../shared/validation.mjs';
import { ApiError } from '../../middleware/errors.mjs';
import { createLimiter } from '../../middleware/rate-limits.mjs';
import { csrfMiddleware } from '../../middleware/security.mjs';
import { encryptPayload, decryptPayload } from '../mail/crypto.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { verifySecondFactor, secondFactorPattern } from '../account/recovery.mjs';
import { digest, resolveSession, revokeSession, createSession } from './sessions.mjs';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const configured = (deps) =>
  Boolean(deps.config.google?.clientId && deps.config.google?.clientSecret);

async function authorizeGoogleLink(input, req, deps) {
  const current = await resolveSession(req, deps);
  const user = current?.user;
  if (!user?.verifiedAt) throw new ApiError(401, 'AUTH_REQUIRED');
  if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.passwordHash)))
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  if (user.twoFactorEnabled && !(await verifySecondFactor(user, input.code, deps)))
    throw new ApiError(401, 'INVALID_TWO_FACTOR');
  return current;
}

async function googleRequest(url, options, deps) {
  let response;
  try {
    response = await (deps.fetch || fetch)(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new ApiError(502, 'GOOGLE_UNAVAILABLE');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new ApiError(502, 'GOOGLE_UNAVAILABLE');
  return result;
}

// Validate the signed ID token, never unverified browser identity or email alone.
export function validateGoogleIdToken(token, keys, { clientId, nonce, now = Date.now() }) {
  const invalid = () => {
    throw new ApiError(400, 'GOOGLE_IDENTITY_INVALID');
  };
  if (typeof token !== 'string' || token.length > 16000) invalid();
  const parts = token.split('.');
  if (parts.length !== 3) invalid();
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const key = keys.find(
      (item) =>
        item.kid === header.kid && item.kty === 'RSA' && (!item.alg || item.alg === 'RS256'),
    );
    if (
      header.alg !== 'RS256' ||
      !key ||
      !verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey({ key, format: 'jwk' }),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      invalid();
  } catch {
    invalid();
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
    !audiences.includes(clientId) ||
    (audiences.length > 1 && claims.azp !== clientId) ||
    (claims.azp && claims.azp !== clientId) ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat * 1000 > now + 60000 ||
    claims.nonce !== nonce ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    claims.sub.length > 255 ||
    claims.email_verified !== true ||
    typeof claims.email !== 'string' ||
    claims.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
  )
    invalid();
  return {
    subject: claims.sub,
    email: claims.email.trim().toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 120) : '',
  };
}

export async function startGoogle(input, req, deps) {
  if (!configured(deps)) throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED');
  const current = await resolveSession(req, deps);
  if (!current) throw new ApiError(403, 'CSRF_REJECTED');
  if (input.link) await authorizeGoogleLink(input, req, deps);
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  const nonce = randomBytes(32).toString('hex');
  await deps.models.OAuthState.insertOne({
    _id: randomUUID(),
    digest: digest(state),
    sessionDigest: current.session.digest,
    payload: encryptPayload(
      {
        verifier,
        nonce,
        locale: input.locale,
        terms: input.terms,
        linkUserId: input.link ? current.user._id : null,
        credentialsVersion: current.user?.credentialsVersion || null,
      },
      deps.config.mailKey,
    ),
    createdAt: deps.now(),
    expiresAt: new Date(deps.now().getTime() + 10 * 60000),
  });
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: deps.config.google.clientId,
    redirect_uri: deps.config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.href };
}

export async function finishGoogle(query, req, res, deps) {
  if (!configured(deps)) throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED');
  const current = await resolveSession(req, deps);
  if (!current) throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  const state = await deps.models.OAuthState.findOneAndDelete({
    digest: digest(query.state),
    sessionDigest: current.session.digest,
    expiresAt: { $gt: deps.now() },
  }).lean();
  if (!state) throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  const stored = decryptPayload(state.payload, deps.config.mailKey);
  if (query.error) throw new ApiError(400, 'GOOGLE_CANCELLED');
  if (!query.code) throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  const tokens = await googleRequest(
    GOOGLE_TOKEN,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: query.code,
        client_id: deps.config.google.clientId,
        client_secret: deps.config.google.clientSecret,
        redirect_uri: deps.config.google.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: stored.verifier,
      }),
    },
    deps,
  );
  const certs = await googleRequest(GOOGLE_CERTS, {}, deps);
  const identity = validateGoogleIdToken(tokens.id_token, certs.keys || [], {
    clientId: deps.config.google.clientId,
    nonce: stored.nonce,
    now: deps.now().getTime(),
  });
  let user = await deps.models.User.findOne({ googleSubject: identity.subject }).lean();
  if (stored.linkUserId) {
    if (
      !current.user ||
      current.user._id !== stored.linkUserId ||
      current.user.credentialsVersion !== stored.credentialsVersion ||
      identity.email !== current.user.email
    )
      throw new ApiError(400, 'GOOGLE_LINK_INVALID');
    if (
      (user && user._id !== current.user._id) ||
      (current.user.googleSubject && current.user.googleSubject !== identity.subject)
    )
      throw new ApiError(409, 'GOOGLE_ALREADY_LINKED');
    try {
      await transaction(deps, async (session) => {
        const linked = await deps.models.User.updateOne(
          { _id: current.user._id, credentialsVersion: stored.credentialsVersion },
          {
            $set: { googleSubject: identity.subject, updatedAt: deps.now() },
            $inc: { credentialsVersion: 1 },
          },
          { session },
        );
        if (!linked.modifiedCount) throw new ApiError(409, 'STALE_CREDENTIALS');
        await deps.models.Session.updateMany(
          { userId: current.user._id, revokedAt: null },
          { $set: { revokedAt: deps.now() } },
          { session },
        );
      });
    } catch (error) {
      if (error.code === 11000) throw new ApiError(409, 'GOOGLE_ALREADY_LINKED');
      throw error;
    }
    await createSession(
      res,
      {
        userId: current.user._id,
        credentialsVersion: stored.credentialsVersion + 1,
        workspaceId: current.session.workspaceId || null,
        pendingInvitationDigest: current.session.pendingInvitationDigest || null,
      },
      deps,
    );
    return { status: 'linked' };
  }
  if (!user) {
    // Existing local accounts require their own sign-in; email matching never links identities.
    if (await deps.models.User.findOne({ email: identity.email }).lean())
      throw new ApiError(409, 'GOOGLE_ACCOUNT_NOT_LINKED');
    if (!stored.terms) throw new ApiError(400, 'TERMS_REQUIRED');
    user = {
      _id: randomUUID(),
      name: identity.name || identity.email.split('@')[0],
      email: identity.email,
      locale: stored.locale,
      passwordHash: await hashPassword(randomBytes(48).toString('base64url')),
      credentialsVersion: 1,
      verifiedAt: deps.now(),
      termsAcceptedAt: state.createdAt,
      googleSubject: identity.subject,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    };
    try {
      await transaction(deps, async (session) => deps.models.User.insertOne(user, { session }));
    } catch (error) {
      if (error.code === 11000) throw new ApiError(409, 'GOOGLE_ACCOUNT_NOT_LINKED');
      throw error;
    }
  }
  // A configured local second factor is never bypassed by a Google identity.
  if (user.twoFactorEnabled) {
    const challenge = randomBytes(32).toString('hex');
    await deps.models.OAuthState.insertOne({
      _id: randomUUID(),
      digest: digest(challenge),
      sessionDigest: current.session.digest,
      payload: encryptPayload(
        {
          purpose: 'google_second_factor',
          userId: user._id,
          credentialsVersion: user.credentialsVersion,
        },
        deps.config.mailKey,
      ),
      createdAt: deps.now(),
      expiresAt: new Date(deps.now().getTime() + 5 * 60000),
    });
    return { status: 'second_factor_required', challenge };
  }
  await revokeSession(req, res, deps, { clearCookie: false });
  await createSession(
    res,
    {
      userId: user._id,
      credentialsVersion: user.credentialsVersion,
      workspaceId: current.user?._id === user._id ? current.session.workspaceId || null : null,
      pendingInvitationDigest: current.session.pendingInvitationDigest || null,
    },
    deps,
  );
  return { status: 'signed_in' };
}

export async function completeGoogleSecondFactor(input, req, res, deps) {
  const current = await resolveSession(req, deps);
  if (!current) throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  const query = {
    digest: digest(input.challenge),
    sessionDigest: current.session.digest,
    expiresAt: { $gt: deps.now() },
  };
  const challenge = await deps.models.OAuthState.findOne(query).lean();
  if (!challenge) throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  const payload = decryptPayload(challenge.payload, deps.config.mailKey);
  if (payload.purpose !== 'google_second_factor') throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  const user = await deps.models.User.findOne({
    _id: payload.userId,
    credentialsVersion: payload.credentialsVersion,
    twoFactorEnabled: true,
  }).lean();
  if (!user || !(await verifySecondFactor(user, input.code, deps)))
    throw new ApiError(401, 'INVALID_TWO_FACTOR');
  const consumed = await deps.models.OAuthState.findOneAndDelete(query).lean();
  if (!consumed) throw new ApiError(400, 'GOOGLE_STATE_INVALID');
  await revokeSession(req, res, deps, { clearCookie: false });
  await createSession(
    res,
    {
      userId: user._id,
      credentialsVersion: user.credentialsVersion,
      workspaceId: current.user?._id === user._id ? current.session.workspaceId || null : null,
      pendingInvitationDigest: current.session.pendingInvitationDigest || null,
    },
    deps,
  );
  return { status: 'signed_in' };
}

export function googleRoutes(deps) {
  const router = Router();
  const limit = createLimiter(deps);
  router.post('/start', csrfMiddleware(deps), async (req, res) => {
    limit('google:start:' + req.ip, 20, 900000, res);
    const input = parse(
      z
        .object({
          terms: z.boolean().default(false),
          locale: locale.default('en'),
          link: z.boolean().default(false),
          currentPassword: z.string().min(1).max(128).optional(),
          code: z.string().regex(secondFactorPattern).optional(),
        })
        .strict(),
      req.body,
    );
    res.json(await startGoogle(input, req, deps));
  });
  router.post('/unlink', csrfMiddleware(deps), async (req, res) => {
    limit('google:unlink:' + req.ip, 10, 900000, res);
    const input = parse(
      z
        .object({
          currentPassword: z.string().min(1).max(128),
          code: z.string().regex(secondFactorPattern).optional(),
        })
        .strict(),
      req.body,
    );
    const current = await authorizeGoogleLink(input, req, deps);
    if (!current.user.googleSubject) throw new ApiError(409, 'GOOGLE_NOT_LINKED');
    await transaction(deps, async (session) => {
      const updated = await deps.models.User.updateOne(
        { _id: current.user._id, credentialsVersion: current.user.credentialsVersion },
        {
          $unset: { googleSubject: '' },
          $inc: { credentialsVersion: 1 },
          $set: { updatedAt: deps.now() },
        },
        { session },
      );
      if (!updated.modifiedCount) throw new ApiError(409, 'STALE_CREDENTIALS');
      await deps.models.Session.updateMany(
        { userId: current.user._id, revokedAt: null },
        { $set: { revokedAt: deps.now() } },
        { session },
      );
    });
    const refreshed = await createSession(
      res,
      {
        userId: current.user._id,
        credentialsVersion: current.user.credentialsVersion + 1,
        workspaceId: current.session.workspaceId || null,
        pendingInvitationDigest: current.session.pendingInvitationDigest || null,
      },
      deps,
    );
    res.json({ status: 'disconnected', ...refreshed });
  });
  router.post('/second-factor', csrfMiddleware(deps), async (req, res) => {
    limit('google:second-factor:' + req.ip, 10, 900000, res);
    const input = parse(
      z
        .object({
          challenge: z.string().regex(/^[a-f0-9]{64}$/),
          code: z.string().regex(secondFactorPattern),
        })
        .strict(),
      req.body,
    );
    res.json(await completeGoogleSecondFactor(input, req, res, deps));
  });
  router.get('/callback', async (req, res) => {
    limit('google:callback:' + req.ip, 30, 900000, res);
    try {
      const query = parse(
        z
          .object({
            state: z.string().regex(/^[a-f0-9]{64}$/),
            code: z.string().max(4096).optional(),
            error: z.string().max(120).optional(),
          })
          .passthrough(),
        req.query,
      );
      const result = await finishGoogle(query, req, res, deps);
      res.redirect(
        303,
        deps.config.appOrigin +
          (result.challenge
            ? '/#/login?googleChallenge=' + result.challenge
            : result.status === 'linked'
              ? '/#/settings-security?google=linked'
              : '/#/dashboard'),
      );
    } catch (error) {
      const code = [
        'GOOGLE_ACCOUNT_NOT_LINKED',
        'TWO_FACTOR_REQUIRED',
        'GOOGLE_CANCELLED',
        'TERMS_REQUIRED',
      ].includes(error.code)
        ? error.code
        : 'GOOGLE_SIGN_IN_FAILED';
      res.redirect(303, deps.config.appOrigin + '/#/login?googleError=' + code);
    }
  });
  return router;
}
