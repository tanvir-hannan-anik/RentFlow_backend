import { Router } from 'express';
import { requireJwt, verifyRenter } from '../middleware/auth.js';
import { getDatabase } from '../config/database.js';
import { objectId, fail } from '../utils/record.js';
import { sendResponse } from '../utils/api-response.js';
import { startCheckout, syncPayment, stripeClient } from '../services/payments.js';
import type { Booking } from '../types.js';
const router = Router();
router.post('/payments/checkout', requireJwt, verifyRenter, async (req,res) => sendResponse(res,200,'Checkout ready',await startCheckout(req.body?.bookingId,req.auth.user.id)));
router.post('/payments/verify', requireJwt, verifyRenter, async (req,res) => {
  const booking = await getDatabase().collection<Booking>('bookings').findOne({ _id: objectId(req.body?.bookingId), customerId: req.auth.user.id });
  if (!booking) throw fail('Rental not found.',404);
  if (req.body.sessionId && req.body.sessionId !== booking.stripeSessionId) throw fail('Checkout does not belong to this rental.',403);
  sendResponse(res,200,'Payment status checked',await syncPayment(booking));
});
router.post('/payments/cancel-checkout', requireJwt, verifyRenter, async (req,res) => {
  const booking = await getDatabase().collection<Booking>('bookings').findOne({ _id:objectId(req.body?.bookingId),customerId:req.auth.user.id });
  if (!booking) throw fail('Rental not found.',404);
  if (booking.stripeSessionId && booking.paymentStatus !== 'paid') {
    const checkout = await stripeClient().checkout.sessions.retrieve(booking.stripeSessionId);
    if(checkout.status==='open') await stripeClient().checkout.sessions.expire(checkout.id);
  }
  sendResponse(res,200,'Checkout status updated',await syncPayment(booking));
});
export default router;
