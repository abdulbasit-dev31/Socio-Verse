const router = require('../router')(), auth = require('../middleware/auth'), Post = require('../models/Post'), Comment = require('../models/Comment');
const User = require('../models/User'), { U, isBlocked, isFriend, notify } = require('../utils');
const { canViewPost } = require('../access');
router.use(auth);
const shape = async (posts, me) => {
  const counts = await Comment.aggregate([{ $match: { post: { $in: posts.map(p => p._id) } } }, { $group: { _id: '$post', n: { $sum: 1 } } }]);
  return posts.map(p => { const value = p.toObject(); delete value.user.blocked; delete value.user.isPrivate; return { ...value, likesCount: p.likes.length, liked: p.likes.some(l => l.equals(me._id)), commentsCount: (counts.find(c => c._id.equals(p._id)) || {}).n || 0 }; });
};
router.post('/', async (req, res, next) => {
  const { text = '', media, mediaType, privacy } = req.body;
  if (!text.trim() && !media) return res.status(400).json({ message: 'Write something or add a photo/video' });
  // "Only Me" -> me; "Everyone" -> public for public accounts, friends-only for private accounts
  if (privacy !== undefined && !['public', 'friends', 'me'].includes(privacy)) return res.status(400).json({ message: 'Invalid privacy' });
  const p = await Post.create({ user: req.user._id, text: text.trim(), media, mediaType, privacy: privacy === 'me' ? 'me' : privacy === 'friends' || req.user.isPrivate ? 'friends' : 'public' });
  res.status(201).json((await shape([await p.populate('user', U)], req.user))[0]);
});
router.get('/feed', async (req, res, next) => {
  const hidden = req.user.blocked, friends = req.user.friends;
  const posts = await Post.find({ $or: [{ user: req.user._id }, { user: { $in: friends }, privacy: { $in: ['public', 'friends'] } }, { privacy: 'public' }], user: { $nin: hidden } })
    .sort('-createdAt').limit(50).populate('user', U + ' blocked isPrivate');
  res.json(await shape(posts.filter(p => canViewPost(req.user, p, p.user)), req.user));
});
router.get('/user/:id', async (req, res, next) => {
  const other = await User.findById(req.params.id); if (!other || isBlocked(req.user, other)) return res.json([]);
  const self = other._id.equals(req.user._id), fr = isFriend(req.user, other._id);
  if (!self && other.isPrivate && !fr) return res.json([]);
  const q = { user: other._id }; if (!self) q.privacy = fr ? { $in: ['public', 'friends'] } : 'public';
  res.json(await shape(await Post.find(q).sort('-createdAt').populate('user', U), req.user));
});
// Every direct post action must enforce the same visibility as the feed.
router.use('/:id', async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).populate('user', U + ' blocked isPrivate');
    if (!post || !canViewPost(req.user, post, post.user)) return res.status(404).json({ message: 'Post not found' });
    req.post = post; next();
  } catch (error) { next(error); }
});
router.get('/:id', async (req, res) => res.json((await shape([req.post], req.user))[0]));
router.post('/:id/like', async (req, res, next) => {
  const uid = req.user._id;
  const p = await Post.findByIdAndUpdate(req.params.id, [{ $set: { likes: { $cond: [{ $in: [uid, '$likes'] }, { $setDifference: ['$likes', [uid]] }, { $concatArrays: ['$likes', [uid]] }] } } }], { new: true });
  if (!p) return res.status(404).json({ message: 'Post not found' });
  const liked = p.likes.some(l => l.equals(uid));
  if (liked) await notify(req, { to: p.user, type: 'like', post: p._id });
  res.json({ liked, likesCount: p.likes.length });
});
router.get('/:id/comments', async (req, res) => res.json(await Comment.find({ post: req.params.id }).sort('createdAt').populate('user', U)));
router.post('/:id/comments', async (req, res, next) => {
  if (!(req.body.text || '').trim()) return res.status(400).json({ message: 'Comment cannot be empty' });
  const p = await Post.findById(req.params.id); if (!p) return res.status(404).json({ message: 'Post not found' });
  const c = await Comment.create({ post: p._id, user: req.user._id, text: req.body.text.trim() });
  await notify(req, { to: p.user, type: 'comment', post: p._id }); res.status(201).json(await c.populate('user', U));
});
router.delete('/:id/comments/:cid', async (req, res, next) => {
  const [c, p] = await Promise.all([Comment.findById(req.params.cid), Post.findById(req.params.id)]);
  if (!c || !p || !c.post.equals(p._id) || !(c.user.equals(req.user._id) || p.user.equals(req.user._id))) return res.status(403).json({ message: 'Not allowed' });
  await c.deleteOne(); res.json({ message: 'Comment deleted' });
});
router.delete('/:id', async (req, res, next) => {
  const p = await Post.findOne({ _id: req.params.id, user: req.user._id }); if (!p) return res.status(403).json({ message: 'You can only delete your own posts' });
  await Promise.all([p.deleteOne(), Comment.deleteMany({ post: p._id })]); res.json({ message: 'Post deleted' });
});
module.exports = router;
