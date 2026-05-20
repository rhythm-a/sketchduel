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
