#!/usr/bin/env node
/**
 * SMTP Connection & Send Test
 * Tests: connect → verify credentials → send test email
 * Run: node test-email.mjs
 */
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env.local manually
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
  env[key] = val;
}

const cfg = {
  host:   env.SMTP_HOST,
  port:   parseInt(env.SMTP_PORT || '465', 10),
  secure: env.SMTP_SECURE === 'true',
  user:   env.SMTP_USER,
  pass:   env.SMTP_PASS,
  from:   env.SMTP_FROM || `"TiniTraker" <${env.SMTP_USER}>`,
};

const TEST_TO = 'kalvinclarke.dev@gmail.com';

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  TiniTraker SMTP Email Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Config loaded:');
console.log(`  Host   : ${cfg.host}`);
console.log(`  Port   : ${cfg.port}`);
console.log(`  Secure : ${cfg.secure} (SSL/TLS)`);
console.log(`  User   : ${cfg.user}`);
console.log(`  From   : ${cfg.from}`);
console.log(`  To     : ${TEST_TO}\n`);

if (!cfg.host || !cfg.user || !cfg.pass) {
  console.error('❌ SMTP not configured — missing SMTP_HOST, SMTP_USER, or SMTP_PASS in .env.local');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host:   cfg.host,
  port:   cfg.port,
  secure: cfg.secure,
  auth:   { user: cfg.user, pass: cfg.pass },
  tls: {
    // Allow self-signed certs that shared hosting providers often use
    rejectUnauthorized: false,
  },
});

// ── Step 1: Verify connection ──────────────────────────────
console.log('Step 1: Verifying SMTP connection...');
try {
  await transporter.verify();
  console.log('  ✅ SMTP connection verified — credentials accepted!\n');
} catch (err) {
  console.error('  ❌ SMTP connection FAILED:', err.message);
  console.error('\n  Possible causes:');
  console.error('  • Wrong host/port — check mail.tinitraker.in:465 is reachable');
  console.error('  • Wrong password');
  console.error('  • Firewall blocking outbound port 465');
  console.error('\n  Full error:', err);
  process.exit(1);
}

// ── Step 2: Send test OTP-style email ─────────────────────
console.log(`Step 2: Sending test email to ${TEST_TO}...`);
const testOtp = '847291';
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0b0d; color: #f1f5f9; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #111113; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 32px 28px; }
    .logo-text { font-size: 22px; font-weight: 700; color: #ffffff; }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin: 20px 0 10px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px; }
    .otp-box { background: rgba(0,133,124,0.12); border: 1px solid rgba(0,133,124,0.35); border-radius: 10px; padding: 18px 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2dd4bf; margin: 0; }
    .validity { font-size: 12px; color: #6b7280; margin-top: 8px; }
    .footer { font-size: 12px; color: #475569; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; margin-top: 24px; }
    .badge { display: inline-block; background: rgba(0,133,124,0.15); border: 1px solid rgba(0,133,124,0.3); color: #2dd4bf; font-size: 11px; padding: 2px 8px; border-radius: 20px; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓ SMTP TEST</div>
    <div class="logo-text">TiniTraker</div>
    <h1>Email Service Working! 🎉</h1>
    <p>This is a test email confirming that the TiniTraker SMTP email service is correctly configured and sending emails from <strong>admin@tinitraker.in</strong>.</p>
    <p>Below is a sample OTP code as it would appear to users during registration or password reset:</p>
    <div class="otp-box">
      <div class="otp-code">${testOtp}</div>
      <div class="validity">Sample code — Valid for 5 minutes</div>
    </div>
    <p style="font-size: 13px; color: #cbd5e1;">If you received this email, the email delivery pipeline is working end-to-end.</p>
    <div class="footer">
      Sent from TiniTraker at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.<br>
      Server: mail.tinitraker.in (SSL 465)
    </div>
  </div>
</body>
</html>
`;

try {
  const info = await transporter.sendMail({
    from:    cfg.from,
    to:      TEST_TO,
    subject: '✅ TiniTraker SMTP Test — Email Service Confirmed',
    text:    `TiniTraker SMTP test. Sample OTP: ${testOtp}. Sent at ${new Date().toISOString()}`,
    html,
  });
  console.log(`  ✅ Email sent successfully!`);
  console.log(`  Message ID : ${info.messageId}`);
  console.log(`  Response   : ${info.response}`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🎉 ALL TESTS PASSED — Check ${TEST_TO} inbox`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
} catch (err) {
  console.error('  ❌ Email send FAILED:', err.message);
  console.error('\n  Full error:', err);
  process.exit(1);
}
