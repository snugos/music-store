import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

export async function getArtistBySlug(c: Context, slug: string) {
  const { data, error } = await supabase
    .from('artists')
    .select(`
      *,
      albums (
        id, title, cover_image_url, price_cents, is_name_your_price, is_published, release_date,
        tracks (count)
      )
    `)
    .eq('slug', slug)
    .single();

  if (error || !data) return null;

  // Transform albums to include track_count
  if (data.albums) {
    data.albums = data.albums.map((album: any) => ({
      ...album,
      track_count: album.tracks?.[0]?.count || 0
    }));
  }

  return data;
}

export async function getArtistByUserId(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('supabase_user_id', userId)
    .single();
  
  if (error || !data) return null;
  return data;
}

export async function requireArtistAuth(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: 'Invalid token', status: 401 };
  }

  const artist = await getArtistByUserId(supabase, user.id);
  if (!artist) {
    return { error: 'Artist not found', status: 404 };
  }

  return { user, artist, token };
}

export { supabase };