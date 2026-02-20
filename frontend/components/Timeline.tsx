"use client";

import { useAppStore } from "@/store/useAppStore";

export default function Timeline() {
  const events = useAppStore((s) => s.events);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Live Timeline</div>
        <div className="text-xs text-white/60">{events.length} events</div>
      </div>

      <div className="mt-3 max-h-[320px] overflow-auto space-y-2 pr-1">
        {events.slice().reverse().slice(0, 80).map((e, idx) => (
          <div key={idx} className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="flex items-center justify-between text-xs">
              <div className="text-white/80">{e.type}</div>
              <div className="text-white/50">{new Date(e.ts).toLocaleTimeString()}</div>
            </div>
            <div className="mt-1 text-[11px] text-white/60 break-all">
              {e.url}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
