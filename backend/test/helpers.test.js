const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validMedia } = require('../middleware/validate');
const limit = require('../middleware/rateLimit');
test('media validation rejects attribute injection, SVG and oversized uploads', () => {
  assert.equal(validMedia('data:image/png;base64,aGVsbG8='), true);
  assert.equal(validMedia('data:image/svg+xml;base64,aGVsbG8='), false);
  assert.equal(validMedia('x" onerror="alert(1)'), false);
  assert.equal(validMedia('data:video/mp4;base64,aGVsbG8=', true), false);
  assert.equal(validMedia('data:image/png;base64,' + 'a'.repeat(3e6), true), false);
});
test('authentication rate limit returns retry guidance', () => {
  const middleware = limit({ limit: 2 }); let allowed = 0, status, body; const headers = {};
  const res = { set(key, value) { headers[key] = value; }, status(code) { status = code; return this; }, json(value) { body = value; } };
  for (let i = 0; i < 3; i++) middleware({ ip: 'test' }, res, () => allowed++);
  assert.equal(allowed, 2); assert.equal(status, 429); assert.ok(Number(headers['Retry-After']) > 0); assert.match(body.message, /Too many/);
});
