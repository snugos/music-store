import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// GET /api/artists/:slug - Get artist by slug (public)
export async function getArtist(c: Context) {
  const slug = c.req.param('slug');
  
  const { data, error } = await supabase
    .from('artists')
    .select('id, slug, name, bio, avatar_url, cover_image_url, social_links')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return c.json({ error: 'Artist not found' }, 404);
  }

  return c.json({ artist: data });
}

// GET /api/artists/me - Get current artist (authenticated)
export async function getCurrentArtist(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('supabase_user_id', user.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Artist not found' }, 404);
  }

  return c.json(data);
}

// PATCH /api/artists/me - Update current artist
export async function updateCurrentArtist(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const body = await c.req.json();
  
  const { data, error } = await supabase
    .from('artists')
    .update({
      name: body.name,
      bio: body.bio,
      slug: body.slug,
      avatar_url: body.avatar_url,
      cover_image_url: body.cover_image_url,
      social_links: body.social_links
    })
    .eq('supabase_user_id', user.id)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json(data);
}

// POST /api/artists - Create new artist
export async function createArtist(c: Context) {
  const body = await c.req.json();
  const { email, name, slug, bio } = body;

  if (!email || !name || !slug) {
    return c.json({ error: 'Email, name, and slug are required' }, 400);
  }

  // Validate slug
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) {
    return c.json({ error: 'Invalid slug format' }, 400);
  }

  // Check if slug is taken
  const { data: existing } = await supabase
    .from('artists')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existing) {
    return c.json({ error: 'This URL is already taken' }, 400);
  }

  // Create Supabase auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { artist_name: name }
  });

  if (authError || !authData.user) {
    return c.json({ error: 'Failed to create account. Email may already be in use.' }, 400);
  }

  // Create artist record
  const { data, error } = await supabase
    .from('artists')
    .insert({
      supabase_user_id: authData.user.id,
      name,
      slug,
      bio: bio || null,
      social_links: {}
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json({ artist: data }, 201);
}

export { supabase };