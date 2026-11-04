/**
 * Paying rupees out to a UPI ID.
 *
 *  - 'razorpayx'  : RazorpayX Payouts API (needs a RazorpayX account).
 *  - 'simulated'  : no money moves; the payout is marked processed immediately.
 *                   For demos and tests without a RazorpayX account.
 *
 * Gateway-specific code lives only in this file.
 */
import crypto from 'crypto';

const apiBase = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1';

export const getPayoutMode = () =>
  process.env.PAYOUT_MODE || (process.env.RAZORPAYX_ACCOUNT_NUMBER ? 'razorpayx' : 'simulated');

/** Live = RazorpayX with live keys: real rupees leave the platform's account. */
export const isLivePayouts = () => getPayoutMode() === 'razorpayx' && (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_');

export const getPayoutLimits = () => ({
  min: 1,
  max: Number(process.env.MAX_PAYOUT_INR || 10000)
});

export const isValidVpa = (vpa) => /^[a-zA-Z0-9._-]{2,100}@[a-zA-Z0-9]{2,64}$/.test(String(vpa || ''));

const call = async (path, options = {}, extraHeaders = {}) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      ...extraHeaders
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.description || `Payout request failed (${res.status})`);
  return body;
};

/** Gateway status -> our coarse status. */
export const mapGatewayStatus = (status) => {
  if (status === 'processed') return 'PROCESSED';
  if (['failed', 'reversed', 'rejected', 'cancelled'].includes(status)) return 'FAILED';
  return 'PROCESSING'; // queued, pending, initiated, processing...
};

/**
 * Send `amount` rupees to the user's UPI ID. Safe to call again with the same
 * idempotencyKey: the gateway returns the original payout instead of paying twice.
 * returns { id, status: 'PROCESSED'|'PROCESSING'|'FAILED', utr, failureReason }
 */
export const sendPayout = async ({ idempotencyKey, amount, vpa, user }) => {
  if (getPayoutMode() === 'simulated') {
    return { id: `sim_${idempotencyKey.slice(0, 12)}`, status: 'PROCESSED', utr: `SIM${crypto.randomInt(10 ** 9, 10 ** 10)}`, failureReason: '' };
  }
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!accountNumber) throw new Error('RAZORPAYX_ACCOUNT_NUMBER is not set.');
  const payout = await call('/payouts', {
    method: 'POST',
    body: JSON.stringify({
      account_number: accountNumber,
      amount: Math.round(amount * 100),
      currency: 'INR',
      mode: 'UPI',
      purpose: 'payout',
      reference_id: idempotencyKey,
      narration: 'EscrowX payout',
      fund_account: {
        account_type: 'vpa',
        vpa: { address: vpa },
        contact: { name: user.name, email: user.email, type: 'customer', reference_id: String(user._id) }
      }
    })
  }, { 'X-Payout-Idempotency': idempotencyKey });
  return { id: payout.id, status: mapGatewayStatus(payout.status), utr: payout.utr || '', failureReason: payout.failure_reason || '' };
};

/** Current state of a payout at the gateway. Same shape as sendPayout(). */
export const fetchPayoutStatus = async (gatewayPayoutId) => {
  if (getPayoutMode() === 'simulated' || String(gatewayPayoutId).startsWith('sim_')) {
    return { id: gatewayPayoutId, status: 'PROCESSED', utr: '', failureReason: '' };
  }
  const payout = await call(`/payouts/${encodeURIComponent(gatewayPayoutId)}`);
  return { id: payout.id, status: mapGatewayStatus(payout.status), utr: payout.utr || '', failureReason: payout.failure_reason || '' };
};
