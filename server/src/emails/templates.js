import { env } from '../config/env.js';
import { formatSlot } from '../utils/time.js';

/**
 * Email bodies, as pure functions returning { subject, text, html }.
 *
 * Kept separate from delivery so they can be asserted directly in tests
 * without a transport, a mock, or a network call.
 */

const BRAND = '#f06106';
const INK = '#292524';
const MUTED = '#78716c';

/** The public origin, for links back into the app. */
const appUrl = () => (env.clientUrls[0] || 'http://localhost:5173').replace(/\/$/, '');

/**
 * Escapes text before it goes into HTML.
 * Restaurant names, dish names and reviews are user-supplied; without this a
 * name containing markup would render as markup in the recipient's inbox.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Shared shell. Inline styles only — email clients strip <style> blocks. */
function layout({ heading, intro, bodyHtml = '', ctaLabel, ctaHref, footer }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;">
      <tr>
        <td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:20px;font-weight:700;">🍲 Annam <span style="color:${BRAND};font-weight:400;">अन्नम्</span></p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 0;">
          <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">${heading}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${MUTED};">${intro}</p>
          ${bodyHtml}
          ${
            ctaHref
              ? `<p style="margin:24px 0 8px;">
                   <a href="${ctaHref}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:15px;font-weight:600;">${ctaLabel}</a>
                 </p>`
              : ''
          }
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 24px;">
          <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;line-height:1.5;color:#a8a29e;">
            ${footer || 'You are receiving this because you have an Annam account.'}
            Turn these off any time in <a href="${appUrl()}/profile" style="color:${MUTED};">your profile</a>.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Order lines as an HTML table plus a plain-text equivalent. */
function itemsBlock(items = [], { subtotal, deliveryFee, total }) {
  const rows = items
    .map(
      (i) => `<tr>
        <td style="padding:6px 0;font-size:14px;">${escapeHtml(i.qty)} × ${escapeHtml(i.name)}</td>
        <td style="padding:6px 0;font-size:14px;text-align:right;">${rupees(i.price * i.qty)}</td>
      </tr>`
    )
    .join('');

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
    ${rows}
    <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #e7e5e4;"></td></tr>
    <tr><td style="padding:4px 0;font-size:14px;color:${MUTED};">Subtotal</td><td style="padding:4px 0;font-size:14px;text-align:right;">${rupees(subtotal)}</td></tr>
    <tr><td style="padding:4px 0;font-size:14px;color:${MUTED};">Delivery</td><td style="padding:4px 0;font-size:14px;text-align:right;">${rupees(deliveryFee)}</td></tr>
    <tr><td style="padding:6px 0;font-size:15px;font-weight:700;">Total</td><td style="padding:6px 0;font-size:15px;font-weight:700;text-align:right;">${rupees(total)}</td></tr>
  </table>`;

  const text = [
    ...items.map((i) => `  ${i.qty} x ${i.name} — ${rupees(i.price * i.qty)}`),
    `  Subtotal: ${rupees(subtotal)}`,
    `  Delivery: ${rupees(deliveryFee)}`,
    `  Total: ${rupees(total)}`,
  ].join('\n');

  return { html, text };
}

const shortId = (id) => String(id).slice(-6).toUpperCase();

export function welcome({ name, role }) {
  const what = {
    customer: 'Browse the reels, order from a kitchen you can watch, and track it live.',
    restaurant: 'Set up your kitchen, add a menu and reels, and post surplus food to Annadevta.',
    delivery: 'Go online from your dashboard to start claiming deliveries.',
    volunteer: 'Open Annadevta to see surplus food waiting for pickup near you.',
  }[role] || 'Welcome aboard.';

  return {
    subject: 'Welcome to Annam',
    text: `Hi ${name},\n\nYour Annam account is ready.\n\n${what}\n\n${appUrl()}\n`,
    html: layout({
      heading: `Welcome, ${escapeHtml(name)}`,
      intro: 'Your Annam account is ready.',
      bodyHtml: `<p style="margin:0;font-size:15px;line-height:1.55;">${escapeHtml(what)}</p>`,
      ctaLabel: 'Open Annam',
      ctaHref: appUrl(),
    }),
  };
}

export function orderPlaced({ order, restaurantName }) {
  const items = itemsBlock(order.items, order);
  const link = `${appUrl()}/order/${order._id}`;
  const id = shortId(order._id);

  // What a customer needs from a scheduled order is when it will turn up, not
  // the promise of an email once it is on the way — that is hours off.
  if (order.scheduledFor) {
    const slot = formatSlot(order.scheduledFor);
    return {
      subject: `Order scheduled for ${slot} — ${restaurantName} (#${id})`,
      text: `Your order from ${restaurantName} is scheduled for delivery around ${slot}.\n\n${items.text}\n\nTrack it: ${link}\n`,
      html: layout({
        heading: 'Your order is scheduled',
        intro: `${escapeHtml(restaurantName)} will start cooking order #${id} in time to deliver it around ${escapeHtml(slot)}.`,
        bodyHtml: items.html,
        ctaLabel: 'Track your order',
        ctaHref: link,
      }),
    };
  }

  return {
    subject: `Order confirmed — ${restaurantName} (#${id})`,
    text: `Your order from ${restaurantName} is in.\n\n${items.text}\n\nTrack it: ${link}\n`,
    html: layout({
      heading: 'Your order is in',
      intro: `${escapeHtml(restaurantName)} has your order #${id}. We will email you when it is on the way.`,
      bodyHtml: items.html,
      ctaLabel: 'Track your order',
      ctaHref: link,
    }),
  };
}

