/**
 * Pay with UPI / Paytm / card (Razorpay Checkout). After the gateway confirms,
 * the server verifies the signature and mints the same amount of INR tokens
 * to the user's wallet, which are then spent through the escrow smart contract.
 */
import { getPaymentConfigApi, createPaymentOrderApi, verifyPaymentApi } from './api.js';

let configPromise = null;
export const loadPaymentConfig = () => {
  if (!configPromise) {
    configPromise = getPaymentConfigApi()
      .then((res) => res.data?.config || { enabled: false })
      .catch(() => {
        configPromise = null;
        return { enabled: false };
      });
  }
  return configPromise;
};

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const loadCheckoutScript = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Could not load the payment window. Check your internet connection.')));
    if (!existing) {
      script.src = CHECKOUT_SRC;
      document.body.appendChild(script);
    }
  });

/**
 * Opens the payment window for `amount` rupees.
 * Resolves with the server's verify response ({ message, payment }).
 * Rejects with err.cancelled === true if the user closes the window.
 */
export const startTopUp = async ({ amount, user }) => {
  const config = await loadPaymentConfig();
  if (!config.enabled) throw new Error('Payments are not enabled on this server.');

  // Demo mode: no gateway. The server creates a demo order and credits the tokens
  // when we confirm it (the "checkout" is the demo form on the Wallet page).
  if (config.mode === 'demo') {
    const demoOrder = (await createPaymentOrderApi({ amount })).data;
    return (await verifyPaymentApi({ razorpay_order_id: demoOrder.orderId })).data;
  }

  await loadCheckoutScript();
  const orderRes = await createPaymentOrderApi({ amount });
  const order = orderRes.data;

  return new Promise((resolve, reject) => {
    let paid = false;
    const checkout = new window.Razorpay({
      key: config.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency || 'INR',
      name: 'EscrowX',
      description: `Add ₹${order.amount} as INR tokens`,
      prefill: { name: user?.name, email: user?.email },
      theme: { color: '#4f46e5' },
      handler: async (response) => {
        paid = true; // the window closes right after success; do not treat that as a cancel
        try {
          const verified = await verifyPaymentApi(response);
          resolve(verified.data);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => {
          if (!paid) reject(Object.assign(new Error('Payment cancelled.'), { cancelled: true }));
        }
      }
    });
    checkout.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed.')));
    checkout.open();
  });
};
