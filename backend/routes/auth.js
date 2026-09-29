const router = require('../router')(), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), crypto = require('crypto');
const User = require('../models/User'), auth = require('../middleware/auth'), { sendResetEmail } = require('../config/mailer');
// country-specific phone validation
const PHONE = { PK: /^(\+92|0)?3\d{9}$/, IN: /^(\+91)?[6-9]\d{9}$/, US: /^(\+1)?\d{10}$/, GB: /^(\+44|0)7\d{9}$/, AE: /^(\+971|0)?5\d{8}$/, SA: /^(\+966|0)?5\d{8}$/ };
const sign = (user, remember) => jwt.sign({ id: user._id, v: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: remember ? '30d' : '1d' });
const safe = u => { const o = u.toObject(); delete o.password; delete o.resetToken; delete o.resetExpires; delete o.tokenVersion; return o; };

router.post('/register', async (req, res, next) => {
  try {
    const { phone, country, gender, dob, password } = req.body;
    const fullName = (req.body.fullName || '').trim(), username = (req.body.username || '').trim().toLowerCase(), email = (req.body.email || '').trim().toLowerCase();
    if (!fullName || !username || !email || !password || !dob) return res.status(400).json({ message: 'Please fill all required fields' });
    if (!/^[a-z0-9_.]{3,20}$/i.test(username)) return res.status(400).json({ message: 'Username: 3-20 letters, numbers, . or _' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    const birth = new Date(dob), today = new Date();
    const age = today.getUTCFullYear() - birth.getUTCFullYear() - (today.toISOString().slice(5, 10) < dob.slice(5, 10) ? 1 : 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== dob || age < 18) return res.status(400).json({ message: 'Enter a valid birth date; you must be at least 18 years old' });
    if (phone && PHONE[country] && !PHONE[country].test(phone)) return res.status(400).json({ message: `Invalid phone number for ${country}` });
    if (await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] })) return res.status(400).json({ message: 'Username or email already exists' });
    const user = await User.create({ fullName, username, email, phone, country, gender, dob, password: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user), user: safe(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { identifier = '', password = '', remember } = req.body, id = identifier.toLowerCase().trim();
    const user = await User.findOne({ $or: [{ email: id }, { username: id }] });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: 'Invalid credentials' });
    res.json({ token: sign(user, remember), user: safe(user) });
  } catch (e) { next(e); }
});

router.post('/forgot', async (req, res, next) => {
  try {
    if (!process.env.SMTP_HOST && !(process.env.NODE_ENV !== 'production' && process.env.DEV_EMAIL_PREVIEW === 'true')) return res.status(503).json({ message: 'Password-reset email is not configured' });
    const email = (req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetToken = crypto.createHash('sha256').update(token).digest('hex'); user.resetExpires = Date.now() + 15 * 60000; await user.save();
      const preview = await sendResetEmail(user.email, `${(process.env.CLIENT_URL || 'http://localhost:5000').replace(/\/$/, '')}/reset.html?token=${token}`);
      return res.json({ message: 'If that email exists, a reset link has been sent.', ...(preview ? { preview } : {}) });
    }
    res.json({ message: 'If that email exists, a reset link has been sent.' }); // do not reveal which emails exist
  } catch (e) { next(e); }
});

router.post('/reset/:token', async (req, res, next) => {
  try {
    const user = await User.findOne({ resetToken: crypto.createHash('sha256').update(req.params.token).digest('hex'), resetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Reset link is invalid or expired' });
    if ((req.body.password || '').length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const updated = await User.findOneAndUpdate({ _id: user._id, resetToken: user.resetToken, resetExpires: { $gt: Date.now() } }, { $set: { password: await bcrypt.hash(req.body.password, 10) }, $unset: { resetToken: 1, resetExpires: 1 }, $inc: { tokenVersion: 1 } });
    if (!updated) return res.status(400).json({ message: 'Reset link is invalid or expired' });
    req.app.get('io').in(String(user._id)).disconnectSockets(true);
    res.json({ message: 'Password reset successful. You can login now.' });
  } catch (e) { next(e); }
});

router.post('/change-password', auth, async (req, res, next) => {
  const { current, password } = req.body;
  if (!(await bcrypt.compare(current || '', req.user.password))) return res.status(400).json({ message: 'Current password is incorrect' });
  if ((password || '').length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
  req.user.password = await bcrypt.hash(password, 10); req.user.tokenVersion += 1; req.user.resetToken = req.user.resetExpires = undefined; await req.user.save();
  req.app.get('io').in(String(req.user._id)).disconnectSockets(true);
  res.json({ message: 'Password changed successfully. Please log in again.' });
});
module.exports = router;
