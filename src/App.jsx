import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload, Undo2, Pencil, Trash2, Image as ImageIcon, Download, Copy } from "lucide-react";
import { Toaster, toast } from "sonner";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "./components/ui/button";

import {
  dbLoadAll,
  dbUpsertPlayers,
  dbUpsertActivities,
  dbInsertEvent,
  dbDeleteEvent,
  dbResetEvents,
  dbSubscribeEvents,
  dbUpdatePlayerAvatarUrl,
  dbInsertActivity,
} from "./db";

import { supabase } from "./supabaseClient";

/* ---------- CSV helpers ---------- */
function splitCSVLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(splitCSVLine);
  return { header, rows };
}
function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

/* ---------- util ---------- */
const palette = ["#ef4444","#3b82f6","#10b981","#f59e0b","#8b5cf6"];
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }

/* ===================== APP ===================== */
export default function FantavacanzaApp() {
  const [players, setPlayers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [events, setEvents] = useState([]);
  const [baseTs, setBaseTs] = useState(startOfToday());

  const [selPlayer, setSelPlayer] = useState("");
  const [selActivity, setSelActivity] = useState("");
  const [dayNum, setDayNum] = useState(1);
  const [tab, setTab] = useState("add");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const noteRef = useRef(null);
  const [newActName, setNewActName] = useState("");
  const [newActPoints, setNewActPoints] = useState("");


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const token = params.get("token");
    const saved = localStorage.getItem("fantavacanza_editor_token");

    if (mode === "view") { setCanEdit(false); return; }
    if (token) { localStorage.setItem("fantavacanza_editor_token", token); setCanEdit(true); return; }
    setCanEdit(Boolean(saved));
  }, []);

  useEffect(() => { if (!canEdit && showShare) setShowShare(false); }, [canEdit, showShare]);

  useEffect(() => {
    (async () => {
      try {
        const { players: pl, activities: ac, events: ev } = await dbLoadAll();
        setPlayers(pl);
        setActivities(ac);
        setEvents(ev);
        setSelPlayer(pl[0]?.id || "");
        setSelActivity(ac[0]?.id || "");
        setDayNum(1 + Math.floor((Date.now() - baseTs)/86400000));
      } catch (e) {
        console.error("Load DB error:", e);
      }
    })();

    const unsub = dbSubscribeEvents(async () => {
      try {
        const { events: ev } = await dbLoadAll();
        setEvents(ev);
      } catch {}
    });
    return () => unsub();
  }, [baseTs]);

  useEffect(() => { if (!players.find(p => p.id === selPlayer)) setSelPlayer(players[0]?.id || ""); }, [players]);
  useEffect(() => { if (!activities.find(a => a.id === selActivity)) setSelActivity(activities[0]?.id || ""); }, [activities]);

  const activityById = useMemo(() => Object.fromEntries(activities.map(a => [a.id, a])), [activities]);

  const scores = useMemo(() => {
    const map = new Map(players.map(p => [p.id, { total: 0, maxSingle: -Infinity }]));
    for (const e of events) {
      const s = map.get(e.player_id);
      if (!s) continue;
      s.total += e.points;
      if (e.points > s.maxSingle) s.maxSingle = e.points;
    }
    return map;
  }, [events, players]);

  const leaderboard = useMemo(() => {
    return [...players].sort((a, b) => {
      const sa = scores.get(a.id) || { total: 0, maxSingle: -Infinity };
      const sb = scores.get(b.id) || { total: 0, maxSingle: -Infinity };
      if (sb.total !== sa.total) return sb.total - sa.total;
      if (sb.maxSingle !== sa.maxSingle) return sb.maxSingle - sa.maxSingle;
      return a.name.localeCompare(b.name);
    });
  }, [players, scores]);

  const dailySeries = useMemo(() => {
    const ids = players.map(p => p.id);
    if (events.length === 0) {
      return { data: [{ label: "Giorno 0", ...Object.fromEntries(ids.map(id => [id, 0])) }] };
    }
    const norm = events.map(e => ({ ...e, day: e.day ?? Math.max(1, Math.floor((e.ts - baseTs) / 86400000) + 1) }));
    const maxDay = Math.max(1, ...norm.map(e => e.day));
    const accum = Object.fromEntries(ids.map(id => [id, 0]));
    const arr = [{ label: "Giorno 0", ...Object.fromEntries(ids.map(id => [id, 0])) }];
    for (let d = 1; d <= maxDay; d++) {
      for (const e of norm.filter(x => x.day === d)) accum[e.player_id] = (accum[e.player_id] || 0) + e.points;
      const row = { label: `Giorno ${d}` }; for (const id of ids) row[id] = accum[id] || 0; arr.push(row);
    }
    return { data: arr };
  }, [events, players, baseTs]);

  async function addEvent() {
  if (!canEdit) return;
  if (!selPlayer || !selActivity) { toast.error("Seleziona giocatore e attività"); return; }
  const act = activityById[selActivity]; if (!act) { toast.error("Attività non valida"); return; }

  const d = (dayNum == null || dayNum === "" || Number.isNaN(Number(dayNum)))
    ? Math.max(1, Math.floor((Date.now() - baseTs) / 86400000) + 1)
    : Math.max(1, Math.floor(Number(dayNum)));
  const ts = baseTs + (d - 1) * 86400000;

  try {
    await dbInsertEvent({
      player_id: selPlayer,
      activity_id: selActivity,
      points: Number(act.points) || 0,
      note: noteRef.current?.value || "",
      ts, day: d,
    });
    if (noteRef.current) noteRef.current.value = "";
    toast.success("Attività registrata ✨");
  } catch (e) {
    console.error(e); toast.error("Errore salvataggio");
  }
}

