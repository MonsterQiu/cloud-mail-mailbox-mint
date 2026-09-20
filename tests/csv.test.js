import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, credentialText } from '../lib/csv.js';
test('CSV quotes quotes, commas and lines and prevents spreadsheet formulas', () => {
  const csv = toCsv([{ email: 'a@example.com', password: '=HYPERLINK("test")', loginUrl: 'https://a.com', createdAt: 'one,\ntwo', status: 'created' }]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"\'=HYPERLINK(""test"")"')); assert.ok(csv.includes('"one,\ntwo"'));
});
test('plain credentials and JSON preserve exact passwords', () => {
  const row = { email: 'a@example.com', password: '+Pass"word!', loginUrl: 'https://a.com' };
  assert.ok(credentialText(row).includes(row.password)); assert.equal(JSON.parse(JSON.stringify(row)).password, row.password);
});
