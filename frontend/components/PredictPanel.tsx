"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

export default function PredictPanel() {
  const predictions = useAppStore((s) => s.predictions);
  const setPredictions = useAppStore((s) => s.setPredictions);
  const recording = useAppStore((s) => s.recording);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setInterval(async () => {
      try {
        const res = await apiGet<{ ok: boolean; predictions: any[] }>("/api/predict");
        if (alive) setPredictions(res.predictions || []);
      } catch {
        // ignore
      }
    }, 900);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [setPredictions]);

  async function execute(actionId: string) {
    setBusy(actionId);
    setErr(null);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>("/api/execute", { action_id: actionId });
      if (!res.ok) setErr(res.error || "Execution failed");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-medium">Next-step Prediction</div>
      <div className="text-xs text-white/60 mt-1">Markov baseline over observed transitions.</div>

      <div className="mt-3 space-y-2">
        {predictions.length === 0 && (
          <div className="text-xs text-white/50">No predictions yet. Do a few clicks in the session.</div>
        )}
        {predictions.slice(0, 5).map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="text-xs text-white/80 break-words">{p.label}</div>
            <div className="mt-1 flex items-center justify-between">
              <div className="text-[11px] text-white/50">count={p.count}</div>
              <button
                className="rounded-lg border border-white/10 bg-white/10 hover:bg-white/15 px-2 py-1 text-xs disabled:opacity-50"
                disabled={!recording || busy !== null}
                onClick={() => execute(p.id)}
              >
                {busy === p.id ? "Executing…" : "Execute"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {err && <div className="mt-2 text-xs text-red-200">{err}</div>}
      <div className="mt-2 text-xs text-white/50">
        Execution is intentionally limited (CLICK/NAV/SHORTCUT). Add guardrails before any destructive actions.
      </div>
    </div>
  );
}
