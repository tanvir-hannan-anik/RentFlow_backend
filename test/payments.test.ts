import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import type Stripe from 'stripe';
import type { Booking } from '../src/types.js';
import { validateStripePayment } from '../src/services/payments.js';
const booking = { _id:new ObjectId(),customerId:'customer-a',total:125 } as Booking;
const session = { id:'cs_test_fixture',status:'complete',payment_status:'paid',currency:'usd',amount_total:12500,client_reference_id:'customer-a',metadata:{bookingId:booking._id.toString(),customerId:'customer-a'} } as Stripe.Checkout.Session;
test('payment verification accepts a paid Stripe session with matching stored ownership and amount',()=>assert.doesNotThrow(()=>validateStripePayment(session,booking)));
test('payment verification rejects unpaid, mismatched amounts, currency, ownership, and rental IDs',()=>{
 for(const changes of [{payment_status:'unpaid'},{status:'open'},{amount_total:1},{currency:'eur'},{client_reference_id:'another-customer'},{metadata:{bookingId:'another-booking',customerId:'customer-a'}}])assert.throws(()=>validateStripePayment({...session,...changes} as Stripe.Checkout.Session,booking),{status:409});
});
