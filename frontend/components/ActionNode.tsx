"use client";

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

type NodeData = {
  kind: "NAV" | "TAB" | "CLICK" | "SHORTCUT" | "KEYBOARD" | "MOUSE" | "DOM" | "STATE" | "OTHER";
  label: string;
  count: number;
};

const hiddenHandleStyle: React.CSSProperties = {
  width: 1,
  height: 1,
  opacity: 0,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
};

function parseLabel(kind: NodeData["kind"], label: string) {
  const lines = (label || "").split("\n");
  const l1 = (lines[0] || "").trim();
  const l2 = (lines[1] || "").trim();
  const l3 = (lines[2] || "").trim();

  if (kind === "CLICK") {
    const afterBracket = l1.includes("]") ? l1.split("]").slice(1).join("]").trim() : l1;
    const parts = afterBracket.split(" / ").map((s) => s.trim()).filter(Boolean);
    const human = parts[0] || afterBracket || "Click";
    const hint = parts[1] ? `testid=${parts[1]}` : "";
    return { type: "Click", human, hint, path: l2 };
  }

  if (kind === "NAV") return { type: "Navigate", human: l2 || l1, hint: "", path: l2 };
  if (kind === "TAB") return { type: "Tab (context)", human: "tab focused", hint: "", path: l2 || l1 };
  if (kind === "DOM") return { type: "DOM (context)", human: "DOM change", hint: "", path: l2 };
  if (kind === "MOUSE") return { type: "Mouse (context)", human: "mouse input", hint: "", path: l2 };
  if (kind === "KEYBOARD") return { type: "Keyboard (context)", human: "keyboard input", hint: "", path: l2 };
  if (kind === "STATE") return { type: "State", human: l2 || "(no affordances)", hint: "", path: l3 || "" };
  if (kind === "SHORTCUT") return { type: "Shortcut", human: l1 || l2, hint: "", path: l2 || l3 };

  return { type: kind, human: l1 || l2, hint: "", path: l2 };
}

function ActionNode({ data }: NodeProps<NodeData>) {
  const parsed = useMemo(() => parseLabel(data.kind, data.label), [data.kind, data.label]);

  const isContext = data.kind === "DOM" || data.kind === "TAB" || data.kind === "MOUSE" || data.kind === "KEYBOARD";

  const box =
    data.kind === "NAV"
      ? "rounded-full"
      : data.kind === "STATE"
      ? "rounded-full"
      : data.kind === "CLICK"
      ? "rounded-2xl"
      : "rounded-xl";

  const tone = isContext
    ? "bg-white/5 border-white/10 text-white/70"
    : "bg-black/35 border-white/12 text-white";

  const padding = isContext ? "px-3 py-2" : "px-4 py-3";

  return (
    <div
      className={`${box} ${tone} border ${padding} shadow-sm`}
      style={{
        minWidth: isContext ? 190 : 240,
        maxWidth: isContext ? 320 : 520,
        width: "fit-content",
      }}
    >
      <Handle type="target" position={Position.Left} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Right} style={hiddenHandleStyle} />

      <div style={{ fontSize: 14, lineHeight: 1.2 }}>
        <div className="flex items-center gap-2">
          <div className="font-semibold">{parsed.type}</div>
          <div className="text-[11px] px-2 py-[2px] rounded-full border border-white/10 bg-white/5 text-white/70">
            x{data.count}
          </div>
        </div>

        <div className={isContext ? "mt-1 text-white/70" : "mt-2"}>
          <div className="font-medium whitespace-pre-wrap break-words">{parsed.human}</div>
        </div>

        <div className="mt-2 text-[12px] text-white/55 space-y-1">
          {parsed.hint ? <div>{parsed.hint}</div> : null}
          {parsed.path ? <div className="text-white/45">{parsed.path}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default memo(ActionNode);