const Notification = require('./models/Notification');
const U = 'fullName username avatar';
// mutual block check: true if either user blocked the other
const isBlocked = (a, b) => (a.blocked || []).some(x => String(x) === String(b._id || b)) || (b.blocked || []).some(x => String(x) === String(a._id));
const isFriend = (a, id) => (a.friends || []).some(x => String(x) === String(id));
async function notify(req, { to, type, post }) {
  if (String(to) === String(req.user._id)) return;
  const n = await Notification.create({ user: to, from: req.user._id, type, post });
  req.app.get('io').to(String(to)).emit('notification', await n.populate('from', U));
}
module.exports = { U, isBlocked, isFriend, notify };
