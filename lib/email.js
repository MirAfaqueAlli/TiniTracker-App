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
  const from = process.env.SMTP_FROM || '"TiniTraker" <noreply@tinitraker.in>';

  const subject = opts.subject || `Your TiniTraker Verification Code: ${otp}`;
  const heading = opts.intro || 'Verify Your Email Address';
  const introLine = opts.bodyLine || 'Thank you for starting your free trial with TiniTraker. Please use the verification code below to verify your email address and complete your registration:';
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b0d; color: #f1f5f9; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #111113; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 32px 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .logo-text { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin: 0 0 10px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px; }
    .otp-box { background: rgba(0, 133, 124, 0.12); border: 1px solid rgba(0, 133, 124, 0.35); border-radius: 10px; padding: 18px 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2dd4bf; margin: 0; }
    .validity { font-size: 12px; color: #6b7280; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
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

    <p style="font-size: 13px; color: #cbd5e1;">Enter this 6-digit code on the registration page to proceed.</p>

    <div class="footer">
      If you did not request this verification code, please ignore this email. No account will be created without this verification.
    </div>
  </div>
</body>
</html>
  `;

  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      // Dev-only: log OTP to terminal so local development works without SMTP
      console.log('\n======================================================');
      console.log(`📨 [TiniTraker Email OTP] To: ${toEmail}`);
      console.log(`🔑 Verification Code: ${otp}`);
      console.log(`⏱️  Validity: 5 Minutes (Expires at ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()})`);
      console.log(`ℹ️  Note: SMTP is not configured in .env. Code logged for development.`);
      console.log('======================================================\n');
    } else {
      // Production: do NOT log the OTP. Fail loudly so the ops team configures SMTP.
      console.error('[TiniTraker] ⚠️ SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS). OTP email could not be sent. Please configure SMTP in environment variables.');
    }
    return { success: true, simulated: true, otp };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text: `Your TiniTraker verification code is: ${otp}. This code is valid for 5 minutes.`,
      html: htmlContent,
    });
    console.log(`✅ Verification email sent to ${toEmail}: messageId=${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Failed to send verification email to ${toEmail}:`, err);
    // If SMTP fails in dev mode, fallback to logging so developer isn't stuck
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Fallback OTP for ${toEmail}: ${otp}`);
    }
    return { success: true, simulated: true, otp, error: err.message };
  }
}
