const router = require('../router')(), auth = require('../middleware/auth'), User = require('../models/User'), Post = require('../models/Post');
const FR = require('../models/FriendRequest'), { U, isBlocked, isFriend } = require('../utils');
router.use(auth);
const status = async (me, other) => {
  if (me._id.equals(other._id)) return 'self'; if (isFriend(me, other._id)) return 'friends';
  if (await FR.exists({ from: me._id, to: other._id })) return 'sent'; if (await FR.exists({ from: other._id, to: me._id })) return 'received'; return 'none';
};
router.get('/me', async (req, res, next) => {
  const u = req.user.toObject(); delete u.password; delete u.resetToken; delete u.resetExpires; delete u.tokenVersion; res.json({ ...u, friendsCount: u.friends.length, postsCount: await Post.countDocuments({ user: u._id }) });
});
router.put('/me', async (req, res, next) => {
  const { fullName, bio, location, avatar, cover, isPrivate } = req.body;
  if (fullName !== undefined) { if (!fullName.trim()) return res.status(400).json({ message: 'Name cannot be empty' }); req.user.fullName = fullName.trim(); }
  if (bio !== undefined) req.user.bio = bio.slice(0, 200); if (location !== undefined) req.user.location = location;
  if (avatar !== undefined) req.user.avatar = avatar; if (cover !== undefined) req.user.cover = cover; // '' removes the picture
  if (isPrivate !== undefined) req.user.isPrivate = !!isPrivate;
  await req.user.save(); res.json({ message: 'Profile updated' });
});
router.get('/search', async (req, res, next) => {
  const q = (req.query.q || '').trim(); if (!q) return res.json([]);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({ _id: { $ne: req.user._id, $nin: req.user.blocked }, blocked: { $ne: req.user._id }, $or: [{ username: rx }, { fullName: rx }, { email: rx }] }).select(U).limit(10);
  res.json(users);
});
router.get('/suggestions', async (req, res, next) => {
  const sent = await FR.find({ from: req.user._id }).distinct('to');
  const users = await User.find({ _id: { $nin: [req.user._id, ...req.user.friends, ...req.user.blocked] }, blocked: { $ne: req.user._id } }).select(U).limit(6);
  const received = (await FR.find({ to: req.user._id }).distinct('from')).map(String);
  res.json(users.map(u => ({ ...u.toObject(), status: sent.some(s => s.equals(u._id)) ? 'sent' : received.includes(String(u._id)) ? 'received' : 'none' })));
});
router.get('/blocked', async (req, res) => res.json((await User.find({ _id: { $in: req.user.blocked } }).select(U))));
router.post('/:id/block', async (req, res, next) => {
  const other = await User.findById(req.params.id); if (!other || other._id.equals(req.user._id)) return res.status(400).json({ message: 'Invalid user' });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { blocked: other._id }, $pull: { friends: other._id } });
  await User.updateOne({ _id: other._id }, { $pull: { friends: req.user._id } });
  await FR.deleteMany({ $or: [{ from: req.user._id, to: other._id }, { from: other._id, to: req.user._id }] });
  res.json({ message: 'User blocked' });
});
router.delete('/:id/block', async (req, res, next) => { await User.updateOne({ _id: req.user._id }, { $pull: { blocked: req.params.id } }); res.json({ message: 'User unblocked' }); });
router.get('/:id', async (req, res, next) => {
  try {
    const u = await User.findById(req.params.id).select('-password -resetToken -resetExpires'); if (!u) return res.status(404).json({ message: 'User not found' });
    if (isBlocked(req.user, u)) return res.status(403).json({ message: 'This profile is not available' });
    const st = await status(req.user, u), visible = st === 'self' || st === 'friends' || !u.isPrivate;
    res.json({ _id: u._id, fullName: u.fullName, username: u.username, avatar: u.avatar, cover: u.cover, bio: u.bio, location: u.location, isPrivate: u.isPrivate,
      status: st, visible, friendsCount: u.friends.length, postsCount: visible ? await Post.countDocuments({ user: u._id }) : 0, joined: u.createdAt });
  } catch { res.status(404).json({ message: 'User not found' }); }
});
module.exports = router;
