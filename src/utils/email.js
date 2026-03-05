const sgMail = require('@sendgrid/mail');
const logger = require('./logger');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await sgMail.send({
      to,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'CircleCore' },
      subject,
      text: text || '',
      html,
    });
    logger.info('Email sent to ' + to);
  } catch (error) {
    logger.error('Email failed to ' + to + ': ' + error.message);
    throw new Error('Email delivery failed');
  }
};

const sendVerificationEmail = async (to, name, token) => {
  const url = process.env.FRONTEND_URL + '/verify-email?token=' + token;
  await sendEmail({
    to,
    subject: 'Verify your CircleCore account',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>Welcome to CircleCore, ${name}!</h2>
      <p>Please verify your email to activate your account.</p>
      <a href="${url}" style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">Verify Email</a>
      <p>This link expires in 24 hours.</p>
    </div>`,
  });
};

const sendPasswordResetEmail = async (to, name, token) => {
  const url = process.env.FRONTEND_URL + '/reset-password?token=' + token;
  await sendEmail({
    to,
    subject: 'Reset your CircleCore password',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>Password Reset</h2>
      <p>Hi ${name}, click below to reset your password.</p>
      <a href="${url}" style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">Reset Password</a>
      <p>This link expires in 1 hour.</p>
    </div>`,
  });
};

/**
 * Document requirement: Email digests
 * Sends a weekly digest of unread notifications to a user
 */
const sendNotificationDigest = async (to, name, notifications) => {
  if (!notifications || notifications.length === 0) return;

  const notificationRows = notifications.map(n =>
    `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee">
        <strong>${n.title}</strong><br>
        <span style="color:#666;font-size:13px">${n.message}</span>
      </td>
    </tr>`
  ).join('');

  await sendEmail({
    to,
    subject: 'Your CircleCore weekly digest',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>Hi ${name}, here is your weekly digest</h2>
      <p>You have ${notifications.length} unread notification(s) on CircleCore.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${notificationRows}
      </table>
      <a href="${process.env.FRONTEND_URL}/notifications" style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
        View All Notifications
      </a>
      <p style="color:#999;font-size:12px;margin-top:24px">
        You are receiving this because you have unread notifications on CircleCore.
      </p>
    </div>`,
  });
};

/**
 * Document requirement: Admin announcement email
 * Sends an announcement email from admin to a user
 */
const sendAnnouncementEmail = async (to, name, announcementTitle, announcementBody) => {
  await sendEmail({
    to,
    subject: '[CircleCore Announcement] ' + announcementTitle,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>Community Announcement</h2>
      <p>Hi ${name},</p>
      <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0">
        <h3>${announcementTitle}</h3>
        <p>${announcementBody}</p>
      </div>
      <a href="${process.env.FRONTEND_URL}" style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
        Visit CircleCore
      </a>
    </div>`,
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNotificationDigest,
  sendAnnouncementEmail,
};