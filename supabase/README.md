# Supabase persistence (optional)

1. Create a project at [Supabase](https://supabase.com).
2. In **SQL Editor**, run `schema.sql` from this folder.
3. Add to your environment (server only for writes):

- `SUPABASE_URL` — Project URL (Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` — service role secret (never expose to the browser)

The Next.js app already uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for optional client checks.

If these server variables are omitted, the game still runs; scores stay in memory until the socket server restarts.
