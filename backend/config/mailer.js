const nodemailer = require('nodemailer');
// Preview links grant password-reset access: opt in only for local development.
exports.sendResetEmail = async (to, link) => {
  const previewMode = process.env.NODE_ENV !== 'production' && process.env.DEV_EMAIL_PREVIEW === 'true';
  let config;
  if (process.env.SMTP_HOST) config = { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === '465', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined };
  else if (previewMode) { const acc = await nodemailer.createTestAccount(); config = { host: 'smtp.ethereal.email', port: 587, auth: { user: acc.user, pass: acc.pass } }; }
  else throw Object.assign(new Error('Password-reset email is not configured'), { status: 503 });
  const t = nodemailer.createTransport(config);
  const info = await t.sendMail({ from: process.env.MAIL_FROM || '"SocioVerse" <no-reply@socioverse.com>', to, subject: 'Reset your SocioVerse password',
    html: `<h2>Password reset</h2><p>Click the button (valid 15 minutes):</p><a href="${link}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">Reset Password</a><p>Or open: ${link}</p>` });
  return previewMode ? nodemailer.getTestMessageUrl(info) : undefined;
};
