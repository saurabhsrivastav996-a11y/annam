import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from './env.js';

const { keyId, keySecret, webhookSecret } = env.razorpay;

/** Online payment is offered only when both keys are present. */
export const razorpayEnabled = Boolean(keyId && keySecret);

export const razorpay = razorpayEnabled
  ? new Razorpay({ key_id: keyId, key_secret: keySecret })
  : null;

export const webhookConfigured = Boolean(webhookSecret);

/** Razorpay works in the smallest currency unit, so rupees become paise. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

/**
 * Constant-time compare, so a wrong signature cannot be narrowed down by
 * timing how long the rejection took.
 */
function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Confirms a checkout result really came from Razorpay.
 * The browser reports success, so this is the only thing standing between a
 * forged callback and a free meal — never mark an order paid without it.
 */
export function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  if (!razorpayEnabled || !razorpayOrderId || !razorpayPaymentId || !signature) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  return safeEqual(expected, signature);
}

/** Verifies a webhook against the raw request body, which must not be re-serialised. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!webhookConfigured || !signature) return false;

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
