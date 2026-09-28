import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && (supabaseAnonKey || supabasePublishableKey || supabaseServiceKey) && !supabaseUrl.includes('your-project')
);

export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')
);

export const isSupabasePublicConfigured = Boolean(
  supabaseUrl && (supabaseAnonKey || supabasePublishableKey) && !supabaseUrl.includes('your-project')
);

// Client for browser / public access
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey || supabasePublishableKey)
  : null;

// Admin client for server-side trusted operations
export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
