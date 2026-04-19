import type { Context } from 'hono';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

const ZIP_URL = 'https://zo.pub/fonk/listen/LISTEN.zip';

// In-memory deduplication (fine for low-volume hobby use)
const processedEvents = new Map<string, number>();
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

function markProcessed(id: string) {
  processedEvents.set(id, Date.now());
  for (const [key, ts] of processedEvents) {
    if (Date.now() - ts > EVENT_TTL_MS) processedEvents.delete(key);
  }
}

// POST /api/webhook - Stripe webhook handler
export default async function handler(c: Context) {
  const sig = c.req.header('stripe-signature');
  const body = await c.req.text();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return c.json({ error: 'Missing signature or secret' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  if (processedEvents.has(event.id)) {
    return c.json({ received: true, skipped: 'already processed' });
  }
  markProcessed(event.id);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerEmail = session.customer_details?.email;
    const hasCD = session.metadata?.hasCD === 'true';

    console.log(`[LISTEN] Payment from ${customerEmail} | CD: ${hasCD}`);
    // TODO: Send email with download link + CD note
    // For now: just log it. Wire up Resend/SendGrid/etc. to actually deliver.
  }

  return c.json({ received: true });
}
