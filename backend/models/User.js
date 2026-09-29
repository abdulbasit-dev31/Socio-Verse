const s = new (require('mongoose').Schema)({
  fullName: { type: String, required: true, trim: true }, username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true }, phone: String, country: String, gender: String, dob: Date,
  password: { type: String, required: true }, bio: { type: String, default: '', maxlength: 200 }, location: { type: String, default: '' },
  avatar: { type: String, default: '' }, cover: { type: String, default: '' }, isPrivate: { type: Boolean, default: false },
  friends: [{ type: require('mongoose').Schema.Types.ObjectId, ref: 'User' }], blocked: [{ type: require('mongoose').Schema.Types.ObjectId, ref: 'User' }],
  tokenVersion: { type: Number, default: 0 }, resetToken: String, resetExpires: Date }, { timestamps: true });
module.exports = require('mongoose').model('User', s);
