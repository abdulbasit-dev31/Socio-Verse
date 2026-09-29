const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { sendResetEmail } = require('../config/mailer');
test('production mail uses configured SMTP and never returns preview credentials', async () => {
  const original = nodemailer.createTransport;
  const saved = { ...process.env };
  let configuration, message;
  nodemailer.createTransport = config => { configuration = config; return { sendMail: async mail => { message = mail; return {}; } }; };
  try {
    Object.assign(process.env, { NODE_ENV: 'production', DEV_EMAIL_PREVIEW: 'true', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'test', SMTP_PASS: 'test-only', MAIL_FROM: 'SocioVerse <noreply@example.com>' });
    assert.equal(await sendResetEmail('test@example.com', 'https://example.com/reset.html?token=test'), undefined);
    assert.equal(configuration.secure, true); assert.equal(configuration.host, 'smtp.example.com');
    assert.equal(message.to, 'test@example.com'); assert.match(message.html, /token=test/);
    delete process.env.SMTP_HOST;
    await assert.rejects(sendResetEmail('test@example.com', 'https://example.com/reset'), /not configured/);
  } finally { nodemailer.createTransport = original; for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
});
