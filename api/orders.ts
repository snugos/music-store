import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');

// GET /api/orders - List orders for authenticated artist
export async function listOrders(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
  if (!user) return c.json({ error: 'Invalid token' }, 401);

  // Get artist
  const { data: artist } = await supabase.from('artists').select('id').eq('supabase_user_id', user.id).single();
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const limit = parseInt(c.req.query('limit') || '50');

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, customer_email, amount_cents, platform_fee_cents, artist_payout_cents, status, created_at,
      albums!inner(title)
    `)
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return c.json({ error: error.message }, 500);

  const orders = data.map(o => ({
    ...o,
    album_title: o.albums?.title
  }));

  return c.json({ orders });
}

// GET /api/orders/:id - Get order details
export async function getOrder(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
  if (!user) return c.json({ error: 'Invalid token' }, 401);

  const id = c.req.param('id');

  // Get artist
  const { data: artist } = await supabase.from('artists').select('id').eq('supabase_user_id', user.id).single();
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      albums!inner(title, cover_image_url),
      artists!inner(name)
    `)
    .eq('id', id)
    .eq('artist_id', artist.id)
    .single();

  if (error || !data) return c.json({ error: 'Order not found' }, 404);

  return c.json({ order: data });
}

export { supabase };