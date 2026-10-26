import { randomBytes, createHash } from 'node:crypto';
import { decryptPayload } from '../mail/crypto.mjs';
import { verifyTotp } from './totp.mjs';

export const secondFactorPattern =
  /^(?:\d{6}|[a-fA-F0-9]{4}(?:-[a-fA-F0-9]{4}){4}|[a-fA-F0-9]{20})$/;
const normalized = (value) =>
  String(value || '')
    .replaceAll('-', '')
    .toLowerCase();
export const recoveryDigest = (value) =>
  createHash('sha256').update(normalized(value)).digest('hex');
export function createRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(10).toString('hex').match(/.{4}/g).join('-'),
  );
  return { codes, hashes: codes.map(recoveryDigest) };
}

export async function verifySecondFactor(user, code, deps) {
  if (/^\d{6}$/.test(code || ''))
    return verifyTotp(
      decryptPayload(user.twoFactorSecret, deps.config.mailKey).secret,
      code,
      deps.now().getTime(),
    );
  if (!secondFactorPattern.test(code || '')) return false;
  const hash = recoveryDigest(code);
  // Atomic pull prevents the same recovery code authenticating concurrent requests twice.
  const used = await deps.models.User.updateOne(
    {
      _id: user._id,
      credentialsVersion: user.credentialsVersion,
      twoFactorEnabled: true,
      twoFactorRecoveryHashes: hash,
    },
    { $pull: { twoFactorRecoveryHashes: hash } },
  );
  return used.modifiedCount === 1;
}
