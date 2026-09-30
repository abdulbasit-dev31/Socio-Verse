// Vercel entry: the whole Express + Socket.IO app runs as one function (see vercel.json rewrites).
const mongoose = require('../backend/node_modules/mongoose');
const { createAdapter } = require('../backend/node_modules/@socket.io/mongo-adapter');
const connectDB = require('../backend/config/db');
const { createServer } = require('../backend/server');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters');

// Function instances do not share memory, so socket events and presence go through MongoDB change streams.
async function init() {
  await connectDB();
  const events = mongoose.connection.db.collection('socket.io-adapter-events');
  await events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });
  io.adapter(createAdapter(events, { addCreatedAtField: true }));
}
let pending;
// A failed start is retried on the next request instead of leaving this instance broken.
const ready = () => pending ||= init().catch(error => {
  pending = null;
  console.error('Startup failed:', error.message, error.cause?.message || '');
  throw error;
});

const { server, io } = createServer({ ready, trustProxy: true, stream: true });
ready().catch(() => {});
module.exports = server;
