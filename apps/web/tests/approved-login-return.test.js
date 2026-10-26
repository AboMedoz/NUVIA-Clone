import { it, expect } from 'vitest';
import {
  safeProductReturn,
  saveProductReturn,
  readProductReturn,
  takeProductReturn,
} from '../src/app/router/login-return.js';
it('preserves only bounded internal product routes and public UUID context across provider redirects', () => {
  const id = '12345678-1234-4234-9234-123456789abc';
  saveProductReturn(`#/report-details?id=${id}&workspace=${id}&token=secret&search=private`);
  expect(readProductReturn()).toBe(`#/report-details?id=${id}&workspace=${id}`);
  expect(takeProductReturn()).toBe(`#/report-details?id=${id}&workspace=${id}`);
  expect(readProductReturn()).toBeNull();
  expect(safeProductReturn('https://attacker.example')).toBeNull();
  expect(safeProductReturn('#/reset?token=secret')).toBeNull();
  expect(safeProductReturn('#/team/accept?token=secret')).toBeNull();
});
