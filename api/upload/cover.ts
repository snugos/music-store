import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');

// POST /api/upload/cover - Get presigned URL for cover image upload
export async function uploadCover(c: Context) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
  if (!user) return c.json({ error: 'Invalid token' }, 401);

  const { data: artist } = await supabase.from('artists').select('id').eq('supabase_user_id', user.id).single();
  if (!artist) return c.json({ error: 'Artist not found' }, 404);

  const { filename, content_type } = await c.req.json();

  if (!filename || !content_type) {
    return c.json({ error: 'filename and content_type required' }, 400);
  }

  // Validate content type
  if (!content_type.startsWith('image/')) {
    return c.json({ error: 'Only image files are allowed' }, 400);
  }

  // Generate R2 key
  const ext = filename.split('.').pop();
  const key = `artists/${artist.id}/covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // In production, generate presigned URL for Cloudflare R2
  // For now, return mock presigned URL structure
  const presignedUrl = `https://placeholder.r2.dev/${key}?presigned=true`;

  return c.json({
    key,
    presigned_url: presignedUrl,
    public_url: `${process.env.CLOUDFLARE_R2_PUBLIC_URL || ''}/${key}`
  });
}

export { supabase };