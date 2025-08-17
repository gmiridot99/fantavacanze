// src/db.js
import { supabase } from "./supabaseClient"

export async function dbLoadAll() {
  const [pl, ac, ev] = await Promise.all([
    supabase.from("players").select("*").order("id", { ascending: true }),
    supabase.from("activities").select("*").order("name", { ascending: true }),
    supabase.from("events").select("*").order("created_at", { ascending: true }),
  ])
  return {
    players: pl.error ? [] : (pl.data || []),
    activities: ac.error ? [] : (ac.data || []),
    events: ev.error ? [] : (ev.data || []),
  }
}

export async function dbUpsertPlayers(players) {
  return supabase.from("players").upsert(players, { onConflict: "id" })
}
export async function dbUpsertActivities(acts) {
  return supabase.from("activities").upsert(acts, { onConflict: "id" })
}

export async function dbUpdatePlayerAvatarUrl(playerId, avatarUrl) {
  const { error } = await supabase
    .from("players")
    .update({ avatar_url: avatarUrl })
    .eq("id", playerId);
  if (error) throw error;
}

export async function dbInsertEvent(ev /* {player_id,activity_id,points,note,ts,day} */) {
  const { data, error } = await supabase.from("events").insert(ev).select().single()
  if (error) throw error
  return data
}

export async function dbDeleteEvent(id) {
  await supabase.from("events").delete().eq("id", id)
}

export async function dbResetEvents() {
  await supabase.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000")
}

export function dbSubscribeEvents(onChange) {
  const ch = supabase
    .channel("realtime:events")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => onChange?.())
    .subscribe()
  return () => supabase.removeChannel(ch)
}