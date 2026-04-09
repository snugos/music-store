import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

const ZIP_URL = 'https://zo.pub/fonk/listen/LISTEN.zip';
const CD_EMAIL_NOTICE = '\n\n+ CD add-on purchased — we\'ll email you for your mailing address.';

// In-memory deduplication (fine for low-volume hobby use)
const processedEvents = new Map<string, number>();
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

function markProcessed(id: string) {
  processedEvents.set(id, Date.now());
  for (const [key, ts] of processedEvents) {
    if (Date.now() - ts > EVENT_TTL_MS) processedEvents.delete(key);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const body = req.body;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or secret' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (processedEvents.has(event.id)) {
    return res.json({ received: true, skipped: 'already processed' });
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

  return res.json({ received: true });
}
