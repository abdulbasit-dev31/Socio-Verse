const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const { io: client } = require('socket.io-client');
const crypto = require('crypto');
const { createServer } = require('../server');
const User = require('../models/User'), Story = require('../models/Story'), Post = require('../models/Post');
let mongo, server, io, base, alice, bob, carol;
async function request(path, method = 'GET', body, user) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + user.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function register(username) {
  const result = await request('/auth/register', 'POST', { fullName: username, username, email: username + '@example.com', password: 'password123', dob: '2000-01-01' });
  assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body;
}
before(async () => {
  process.env.JWT_SECRET = 'test-only-secret-01234567890123456789';
  if (process.env.TEST_MONGO_URI) {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'socioverse_test_' + crypto.randomBytes(6).toString('hex') });
  } else {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }
  ({ server, io } = createServer());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  alice = await register('alice'); bob = await register('bob'); carol = await register('carol');
}, { timeout: 180000 });
after(async () => { if (io) { io.disconnectSockets(true); server.closeAllConnections(); await new Promise(resolve => io.close(resolve)); } if (mongoose.connection.name?.startsWith('socioverse_test_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); if (mongo) await mongo.stop(); });

test('authentication, validation and errors return JSON without crashing', async () => {
  assert.equal((await request('/users/me')).status, 401);
  assert.equal((await request('/users/not-an-id', 'GET', undefined, alice)).status, 400);
  assert.equal((await request('/posts', 'POST', { text: {} }, alice)).status, 400);
  assert.equal((await request('/users/me', 'PUT', { isPrivate: 'false' }, alice)).status, 400);
  assert.equal((await request('/users/me', 'PUT', { avatar: '" onerror="alert(1)' }, alice)).status, 400);
  assert.equal((await request('/auth/register', 'POST', { username: 'test', fullName: 'Test', email: 'bad', password: 'password', dob: '2000-01-01' })).status, 400);
  assert.equal((await request('/auth/register', 'POST', { username: 'test', fullName: 'Test', email: 'test@example.com', password: 'password', dob: '2000-02-31' })).status, 400);
  const raw = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(raw.status, 400); assert.equal((await raw.json()).message, 'Invalid JSON');
  const original = Post.find;
  Post.find = () => { throw new Error('private database details'); };
  try { const failed = await request('/posts/feed', 'GET', undefined, alice); assert.equal(failed.status, 500); assert.doesNotMatch(failed.body.message, /private database/); }
  finally { Post.find = original; }
  assert.equal((await request('/users/me', 'GET', undefined, alice)).status, 200);
});

test('post privacy, friends, sharing endpoint and comment ownership', async () => {
  const privatePost = (await request('/posts', 'POST', { text: 'secret', privacy: 'me' }, alice)).body;
  for (const [suffix, method, body] of [['', 'GET'], ['/like', 'POST'], ['/comments', 'GET'], ['/comments', 'POST', { text: 'no' }]]) assert.equal((await request('/posts/' + privatePost._id + suffix, method, body, bob)).status, 404);
  const publicPost = (await request('/posts', 'POST', { text: 'public' }, alice)).body;
  assert.equal((await request('/posts/' + publicPost._id, 'GET', undefined, bob)).status, 200);
  const likes = await Promise.all([bob, carol].map(user => request('/posts/' + publicPost._id + '/like', 'POST', {}, user)));
  assert.ok(likes.every(result => result.status === 200));
  assert.equal((await request('/posts/' + publicPost._id, 'GET', undefined, alice)).body.likesCount, 2);
  const comment = (await request('/posts/' + publicPost._id + '/comments', 'POST', { text: 'hello' }, bob)).body;
  const carolPost = (await request('/posts', 'POST', { text: 'carol' }, carol)).body;
  assert.equal((await request(`/posts/${carolPost._id}/comments/${comment._id}`, 'DELETE', undefined, carol)).status, 403);
  await request('/users/me', 'PUT', { isPrivate: true }, alice);
  assert.equal((await request('/posts/' + publicPost._id, 'GET', undefined, bob)).status, 404);
  assert.ok(!(await request('/posts/feed', 'GET', undefined, bob)).body.some(p => p._id === publicPost._id));
  await request('/friends/request/' + alice.user._id, 'POST', {}, bob);
  assert.equal((await request('/friends/accept/' + bob.user._id, 'POST', {}, alice)).status, 200);
  assert.equal((await request('/posts/' + publicPost._id, 'GET', undefined, bob)).status, 200);
  assert.equal((await request('/posts/' + privatePost._id, 'GET', undefined, bob)).status, 404);
  const visible = (await request('/posts/feed', 'GET', undefined, bob)).body;
  assert.ok(visible.every(p => !('blocked' in p.user)));
  assert.equal((await request(`/posts/${publicPost._id}/comments/${comment._id}`, 'DELETE', undefined, alice)).status, 200);
});

test('stories enforce privacy and expiry even before TTL cleanup', async () => {
  const media = 'data:image/png;base64,aGVsbG8=';
  const story = (await request('/stories', 'POST', { media }, alice)).body;
  for (const action of ['view', 'like']) assert.equal((await request(`/stories/${story._id}/${action}`, 'POST', {}, carol)).status, 404);
  assert.equal((await request(`/stories/${story._id}/view`, 'POST', {}, bob)).status, 200);
  assert.equal((await request(`/stories/${story._id}/details`, 'GET', undefined, bob)).status, 403);
  await Story.updateOne({ _id: story._id }, { createdAt: new Date(Date.now() - 90000000) });
  assert.equal((await request(`/stories/${story._id}/view`, 'POST', {}, bob)).status, 404);
  assert.deepEqual((await request('/stories/user/' + alice.user._id, 'GET', undefined, bob)).body, []);
});

test('chat membership, read receipts, deletion and mutual blocking', async () => {
  assert.equal((await request(`/chats/${alice.user._id}/messages`, 'POST', { text: 'self' }, alice)).status, 400);
  const sent = await request(`/chats/${bob.user._id}/messages`, 'POST', { text: 'hello bob' }, alice);
  assert.equal(sent.status, 201);
  assert.equal((await request('/chats/message/' + sent.body._id, 'DELETE', undefined, carol)).status, 404);
  const messages = (await request(`/chats/${alice.user._id}/messages`, 'GET', undefined, bob)).body.messages;
  assert.equal(messages.length, 1); assert.equal(messages[0].read, true);
  await request('/chats/message/' + sent.body._id, 'DELETE', undefined, bob);
  assert.equal((await request(`/chats/${alice.user._id}/messages`, 'GET', undefined, bob)).body.messages.length, 0);
  assert.equal((await request(`/chats/${bob.user._id}/messages`, 'GET', undefined, alice)).body.messages.length, 1);
  await request('/users/' + bob.user._id + '/block', 'POST', {}, alice);
  assert.equal((await request(`/chats/${alice.user._id}/messages`, 'POST', { text: 'blocked' }, bob)).status, 403);
  assert.equal((await request('/users/' + alice.user._id, 'GET', undefined, bob)).status, 403);
  assert.deepEqual((await request('/friends', 'GET', undefined, bob)).body, []);
});

test('socket authentication and malformed typing payloads', async () => {
  const socket = client(base, { auth: { token: carol.token }, transports: ['websocket'], reconnection: false });
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    socket.emit('typing', null); socket.emit('typing', { to: {}, typing: true });
    assert.equal((await request('/users/me', 'GET', undefined, carol)).status, 200);
  } finally { socket.disconnect(); }
});

test('concurrent first messages share one conversation', async () => {
  const sent = await Promise.all([1, 2, 3].map(n => request(`/chats/${carol.user._id}/messages`, 'POST', { text: 'concurrent ' + n }, bob)));
  assert.ok(sent.every(result => result.status === 201));
  assert.equal(new Set(sent.map(result => result.body.chat)).size, 1);
});

test('frontend assets and local socket client are served', async () => {
  for (const path of ['/', '/login.html', '/register.html', '/reset.html', '/style.css', '/script.js', '/auth.js', '/socket.io/socket.io.js']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path);
  }
});

test('password reset is single-use and revokes old sessions', async () => {
  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: carol.user._id }, { resetToken: crypto.createHash('sha256').update(token).digest('hex'), resetExpires: new Date(Date.now() + 60000) });
  const me = (await request('/users/me', 'GET', undefined, carol)).body;
  assert.ok(!('resetToken' in me)); assert.ok(!('resetExpires' in me));
  assert.equal((await request('/auth/reset/' + token, 'POST', { password: 'changed123' })).status, 200);
  assert.equal((await request('/auth/reset/' + token, 'POST', { password: 'other123' })).status, 400);
  assert.equal((await request('/users/me', 'GET', undefined, carol)).status, 401);
  assert.equal((await request('/auth/login', 'POST', { identifier: 'carol', password: 'password123' })).status, 400);
  const login = await request('/auth/login', 'POST', { identifier: ' CAROL ', password: 'changed123' });
  assert.equal(login.status, 200);
  assert.equal((await request('/auth/change-password', 'POST', { current: 'changed123', password: 'newpass123' }, login.body)).status, 200);
  assert.equal((await request('/users/me', 'GET', undefined, login.body)).status, 401);
});
