const M = require('mongoose');
module.exports = M.model('Chat', new M.Schema({ pairKey: { type: String, unique: true, sparse: true }, members: [{ type: M.Schema.Types.ObjectId, ref: 'User' }] }, { timestamps: true }));
