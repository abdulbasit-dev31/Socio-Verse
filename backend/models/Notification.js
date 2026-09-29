const M = require('mongoose'), R = { type: M.Schema.Types.ObjectId, ref: 'User' };
module.exports = M.model('Notification', new M.Schema({ user: R, from: R, type: { type: String, enum: ['like', 'comment', 'friend_request', 'friend_accept'] },
  post: { type: M.Schema.Types.ObjectId, ref: 'Post' }, read: { type: Boolean, default: false } }, { timestamps: true }));
