"use client";

import { useEffect } from "react";
import { apiGet } from "@/lib/api";
import { connectWS } from "@/lib/ws";
import { useAppStore } from "@/store/useAppStore";

export default function TopBar() {
  const recording = useAppStore((s) => s.recording);
  const sessionId = useAppStore((s) => s.sessionId);
  const setRecording = useAppStore((s) => s.setRecording);
  const pushEvent = useAppStore((s) => s.pushEvent);
  const pushAction = useAppStore((s) => s.pushAction);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;

    (async () => {
      try {
        const st = await apiGet<{ recording: boolean; session_id: string | null }>(`/api/state`);
        if (!alive) return;
        setRecording(st.recording, st.session_id);
      } catch {
        // ignore
      }

      ws = connectWS((msg) => {
        if (msg?.type === "hello") {
          setRecording(!!msg.recording, msg.session_id ?? null);
        }
        if (msg?.type === "event") pushEvent(msg.event);
        if (msg?.type === "action") pushAction(msg.action);
      });
    })();

    return () => {
      alive = false;
      try { ws?.close(); } catch {}
    };
  }, [setRecording, pushEvent, pushAction]);

  return (
    <header className="border-b border-white/10 bg-white/5">
      <div className="mx-auto max-w-6xl p-4 flex items-center justify-between">
        <div className="font-semibold">Browser Workflow Graphs + Agent</div>
        <div className="flex items-center gap-3 text-sm">
          <div className={`px-2 py-1 rounded-full border ${recording ? "border-green-500/40 text-green-200" : "border-white/10 text-white/60"}`}>
            {recording ? "Recording" : "Idle"}
          </div>
          <div className="text-white/60">
            {sessionId ? `session ${sessionId.slice(0, 8)}` : "no session"}
          </div>
        </div>
      </div>
    </header>
  );
}
