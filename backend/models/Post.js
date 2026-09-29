const M = require('mongoose'), R = { type: M.Schema.Types.ObjectId, ref: 'User' };
module.exports = M.model('Post', new M.Schema({ user: R, text: { type: String, default: '' }, media: String, mediaType: String,
  privacy: { type: String, enum: ['public', 'friends', 'me'], default: 'public' }, likes: [R] }, { timestamps: true }));
