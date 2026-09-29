const { isBlocked, isFriend } = require('./utils');
const same = (a, b) => String(a?._id || a) === String(b?._id || b);
function canViewOwner(me, owner) {
  return !!owner && !isBlocked(me, owner) && (same(me, owner) || !owner.isPrivate || isFriend(me, owner._id));
}
function canViewPost(me, post, owner) {
  return canViewOwner(me, owner) && (same(me, owner) || post.privacy === 'public' || (post.privacy === 'friends' && isFriend(me, owner._id)));
}
const activeStory = () => ({ createdAt: { $gt: new Date(Date.now() - 86400000) } });
module.exports = { same, canViewOwner, canViewPost, activeStory };
