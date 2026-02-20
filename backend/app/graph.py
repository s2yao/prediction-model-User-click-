from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Tuple
import statistics


@dataclass
class EdgeStat:
    count: int = 0
    dts: List[int] = field(default_factory=list)


@dataclass
class GraphState:
    node_counts: Dict[str, int] = field(default_factory=dict)
    node_meta: Dict[str, Tuple[str, str]] = field(default_factory=dict)  # id -> (label, kind)
    edges: Dict[Tuple[str, str], EdgeStat] = field(default_factory=dict)

    def touch_node(self, node_id: str, label: str, kind: str) -> None:
        self.node_counts[node_id] = self.node_counts.get(node_id, 0) + 1
        if node_id not in self.node_meta:
            self.node_meta[node_id] = (label, kind)

    def add_edge(self, frm: str, to: str, dt: int) -> None:
        key = (frm, to)
        st = self.edges.get(key)
        if st is None:
            st = EdgeStat()
            self.edges[key] = st
        st.count += 1
        st.dts.append(max(0, int(dt)))

    def snapshot(self, now_ms: int):
        nodes = [
            {
                "id": nid,
                "label": self.node_meta.get(nid, (nid, "OTHER"))[0],
                "kind": self.node_meta.get(nid, (nid, "OTHER"))[1],
                "count": self.node_counts.get(nid, 0),
            }
            for nid in self.node_counts.keys()
        ]

        edges = []
        for (frm, to), st in self.edges.items():
            if not st.dts:
                med = 0
                avg = 0
            else:
                med = int(statistics.median(st.dts))
                avg = int(sum(st.dts) / len(st.dts))
            edges.append(
                {
                    "from": frm,
                    "to": to,
                    "count": st.count,
                    "median_ms": med,
                    "avg_ms": avg,
                }
            )

        return {
            "v": 1,
            "generated_at": now_ms,
            "nodes": nodes,
            "edges": edges,
        }
