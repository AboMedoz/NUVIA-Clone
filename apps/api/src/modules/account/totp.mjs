import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  let bits = '';
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)
    .map((part) => alphabet[parseInt(part, 2)])
    .join('');
}
export function totp(secret, time = Date.now()) {
  const bits = [...secret]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function verifyTotp(secret, code, time = Date.now()) {
  if (!/^[0-9]{6}$/.test(code || '')) return false;
  return [-1, 0, 1].some((step) =>
    timingSafeEqual(Buffer.from(totp(secret, time + step * 30000)), Buffer.from(code)),
  );
}
