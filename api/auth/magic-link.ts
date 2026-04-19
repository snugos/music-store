import type { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');

// POST /api/auth/magic-link - Send magic link email
export async function sendMagicLink(c: Context) {
  const body = await c.req.json();
  const { email, type } = body;

  if (!email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  // Check if user exists for login, create if signup
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { type: type || 'login' }
    });

    // If user exists, it returns an error - that's fine, we still send
    // In production, use supabase.auth.signInWithOtp() for real magic links
    
    // For demo purposes, we simulate success
    // In production with proper email configured:
    // const { error } = await supabase.auth.signInWithOtp({ email });
    
    return c.json({ success: true, message: 'Magic link sent (simulated in demo)' });
  } catch (e: any) {
    // User likely already exists, that's OK for login
    return c.json({ success: true, message: 'Magic link sent (simulated in demo)' });
  }
}

// GET /api/auth/callback - Handle magic link callback
export async function authCallback(c: Context) {
  const code = c.req.query('code');
  const next = c.req.query('next') || '/dashboard/';

  if (!code) {
    return c.json({ error: 'No code provided' }, 400);
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      return c.json({ error: 'Invalid or expired link' }, 400);
    }

    // Redirect to dashboard with token
    return c.redirect(`${next}?token=${data.session.access_token}`);
  } catch (e) {
    return c.json({ error: 'Authentication failed' }, 400);
  }
}

export { supabase };