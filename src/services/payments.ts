import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { getDatabase, getDatabaseClient } from '../config/database.js';
import { fail, objectId } from '../utils/record.js';
import { availableQuantity } from '../utils/rental.js';
import type { Booking, Equipment } from '../types.js';

let client: Stripe;
export function stripeClient(): Stripe {
  if (!env.stripeSecretKey) throw fail('Online payments are not configured.', 503);
  return client ??= new Stripe(env.stripeSecretKey, { maxNetworkRetries: 2, timeout: 15000 });
}
const bookings = () => getDatabase().collection<Booking>('bookings');
type CheckoutBooking = Booking & { checkoutExpiresAt?: number };

export function validateStripePayment(session: Stripe.Checkout.Session, booking: Booking): void {
  if (session.payment_status !== 'paid' || session.status !== 'complete') throw fail('Payment is not completed.', 409);
  if (session.metadata?.bookingId !== booking._id.toString() || session.metadata?.customerId !== booking.customerId || session.client_reference_id !== booking.customerId || session.currency !== 'usd' || session.amount_total !== Math.round(booking.total * 100)) throw fail('Payment details do not match this rental.', 409);
}

export async function syncPayment(booking: Booking): Promise<Booking> {
  if (!booking.stripeSessionId || booking.paymentStatus === 'paid') return booking;
  // Stripe's server API is the only authority for payment success; never the return URL.
  const checkout = await stripeClient().checkout.sessions.retrieve(booking.stripeSessionId);
  if (checkout.payment_status === 'paid') {
    validateStripePayment(checkout, booking);
    const session = getDatabaseClient().startSession();
    try {
      await session.withTransaction(async () => {
        const current = await bookings().findOne({ _id: booking._id }, { session });
        if (!current || current.paymentStatus === 'paid') return;
        if (current.stripeSessionId !== checkout.id) throw fail('This payment belongs to an older checkout attempt.', 409);
        await getDatabase().collection('payments').updateOne(
          { bookingId: booking._id.toString(), stripeSessionId: checkout.id },
          { $setOnInsert: { customerId: booking.customerId, ownerId: booking.ownerId, equipmentId: booking.equipmentId, amount: booking.total, currency: 'usd', status: 'paid', stripePaymentIntentId: typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id, idempotencyKey: checkout.id, createdAt: new Date() } },
          { upsert: true, session },
        );
        await bookings().updateOne({ _id: booking._id }, { $set: { paymentStatus: 'paid', status: 'confirmed' } }, { session });
      });
    } finally { await session.endSession(); }
  } else if (checkout.status === 'expired') {
    await bookings().updateOne({ _id: booking._id, stripeSessionId: checkout.id, paymentStatus: { $ne: 'paid' } }, { $set: { status: 'requested', paymentStatus: 'unpaid' }, $unset: { stripeSessionId: '', checkoutAttempt: '', checkoutCreatedAt: '', checkoutExpiresAt: '' } });
  }
  return await bookings().findOne({ _id: booking._id }) || booking;
}

async function createSession(booking: CheckoutBooking): Promise<Stripe.Checkout.Session> {
  if (booking.stripeSessionId) return stripeClient().checkout.sessions.retrieve(booking.stripeSessionId);
  if (!booking.checkoutAttempt) throw fail('Start a checkout before continuing.', 409);
  // A durable attempt ID makes retries create the same Stripe session.
  const checkout = await stripeClient().checkout.sessions.create({
    mode: 'payment', allowed_payment_method_types: ['card'],
    client_reference_id: booking.customerId, customer_email: booking.customerEmail,
    metadata: { bookingId: booking._id.toString(), customerId: booking.customerId },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(booking.total * 100), product_data: { name: booking.equipmentName, description: `${booking.startDate} to ${booking.endDate} · ${booking.quantity} units · ${booking.units} ${booking.rentalType} periods` } } }],
    success_url: `${env.authUrl}/payment/success?booking=${booking._id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.authUrl}/payment/cancelled?booking=${booking._id}`,
    expires_at: booking.checkoutExpiresAt,
  }, { idempotencyKey: `rental-${booking._id}-${booking.checkoutAttempt}` });
  await bookings().updateOne({ _id: booking._id, checkoutAttempt: booking.checkoutAttempt }, { $set: { stripeSessionId: checkout.id } });
  return checkout;
}

