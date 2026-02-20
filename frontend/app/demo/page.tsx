"use client";

import { useMemo, useState } from "react";

type Item = { id: string; name: string };

export default function DemoPage() {
  const items: Item[] = useMemo(
    () => [
      { id: "a1", name: "Alpha" },
      { id: "b2", name: "Beta" },
      { id: "c3", name: "Gamma" }
    ],
    []
  );

  const [selected, setSelected] = useState<Item | null>(null);
  const [step, setStep] = useState<"start" | "details" | "confirm">("start");
  const [status, setStatus] = useState<string>("Idle");

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Demo Workflow Page</h1>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Status</div>
            <div className="text-sm">{status}</div>
          </div>
        </div>

        {step === "start" && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="font-medium">Step 1: Pick an item</h2>
            <div className="flex gap-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  data-testid={`pick-${it.id}`}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 hover:bg-white/15"
                  aria-label={`Pick ${it.name}`}
                  onClick={() => {
                    setSelected(it);
                    setStatus(`Picked ${it.name}`);
                    setStep("details");
                  }}
                >
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="font-medium">Step 2: Review details</h2>
            <div className="text-sm text-white/70">
              Selected: <span className="text-white">{selected?.name}</span>
            </div>

            <div className="flex gap-2">
              <button
                data-testid="open-confirm"
                aria-label="Open confirm"
                className="rounded-lg border border-white/10 bg-blue-500/30 px-3 py-2 hover:bg-blue-500/40"
                onClick={() => {
                  setStatus("Opened confirm");
                  setStep("confirm");
                }}
              >
                Continue
              </button>

              <button
                data-testid="go-back"
                aria-label="Go back"
                className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 hover:bg-white/15"
                onClick={() => {
                  setSelected(null);
                  setStatus("Back to start");
                  setStep("start");
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="font-medium">Step 3: Confirm</h2>
            <div className="text-sm text-white/70">
              You’re about to submit: <span className="text-white">{selected?.name}</span>
            </div>

            <div className="flex gap-2">
              <button
                data-testid="submit"
                aria-label="Submit"
                className="rounded-lg border border-white/10 bg-green-500/30 px-3 py-2 hover:bg-green-500/40"
                onClick={() => {
                  setStatus("Submitted!");
                }}
              >
                Submit
              </button>

              <button
                data-testid="cancel"
                aria-label="Cancel"
                className="rounded-lg border border-white/10 bg-red-500/30 px-3 py-2 hover:bg-red-500/40"
                onClick={() => {
                  setStatus("Cancelled");
                  setStep("details");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="text-xs text-white/50">
          Tip: Use the recorder UI to start a session on this page, then click through steps.
        </div>
      </div>
    </div>
  );
}
