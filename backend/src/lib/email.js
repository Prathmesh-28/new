const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || "smtp.gmail.com",
  port:   Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const BRAND = `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d09;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#16160f;border:1px solid #2a2a1a;border-radius:12px;overflow:hidden">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #2a2a1a">
          <span style="font-size:20px;font-weight:700;color:#ffffff;font-family:system-ui,sans-serif">
            Head<span style="color:#C9A227">room</span>
          </span>
        </td></tr>
`;

const FOOTER = `
        <tr><td style="padding:20px 32px;border-top:1px solid #2a2a1a;text-align:center">
          <p style="margin:0;font-size:11px;color:#5a5a40;font-family:system-ui,sans-serif">
            Headroom — Cash flow intelligence for Indian SMBs<br>
            This is an automated message, please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
`;

function wrap(body) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0">${BRAND}${body}${FOOTER}</html>`;
}

async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_USER) {
    console.log(`[email] would send to ${to}: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: `Headroom <${process.env.SMTP_FROM || process.env.SMTP_USER}>`, to, subject, html });
}

async function sendOtp({ to, otp, name }) {
  const html = wrap(`
    <tr><td style="padding:32px 32px 8px">
      <p style="margin:0 0 8px;font-size:14px;color:#9a9a70;font-family:system-ui,sans-serif">
        Hi${name ? ` ${name}` : ""},
      </p>
      <h2 style="margin:0 0 24px;font-size:22px;color:#ffffff;font-family:system-ui,sans-serif">
        Your one-time password
      </h2>
    </td></tr>
    <tr><td style="padding:0 32px">
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#0d0d09;border:1px solid #2a2a1a;border-radius:8px">
        <tr><td align="center" style="padding:20px">
          <span style="font-size:36px;font-weight:700;color:#C9A227;letter-spacing:10px;font-family:monospace">
            ${otp}
          </span>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 32px">
      <p style="margin:0;font-size:13px;color:#5a5a40;font-family:system-ui,sans-serif">
        This code expires in <strong style="color:#9a9a70">10 minutes</strong>.
        If you didn't request this, you can safely ignore this email.
      </p>
    </td></tr>
  `);
  await sendMail({ to, subject: "Your Headroom verification code", html });
}

async function sendWelcome({ to, password, name }) {
  const html = wrap(`
    <tr><td style="padding:32px 32px 8px">
      <h2 style="margin:0 0 8px;font-size:22px;color:#ffffff;font-family:system-ui,sans-serif">
        Welcome to Headroom${name ? `, ${name}` : ""}!
      </h2>
      <p style="margin:0 0 24px;font-size:14px;color:#9a9a70;font-family:system-ui,sans-serif">
        Your account has been created. Use the credentials below to sign in.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px">
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#0d0d09;border:1px solid #2a2a1a;border-radius:8px">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #1a1a10">
            <p style="margin:0;font-size:11px;color:#5a5a40;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px">Email</p>
            <p style="margin:4px 0 0;font-size:14px;color:#C9A227;font-family:monospace">${to}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px">
            <p style="margin:0;font-size:11px;color:#5a5a40;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px">Temporary password</p>
            <p style="margin:4px 0 0;font-size:14px;color:#C9A227;font-family:monospace">${password}</p>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 32px">
      <p style="margin:0 0 16px;font-size:13px;color:#9a9a70;font-family:system-ui,sans-serif">
        For security, please change your password after your first login.
      </p>
      <a href="${process.env.FRONTEND_URL || "https://headroom-pi.vercel.app"}/login"
        style="display:inline-block;background:#C9A227;color:#0d0d09;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">
        Sign in to Headroom →
      </a>
    </td></tr>
  `);
  await sendMail({ to, subject: "Welcome to Headroom — your credentials", html });
}

async function sendPasswordResetSuccess({ to, name }) {
  const html = wrap(`
    <tr><td style="padding:32px 32px 8px">
      <h2 style="margin:0 0 8px;font-size:22px;color:#ffffff;font-family:system-ui,sans-serif">
        Password updated
      </h2>
      <p style="margin:0 0 24px;font-size:14px;color:#9a9a70;font-family:system-ui,sans-serif">
        Hi${name ? ` ${name}` : ""},<br><br>
        Your Headroom password was successfully changed. If this wasn't you, please contact support immediately.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <a href="${process.env.FRONTEND_URL || "https://headroom-pi.vercel.app"}/login"
        style="display:inline-block;background:#C9A227;color:#0d0d09;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">
        Sign in to Headroom →
      </a>
    </td></tr>
  `);
  await sendMail({ to, subject: "Your Headroom password has been changed", html });
}

async function sendAlertEmail({ to, title, message, severity }) {
  const colorMap = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
  const color = colorMap[severity] || "#C9A227";
  const html = wrap(`
    <tr><td style="padding:32px 32px 8px">
      <h2 style="margin:0 0 8px;font-size:22px;color:#ffffff;font-family:system-ui,sans-serif">Cash Flow Alert</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#9a9a70;font-family:system-ui,sans-serif">
        A new alert was generated for your Headroom account.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px">
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#0d0d09;border:1px solid #2a2a1a;border-left:3px solid ${color};border-radius:8px">
        <tr><td style="padding:16px 20px">
          <p style="margin:0 0 4px;font-size:11px;color:#5a5a40;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px">
            ${severity} severity
          </p>
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#ffffff;font-family:system-ui,sans-serif">${title}</p>
          <p style="margin:0;font-size:13px;color:#9a9a70;font-family:system-ui,sans-serif">${message}</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 32px">
      <a href="${process.env.FRONTEND_URL || "https://headroom-pi.vercel.app"}/alerts"
        style="display:inline-block;background:#C9A227;color:#0d0d09;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">
        View Alerts →
      </a>
    </td></tr>
  `);
  await sendMail({ to, subject: `[${severity.toUpperCase()}] ${title} — Headroom`, html });
}

module.exports = { sendMail, sendOtp, sendWelcome, sendPasswordResetSuccess, sendAlertEmail };
