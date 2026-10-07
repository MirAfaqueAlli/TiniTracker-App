import nodemailer from 'nodemailer';

/**
 * Creates a Nodemailer transporter based on environment variables.
 * Supported variables:
 *  - SMTP_HOST (e.g. smtp.gmail.com, smtp-relay.brevo.com, etc.)
 *  - SMTP_PORT (default 587 or 465)
 *  - SMTP_SECURE ('true' for 465, false otherwise)
 *  - SMTP_USER
 *  - SMTP_PASS
 *  - SMTP_FROM (default: "TiniTraker <noreply@tinitraker.in>")
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      // cPanel shared hosting uses self-signed certs — allow them
      rejectUnauthorized: false,
    },
  });
}

/**
 * Sends a 6-digit verification OTP email to the user.
 * Valid for 5 minutes.
 * @param {string} toEmail
 * @param {string} otp
 * @param {{ subject?: string, intro?: string, bodyLine?: string }} [opts]
 */
export async function sendOtpEmail(toEmail, otp, opts = {}) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || '"TiniTraker" <admin@tinitraker.in>';

  const subject = opts.subject || `Your TiniTraker Verification Code: ${otp}`;
  const heading = opts.intro || 'Verify Your Email Address';
  const introLine = opts.bodyLine || 'Thank you for choosing TiniTraker. Please use the verification code below to verify your email address and continue:';
  const instruction = opts.instruction || 'Enter this 6-digit code on the screen to proceed.';

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b0d; color: #f1f5f9; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #111113; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 32px 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .logo-text { font-size: 22px; font-weight: 700; color: #14b8a6; letter-spacing: -0.02em; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 12px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px; }
    .otp-box { background: rgba(20, 184, 166, 0.1); border: 1px solid rgba(20, 184, 166, 0.35); border-radius: 10px; padding: 18px 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2dd4bf; margin: 0; }
    .validity { font-size: 12px; color: #94a3b8; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .instruction { font-size: 13px; color: #cbd5e1; margin-top: 16px; }
    .footer { font-size: 12px; color: #475569; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; margin-top: 24px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <span class="logo-text">TiniTraker</span>
    </div>
    <h1>${heading}</h1>
    <p>${introLine}</p>

    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="validity">Valid for 5 minutes only</div>
    </div>

    <p class="instruction">${instruction}</p>

    <div class="footer">
      If you did not request this verification code, please ignore this email. Your account remains secure.
    </div>
  </div>
</body>
</html>
  `;

  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n======================================================');
      console.log(`📨 [TiniTraker Email OTP] To: ${toEmail}`);
      console.log(`🔑 Verification Code: ${otp}`);
      console.log(`⏱️  Validity: 5 Minutes`);
      console.log(`ℹ️  Note: SMTP is not configured in .env. Code logged for development.`);
      console.log('======================================================\n');
      return { success: true, simulated: true, otp };
    } else {
      console.error('[TiniTraker] ⚠️ SMTP is not configured. OTP email could not be sent.');
      return { success: false, simulated: false, error: 'Email service is not configured' };
    }
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text: opts.text || `${heading}\n\n${introLine}\n\nYour verification code is: ${otp}\n(Valid for 5 minutes)\n\n${instruction}`,
      html: htmlContent,
    });
    console.log(`✅ Verification email sent to ${toEmail}: messageId=${info.messageId}`);
    return { success: true, messageId: info.messageId, simulated: false };
  } catch (err) {
    console.error(`❌ Failed to send verification email to ${toEmail}:`, err);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Fallback OTP for ${toEmail}: ${otp}`);
    }
    return { success: false, simulated: false, error: err.message };
  }
}

/**
 * Sends a general transactional email.
 * @param {{ to: string, subject: string, html?: string, text?: string }} options
 */
export async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || '"TiniTraker" <admin@tinitraker.in>';

  if (!transporter) {
    console.log(`[Email Simulated] To: ${to}, Subject: ${subject}`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || '',
      html: html || undefined,
    });
    console.log(`✅ Email sent to ${to}: messageId=${info.messageId}`);
    return { success: true, messageId: info.messageId, simulated: false };
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err);
    return { success: false, simulated: false, error: err.message };
  }
}
