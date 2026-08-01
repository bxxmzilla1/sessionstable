import { createClient } from '@supabase/supabase-js'

// Falls back to the shared Sessions project so the app works on Vercel even before
// you set env vars. The anon key is a public client key — safe to ship in the frontend.
const url =
  import.meta.env.VITE_SUPABASE_URL || 'https://drhloqzeumuvhyuduwnw.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyaGxvcXpldW11dmh5dWR1d253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Nzk4MTEsImV4cCI6MjEwMTE1NTgxMX0.YVAYL9wIH6X5fJuQ7Ayv241HcqYRT4p5M8bz2ANXyF8'

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
