import nodemailer from 'nodemailer';
import { env, isTest } from './env.js';

const { host, port, user, pass, from } = env.smtp;

/** Email goes out only when SMTP credentials are configured. */
export const mailEnabled = Boolean(user && pass);

/**
 * In tests, jsonTransport renders the message and hands it back instead of
 * connecting anywhere, so delivery can be asserted without a network or a mock.
 */
const transporter = isTest
  ? nodemailer.createTransport({ jsonTransport: true })
  : mailEnabled
    ? nodemailer.createTransport({
        host,
        port,
        // 465 is implicit TLS; 587 upgrades with STARTTLS.
        secure: port === 465,
        auth: { user, pass },
      })
    : null;

/** Messages captured during a test run, so assertions can read them. */
export const sentInTests = [];

/**
 * Sends one message. Resolves either way — a mail outage must never take an
 * order down with it, so failures are logged and swallowed.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!transporter || !to) return { sent: false, reason: 'mail-disabled' };

  try {
    const info = await transporter.sendMail({
      from: from || `Annam <${user}>`,
      to,
      subject,
      text,
      html,
    });

    if (isTest) sentInTests.push({ to, subject, text, html });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[mail] could not send "${subject}" to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

/** Confirms the credentials actually work, without sending anything. */
export async function verifyMailer() {
  if (!transporter || isTest) return { ok: mailEnabled };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
