const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express'), http = require('http'), cors = require('cors'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io'), connectDB = require('./config/db'), User = require('./models/User');
const { isBlocked } = require('./utils');
const { validate } = require('./middleware/validate');

function createServer() {
  const app = express(), server = http.createServer(app);
  const origin = process.env.CLIENT_URL || 'http://localhost:5000';
  const io = new Server(server, { cors: { origin }, maxHttpBufferSize: 10000 });
  const online = new Map();
  app.disable('x-powered-by');
  app.set('io', io); app.set('online', online);
  app.use(cors({ origin }));
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  app.use(express.json({ limit: '50mb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, validate);
  app.use('/api/auth', require('./middleware/rateLimit')());
  for (const name of ['auth', 'users', 'posts', 'friends', 'chats', 'stories', 'notifications']) app.use('/api/' + name, require('./routes/' + name));
  app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));
  app.use(express.static(path.join(__dirname, '../frontend')));
  app.use(require('./middleware/errors'));

  io.use(async (socket, next) => {
    try {
      const claims = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      const user = await User.findById(claims.id);
      if (!user || (claims.v || 0) !== user.tokenVersion) throw new Error('auth');
      socket.uid = String(user._id); socket.expires = claims.exp; next();
    } catch { next(new Error('Not authorized')); }
  });
  io.on('connection', socket => {
    const id = socket.uid;
    socket.join(id); online.set(id, (online.get(id) || 0) + 1);
    io.emit('presence', { id, online: true }); socket.emit('online:list', [...online.keys()]);
    const expiry = setInterval(() => { if (socket.expires * 1000 <= Date.now()) socket.disconnect(true); }, 60000);
    expiry.unref();
    socket.on('typing', async (payload) => {
      try {
        if (!payload || !require('mongoose').isObjectIdOrHexString(payload.to) || typeof payload.typing !== 'boolean' || payload.to === id) return;
        const [from, to] = await Promise.all([User.findById(id), User.findById(payload.to)]);
        if (from && to && !isBlocked(from, to)) io.to(String(to._id)).emit('typing', { from: id, typing: payload.typing });
      } catch { /* A transient database failure must not crash a socket handler. */ }
    });
    socket.on('disconnect', () => {
      clearInterval(expiry);
      const count = (online.get(id) || 1) - 1;
      if (count <= 0) { online.delete(id); io.emit('presence', { id, online: false }); }
      else online.set(id, count);
    });
  });
  return { app, server, io };
}
async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters in backend/.env');
  await connectDB();
  const { server } = createServer();
  const port = Number(process.env.PORT || 5000);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, resolve); });
  console.log(`SocioVerse running on http://localhost:${port}`);
  return server;
}
if (require.main === module) start().catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
module.exports = { createServer, start };
