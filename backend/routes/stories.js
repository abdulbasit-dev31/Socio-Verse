const router = require('../router')(), auth = require('../middleware/auth'), Story = require('../models/Story'), User = require('../models/User'), { U, isBlocked, isFriend } = require('../utils');
router.use(auth);
const { canViewOwner, activeStory } = require('../access');
router.post('/', async (req, res, next) => {
  const { media, mediaType } = req.body; if (!media) return res.status(400).json({ message: 'Choose an image or video' });
  const s = await Story.create({ user: req.user._id, media, mediaType: mediaType === 'video' ? 'video' : 'image' }); res.status(201).json(s);
});
const group = (stories, me) => {
  const map = new Map();
  stories.filter(s => canViewOwner(me, s.user)).forEach(s => { const k = String(s.user._id); if (!map.has(k)) { const user = s.user.toObject(); delete user.blocked; delete user.isPrivate; map.set(k, { user, stories: [] }); }
    map.get(k).stories.push({ _id: s._id, media: s.media, mediaType: s.mediaType, createdAt: s.createdAt, liked: s.likes.some(l => l.equals(me._id)), seen: s.viewers.some(v => v.equals(me._id)) }); });
  return [...map.values()];
};
router.get('/', async (req, res, next) => { // own + friends' stories for the feed
  const stories = await Story.find({ ...activeStory(), user: { $in: [req.user._id, ...req.user.friends], $nin: req.user.blocked } }).sort('createdAt').populate('user', U + ' blocked isPrivate');
  const g = group(stories, req.user); g.sort((a, b) => (String(a.user._id) === String(req.user._id) ? -1 : 0) - (String(b.user._id) === String(req.user._id) ? -1 : 0)); res.json(g);
});
router.get('/user/:id', async (req, res, next) => { // profile page: public accounts or friends
  const o = await User.findById(req.params.id); if (!o || isBlocked(req.user, o)) return res.json([]);
  if (!o._id.equals(req.user._id) && o.isPrivate && !isFriend(req.user, o._id)) return res.json([]);
  res.json(group(await Story.find({ ...activeStory(), user: o._id }).sort('createdAt').populate('user', U + ' blocked isPrivate'), req.user));
});
router.use('/:id', async (req, res, next) => {
  try {
    const story = await Story.findOne({ _id: req.params.id, ...activeStory() }).populate('user', U + ' blocked isPrivate');
    if (!story || !canViewOwner(req.user, story.user)) return res.status(404).json({ message: 'Story expired or unavailable' });
    next();
  } catch (error) { next(error); }
});
router.post('/:id/view', async (req, res, next) => { await Story.updateOne({ _id: req.params.id, user: { $ne: req.user._id } }, { $addToSet: { viewers: req.user._id } }); res.json({ ok: true }); });
router.post('/:id/like', async (req, res, next) => {
  const s = await Story.findById(req.params.id); if (!s) return res.status(404).json({ message: 'Story expired' });
  if (s.user.equals(req.user._id)) return res.status(400).json({ message: 'You cannot like your own story' });
  const uid = req.user._id;
  const updated = await Story.findByIdAndUpdate(s._id, [{ $set: { likes: { $cond: [{ $in: [uid, '$likes'] }, { $setDifference: ['$likes', [uid]] }, { $concatArrays: ['$likes', [uid]] }] } } }], { new: true });
  if (!updated) return res.status(404).json({ message: 'Story expired' });
  res.json({ liked: updated.likes.some(l => l.equals(uid)) });
});
router.get('/:id/details', async (req, res, next) => { // owner only
  const s = await Story.findOne({ _id: req.params.id, user: req.user._id }).populate('viewers likes', U); if (!s) return res.status(403).json({ message: 'Not allowed' });
  res.json({ views: s.viewers.length, viewers: s.viewers, likes: s.likes });
});
router.delete('/:id', async (req, res, next) => { const r = await Story.deleteOne({ _id: req.params.id, user: req.user._id }); r.deletedCount ? res.json({ message: 'Story deleted' }) : res.status(403).json({ message: 'Not allowed' }); });
module.exports = router;
