const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('shared-post login returns only to a safe app route', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/auth.js'), 'utf8').split('// Login stays')[0];
  for (const [target, expected] of [['/index.html#/post/0123456789abcdef01234567', '/index.html#/post/0123456789abcdef01234567'], ['https://evil.example', 'index.html'], ['//evil.example/#/post/0123456789abcdef01234567', 'index.html']]) {
    let removed = false;
    const context = { document: { querySelector() {} }, location: { pathname: '/login.html' }, sessionStorage: { getItem: () => target, removeItem: () => { removed = true; } } };
    vm.runInNewContext(source + '\nfinishLogin();', context);
    assert.equal(context.location.href, expected); assert.equal(removed, true);
  }
});
test('frontend media rendering rejects legacy stored injection payloads', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/script.js'), 'utf8');
  const declaration = source.split('\n').find(line => line.startsWith('const mediaURL ='));
  const context = {};
  vm.runInNewContext(declaration + '\nglobalThis.clean = mediaURL;', context);
  assert.equal(context.clean('x" onerror="alert(1)'), '');
  assert.equal(context.clean('data:image/svg+xml;base64,aGVsbG8='), '');
  assert.equal(context.clean('data:image/png;base64,aGVsbG8='), 'data:image/png;base64,aGVsbG8=');
});
