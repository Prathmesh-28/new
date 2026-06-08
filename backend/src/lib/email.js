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

async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_USER) {
    console.log(`[email] would send to ${to}: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
}

async function sendOtp({ to, otp, name }) {
  await sendMail({
    to,
    subject: "Your Headroom OTP",
    html: `<p>Hi${name ? ` ${name}` : ""},</p><p>Your one-time password is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`,
  });
}

async function sendWelcome({ to, password }) {
  await sendMail({
    to,
    subject: "Welcome to Headroom — your credentials",
    html: `<p>Welcome to <strong>Headroom</strong>.</p><p>Email: <strong>${to}</strong><br>Temporary password: <strong>${password}</strong></p><p>Please change your password after first login.</p>`,
  });
}

module.exports = { sendMail, sendOtp, sendWelcome };
