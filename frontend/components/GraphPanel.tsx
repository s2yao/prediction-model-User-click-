"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Panel,
  MarkerType,
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
  if (kind === "NAV" || kind === "TAB" || kind === "STATE") return 0;
  if (kind === "CLICK") return 1;
  if (kind === "DOM") return 2;
  return 2;
}

function edgeColorFor(srcKind: string) {
  if (srcKind === "NAV") return "rgba(130,200,255,1)";
  if (srcKind === "TAB") return "rgba(200,160,255,1)";
  if (srcKind === "STATE") return "rgba(255,230,170,1)";
  if (srcKind === "CLICK") return "rgba(170,255,190,1)";
  if (srcKind === "DOM") return "rgba(200,200,200,1)";
  return "rgba(220,220,220,1)";
}

type RawEdge = GraphSnapshot["edges"][number];

export default function GraphPanel() {
  const graph = useAppStore((s) => s.graph);
  const setGraph = useAppStore((s) => s.setGraph);
  const actions = useAppStore((s) => s.actions);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // UI controls
  const [hideDom, setHideDom] = useState(true);
  const [hideTabs, setHideTabs] = useState(true);
  const [topKEdges, setTopKEdges] = useState(60);
  const [labelMode, setLabelMode] = useState<"none" | "n" | "auto" | "full">(
    "auto"
  );
  const [hideMouse, setHideMouse] = useState(true);

  // interactions
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // current state = latest STATE action id (raw node id)
  const currentStateRawId = useMemo(() => {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i]?.kind === "STATE") return actions[i].id;
    }
    return null;
  }, [actions]);

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

  function fitAll() {
    rfRef.current?.fitView({ padding: 0.22, duration: 220 });
  }

  // Reliable fullscreen "auto fit" (wait for layout + fullscreen transition)
  function fitFullscreen() {
    if (!document.fullscreenElement) return;
    const inst = rfRef.current;
    if (!inst) return;

    // next frame after layout
    requestAnimationFrame(() => {
      inst.fitView({ padding: 0.22, duration: 0 });
    });

    // slight delay for fullscreen reflow
    window.setTimeout(() => {
      inst.fitView({ padding: 0.22, duration: 0 });
    }, 90);
  }

  async function toggleFullscreen() {
    const el = wrapperRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await el.requestFullscreen().catch(() => {});
    }
  }

  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) fitFullscreen();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      if (!document.fullscreenElement) return;
      fitFullscreen();
    });

    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { nodes, edges } = useMemo(() => {
    const g = graph;
    if (!g) return { nodes: [] as Node[], edges: [] as Edge[] };

    const nodeById = new Map<string, GraphSnapshot["nodes"][number]>();
    const toSafe = new Map<string, string>();
    const safeToRaw = new Map<string, string>();
    const kindByRaw = new Map<string, string>();
    const countByRaw = new Map<string, number>();

    for (const n of g.nodes) {
      nodeById.set(n.id, n);
      const safe = `n_${hashId(n.id)}`;
      toSafe.set(n.id, safe);
      safeToRaw.set(safe, n.id);
      kindByRaw.set(n.id, n.kind);
      countByRaw.set(n.id, n.count);
    }

    const currentStateSafeId = currentStateRawId
      ? toSafe.get(currentStateRawId) ?? null
      : null;

    // ---- Hard filters (remove from universe) ----
    const hardNodes = g.nodes
      .filter((n) => !(hideDom && n.kind === "DOM"))
      .filter((n) => !(hideMouse && n.kind === "MOUSE"))
      .filter((n) => {
        if (n.kind !== "CLICK") return true;
        return !n.label.includes("(no label)");
      });

    const hardSet = new Set(hardNodes.map((n) => n.id));

    // TAB nodes survive hard filter (so we can collapse them), but may be hidden in render.
    const tabSet = new Set(
      hardNodes.filter((n) => n.kind === "TAB").map((n) => n.id)
    );

    // ---- Render node set (TAB/STATE can be hidden) ----
    const renderNodes = hardNodes
      .filter((n) => !(hideTabs && n.kind === "TAB"))
    const renderSet = new Set(renderNodes.map((n) => n.id));

    // ---- Edges within hard universe ----
    const hardEdges: RawEdge[] = g.edges.filter(
      (e) => hardSet.has(e.from) && hardSet.has(e.to)
    );

    // ---- Option A: collapse TAB nodes when hidden ----
    const tabBefore = new Map<string, number>();
    const edgeMap = new Map<
      string,
      { from: string; to: string; count: number; sumAvg: number; sumMed: number }
    >();

    function addEdge(
      from: string,
      to: string,
      count: number,
      avg_ms: number,
      median_ms: number
    ) {
      if (!renderSet.has(from) || !renderSet.has(to)) return;
      const k = `${from}→${to}`;
      const cur = edgeMap.get(k) ?? {
        from,
        to,
        count: 0,
        sumAvg: 0,
        sumMed: 0,
      };
      cur.count += count;
      cur.sumAvg += count * avg_ms;
      cur.sumMed += count * median_ms;
      edgeMap.set(k, cur);
    }

    if (!hideTabs) {
      for (const e of hardEdges) {
        if (!renderSet.has(e.from) || !renderSet.has(e.to)) continue;
        addEdge(e.from, e.to, e.count, e.avg_ms, e.median_ms);
      }
    } else {
      for (const e of hardEdges) {
        if (!renderSet.has(e.from) || !renderSet.has(e.to)) continue;
        if (tabSet.has(e.from) || tabSet.has(e.to)) continue;
        addEdge(e.from, e.to, e.count, e.avg_ms, e.median_ms);
      }

      const inToTab = new Map<string, RawEdge[]>();
      const outFromTab = new Map<string, RawEdge[]>();

      for (const e of hardEdges) {
        if (tabSet.has(e.to) && renderSet.has(e.from)) {
          const arr = inToTab.get(e.to) ?? [];
          arr.push(e);
          inToTab.set(e.to, arr);
        }
        if (tabSet.has(e.from) && renderSet.has(e.to)) {
          const arr = outFromTab.get(e.from) ?? [];
          arr.push(e);
          outFromTab.set(e.from, arr);
          tabBefore.set(e.to, (tabBefore.get(e.to) ?? 0) + e.count);
        }
      }

      for (const t of tabSet) {
        const ins = inToTab.get(t) ?? [];
        const outs = outFromTab.get(t) ?? [];
        if (ins.length === 0 || outs.length === 0) continue;

        for (const ein of ins) {
          for (const eout of outs) {
            const from = ein.from;
            const to = eout.to;
            if (!renderSet.has(from) || !renderSet.has(to)) continue;
            if (from === to) continue;

            const w = Math.min(ein.count, eout.count);
            if (w <= 0) continue;

            addEdge(
              from,
              to,
              w,
              ein.avg_ms + eout.avg_ms,
              ein.median_ms + eout.median_ms
            );
          }
        }
      }
    }

    const allVisibleEdges = Array.from(edgeMap.values()).map((x) => ({
      from: x.from,
      to: x.to,
      count: x.count,
      avg_ms: x.count > 0 ? x.sumAvg / x.count : 0,
      median_ms: x.count > 0 ? x.sumMed / x.count : 0,
    }));

    const rawEdges = allVisibleEdges
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, topKEdges);

    // ---- LEVELS (BFS) over rendered edges ----
    const indeg = new Map<string, number>();
    for (const n of renderNodes) indeg.set(n.id, 0);
    for (const e of rawEdges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);

    let roots = renderNodes
      .filter((n) => (indeg.get(n.id) ?? 0) === 0)
      .map((n) => n.id);

    if (roots.length === 0) {
      const pick =
        renderNodes
          .filter((n) => n.kind === "NAV")
          .sort((a, b) => b.count - a.count)[0] ??
        renderNodes.sort((a, b) => b.count - a.count)[0];
      if (pick) roots = [pick.id];
    }

    const out = new Map<string, string[]>();
    for (const n of renderNodes) out.set(n.id, []);
    for (const e of rawEdges) out.get(e.from)?.push(e.to);

    const level = new Map<string, number>();
    for (const n of renderNodes) level.set(n.id, Infinity);
    for (const r of roots) level.set(r, 0);

    const q: string[] = [...roots];
    while (q.length) {
      const cur = q.shift()!;
      const curLv = level.get(cur)!;
      const nexts = out.get(cur) ?? [];
      for (const nx of nexts) {
        const prev = level.get(nx) ?? Infinity;
        const cand = curLv + 1;
        if (cand < prev) {
          level.set(nx, cand);
          q.push(nx);
        }
      }
    }

    for (const n of renderNodes) {
      if (!Number.isFinite(level.get(n.id) ?? Infinity)) level.set(n.id, 0);
    }

    const uniq = Array.from(
      new Set(renderNodes.map((n) => level.get(n.id) ?? 0))
    ).sort((a, b) => a - b);
    const compress = new Map<number, number>();
    uniq.forEach((v, i) => compress.set(v, i));
    for (const n of renderNodes) {
      level.set(n.id, compress.get(level.get(n.id) ?? 0) ?? 0);
    }

    // lanes
    const lanes: string[][] = [[], [], []];
    for (const n of renderNodes) lanes[laneForKind(n.kind)].push(n.id);

    for (const lane of lanes) {
      lane.sort((a, b) => {
        const la = level.get(a) ?? 0;
        const lb = level.get(b) ?? 0;
        if (la !== lb) return la - lb;
        return (countByRaw.get(b) ?? 0) - (countByRaw.get(a) ?? 0);
      });
    }

    
    const X_GAP = 560;
    const LANE_Y = [200, 680, 1160];
    const ROW_GAP = 320;

    const ns: Node[] = [];

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const ids = lanes[laneIdx];

      // Separate rows PER LEVEL (so multiple nodes at same x never overlap).
      const perLevelCounts = new Map<number, number>();

      for (const rawId of ids) {
        const lv = level.get(rawId) ?? 0;
        const offsetInLevel = perLevelCounts.get(lv) ?? 0;
        perLevelCounts.set(lv, offsetInLevel + 1);

        const x = 80 + lv * X_GAP;
        const y = LANE_Y[laneIdx] + offsetInLevel * ROW_GAP;

        const safeId = toSafe.get(rawId)!;
        const nodeMeta = nodeById.get(rawId)!;

        ns.push({
          id: safeId,
          type: "action",
          position: { x, y },
          data: {
            kind: nodeMeta.kind,
            label: nodeMeta.label,
            count: nodeMeta.count,
            context: hideTabs ? { tabBefore: tabBefore.get(rawId) ?? 0 } : undefined,
          },
        });
      }
    }

    // focus path (neighbors of clicked node)
    const focusSafe = focusNodeId;
    const focusRaw = focusSafe ? safeToRaw.get(focusSafe) ?? null : null;

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

    // parallel offsets group by (from,to)
    const group = new Map<string, { e: (typeof rawEdges)[number]; idx: number }[]>();
    rawEdges.forEach((e, idx) => {
      const k = `${e.from}→${e.to}`;
      const arr = group.get(k) ?? [];
      arr.push({ e, idx });
      group.set(k, arr);
    });

    const offsetByIdx = new Map<number, number>();
    for (const arr of group.values()) {
      arr.sort((a, b) => b.e.count - a.e.count);
      const m = arr.length;
      for (let i = 0; i < m; i++) {
        const centered = i - (m - 1) / 2;
        offsetByIdx.set(arr[i].idx, centered * 14);
      }
    }

    const es: Edge[] = rawEdges.map((e, idx) => {
      const srcSafe = toSafe.get(e.from)!;
      const dstSafe = toSafe.get(e.to)!;

      const srcKind = kindByRaw.get(e.from) ?? "OTHER";
      const stroke = edgeColorFor(srcKind);

      const w = clamp(2.4 + Math.log2(e.count + 1) * 1.7, 2.6, 9.0);
      const t = clamp((e.median_ms ?? 0) / 2500, 0, 1);
      const opacity = clamp(0.97 - t * 0.45, 0.40, 0.98);

      const offset = offsetByIdx.get(idx) ?? 0;
      const edgeId = `${srcSafe}->${dstSafe}`;

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
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 18,
          height: 18,
        },
        style: { opacity: dim ? 0.18 : 1 },
        data: {
          count: e.count,
          median_ms: Math.round(e.median_ms ?? 0),
          avg_ms: Math.round(e.avg_ms ?? 0),
          p: 0,
          labelMode,
          hovered: hoverEdgeId === edgeId,
          stroke,
          strokeWidth: w,
          opacity: dim ? 0.18 : opacity,
          offset,
        },
      };
    });

    // node dimming + current-state highlight
    const dimmedNodes: Node[] = ns.map((n) => {
      const rawId = safeToRaw.get(n.id);
      const isCurrent = !!currentStateSafeId && n.id === currentStateSafeId;

      // base dim logic (focus mode)
      let opacity = 1;
      if (focusRaw) {
        const dim = rawId ? !focusNodes.has(rawId) : true;
        opacity = dim ? 0.18 : 1;
      }

      // current state should win over dim
      if (isCurrent) opacity = 1;

      return {
        ...n,
        style: {
          ...(n.style || {}),
          opacity,
          zIndex: isCurrent ? 40 : undefined,
          outline: isCurrent ? "3px solid rgba(170,255,190,0.95)" : undefined,
          outlineOffset: isCurrent ? "8px" : undefined,
          boxShadow: isCurrent
            ? "0 0 0 2px rgba(170,255,190,0.55), 0 0 22px rgba(170,255,190,0.35)"
            : undefined,
        },
      };
    });

    return { nodes: dimmedNodes, edges: es };
  }, [
    graph,
    actions,
    currentStateRawId,
    hideDom,
    hideTabs,
    topKEdges,
    labelMode,
    hoverEdgeId,
    focusNodeId,
  ]);

  // Refit when graph changes while fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    fitFullscreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, nodes.length, edges.length]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      {/* ✅ Make edges render ABOVE nodes, so paths aren’t hidden behind node cards */}
      <style jsx global>{`
        .react-flow__edges {
          z-index: 20 !important;
        }
        .react-flow__edge-path,
        .react-flow__connection-path {
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .react-flow__nodes {
          z-index: 10 !important;
        }
      `}</style>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Workflow Graph</div>
        <div className="text-xs text-white/60">
          {graph ? `${graph.nodes.length} nodes, ${graph.edges.length} edges` : "—"}
        </div>
      </div>

      <div
        ref={wrapperRef}
        className={`mt-3 rounded-xl overflow-hidden border border-white/10 bg-black ${
          isFullscreen ? "w-screen h-screen" : "h-[520px]"
        }`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "styled",
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          }}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          nodesConnectable={false}
          connectOnClick={false}
          onInit={(inst) => {
            rfRef.current = inst;
            requestAnimationFrame(() => inst.fitView({ padding: 0.22, duration: 0 }));
          }}
          onEdgeMouseEnter={(_, e) => setHoverEdgeId(e.id)}
          onEdgeMouseLeave={() => setHoverEdgeId(null)}
          onNodeClick={(_, n) => setFocusNodeId((cur) => (cur === n.id ? null : n.id))}
          // Trackpad two-finger pan in fullscreen
          panOnScroll={isFullscreen}
          panOnScrollMode="free"
          zoomOnScroll={!isFullscreen}
          preventScrolling
        >
          <Background />

          {/*  full screen button in non fullscreen */}
          {!isFullscreen && (
            <Panel position="bottom-left">
              <button
                onClick={toggleFullscreen}
                aria-label="Enter fullscreen"
                className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-white/80 backdrop-blur hover:bg-white/10 hover:text-white transition"
              >
                {/* minimalist fullscreen icon */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="opacity-90"
                >
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </Panel>
          )}

          {/* fullscreen */}
          {isFullscreen && (
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
                  <input
                    type="checkbox"
                    checked={hideDom}
                    onChange={(e) => setHideDom(e.target.checked)}
                  />
                  Hide DOM nodes
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hideTabs}
                    onChange={(e) => setHideTabs(e.target.checked)}
                  />
                  Hide tab nodes (context)
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

                <div className="text-[11px] text-white/45">
                  Tip: click a node to “focus path” (neighbors highlighted). Current state has a green outline.
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      <div className="mt-2 text-xs text-white/50">
        Nodes/edges capped in UI for performance. Backend keeps full counts in memory.
      </div>
    </div>
  );
}