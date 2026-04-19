import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' });
const BASE_URL = process.env.BASE_URL || 'https://fuzzymoss.zo.space';

// POST /api/checkout - Create Stripe Checkout session for album purchase
export async function createCheckoutSession(c: Context) {
  const body = await c.req.json();
  const { album_id, email, amount } = body;

  if (!album_id) {
    return c.json({ error: 'album_id is required' }, 400);
  }

  // Get album and artist
  const { data: album, error: albumError } = await supabase
    .from('albums')
    .select(`
      id, title, cover_image_url, price_cents, is_name_your_price, minimum_price_cents,
      artist_id,
      artists!inner(id, name, stripe_account_id, stripe_onboarding_complete)
    `)
    .eq('id', album_id)
    .single();

  if (albumError || !album) {
    return c.json({ error: 'Album not found' }, 404);
  }

  const artist = album.artists;
  if (!artist.stripe_account_id || !artist.stripe_onboarding_complete) {
    return c.json({ error: 'This artist has not set up payments yet' }, 400);
  }

  // Determine price
  let priceInCents: number;
  if (album.is_name_your_price) {
    priceInCents = amount ? Math.round(amount * 100) : album.minimum_price_cents || 500;
    if (priceInCents < (album.minimum_price_cents || 500)) {
      priceInCents = album.minimum_price_cents || 500;
    }
  } else {
    priceInCents = album.price_cents;
    if (priceInCents <= 0) priceInCents = 500;
  }

  // Create Stripe Checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: priceInCents,
          product_data: {
            name: `${album.title} — ${artist.name}`,
            description: 'Digital album download',
            images: album.cover_image_url ? [album.cover_image_url] : []
          }
        },
        quantity: 1
      }],
      metadata: {
        album_id: album.id,
        artist_id: artist.id
      },
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}&album=${album.id}`,
      cancel_url: `${BASE_URL}/cancel.html`,
      payment_intent_data: {
        application_fee_amount: 0,
        transfer_data: {
          destination: artist.stripe_account_id
        }
      }
    });

    return c.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return c.json({ error: err.message }, 500);
  }
}

export { supabase };