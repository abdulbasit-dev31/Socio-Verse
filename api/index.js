// Vercel entry: the whole Express + Socket.IO app runs as one function (see vercel.json rewrites).
const mongoose = require('../backend/node_modules/mongoose');
const { createAdapter } = require('../backend/node_modules/@socket.io/mongo-adapter');
const connectDB = require('../backend/config/db');
const { createServer } = require('../backend/server');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters');

let io;
// Function instances do not share memory, so socket events and presence go through MongoDB change streams.
const ready = connectDB().then(async () => {
  const events = mongoose.connection.db.collection('socket.io-adapter-events');
  await events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });
  io.adapter(createAdapter(events, { addCreatedAtField: true }));
});
ready.catch(error => console.error('Startup failed:', error.message, error.cause?.message || ''));

const app = createServer({ ready, trustProxy: true, stream: true });
io = app.io;
module.exports = app.server;