async function addActivityFromDashboard() {
  if (!canEdit) return;
  const name = newActName.trim();
  if (!name) { toast.error("Inserisci un nome attività"); return; }

  const pointsNum = Number(newActPoints);
  const points = Number.isFinite(pointsNum) ? pointsNum : 0;

  // Genero un id client-side (la tabella richiede PK testuale)
  const id = `A_${Date.now()}`;

  try {
    const created = await dbInsertActivity({ id, name, points });
    setActivities((prev) => [...prev, created]);
    setSelActivity(created.id);
    setNewActName("");
    setNewActPoints("");
    toast.success("Attività aggiunta ✅");
  } catch (e) {
    console.error(e);
    toast.error("Errore salvataggio attività");
  }
}


  async function undoLast() {
    if (!canEdit) return;
    const last = events[events.length - 1];
    if (!last) return;
    try { await dbDeleteEvent(last.id); } catch (e) { console.error(e); }
  }

  async function updateEvent(evtId, patch) {
    if (!canEdit) return;
    try {
      const { error } = await supabase.from("events").update(patch).eq("id", evtId);
      if (error) throw error;
    } catch (e) {
      console.error(e); toast.error("Errore aggiornamento evento");
    }
  }

  async function deleteEvent(id) {
    if (!canEdit) return;
    try { await dbDeleteEvent(id); } catch (e) { console.error(e); }
  }

  async function resetScores() {
    if (!canEdit) return;
    try {
      await dbResetEvents();
      setBaseTs(startOfToday());
      setDayNum(1);
      toast.success("Punteggi resettati");
    } catch (e) {
      console.error(e); toast.error("Errore reset");
    }
  }

  async function onUploadActivities(file) {
    if (!canEdit || !file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { header, rows } = parseCSV(String(reader.result || ""));
        const lc = header.map(h => (h || "").trim().toLowerCase());

        const idxName = lc.findIndex(h => ["attivita", "attività", "name"].includes(h));
        const idxPts  = lc.findIndex(h => ["punteggio", "points"].includes(h));
        const idxId   = lc.findIndex(h => ["id", "activity_id"].includes(h));

        const exclude = new Set(["attivita", "attività", "name", "punteggio", "points", "premi extra"]);
        const maybePlayersHeaders = header.filter(h => !exclude.has((h || "").trim().toLowerCase()));

        const acts = rows.map((r, i) => {
          const id = idxId >= 0 && r[idxId] ? r[idxId] : `CSV_${i + 1}`;
          const nm = idxName >= 0 ? r[idxName] : `Attività ${i + 1}`;
          const rawPts = idxPts >= 0 ? r[idxPts] : "0";
          const points = Number(String(rawPts).replace(",", ".")) || 0;
          return { id: String(id).trim(), name: String(nm).trim(), points };
        }).filter(a => a.name);

        if (!acts.length) throw new Error("no activities");

        setActivities(acts);
        setSelActivity(acts[0]?.id || "");

        let pls = [];
        if (maybePlayersHeaders.length) {
          pls = maybePlayersHeaders
            .map((n, i) => ({ id: `P${i + 1}`, name: (n || "").trim(), color: palette[i % palette.length] }))
            .slice(0, 12);
          if (pls.length) {
            setPlayers(pls);
            setSelPlayer(pls[0]?.id || "");
          }
        }

        await dbUpsertActivities(acts);
        if (pls.length) await dbUpsertPlayers(pls);

        toast.success(`Importate ${acts.length} attività (salvate su Supabase)`);
      } catch (e) {
        console.error(e);
        toast.error("CSV non valido");
      }
    };
    reader.readAsText(file);
  }

  function exportLogCSV(){
    const headers=["event_id","day","timestamp","player","activity","points","note"];
    const rows=events.slice().reverse().map(e=>[
      e.id,
      e.day ?? Math.max(1,Math.floor((e.ts-baseTs)/86400000)+1),
      new Date(Number(e.ts)).toISOString(),
      players.find(p=>p.id===e.player_id)?.name || "",
      activityById[e.activity_id]?.name || "",
      e.points,
      e.note || ""
    ]);
    const blob=new Blob([toCSV(headers,rows)],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`fantavacanza_log_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function onAvatarChange(pId, file) {
  if (!canEdit || !file) return;

  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${pId}/${Date.now()}.${ext}`;

    // 1) upload nel bucket "players"
    const { error: upErr } = await supabase
      .storage
      .from("players")
      .upload(path, file, { upsert: true });
    if (upErr) throw upErr;

    // 2) prendi l'URL pubblico
    const { data } = supabase.storage.from("players").getPublicUrl(path);
    const publicUrl = data?.publicUrl;

    // 3) salva l'URL nel DB
    await dbUpdatePlayerAvatarUrl(pId, publicUrl);

    // 4) aggiorna subito l'UI
    setPlayers(all => all.map(p => p.id === pId ? { ...p, avatar_url: publicUrl } : p));
    toast.success("Foto aggiornata ✅");
  } catch (e) {
    console.error(e);
    toast.error("Errore upload foto");
  }
}


  function ensureEditorToken(){
    let t=localStorage.getItem("fantavacanza_editor_token");
    if(!t){ t=crypto?.randomUUID?.()||Math.random().toString(36).slice(2); localStorage.setItem("fantavacanza_editor_token",t); }
    return t;
  }
  function getShareLinks(){
    const url=new URL(location.href); url.search="";
    const base=url.origin+url.pathname;
    return { editor:`${base}?mode=edit&token=${ensureEditorToken()}`, viewer:`${base}?mode=view` };
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-3 sm:p-4 md:p-8">
      <Toaster richColors position="top-center" />
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between">
            <button
              className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border mr-2"
              onClick={()=>setMenuOpen(v=>!v)}
              aria-label="Apri menu"
            >☰</button>
            <h1 className="text-2xl md:text-3xl font-bold">🏝️ Fantavacanza — Dashboard</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-2xl border cursor-pointer w-full sm:w-auto justify-center ${!canEdit?"opacity-50 pointer-events-none":""}`}>
              <Upload className="w-4 h-4" />
              <span>Importa attività (CSV)</span>
              <input type="file" accept=".csv" className="hidden" disabled={!canEdit}
                     onChange={(e)=>e.target.files?.[0] && onUploadActivities(e.target.files[0])}/>
            </label>
            <button onClick={exportLogCSV} className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 w-full sm:w-auto">
              <Download className="w-4 h-4"/> Export log
            </button>
            <button onClick={undoLast} disabled={!canEdit} className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 w-full sm:w-auto disabled:opacity-50">
              <Undo2 className="w-4 h-4"/> Undo
            </button>
            <button onClick={resetScores} disabled={!canEdit} className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 w-full sm:w-auto bg-red-600 text-white border border-red-700 hover:bg-red-700 disabled:opacity-50">
              Reset punteggi
            </button>
            {canEdit && (
              <Button variant="outline" onClick={() => setShowShare(s => !s)} className="w-full sm:w-auto">
                Condividi
              </Button>
            )}
          </div>
        </header>

        {canEdit && showShare && (
          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div className="font-semibold">Condividi</div>
            {(() => {
              const { editor, viewer } = getShareLinks();
              const copy = async (t) => { try{ await navigator.clipboard.writeText(t); toast.success("Copiato"); } catch {} };
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm mb-1">Link Editor</div>
                    <div className="flex gap-2">
                      <input readOnly value={editor} className="border rounded-lg px-3 py-2 w-full"/>
                      <button className="rounded-lg border px-3 py-2" onClick={()=>copy(editor)}><Copy className="w-4 h-4"/></button>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm mb-1">Link Viewer</div>
                    <div className="flex gap-2">
                      <input readOnly value={viewer} className="border rounded-lg px-3 py-2 w-full"/>
                      <button className="rounded-lg border px-3 py-2" onClick={()=>copy(viewer)}><Copy className="w-4 h-4"/></button>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="text-xs text-slate-500">Il link “viewer” è sola lettura. Il link “editor” sblocca le modifiche per chi lo apre (memorizzato nel browser).</div>
          </div>
        )}

        {menuOpen && (
          <div className="sm:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={()=>setMenuOpen(false)} />
            <div className="absolute top-0 left-0 h-full w-72 bg-white shadow-xl p-4 space-y-2">
              <div className="text-lg font-semibold mb-2">Menu</div>
              <button className="w-full text-left rounded-xl border px-3 py-2" onClick={()=>{setTab("add"); setMenuOpen(false);}}>Aggiungi attività</button>
              <button className="w-full text-left rounded-xl border px-3 py-2" onClick={()=>{setTab("log"); setMenuOpen(false);}}>Log</button>
              <button className="w-full text-left rounded-xl border px-3 py-2" onClick={()=>{setTab("activities"); setMenuOpen(false);}}>Attività</button>
              <button className="w-full text-left rounded-xl border px-3 py-2" onClick={()=>{document.querySelector("#players-section")?.scrollIntoView({behavior:"smooth"}); setMenuOpen(false);}}>Giocatori</button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border bg-white p-3 md:p-6 space-y-4">
<h2 className="text-lg font-semibold">Classifica</h2>

<div className="space-y-2">
  {leaderboard.map((p, idx) => {
    const s = scores.get(p.id) || { total: 0, maxSingle: -Infinity };
    return (
      <motion.div
        key={p.id}
        layout
        className="border rounded-xl p-2 bg-white flex items-center gap-2"
        style={{
          borderColor: players.find(x => x.id === p.id)?.color || undefined,
          borderWidth: 2,
        }}
      >
        {/* Avatar più piccolo */}
        <div className="relative shrink-0">
          <img
            src={
              p.avatar_url ||
              "https://api.dicebear.com/8.x/thumbs/svg?seed=" +
                encodeURIComponent(p.name)
            }
            alt={p.name}
            className="w-10 h-10 rounded-lg object-cover"
          />
          <span className="absolute -top-2 -right-2 rounded-full text-[10px] bg-black text-white px-1">
            {idx + 1}
          </span>
        </div>

        {/* Nome e info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{p.name}</div>
          <div className="text-[10px] text-slate-500">
            Max: {s.maxSingle === -Infinity ? 0 : s.maxSingle}
          </div>
        </div>

        {/* Punteggio */}
        <div className="text-lg font-bold tabular-nums">{s.total}</div>
      </motion.div>
    );
  })}
</div>

          <div className="h-56 sm:h-64 md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries.data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                {players.map((p)=>(
                  <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={p.color||"#000"} dot={dailySeries.data.length<=1} strokeWidth={2}/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="hidden sm:flex gap-2">
          <button onClick={()=>setTab("add")} className={`px-3 py-2 rounded-xl border ${tab==="add"?"bg-black text-white":"bg-white"}`}>Aggiungi attività</button>
          <button onClick={()=>setTab("log")} className={`px-3 py-2 rounded-xl border ${tab==="log"?"bg-black text-white":"bg-white"}`}>Log</button>
          <button onClick={()=>setTab("activities")} className={`px-3 py-2 rounded-xl border ${tab==="activities"?"bg-black text-white":"bg-white"}`}>Attività</button>
        </div>

        {tab==="add" && (
          <div className="rounded-2xl border bg-white p-3 md:p-6 space-y-4">
            <h2 className="text-xl font-semibold">Registra una nuova attività</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <div className="text-sm mb-1">Giocatore</div>
                <select className="border rounded-lg px-3 py-2 w-full" value={selPlayer} onChange={e=>setSelPlayer(e.target.value)} disabled={!canEdit}>
                  {players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-sm mb-1">Attività</div>
                <select className="border rounded-lg px-3 py-2 w-full" value={selActivity} onChange={e=>setSelActivity(e.target.value)} disabled={!canEdit}>
                  {activities.map(a=><option key={a.id} value={a.id}>{a.name} ({a.points} pt)</option>)}
                </select>
              </div>
              <div>
                <div className="text-sm mb-1">Nota</div>
                <textarea ref={noteRef} className="border rounded-lg px-3 py-2 w-full min-h-[80px]" placeholder="facoltativa" disabled={!canEdit}/>
              </div>
              <div>
                <div className="text-sm mb-1">Giorno</div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="oggi"
                  className="border rounded-lg px-3 py-2 w-full"
                  value={dayNum ?? ""}
                  onChange={(e)=>{
                    const v = e.target.value.trim();
                    setDayNum(v === "" ? null : Number(v) || null);
                  }}
                  disabled={!canEdit}
                />
              </div>

              <div className="flex items-end">
                <button onClick={addEvent} disabled={!canEdit} className="w-full rounded-xl px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white border border-orange-600 disabled:opacity-50">
                  <span className="inline-flex items-center gap-2"><Plus className="w-4 h-4"/>Aggiungi</span>
                </button>
              </div>
            </div>

            <div id="players-section" className="rounded-2xl border bg-white p-3 md:p-6 space-y-3">
              <h3 className="text-lg font-semibold">Giocatori</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {players.map((p,i)=>(
                  <div key={p.id} className="border rounded-2xl p-3 bg-white">
                    <div className="flex flex-col items-center gap-2">
                    <img
                      src={p.avatar_url || ("https://api.dicebear.com/8.x/thumbs/svg?seed=" + encodeURIComponent(p.name))}
                      alt={p.name}
                      className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover"
                    />
                      <label className={`text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full border cursor-pointer ${!canEdit?"opacity-50 pointer-events-none":""}`}>
                        <ImageIcon className="w-3 h-3"/> Carica
                        <input type="file" accept="image/*" className="hidden" disabled={!canEdit} onChange={(e)=>e.target.files?.[0] && onAvatarChange(p.id, e.target.files[0])}/>
                      </label>
                      <input className="border rounded-lg px-3 py-2 w-full" value={p.name} onChange={(e)=>setPlayers(all=>all.map(x=>x.id===p.id?{...x,name:e.target.value}:x))} disabled={!canEdit}/>
                      <input type="color" className="w-full h-9 rounded" value={p.color} onChange={(e)=>setPlayers(all=>all.map(x=>x.id===p.id?{...x,color:e.target.value}:x))} disabled={!canEdit}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="log" && (
          <div className="rounded-2xl border bg-white p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 hidden md:table-cell">Quando</th>
                    <th className="text-left p-3">Giorno</th>
                    <th className="text-left p-3">Giocatore</th>
                    <th className="text-left p-3">Attività</th>
                    <th className="text-right p-3">Punti</th>
                    <th className="text-left p-3 hidden md:table-cell">Nota</th>
                    <th className="text-right p-3">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(e=>(
                    <tr key={e.id} className="border-t">
                      <td className="p-3 hidden md:table-cell">{new Date(Number(e.ts)).toLocaleString()}</td>
                      <td className="p-3">{e.day ?? Math.max(1,Math.floor((e.ts-baseTs)/86400000)+1)}</td>
                      <td className="p-3">{players.find(p=>p.id===e.player_id)?.name}</td>
                      <td className="p-3">{activityById[e.activity_id]?.name}</td>
                      <td className="p-3 text-right font-medium">{e.points}</td>
                      <td className="p-3 max-w-[20ch] truncate hidden md:table-cell" title={e.note}>{e.note}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button disabled={!canEdit} className="rounded-xl border px-2 py-1 disabled:opacity-50" onClick={()=>{ const newNote=prompt("Modifica nota", e.note||""); if(newNote!==null) updateEvent(e.id,{ note:newNote }); }}>
                            <Pencil className="w-4 h-4"/>
                          </button>
                          <button disabled={!canEdit} className="rounded-xl border px-2 py-1 disabled:opacity-50" onClick={()=>{ const newAct=prompt("Cambia attività (inserisci ID)", e.activity_id); const act=activities.find(a=>a.id===newAct); if(act) updateEvent(e.id,{ activity_id: act.id, points: act.points }); else if(newAct!==null) toast.error("ID attività non trovato"); }}>
                            ID
                          </button>
                          <button disabled={!canEdit} className="rounded-xl border px-2 py-1 disabled:opacity-50" onClick={()=>deleteEvent(e.id)}>
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {events.length===0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">Nessun evento ancora. Aggiungete la prima attività! 😊</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==="activities" && (
  <div className="rounded-2xl border bg-white p-0">
    {/* Form per aggiungere attività */}
    {canEdit && (
      <div className="p-4 border-b bg-white">
        <h3 className="font-semibold mb-3">➕ Aggiungi attività</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <div className="text-sm mb-1">Nome attività</div>
            <input
              type="text"
              className="border rounded-lg px-3 py-2 w-full"
              placeholder="Es. Tuffo epico"
              value={newActName}
              onChange={(e)=>setNewActName(e.target.value)}
            />
          </div>
          <div>
            <div className="text-sm mb-1">Punti</div>
            <input
              type="number"
              className="border rounded-lg px-3 py-2 w-full"
              placeholder="Es. 5"
              value={newActPoints}
              onChange={(e)=>setNewActPoints(e.target.value)}
            />
          </div>
          <div className="flex">
            <button
              onClick={addActivityFromDashboard}
              className="w-full rounded-xl px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white border border-orange-600"
            >
              Aggiungi
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Tabella attività */}
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-3">ID</th>
            <th className="text-left p-3">Nome</th>
            <th className="text-right p-3">Punti</th>
          </tr>
        </thead>
        <tbody>
          {activities.map(a=>(
            <tr key={a.id} className="border-t">
              <td className="p-3 font-mono text-xs">{a.id}</td>
              <td className="p-3">{a.name}</td>
              <td className="p-3 text-right font-medium">{a.points}</td>
            </tr>
          ))}
          {activities.length===0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-slate-500">Nessuna attività. Aggiungine una sopra 👆</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
)}


        {canEdit && (
          <button
            aria-label="Aggiungi attività"
            onClick={()=>setTab("add")}
            className="hidden sm:hidden fixed bottom-24 right-4 rounded-full w-14 h-14 shadow-lg z-50 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="w-6 h-6 m-auto"/>
          </button>
        )}

        <footer className="text-xs text-slate-500 text-center py-6">Made with ❤️ — Fantavacanza v1.4</footer>
      </div>
    </div>
  );
}
