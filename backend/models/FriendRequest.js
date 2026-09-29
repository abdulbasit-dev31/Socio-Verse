const M = require('mongoose'), R = { type: M.Schema.Types.ObjectId, ref: 'User' };
module.exports = M.model('FriendRequest', new M.Schema({ from: R, to: R }, { timestamps: true }));
