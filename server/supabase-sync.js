import { createClient } from '@supabase/supabase-js';

let attempted = false;
let clientCache = null;

export function getSupabaseAdmin() {
  if (attempted) return clientCache;
  attempted = true;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  clientCache = createClient(url, key);
  return clientCache;
}

// ── Scores ────────────────────────────────────────────────────────────────────

export async function fetchRoomScores(roomId) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from('room_scores')
    .select('player_id, nickname, score')
    .eq('room_id', roomId);

  if (error) {
    console.error('[supabase] fetchRoomScores', error.message);
    return [];
  }
  return data ?? [];
}

export function persistRoomScores(roomId, players) {
  const client = getSupabaseAdmin();
  if (!client || !players?.length) return;

  const rows = players.map((p) => ({
    room_id: roomId,
    player_id: p.id,
    nickname: p.nickname,
    score: p.score ?? 0,
    updated_at: new Date().toISOString(),
  }));

  client
    .from('room_scores')
    .upsert(rows, { onConflict: 'room_id,player_id' })
    .then(({ error }) => {
      if (error) console.error('[supabase] persistRoomScores', error.message);
    });
}

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Persist room settings when the host creates a room.
 * Uses upsert so re-connects by the same host don't error.
 */
export async function persistRoomSettings(roomId, settings) {
  const client = getSupabaseAdmin();
  if (!client) return;

  const { error } = await client
    .from('room_settings')
    .upsert({ room_id: roomId, settings }, { onConflict: 'room_id' });

  if (error) console.error('[supabase] persistRoomSettings', error.message);
}

/**
 * Fetch persisted settings for a room.
 * Returns null when Supabase is not configured or the row doesn't exist yet.
 */
export async function fetchRoomSettings(roomId) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data, error } = await client
    .from('room_settings')
    .select('settings')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) {
    console.error('[supabase] fetchRoomSettings', error.message);
    return null;
  }
  return data?.settings ?? null;
}