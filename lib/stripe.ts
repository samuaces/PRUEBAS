import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

export const MIN_ENTRY_CENTS = 500; // EUR 5 minimum, enforced server-side
