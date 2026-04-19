import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' });

// Auth helper
async function getArtistFromToken(token: string) {
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from('artists').select('*').eq('supabase_user_id', user.id).single();
  return data;
}

// GET /api/stripe/connect - Get Stripe Connect onboarding link
export async function getConnectLink(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const artist = await getArtistFromToken(authHeader.slice(7));
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  let accountId = artist.stripe_account_id;

  // Create Stripe Connect account if not exists
  if (!accountId) {
    // Fetch artist email from auth.users
    const { data: artistWithEmail } = await supabase
      .from('artists')
      .select('email')
      .eq('id', artist.id)
      .single();

    let artistEmail = '';
    if (artistWithEmail?.email) {
      artistEmail = artistWithEmail.email;
    } else {
      artistEmail = artist.supabase_user_id; // fallback to UUID - Stripe may reject this
    }

    const account = await stripe.accounts.create({
      type: 'express',
      email: artistEmail,
      capabilities: { transfers: { requested: true } },
      metadata: { artist_id: artist.id, artist_slug: artist.slug }
    });
    accountId = account.id;

    // Save account ID
    await supabase.from('artists').update({ stripe_account_id: accountId }).eq('id', artist.id);
  }

  // Create onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.BASE_URL || 'https://fuzzymoss.zo.space'}/api/stripe/connect-callback?artist_id=${artist.id}`,
    return_url: `${process.env.BASE_URL || 'https://fuzzymoss.zo.space'}/dashboard/settings.html?stripe=success`,
    type: 'account_onboarding'
  });

  return c.json({ url: accountLink.url });
}

// GET /api/stripe/connect-callback - Handle Stripe Connect callback
export async function connectCallback(c: Context) {
  const artistId = c.req.query('artist_id');

  if (!artistId) return c.json({ error: 'Missing artist_id' }, 400);

  // Get updated account status
  const { data: artist } = await supabase.from('artists').select('stripe_account_id').eq('id', artistId).single();

  if (!artist?.stripe_account_id) return c.json({ error: 'No Stripe account found' }, 404);

  try {
    const account = await stripe.accounts.retrieve(artist.stripe_account_id);
    
    // Update onboarding complete status
    await supabase.from('artists').update({
      stripe_onboarding_complete: account.details_submitted && account.charges_enabled
    }).eq('id', artistId);

    return c.redirect('/dashboard/settings.html?stripe=success');
  } catch (e) {
    return c.json({ error: 'Failed to verify Stripe account' }, 500);
  }
}

// POST /api/stripe/webhook - Stripe webhook handler
export async function stripeWebhook(c: Context) {
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

  // Process events
  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const artistId = account.metadata?.artist_id;
      if (artistId) {
        await supabase.from('artists').update({
          stripe_onboarding_complete: account.details_submitted && account.charges_enabled
        }).eq('id', artistId);
      }
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
  }

  return c.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { album_id, artist_id } = session.metadata || {};
  if (!album_id || !artist_id) return;

  // Get artist to confirm Stripe account
  const { data: artist } = await supabase.from('artists').select('stripe_account_id').eq('id', artist_id).single();
  if (!artist?.stripe_account_id) return;

  // Calculate payout (platform fee = 0 by default)
  const amount = session.amount_total || 0;
  const artistPayout = amount; // 100% to artist

  // Create order
  await supabase.from('orders').insert({
    artist_id,
    album_id,
    customer_email: session.customer_details?.email || '',
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent as string,
    amount_cents: amount,
    platform_fee_cents: 0,
    artist_payout_cents: artistPayout,
    status: 'completed',
    download_token: generateToken()
  });
}

function generateToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

export { supabase };