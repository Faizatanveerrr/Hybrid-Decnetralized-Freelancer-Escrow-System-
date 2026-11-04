/**
 * Razorpay (UPI / Paytm / cards) via its REST API - no SDK needed.
 * Gateway-specific code lives only here, so swapping to another gateway
 * (e.g. Paytm PG) means re-implementing these four functions.
 */
import crypto from 'crypto';

// Overridable for local testing against a fake gateway
const api = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1';

const creds = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || ''
});

export const isPaymentsEnabled = () => {
  const { keyId, keySecret } = creds();
  return Boolean(keyId && keySecret);
};

export const getPublicPaymentConfig = () => ({
  enabled: isPaymentsEnabled(),
  keyId: creds().keyId,
  maxTopUp: Number(process.env.MAX_TOPUP_INR || 50000),
  testMode: creds().keyId.startsWith('rzp_test_')
});

const call = async (path, options = {}) => {
  const { keyId, keySecret } = creds();
  const res = await fetch(`${api()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.description || `Razorpay request failed (${res.status})`);
  return body;
};

/** Create a gateway order for `rupees` (rounded to paise). */
export const createOrder = (rupees, receipt) =>
  call('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: Math.round(rupees * 100), currency: 'INR', receipt, payment_capture: 1 })
  });

/** Fetch an order (used to reconcile when the browser closed mid-payment). */
export const fetchOrder = (orderId) => call(`/orders/${encodeURIComponent(orderId)}`);

/** Verify the signature Razorpay returns to the browser after payment. */
export const verifySignature = (orderId, paymentId, signature) => {
  const { keySecret } = creds();
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
