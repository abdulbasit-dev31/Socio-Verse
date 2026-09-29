const M = require('mongoose'), R = { type: M.Schema.Types.ObjectId, ref: 'User' };
const s = new M.Schema({ user: R, media: String, mediaType: String, likes: [R], viewers: [R], createdAt: { type: Date, default: Date.now } });
s.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // TTL: auto-delete after 24 hours
module.exports = M.model('Story', s);
