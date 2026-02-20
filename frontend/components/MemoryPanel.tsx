"use client";

import { useState } from "react";
import { apiGet } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

export default function MemoryPanel() {
  const q = useAppStore((s) => s.memoryQuery);
  const setQ = useAppStore((s) => s.setMemoryQuery);
  const results = useAppStore((s) => s.memoryResults);
  const setResults = useAppStore((s) => s.setMemoryResults);

  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const res = await apiGet<{ ok: boolean; results: any[] }>(`/api/memory/search?q=${encodeURIComponent(q)}`);
      setResults(res.results || []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-medium">Memory Search</div>
      <div className="text-xs text-white/60 mt-1">Self-updating hints from recent actions (MVP).</div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/20"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: submit, navigate, pick alpha…"
          spellCheck={false}
        />
        <button
          className="rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 px-3 py-2 text-sm disabled:opacity-50"
          onClick={search}
          disabled={busy}
        >
          {busy ? "…" : "Search"}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {results.length === 0 && <div className="text-xs text-white/50">No results.</div>}
        {results.slice(0, 8).map((r) => (
          <div key={r.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="text-xs text-white/80">{r.title}</div>
            <div className="mt-1 text-[11px] text-white/60 whitespace-pre-wrap">{r.text}</div>
            <div className="mt-1 text-[10px] text-white/40">
              updated {new Date(r.updated_at).toLocaleTimeString()} {r.tags?.length ? `• ${r.tags.join(", ")}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
