const M = require('mongoose'), R = { type: M.Schema.Types.ObjectId, ref: 'User' };
module.exports = M.model('Message', new M.Schema({ chat: { type: M.Schema.Types.ObjectId, ref: 'Chat', index: true }, sender: R, text: String,
  read: { type: Boolean, default: false }, deletedFor: [R] }, { timestamps: true }));
