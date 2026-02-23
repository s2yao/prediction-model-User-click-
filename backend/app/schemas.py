from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional


EventType = Literal[
    "PAGE_READY",
    "POINTER_DOWN",
    "KEY_SHORTCUT",
    "KEY_DOWN",
    "URL_CHANGED",
    "NAV_COMMITTED",
    "TAB_CREATED",
    "TAB_CLOSED",
    "DOM_MUTATION",
    "STATE_SNAPSHOT",
]

ActionKind = Literal[
    "CLICK",
    "SHORTCUT",
    "KEYBOARD",
    "MOUSE",
    "NAV",
    "TAB",
    "DOM",
    "STATE",
    "OTHER",
]


class RawEvent(BaseModel):
    v: int = 1
    ts: int
    source: Literal["injected", "backend"]
    type: EventType
    url: str = ""
    title: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class Action(BaseModel):
    id: str
    ts: int
    kind: ActionKind
    url: str
    host: str
    path: str
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class GraphNode(BaseModel):
    id: str
    label: str
    kind: ActionKind
    count: int = 0


class GraphEdge(BaseModel):
    frm: str = Field(alias="from")
    to: str
    count: int
    median_ms: int
    avg_ms: int


class GraphSnapshot(BaseModel):
    v: int = 1
    generated_at: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class StartSessionRequest(BaseModel):
    url: str


class StartSessionResponse(BaseModel):
    ok: bool
    session_id: Optional[str] = None


class StopSessionResponse(BaseModel):
    ok: bool


class StateResponse(BaseModel):
    recording: bool
    session_id: Optional[str]
    allowed_hosts: list[str]


class PredictResponse(BaseModel):
    ok: bool
    # The node used as the prediction context (workflow-only; DOM/TAB excluded).
    context_node: Optional[str]
    # Full metadata for the context node (for UI display).
    context: Optional[GraphNode] = None
    predictions: list[GraphNode]


class ExecuteRequest(BaseModel):
    action_id: str


class ExecuteResponse(BaseModel):
    ok: bool
    error: Optional[str] = None


class MemoryItem(BaseModel):
    id: str
    title: str
    text: str
    updated_at: int
    tags: list[str] = Field(default_factory=list)


class MemorySearchResponse(BaseModel):
    ok: bool
    results: list[MemoryItem]