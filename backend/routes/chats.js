const router = require('../router')(), auth = require('../middleware/auth'), User = require('../models/User'), Chat = require('../models/Chat'), Message = require('../models/Message');
const { U, isBlocked } = require('../utils');
router.use(auth);
const findChat = (a, b) => Chat.findOne({ members: { $all: [a, b], $size: 2 } });
router.get('/', async (req, res, next) => {
  const chats = await Chat.find({ members: req.user._id }).sort('-updatedAt').populate('members', U + ' blocked'), online = req.app.get('online'), out = [];
  for (const c of chats) {
    const other = c.members.find(m => !m._id.equals(req.user._id)); if (!other || isBlocked(req.user, other)) continue;
    const last = await Message.findOne({ chat: c._id, deletedFor: { $ne: req.user._id } }).sort('-createdAt');
    const unread = await Message.countDocuments({ chat: c._id, sender: other._id, read: false, deletedFor: { $ne: req.user._id } });
    if (last) out.push({ user: { _id: other._id, fullName: other.fullName, username: other.username, avatar: other.avatar }, last, unread, online: online.has(String(other._id)) });
  }
  res.json(out);
});
router.get('/:uid/messages', async (req, res, next) => {
  const other = await User.findById(req.params.uid); if (!other || isBlocked(req.user, other)) return res.status(403).json({ message: 'Chat not available' });
  const chat = await findChat(req.user._id, other._id); if (!chat) return res.json({ messages: [], online: req.app.get('online').has(String(other._id)) });
  await Message.updateMany({ chat: chat._id, sender: other._id, read: false }, { read: true }); req.app.get('io').to(String(other._id)).emit('messages:read', { by: req.user._id });
  res.json({ messages: await Message.find({ chat: chat._id, deletedFor: { $ne: req.user._id } }).sort('createdAt'), online: req.app.get('online').has(String(other._id)) });
});
router.post('/:uid/messages', async (req, res, next) => {
  if (String(req.user._id) === req.params.uid) return res.status(400).json({ message: 'Choose another user to message' });
  const text = (req.body.text || '').trim(); if (!text) return res.status(400).json({ message: 'Message is empty' });
  const other = await User.findById(req.params.uid); if (!other || isBlocked(req.user, other)) return res.status(403).json({ message: 'You cannot message this user' });
  let chat = await findChat(req.user._id, other._id);
  if (!chat) {
    const pairKey = [String(req.user._id), String(other._id)].sort().join(':');
    try { chat = await Chat.findOneAndUpdate({ pairKey }, { $setOnInsert: { members: [req.user._id, other._id] } }, { upsert: true, new: true }); }
    catch (error) { if (error.code !== 11000) throw error; chat = await Chat.findOne({ pairKey }); }
  }
  const m = await Message.create({ chat: chat._id, sender: req.user._id, text }); await chat.updateOne({ updatedAt: new Date() });
  req.app.get('io').to(String(other._id)).emit('message', { message: m, from: { _id: req.user._id, fullName: req.user.fullName, avatar: req.user.avatar } });
  res.status(201).json(m);
});
router.delete('/message/:id', async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message || !(await Chat.exists({ _id: message.chat, members: req.user._id }))) return res.status(404).json({ message: 'Message not found' });
  await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.user._id } });
  res.json({ message: 'Message deleted for you' });
});
router.delete('/:uid', async (req, res, next) => {
  const chat = await findChat(req.user._id, req.params.uid);
  if (chat) await Message.updateMany({ chat: chat._id }, { $addToSet: { deletedFor: req.user._id } });
  res.json({ message: 'Chat cleared' });
});
module.exports = router;