export async function startCheckout(bookingId: string, customerId: string): Promise<{ url: string }> {
  stripeClient();
  const filter = { _id: objectId(bookingId), customerId };
  let booking = await bookings().findOne(filter) as CheckoutBooking;
  if (!booking) throw fail('Rental not found.', 404);
  booking = await syncPayment(booking);
  if (booking.paymentStatus === 'paid') throw fail('This rental has already been paid.', 409);
  if (booking.status === 'cancelled') throw fail('This request was cancelled.', 409);
  // Reconcile outstanding sessions for this equipment before checking its inventory.
  const others = await bookings().find({ equipmentId: booking.equipmentId, status: 'checkout_pending', stripeSessionId: { $exists: true } }).toArray();
  for (const other of others) await syncPayment(other);
  const session = getDatabaseClient().startSession();
  try {
    await session.withTransaction(async () => {
      const current = await bookings().findOne(filter, { session });
      if (!current || current.status === 'cancelled' || current.paymentStatus === 'paid') throw fail('This rental cannot be checked out.', 409);
      if (current.status === 'checkout_pending') { booking = current; return; }
      if (current.startDate < new Date().toISOString().slice(0, 10)) throw fail('Choose new rental dates. This request starts in the past.');
      const equipment = await getDatabase().collection<Equipment>('equipment').findOneAndUpdate({ _id: objectId(current.equipmentId), approvalStatus: 'approved', deleted: { $ne: true } }, { $inc: { inventoryVersion: 1 } }, { session, returnDocument: 'after' });
      if (!equipment) throw fail('This equipment is no longer available.', 409);
      const reserved = await bookings().find({ equipmentId: current.equipmentId, status: { $in: ['checkout_pending', 'confirmed', 'active'] }, startDate: { $lte: current.endDate }, endDate: { $gte: current.startDate } }, { session }).toArray();
      if (availableQuantity(equipment, reserved, current.startDate, current.endDate) < current.quantity) throw fail('Not enough equipment is available for these dates.', 409);
      // Re-price on the server when a request is first checked out.
      const units = Math.ceil(current.days / ({ Daily: 1, Weekly: 7, Monthly: 30 }[equipment.rentalType] || 1));
      const update = { status: 'checkout_pending', paymentStatus: 'pending', unitPrice: equipment.price, rentalType: equipment.rentalType, units, total: Math.round(equipment.price * units * current.quantity * 100) / 100, checkoutAttempt: randomUUID(), checkoutCreatedAt: new Date(), checkoutExpiresAt: Math.floor(Date.now() / 1000) + 35 * 60 };
      if(update.total>999999.99)throw fail('Rental total exceeds the supported card-payment limit. Reduce the quantity or duration.');
      await bookings().updateOne(filter, { $set: update }, { session });
      booking = { ...current, ...update };
    });
  } finally { await session.endSession(); }
  let checkout: Stripe.Checkout.Session;
  try { checkout = await createSession(booking); } catch { throw fail('Stripe Checkout could not be opened. Please try again or release the pending checkout from the payment page.',502); }
  if (checkout.status !== 'open' || !checkout.url) throw fail('Checkout has ended. Refresh your payment status before trying again.', 409);
  return { url: checkout.url };
}

export async function reconcilePayments(): Promise<void> {
  if (!env.stripeSecretKey) return;
  const pending = await bookings().find({ status: 'checkout_pending', paymentStatus: { $ne: 'paid' } }).sort({ checkoutCreatedAt: 1 }).limit(100).toArray();
  for (const booking of pending) {
    try {
      if (booking.stripeSessionId) await syncPayment(booking);
      else if (booking.checkoutCreatedAt && Date.now() - booking.checkoutCreatedAt.getTime() > 40 * 60 * 1000) {
        // No checkout URL can be returned before its session ID is persisted.
        await bookings().updateOne({ _id: booking._id, stripeSessionId: { $exists: false }, status: 'checkout_pending' }, { $set: { status: 'requested', paymentStatus: 'unpaid' }, $unset: { checkoutAttempt: '', checkoutCreatedAt: '', checkoutExpiresAt: '' } });
      } else await createSession(booking);
    } catch { console.error('Payment reconciliation will retry an outstanding checkout.'); }
  }
}
