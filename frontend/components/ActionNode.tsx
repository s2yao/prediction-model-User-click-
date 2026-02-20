"use client";

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

type NodeData = {
  kind: "NAV" | "TAB" | "CLICK" | "DOM" | "OTHER";
  label: string;
  count: number;
};

const hiddenHandleStyle: React.CSSProperties = {
  width: 1,
  height: 1,
  opacity: 0,
  border: "none",
  background: "transparent",
  pointerEvents: "none"
};

function parseLabel(kind: NodeData["kind"], label: string) {
  const [l1Raw, l2Raw] = (label || "").split("\n");
  const l1 = (l1Raw || "").trim();
  const l2 = (l2Raw || "").trim();

  if (kind === "CLICK") {
    const afterBracket = l1.includes("]") ? l1.split("]").slice(1).join("]").trim() : l1;
    const unlabeled = afterBracket.includes("(no label)");
    const parts = afterBracket.split(" / ").map((s) => s.trim()).filter(Boolean);

    const human = unlabeled ? "unlabeled element" : (parts[0] || afterBracket || "Click");
    const hint = unlabeled ? "" : (parts[1] ? `testid=${parts[1]}` : "");

    return { type: "Click", human, hint, path: l2 };
  }

  if (kind === "NAV") return { type: "Navigate", human: l2 || l1, hint: "", path: l2 };
  if (kind === "TAB") return { type: "Tab", human: l2 || l1, hint: "", path: l2 };
  if (kind === "DOM") return { type: "DOM", human: "DOM change", hint: "", path: l2 };

  return { type: kind, human: l1 || l2, hint: "", path: l2 };
}

function ActionNode({ data }: NodeProps<NodeData>) {
  const parsed = useMemo(() => parseLabel(data.kind, data.label), [data.kind, data.label]);

  const box =
    data.kind === "NAV"
      ? "rounded-full"
      : data.kind === "TAB"
      ? "rounded-xl"
      : data.kind === "CLICK"
      ? "rounded-2xl"
      : "rounded-full";

  const tone =
    data.kind === "DOM"
      ? "bg-white/5 border-white/10 text-white/70"
      : "bg-black/35 border-white/12 text-white";

  const padding = data.kind === "DOM" ? "px-3 py-2" : "px-4 py-3";

  return (
    <div
      className={`${box} ${tone} border ${padding} shadow-sm`}
      style={{
        minWidth: data.kind === "DOM" ? 170 : 240,
        maxWidth: data.kind === "DOM" ? 260 : 520,
        width: "fit-content"
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

        <div className={data.kind === "DOM" ? "mt-1 text-white/70" : "mt-2"}>
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
