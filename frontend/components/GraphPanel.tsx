"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  ControlButton,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import { apiGet, type GraphSnapshot } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import ActionNode from "@/components/ActionNode";
import StyledEdge from "@/components/StyledEdge";

const nodeTypes = { action: ActionNode };
const edgeTypes = { styled: StyledEdge };

function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function laneForKind(kind: string) {
  if (kind === "NAV" || kind === "TAB") return 0;
  if (kind === "CLICK") return 1;
  if (kind === "DOM") return 2;
  return 2;
}

function edgeColorFor(srcKind: string) {
  if (srcKind === "NAV") return "rgba(130,200,255,1)";
  if (srcKind === "TAB") return "rgba(200,160,255,1)";
  if (srcKind === "CLICK") return "rgba(170,255,190,1)";
  if (srcKind === "DOM") return "rgba(200,200,200,1)";
  return "rgba(220,220,220,1)";
}

export default function GraphPanel() {
  const graph = useAppStore((s) => s.graph);
  const setGraph = useAppStore((s) => s.setGraph);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // UI controls
  const [hideDom, setHideDom] = useState(false);
  const [hideUnlabeledClicks, setHideUnlabeledClicks] = useState(true);
  const [topKEdges, setTopKEdges] = useState(60);
  const [labelMode, setLabelMode] = useState<"none" | "n" | "auto" | "full">("auto");

  // interactions
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // when true, we will fit as soon as size + nodes are stable
  const needsFitRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const t = setInterval(async () => {
      try {
        const g = await apiGet<GraphSnapshot>("/api/graph");
        if (alive) setGraph(g);
      } catch {}
    }, 800);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [setGraph]);

  async function toggleFullscreen() {
    const el = wrapperRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      needsFitRef.current = true;
      await el.requestFullscreen().catch(() => {});
    }
  }

  function fitAll() {
    rfRef.current?.fitView({ padding: 0.2, duration: 220 });
  }

  // Track fullscreen state
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);

      // Entering fullscreen => we want one good fit after size settles + nodes committed
      if (fs) needsFitRef.current = true;
    };

    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ResizeObserver: when fullscreen, wait until wrapper has real stable size, then fit once.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      if (!document.fullscreenElement) return;
      if (!needsFitRef.current) return;

      // Debounce to end of layout tick
      requestAnimationFrame(() => {
        rfRef.current?.fitView({ padding: 0.2, duration: 250 });
        needsFitRef.current = false;
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When nodes/edges update while fullscreen, if we still need a fit, do it after commit.
  useEffect(() => {
    if (!document.fullscreenElement) return;
    if (!needsFitRef.current) return;

    requestAnimationFrame(() => {
      rfRef.current?.fitView({ padding: 0.2, duration: 250 });
      needsFitRef.current = false;
    });
  }, [isFullscreen]); // keep small; resize observer + manual fit handle the rest

  const { nodes, edges, minimapColors } = useMemo(() => {
    const g = graph;
    if (!g) return { nodes: [] as Node[], edges: [] as Edge[], minimapColors: new Map<string, string>() };

    // raw -> safe id
    const toSafe = new Map<string, string>();
    const kindByRaw = new Map<string, string>();
    const countByRaw = new Map<string, number>();

    for (const n of g.nodes) {
      toSafe.set(n.id, `n_${hashId(n.id)}`);
      kindByRaw.set(n.id, n.kind);
      countByRaw.set(n.id, n.count);
    }

    // filters on nodes
    const visibleRawNodes = g.nodes
      .filter((n) => !(hideDom && n.kind === "DOM"))
      .filter((n) => {
        if (!hideUnlabeledClicks) return true;
        if (n.kind !== "CLICK") return true;
        return !n.label.includes("(no label)");
      });

    const visibleRawSet = new Set(visibleRawNodes.map((n) => n.id));

    // filter + rank edges (topK by frequency)
    const rawEdges = g.edges
      .filter((e) => visibleRawSet.has(e.from) && visibleRawSet.has(e.to))
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, topKEdges);

    // ---- LEVELS: stable BFS from roots (prevents cycle inflation) ----
    const indeg = new Map<string, number>();
    for (const n of visibleRawNodes) indeg.set(n.id, 0);
    for (const e of rawEdges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);

    let roots = visibleRawNodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);

    // If everything is in a cycle, pick a deterministic root:
    if (roots.length === 0) {
      const pick =
        visibleRawNodes
          .filter((n) => n.kind === "NAV" || n.kind === "TAB")
          .sort((a, b) => b.count - a.count)[0] ??
        visibleRawNodes.sort((a, b) => b.count - a.count)[0];

      if (pick) roots = [pick.id];
    }

    const out = new Map<string, string[]>();
    for (const n of visibleRawNodes) out.set(n.id, []);
    for (const e of rawEdges) out.get(e.from)?.push(e.to);

    const level = new Map<string, number>();
    for (const n of visibleRawNodes) level.set(n.id, Infinity);
    for (const r of roots) level.set(r, 0);

    const q: string[] = [...roots];
    while (q.length) {
      const cur = q.shift()!;
      const curLv = level.get(cur)!;
      const nexts = out.get(cur) ?? [];
      for (const nx of nexts) {
        const prev = level.get(nx) ?? Infinity;
        const cand = curLv + 1;
        // shortest distance layering
        if (cand < prev) {
          level.set(nx, cand);
          q.push(nx);
        }
      }
    }

    // Any still-unreached nodes: place near 0 but stable
    for (const n of visibleRawNodes) {
      if (!Number.isFinite(level.get(n.id) ?? Infinity)) level.set(n.id, 0);
    }

    // compress levels to 0..K-1 to keep width sane
    const uniq = Array.from(new Set(visibleRawNodes.map((n) => level.get(n.id) ?? 0))).sort((a, b) => a - b);
    const compress = new Map<number, number>();
    uniq.forEach((v, i) => compress.set(v, i));
    for (const n of visibleRawNodes) level.set(n.id, compress.get(level.get(n.id) ?? 0) ?? 0);

    // lanes
    const lanes: string[][] = [[], [], []];
    for (const n of visibleRawNodes) lanes[laneForKind(n.kind)].push(n.id);

    // Sort within lane by level then by count
    for (const lane of lanes) {
      lane.sort((a, b) => {
        const la = level.get(a) ?? 0;
        const lb = level.get(b) ?? 0;
        if (la !== lb) return la - lb;
        return (countByRaw.get(b) ?? 0) - (countByRaw.get(a) ?? 0);
      });
    }

    // layout constants (more breathing room; node height is now bounded)
    const X_GAP = 320;
    const LANE_Y = [120, 420, 700];
    const ROW_GAP = 180;

    const ns: Node[] = [];

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const ids = lanes[laneIdx];
      const perLevelCounts = new Map<number, number>();

      for (const rawId of ids) {
        const lv = level.get(rawId) ?? 0;
        const offsetInLevel = perLevelCounts.get(lv) ?? 0;
        perLevelCounts.set(lv, offsetInLevel + 1);

        const x = 80 + lv * X_GAP;
        const y = LANE_Y[laneIdx] + offsetInLevel * ROW_GAP;

        const safeId = toSafe.get(rawId)!;
        const nodeMeta = visibleRawNodes.find((n) => n.id === rawId)!;

        ns.push({
          id: safeId,
          type: "action",
          position: { x, y },
          data: {
            kind: nodeMeta.kind,
            label: nodeMeta.label,
            count: nodeMeta.count,
          },
        });
      }
    }

    // focus path (neighbors of clicked node)
    const focusSafe = focusNodeId;
    const focusRaw = focusSafe
      ? Array.from(toSafe.entries()).find(([, v]) => v === focusSafe)?.[0] ?? null
      : null;

    const focusNodes = new Set<string>();
    const focusEdges = new Set<string>();

    if (focusRaw) {
      focusNodes.add(focusRaw);
      for (const e of rawEdges) {
        if (e.from === focusRaw || e.to === focusRaw) {
          focusNodes.add(e.from);
          focusNodes.add(e.to);
        }
      }
    }

    // ---- Deterministic parallel offsets: group by (from,to) ----
    const group = new Map<string, { e: (typeof rawEdges)[number]; idx: number }[]>();
    rawEdges.forEach((e, idx) => {
      const k = `${e.from}→${e.to}`;
      const arr = group.get(k) ?? [];
      arr.push({ e, idx });
      group.set(k, arr);
    });

    const offsetByIdx = new Map<number, number>();
    for (const arr of group.values()) {
      // stable order within group: highest count first
      arr.sort((a, b) => b.e.count - a.e.count);

      const m = arr.length;
      for (let i = 0; i < m; i++) {
        const centered = i - (m - 1) / 2;
        offsetByIdx.set(arr[i].idx, centered * 14); // 14px per lane
      }
    }

    // build edges
    const es: Edge[] = rawEdges.map((e, idx) => {
      const srcSafe = toSafe.get(e.from)!;
      const dstSafe = toSafe.get(e.to)!;

      const srcKind = kindByRaw.get(e.from) ?? "OTHER";
      const stroke = edgeColorFor(srcKind);

      // thickness = frequency
      const w = clamp(2.2 + Math.log2(e.count + 1) * 1.6, 2.4, 8.2);

      // opacity = speed (keep a floor)
      const t = clamp(e.median_ms / 2500, 0, 1);
      const opacity = clamp(0.95 - t * 0.45, 0.35, 0.98);

      const offset = offsetByIdx.get(idx) ?? 0;

      const edgeId = `${srcSafe}->${dstSafe}-${idx}`;

      if (focusRaw) {
        if (e.from === focusRaw || e.to === focusRaw) focusEdges.add(edgeId);
      }

      const dim = focusRaw && !focusEdges.has(edgeId);

      return {
        id: edgeId,
        source: srcSafe,
        target: dstSafe,
        type: "styled",
        animated: e.count >= 6,
        interactionWidth: 22,
        // IMPORTANT: marker styled here (clear direction)
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 18,
          height: 18,
        },
        style: { opacity: dim ? 0.12 : 1 },
        data: {
          count: e.count,
          median_ms: e.median_ms,
          avg_ms: e.avg_ms,
          labelMode,
          hovered: hoverEdgeId === edgeId,
          stroke,
          strokeWidth: w,
          opacity: dim ? 0.12 : opacity,
          offset,
        },
      };
    });

    // Dim nodes when focused
    const dimmedNodes: Node[] = ns.map((n) => {
      if (!focusRaw) return n;
      const rawId = Array.from(toSafe.entries()).find(([, v]) => v === n.id)?.[0];
      const dim = rawId ? !focusNodes.has(rawId) : true;
      return {
        ...n,
        style: { ...(n.style || {}), opacity: dim ? 0.18 : 1 },
      };
    });

    // minimap coloring
    const mm = new Map<string, string>();
    for (const rawId of visibleRawSet) {
      const k = kindByRaw.get(rawId) ?? "OTHER";
      mm.set(toSafe.get(rawId)!, edgeColorFor(k));
    }

    return { nodes: dimmedNodes, edges: es, minimapColors: mm };
  }, [
    graph,
    hideDom,
    hideUnlabeledClicks,
    topKEdges,
    labelMode,
    hoverEdgeId,
    focusNodeId,
  ]);

  // When entering fullscreen, ensure we fit once after the graph is present.
  useEffect(() => {
    if (!isFullscreen) return;
    if (!rfRef.current) return;
    // mark that we need a good fit; resize observer will execute it
    needsFitRef.current = true;
  }, [isFullscreen, nodes.length, edges.length]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Workflow Graph</div>
        <div className="text-xs text-white/60">
          {graph ? `${graph.nodes.length} nodes, ${graph.edges.length} edges` : "—"}
        </div>
      </div>

      <div
        ref={wrapperRef}
        className={`mt-3 rounded-xl overflow-hidden border border-white/10 bg-black ${
          isFullscreen ? "w-full h-full" : "h-[520px]"
        }`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: "styled",
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesConnectable={false}
          connectOnClick={false}
          onInit={(inst) => {
            rfRef.current = inst;
            requestAnimationFrame(() => inst.fitView({ padding: 0.2, duration: 200 }));
          }}
          onEdgeMouseEnter={(_, e) => setHoverEdgeId(e.id)}
          onEdgeMouseLeave={() => setHoverEdgeId(null)}
          onNodeClick={(_, n) => setFocusNodeId((cur) => (cur === n.id ? null : n.id))}
        >
          <Background />

          {/* Controls: include a real fullscreen toggle in the bottom-left cluster */}
          <Controls showInteractive={false}>
            <ControlButton onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {/* simple icon without extra deps */}
              <span style={{ fontSize: 14, lineHeight: 1 }}>{isFullscreen ? "⤡" : "⤢"}</span>
            </ControlButton>
          </Controls>

          {/* Keep minimap visible in fullscreen so you never get lost */}
          {isFullscreen && (
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => minimapColors.get(n.id) ?? "rgba(255,255,255,0.6)"}
              nodeStrokeColor={() => "rgba(0,0,0,0.0)"}
              nodeBorderRadius={10}
            />
          )}

          <Panel position="top-right">
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-white/10 bg-white/10 hover:bg-white/15 px-2 py-1"
                  onClick={fitAll}
                >
                  Fit
                </button>
                <button
                  className="rounded-lg border border-white/10 bg-white/10 hover:bg-white/15 px-2 py-1"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? "Exit FS" : "Fullscreen"}
                </button>
                <button
                  className="rounded-lg border border-white/10 bg-white/10 hover:bg-white/15 px-2 py-1"
                  onClick={() => setFocusNodeId(null)}
                >
                  Clear focus
                </button>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hideDom} onChange={(e) => setHideDom(e.target.checked)} />
                Hide DOM nodes
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hideUnlabeledClicks}
                  onChange={(e) => setHideUnlabeledClicks(e.target.checked)}
                />
                Hide unlabeled clicks
              </label>

              <div className="flex items-center justify-between gap-3">
                <div className="text-white/70">Top edges</div>
                <input
                  className="w-[140px]"
                  type="range"
                  min={10}
                  max={160}
                  step={5}
                  value={topKEdges}
                  onChange={(e) => setTopKEdges(Number(e.target.value))}
                />
                <div className="text-white/60 w-[28px] text-right">{topKEdges}</div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-white/70">Edge labels</div>
                <select
                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-1"
                  value={labelMode}
                  onChange={(e) => setLabelMode(e.target.value as any)}
                >
                  <option value="none">none</option>
                  <option value="n">n</option>
                  <option value="auto">auto</option>
                  <option value="full">full</option>
                </select>
              </div>

              <div className="text-[11px] text-white/45">Tip: click a node to “focus path” (neighbors highlighted).</div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <div className="mt-2 text-xs text-white/50">
        Nodes/edges capped in UI for performance. Backend keeps full counts in memory.
      </div>
    </div>
  );
}
