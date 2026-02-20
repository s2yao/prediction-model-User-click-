"use client";

import TopBar from "@/components/TopBar";
import SessionControls from "@/components/SessionControls";
import Timeline from "@/components/Timeline";
import GraphPanel from "@/components/GraphPanel";
import PredictPanel from "@/components/PredictPanel";
import MemoryPanel from "@/components/MemoryPanel";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl p-4">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <SessionControls />
            <PredictPanel />
            <MemoryPanel />
          </div>

          <div className="col-span-12 lg:col-span-8 space-y-4">
            <GraphPanel />
            <Timeline />
          </div>
        </div>

        <div className="mt-6 text-xs text-white/50">
          Demo target: <a className="underline" href="/demo" target="_blank">/demo</a> (use this as the session URL)
        </div>
      </main>
    </div>
  );
}
