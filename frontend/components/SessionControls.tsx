"use client";

import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

type StateResp = { recording: boolean; session_id: string | null };

export default function SessionControls() {
  const targetUrl = useAppStore((s) => s.targetUrl);
  const setTargetUrl = useAppStore((s) => s.setTargetUrl);
  const recording = useAppStore((s) => s.recording);
  const setRecording = useAppStore((s) => s.setRecording);
  const clearLocal = useAppStore((s) => s.clearLocal);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function syncState() {
    try {
      const st = await apiGet<StateResp>("/api/state");
      setRecording(!!st.recording, st.session_id ?? null);
      return st;
    } catch {
      return null;
    }
  }

  async function startOrRestart() {
    setBusy(true);
    setErr(null);

    try {
      // Always trust backend state more than stale UI state.
      const st = await syncState();

      // If backend thinks we're recording, force a clean restart.
      if (st?.recording) {
        try {
          await apiPost("/api/session/stop");
        } catch {
          // ignore; still attempt start
        }
        await syncState();
      }

      // Start session (backend should open/reopen Playwright Chromium).
      await apiPost("/api/session/start", { url: targetUrl });

      // Re-sync so UI updates without a refresh.
      await syncState();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/api/session/stop");
      await syncState();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/api/clear");
      clearLocal();
      await syncState();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-medium mb-2">Session</div>

      <label className="text-xs text-white/60">Target URL</label>
      <input
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/20"
        value={targetUrl}
        onChange={(e) => setTargetUrl(e.target.value)}
        placeholder="http://localhost:3000/demo"
        spellCheck={false}
      />

      <div className="mt-3 flex gap-2">
        <button
          className="flex-1 rounded-xl border border-white/10 bg-blue-500/25 hover:bg-blue-500/35 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={startOrRestart}
          title="Force restart if stuck; opens only the Playwright-controlled Chromium."
        >
          {recording ? "Restart Session" : "Start Session"}
        </button>

        <button
          className="flex-1 rounded-xl border border-white/10 bg-red-500/25 hover:bg-red-500/35 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy || !recording}
          onClick={stop}
        >
          Stop
        </button>
      </div>

      <button
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 px-3 py-2 text-sm disabled:opacity-50"
        disabled={busy}
        onClick={clearAll}
      >
        Clear Graph/Events
      </button>

      {err && <div className="mt-2 text-xs text-red-200">{err}</div>}
    </div>
  );
}
