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

// GET /api/albums - List albums (public or authenticated)
export async function listAlbums(c: Context) {
  const limit = parseInt(c.req.query('limit') || '50');
  const artistId = c.req.query('artist_id');
  const published = c.req.query('published');
  const mine = c.req.query('mine');

  let query = supabase
    .from('albums')
    .select(`
      id, title, description, cover_image_url, price_cents, is_name_your_price, is_published, release_date, created_at,
      artist_id,
      artists!inner(slug, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (artistId) query = query.eq('artist_id', artistId);
  if (published === 'true') query = query.eq('is_published', true);
  if (mine === 'true') {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
    const artist = await getArtistFromToken(authHeader.slice(7));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    query = query.eq('artist_id', artist.id);
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  // Get track counts
  const albumIds = data.map(a => a.id);
  const { data: trackCounts } = await supabase
    .from('tracks')
    .select('album_id')
    .in('album_id', albumIds);

  const trackCountMap: Record<string, number> = {};
  trackCounts?.forEach(t => { trackCountMap[t.album_id] = (trackCountMap[t.album_id] || 0) + 1; });

  const albums = data.map(a => ({
    ...a,
    artist_slug: a.artists?.slug,
    artist_name: a.artists?.name,
    track_count: trackCountMap[a.id] || 0
  }));

  return c.json({ albums });
}

// POST /api/albums - Create album (authenticated)
export async function createAlbum(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const artist = await getArtistFromToken(authHeader.slice(7));
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const body = await c.req.json();
  const { title, description, cover_image_url, price_cents, minimum_price_cents, is_name_your_price, is_published, release_date, genre, tracks } = body;

  if (!title) return c.json({ error: 'Title is required' }, 400);

  // Create album
  const { data: album, error: albumError } = await supabase
    .from('albums')
    .insert({
      artist_id: artist.id,
      title,
      description: description || null,
      cover_image_url: cover_image_url || null,
      price_cents: price_cents || 0,
      minimum_price_cents: minimum_price_cents || 500,
      is_name_your_price: is_name_your_price || false,
      is_published: is_published || false,
      release_date: release_date || null
    })
    .select()
    .single();

  if (albumError) return c.json({ error: albumError.message }, 400);

  // Create tracks if provided
  if (tracks && Array.isArray(tracks) && tracks.length > 0) {
    const trackRecords = tracks.map((t: any) => ({
      album_id: album.id,
      title: t.title,
      track_number: t.track_number,
      duration_seconds: t.duration_seconds || null,
      audio_preview_url: t.audio_preview_url || null,
      audio_file_key: t.audio_file_key || null,
      is_preview_available: t.is_preview_available || false
    }));

    await supabase.from('tracks').insert(trackRecords);
  }

  return c.json({ album }, 201);
}

// GET /api/albums/:id - Get album details
export async function getAlbum(c: Context) {
  const id = c.req.param('id');

  const { data, error } = await supabase
    .from('albums')
    .select(`
      *,
      artists!inner(id, slug, name, avatar_url, cover_image_url, social_links),
      tracks(id, title, track_number, duration_seconds, audio_preview_url, is_preview_available)
    `)
    .eq('id', id)
    .single();

  if (error || !data) return c.json({ error: 'Album not found' }, 404);

  // Order tracks
  data.tracks = data.tracks?.sort((a: any, b: any) => a.track_number - b.track_number) || [];

  return c.json({
    ...data,
    artist_slug: data.artists?.slug,
    artist_name: data.artists?.name,
    artist_avatar: data.artists?.avatar_url,
    track_count: data.tracks?.length || 0
  });
}

// PUT /api/albums/:id - Update album
export async function updateAlbum(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const artist = await getArtistFromToken(authHeader.slice(7));
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const id = c.req.param('id');
  const body = await c.req.json();

  // Check ownership
  const { data: existing } = await supabase.from('albums').select('artist_id').eq('id', id).single();
  if (!existing || existing.artist_id !== artist.id) return c.json({ error: 'Not found or not authorized' }, 404);

  const { data, error } = await supabase
    .from('albums')
    .update({
      title: body.title,
      description: body.description,
      cover_image_url: body.cover_image_url,
      price_cents: body.price_cents,
      minimum_price_cents: body.minimum_price_cents,
      is_name_your_price: body.is_name_your_price,
      is_published: body.is_published,
      release_date: body.release_date,
      genre: body.genre
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ album: data });
}

// DELETE /api/albums/:id - Delete album
export async function deleteAlbum(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const artist = await getArtistFromToken(authHeader.slice(7));
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const id = c.req.param('id');

  // Check ownership
  const { data: existing } = await supabase.from('albums').select('artist_id').eq('id', id).single();
  if (!existing || existing.artist_id !== artist.id) return c.json({ error: 'Not found or not authorized' }, 404);

  const { error } = await supabase.from('albums').delete().eq('id', id);
  if (error) return c.json({ error: error.message }, 400);

  return c.json({ success: true });
}

// POST /api/albums/:id/publish - Toggle publish status
export async function publishAlbum(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const artist = await getArtistFromToken(authHeader.slice(7));
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const id = c.req.param('id');

  // Check ownership
  const { data: existing } = await supabase.from('albums').select('artist_id, is_published').eq('id', id).single();
  if (!existing || existing.artist_id !== artist.id) return c.json({ error: 'Not found or not authorized' }, 404);

  const { data, error } = await supabase
    .from('albums')
    .update({ is_published: !existing.is_published })
    .eq('id', id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ album: data });
}

export { supabase };