import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Defensive cleanup: if a trailing slash or a leftover /rest/v1 suffix gets
// pasted into VITE_SUPABASE_URL (easy to do, since Supabase's dashboard shows
// the API URL as https://xxx.supabase.co/rest/v1/), strip it here. The
// Supabase client appends /rest/v1/<table> itself, so a leftover suffix
// produces a malformed, doubled path and PostgREST replies with
// "Invalid path specified in request URL".
const supabaseUrl = rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase config. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
