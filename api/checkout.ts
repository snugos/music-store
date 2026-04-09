import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

const BASE_URL = process.env.BASE_URL || `https://${process.env.VERCEL_URL || 'localhost'}`;
const CASHAPP_USERNAME = 'snugsworth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, email, hasCD } = req.body;

  if (!amount || amount < 5) {
    return res.status(400).json({ error: 'Minimum donation is $5' });
  }

  // Direct CashApp link
  if (Number(amount) < 5) {
    const cashappUrl = `https://cash.app/$/${CASHAPP_USERNAME}/${amount}`;
    return res.status(200).json({ cashappUrl, type: 'cashapp' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: 'LISTEN — Digital Download',
              description: hasCD
                ? 'Digital album + CD mailed to you'
                : 'Digital album download (MP3 + WAV)',
              images: [`${BASE_URL}/assets/album-cover.jpg`],
            },
          },
          quantity: 1,
        },
      ],
      metadata: { hasCD: hasCD ? 'true' : 'false' },
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email || '')}`,
      cancel_url: `${BASE_URL}/cancel.html`,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id, type: 'stripe' });
  } catch (err: any) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
