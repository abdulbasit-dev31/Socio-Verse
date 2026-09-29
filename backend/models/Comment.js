const M = require('mongoose');
module.exports = M.model('Comment', new M.Schema({ post: { type: M.Schema.Types.ObjectId, ref: 'Post', index: true }, user: { type: M.Schema.Types.ObjectId, ref: 'User' }, text: String }, { timestamps: true }));
