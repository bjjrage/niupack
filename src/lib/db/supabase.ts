import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && (supabaseAnonKey || supabaseServiceKey) && !supabaseUrl.includes('your-project')
);

// Client for browser / public access
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey)
  : null;

// Admin client for server-side trusted operations
export const supabaseAdmin = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;
