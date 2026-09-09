import Payment from '../models/Payment.js';
import { razorpay, razorpayEnabled, toPaise } from '../config/razorpay.js';

/**
 * Returning a customer's money when their order is cancelled.
 *
 * Idempotent, because a cancellation can be retried and a webhook can arrive
 * twice: an order already refunding or refunded is left exactly as it is.
 * Nothing here throws — a gateway that is down must not block the cancellation
 * itself, since leaving the food order live would be worse than a refund that
 * needs chasing. The failure is recorded for an admin to retry.
 */

/** What a given order is owed, and how it was paid. */
function refundPlan(order) {
  if (order.paymentStatus !== 'paid') return { action: 'none', reason: 'nothing was captured' };

  switch (order.paymentMethod) {
    case 'cod':
      // Cash is handed over on delivery; a cancelled order was never paid.
      return { action: 'none', reason: 'cash on delivery' };
    case 'mock-card':
      // Simulated gateway: settle instantly so the demo shows the whole flow.
      return { action: 'simulate' };
    case 'razorpay':
      return { action: 'gateway' };
    default:
      return { action: 'none', reason: 'unknown payment method' };
  }
}

/**
 * Refunds a cancelled order. Returns the paymentStatus the order should carry.
 * Never throws.
 */
export async function refundOrder(order) {
  const plan = refundPlan(order);

  if (plan.action === 'none') return order.paymentStatus;
  if (plan.action === 'simulate') {
    await Payment.updateOne(
      { orderId: order._id },
      { status: 'refunded', refundedAmount: order.total, refundedAt: new Date() }
    );
    return 'refunded';
  }

  const payment = await Payment.findOne({ orderId: order._id });
  if (!payment?.razorpayPaymentId) {
    console.error(`[refund] no captured payment recorded for order ${order._id}`);
    return 'refund_failed';
  }
  // Already handled, possibly by a webhook arriving first.
  if (['refunding', 'refunded'].includes(payment.status)) return payment.status;

  if (!razorpayEnabled) {
    console.error('[refund] Razorpay is not configured; cannot refund', String(order._id));
    return 'refund_failed';
  }

  try {
    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: toPaise(order.total),
      speed: 'normal',
      notes: { orderId: String(order._id), reason: order.cancellationReason || 'Order cancelled' },
    });

    payment.refundId = refund.id;
    payment.refundedAmount = order.total;
    payment.refundRequestedAt = new Date();
    // Razorpay may settle immediately or asynchronously; the webhook confirms.
    payment.status = refund.status === 'processed' ? 'refunded' : 'refunding';
    if (refund.status === 'processed') payment.refundedAt = new Date();
    await payment.save();

    return payment.status;
  } catch (err) {
    const reason = err?.error?.description || err?.message || 'unknown error';
    console.error(`[refund] gateway refused for order ${order._id}: ${reason}`);

    payment.status = 'refund_failed';
    payment.refundFailureReason = reason;
    await payment.save();

    return 'refund_failed';
  }
}
