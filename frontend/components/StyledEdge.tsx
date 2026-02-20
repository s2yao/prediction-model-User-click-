"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps
} from "reactflow";

type EdgeData = {
  count: number;
  median_ms: number;
  avg_ms: number;

  // NEW: conditional probability P(to | from)
  p: number;

  // UI controls
  labelMode: "none" | "n" | "p" | "auto" | "full";
  hovered?: boolean;

  // styling inputs
  stroke: string;
  strokeWidth: number;
  opacity: number;
  offset: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(p: number) {
  if (!isFinite(p) || p <= 0) return "0%";
  const v = Math.round(p * 100);
  return `${v}%`;
}

function StyledEdge(props: EdgeProps<EdgeData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    data
  } = props;

  const d = data ?? {
    count: 1,
    median_ms: 0,
    avg_ms: 0,
    p: 0,
    labelMode: "auto" as const,
    stroke: "rgba(255,255,255,0.65)",
    strokeWidth: 2,
    opacity: 0.8,
    offset: 0
  };

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: d.offset
  });

  const showLabel =
    d.labelMode !== "none" &&
    (d.labelMode === "full" ||
      d.labelMode === "n" ||
      d.labelMode === "p" ||
      (d.labelMode === "auto" && (selected || d.hovered)));

  // Default label: probability + n
  const baseLabel = `p=${pct(d.p)} · n=${d.count}`;

  // Hover/selected label: include latency stats
  const fullLabel = `p=${pct(d.p)} · n=${d.count} · med=${d.median_ms}ms · avg=${d.avg_ms}ms`;

  const labelText =
    d.labelMode === "full" || (d.labelMode === "auto" && (selected || d.hovered))
      ? fullLabel
      : d.labelMode === "n"
      ? `n=${d.count}`
      : d.labelMode === "p"
      ? `p=${pct(d.p)}`
      : baseLabel;

  const strokeOpacity = clamp(d.opacity + (selected ? 0.18 : 0), 0.15, 1);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: d.stroke,
          strokeWidth: d.strokeWidth + (selected ? 0.8 : 0),
          opacity: strokeOpacity,
          filter: "drop-shadow(0 0 4px rgba(255,255,255,0.25))"
        }}
      />

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: "translate(-50%, -50%) translate(0px, -14px)",
              left: labelX,
              top: labelY,
              pointerEvents: "none",
              zIndex: 10
            }}
          >
            <div
              style={{
                fontSize: 11,
                lineHeight: 1,
                padding: "6px 8px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.92)",
                whiteSpace: "nowrap"
              }}
            >
              {labelText}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(StyledEdge);
