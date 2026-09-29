const router = require('../router')(), auth = require('../middleware/auth'), N = require('../models/Notification'), { U } = require('../utils');
router.use(auth);
router.get('/', async (req, res) => res.json({ items: await N.find({ user: req.user._id }).sort('-createdAt').limit(40).populate('from', U), unread: await N.countDocuments({ user: req.user._id, read: false }) }));
router.post('/read-all', async (req, res, next) => { await N.updateMany({ user: req.user._id }, { read: true }); res.json({ ok: true }); });
router.post('/:id/read', async (req, res, next) => { await N.updateOne({ _id: req.params.id, user: req.user._id }, { read: true }); res.json({ ok: true }); });
module.exports = router;