export function newOrderForRestaurant({ order, customerName }) {
  const items = itemsBlock(order.items, order);
  const link = `${appUrl()}/dashboard/restaurant`;
  const due = order.scheduledFor ? ` Due around ${formatSlot(order.scheduledFor)}.` : '';

  return {
    subject: `New order #${shortId(order._id)} — ${rupees(order.total)}`,
    text: `New order from ${customerName}.${due}\n\n${items.text}\n\nDeliver to: ${order.deliveryAddress}\n\nAccept it: ${link}\n`,
    html: layout({
      heading: `New order #${shortId(order._id)}`,
      intro: `From ${escapeHtml(customerName)}, for delivery to ${escapeHtml(order.deliveryAddress)}.${escapeHtml(due)}`,
      bodyHtml: items.html,
      ctaLabel: 'Open your kitchen',
      ctaHref: link,
      footer: 'You are receiving this because you own a restaurant on Annam.',
    }),
  };
}

export function outForDelivery({ order, restaurantName, courierName, otp, etaMinutes }) {
  const link = `${appUrl()}/order/${order._id}`;
  const eta = etaMinutes ? `about ${etaMinutes} minutes` : 'shortly';

  return {
    subject: `On the way — ${restaurantName} (#${shortId(order._id)})`,
    text: `${courierName || 'Your delivery partner'} has picked up your order and should arrive in ${eta}.\n\nPickup code: ${otp}\nGive this to your delivery partner at handover.\n\nTrack: ${link}\n`,
    html: layout({
      heading: 'Your food is on the way',
      intro: `${escapeHtml(courierName || 'Your delivery partner')} has picked up your order from ${escapeHtml(restaurantName)} and should arrive in ${escapeHtml(eta)}.`,
      bodyHtml: `<div style="margin-top:8px;padding:14px 16px;background:#fff8ed;border:1px solid #ffdba8;border-radius:12px;">
          <p style="margin:0;font-size:13px;color:#9e380e;">Pickup code — read this out at handover</p>
          <p style="margin:4px 0 0;font-size:26px;font-weight:700;letter-spacing:5px;color:#9e380e;">${escapeHtml(otp)}</p>
        </div>`,
      ctaLabel: 'Follow it on the map',
      ctaHref: link,
    }),
  };
}

export function delivered({ order, restaurantName }) {
  const link = `${appUrl()}/order/${order._id}`;

  return {
    subject: `Delivered — ${restaurantName} (#${shortId(order._id)})`,
    text: `Your order from ${restaurantName} has been delivered. Enjoy!\n\nRate it: ${link}\n`,
    html: layout({
      heading: 'Delivered — enjoy',
      intro: `Your order from ${escapeHtml(restaurantName)} has arrived. If you have a minute, tell others how it was.`,
      ctaLabel: 'Rate this order',
      ctaHref: link,
    }),
  };
}

export function donationClaimed({ donation, volunteerName, volunteerPhone }) {
  const link = `${appUrl()}/dashboard/restaurant`;
  const contact = volunteerPhone ? ` (${volunteerPhone})` : '';

  return {
    subject: `${volunteerName} is collecting your donation`,
    text: `${volunteerName}${contact} has accepted your Annadevta donation: ${donation.description} (${donation.quantity} ${donation.units}).\n\nDetails: ${link}\n`,
    html: layout({
      heading: 'A volunteer is on the way',
      intro: `${escapeHtml(volunteerName)}${escapeHtml(contact)} has accepted your Annadevta donation.`,
      bodyHtml: `<p style="margin:0;padding:14px 16px;background:#f1f8f2;border:1px solid #bcddc3;border-radius:12px;font-size:15px;">
          ${escapeHtml(donation.description)}<br />
          <span style="color:${MUTED};font-size:14px;">${escapeHtml(donation.quantity)} ${escapeHtml(donation.units)}</span>
        </p>`,
      ctaLabel: 'View in your kitchen',
      ctaHref: link,
      footer: 'You are receiving this because you posted a donation on Annam.',
    }),
  };
}
