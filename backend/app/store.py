from __future__ import annotations
import asyncio
import time
from typing import Optional, List, Dict

from .schemas import RawEvent, Action
from .graph import GraphState
from .predictor import MarkovPredictor
from .memory import MemoryStore


def now_ms() -> int:
    return int(time.time() * 1000)


class AppStore:
    def __init__(self, max_events: int = 20_000):
        self._lock = asyncio.Lock()
        self.max_events = max_events

        self.recording: bool = False
        self.session_id: Optional[str] = None

        self.events: List[RawEvent] = []
        self.actions: List[Action] = []

        self.graph = GraphState()
        self.predictor = MarkovPredictor()
        self.memory = MemoryStore()

        self._last_action_id: Optional[str] = None
        self._last_action_ts: Optional[int] = None

        # For execution: active Playwright "agent"
        self.agent = None  # set by recorder

    async def set_recording(self, on: bool, session_id: Optional[str]) -> None:
        async with self._lock:
            self.recording = on
            self.session_id = session_id

    async def append_event(self, ev: RawEvent) -> None:
        async with self._lock:
            self.events.append(ev)
            if len(self.events) > self.max_events:
                self.events = self.events[-self.max_events :]

    async def append_action(self, act: Action) -> None:
        async with self._lock:
            self.actions.append(act)
            if len(self.actions) > self.max_events:
                self.actions = self.actions[-self.max_events :]

            # update graph + predictor with transition
            self.graph.touch_node(act.id, act.label, act.kind)
            if self._last_action_id is not None and self._last_action_ts is not None:
                dt = act.ts - self._last_action_ts
                self.graph.add_edge(self._last_action_id, act.id, dt)
                self.predictor.observe(self._last_action_id, act.id)

            self._last_action_id = act.id
            self._last_action_ts = act.ts

    async def snapshot_graph(self) -> dict:
        async with self._lock:
            return self.graph.snapshot(now_ms())

    async def get_last_action_id(self) -> Optional[str]:
        async with self._lock:
            return self._last_action_id

    async def get_node_meta(self, node_id: str) -> Optional[dict]:
        async with self._lock:
            if node_id not in self.graph.node_meta:
                return None
            label, kind = self.graph.node_meta[node_id]
            return {"id": node_id, "label": label, "kind": kind, "count": self.graph.node_counts.get(node_id, 0)}

    async def predict_next(self, k: int = 5) -> List[dict]:
        async with self._lock:
            ctx = self._last_action_id
            if not ctx:
                return []
            top = self.predictor.top_k(ctx, k=k)
            out = []
            for nid, cnt in top:
                label, kind = self.graph.node_meta.get(nid, (nid, "OTHER"))
                out.append({"id": nid, "label": label, "kind": kind, "count": cnt})
            return out

    async def clear(self) -> None:
        async with self._lock:
            self.events.clear()
            self.actions.clear()
            self.graph = GraphState()
            self.predictor = MarkovPredictor()
            self.memory = MemoryStore()
            self._last_action_id = None
            self._last_action_ts = None
