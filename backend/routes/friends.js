const router = require('../router')(), auth = require('../middleware/auth'), User = require('../models/User'), FR = require('../models/FriendRequest');
const { U, isBlocked, notify } = require('../utils');
router.use(auth);
const push = (req, id, ev) => req.app.get('io').to(String(id)).emit(ev);
router.get('/', async (req, res) => res.json(await User.find({ _id: { $in: req.user.friends } }).select(U)));
router.get('/requests', async (req, res) => res.json(await FR.find({ to: req.user._id }).sort('-createdAt').populate('from', U)));
router.post('/request/:id', async (req, res, next) => {
  const other = await User.findById(req.params.id); if (!other || other._id.equals(req.user._id)) return res.status(400).json({ message: 'Invalid user' });
  if (isBlocked(req.user, other)) return res.status(403).json({ message: 'Action not allowed' });
  if (req.user.friends.some(f => f.equals(other._id))) return res.status(400).json({ message: 'Already friends' });
  if (await FR.exists({ from: other._id, to: req.user._id })) return res.status(400).json({ message: 'This user already sent you a request' });
  if (!(await FR.exists({ from: req.user._id, to: other._id }))) { await FR.create({ from: req.user._id, to: other._id }); await notify(req, { to: other._id, type: 'friend_request' }); push(req, other._id, 'friend:update'); }
  res.json({ message: 'Friend request sent' });
});
router.delete('/request/:id', async (req, res, next) => { await FR.deleteOne({ from: req.user._id, to: req.params.id }); push(req, req.params.id, 'friend:update'); res.json({ message: 'Request cancelled' }); });
router.post('/accept/:id', async (req, res, next) => {
  const other = await User.findById(req.params.id);
  if (!other || isBlocked(req.user, other)) return res.status(403).json({ message: 'Action not allowed' });
  const r = await FR.findOneAndDelete({ from: req.params.id, to: req.user._id }); if (!r) return res.status(404).json({ message: 'Request not found' });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { friends: r.from } }); await User.updateOne({ _id: r.from }, { $addToSet: { friends: req.user._id } });
  await notify(req, { to: r.from, type: 'friend_accept' }); push(req, r.from, 'friend:update'); res.json({ message: 'Friend request accepted' });
});
router.post('/reject/:id', async (req, res, next) => { await FR.deleteOne({ from: req.params.id, to: req.user._id }); res.json({ message: 'Request rejected' }); });
router.delete('/:id', async (req, res, next) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { friends: req.params.id } }); await User.updateOne({ _id: req.params.id }, { $pull: { friends: req.user._id } });
  res.json({ message: 'Friend removed' });
});
module.exports = router;
