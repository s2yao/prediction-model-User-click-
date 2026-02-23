from __future__ import annotations

import asyncio
import hashlib
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings
from .schemas import (
    StartSessionRequest,
    StartSessionResponse,
    StopSessionResponse,
    StateResponse,
    PredictResponse,
    ExecuteRequest,
    ExecuteResponse,
    MemorySearchResponse,
    Action,
    RawEvent,
)
from .store import AppStore
from .ws import WSManager
from .recorder.playwright_agent import PlaywrightAgent
from .recorder.sanitize import safe_host, safe_path, scrub_text

app = FastAPI(title="ThirdLayer Sample Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = AppStore(max_events=settings.max_events)
ws_mgr = WSManager()


def action_id_for(kind: str, host: str, path: str, payload: dict) -> str:
    """Return a stable node id for graph merging.

    Important: CLICK nodes should be keyed by semantic identity first
    (testid / aria-label / id) and only fall back to selectors.
    """
    if kind == "CLICK":
        # Prefer stable semantic keys over CSS selectors.
        if payload.get("testid"):
            key = f"testid={payload.get('testid')}"
        elif payload.get("ariaLabel"):
            key = f"aria={payload.get('ariaLabel')}"
        elif payload.get("id"):
            key = f"id={payload.get('id')}"
        else:
            key = f"sel={payload.get('selector') or ''}"

        key = scrub_text(str(key), max_len=160)
        return f"CLICK:{host}{path}:{key}"

    if kind == "SHORTCUT":
        combo = scrub_text(str(payload.get("combo") or ""), max_len=80)
        return f"SHORTCUT:{combo}"

    if kind == "KEYBOARD":
        key = scrub_text(str(payload.get("key") or ""), max_len=40)
        return f"KEY:{key}"

    if kind == "NAV":
        return f"NAV:{host}{path}"

    if kind == "TAB":
        return f"TAB:{host}{path}"

    if kind == "DOM":
        return f"DOM:{host}{path}"

    if kind == "STATE":
        # Stable state identity derived from currently-visible semantic affordances.
        sig = payload.get("sig")
        if not sig:
            testids = payload.get("testids") or []
            if isinstance(testids, list):
                sig = "|".join([str(t) for t in testids])
            else:
                sig = ""
        sig = scrub_text(str(sig), max_len=500)
        h = hashlib.sha1(sig.encode("utf-8")).hexdigest()[:10] if sig else "empty"
        return f"STATE:{host}{path}:{h}"

    return f"OTHER:{host}{path}:{kind}"


def label_for_action(kind: str, host: str, path: str, payload: dict) -> str:
    if kind == "CLICK":
        role = scrub_text(str(payload.get("tag") or ""), max_len=12)
        a = scrub_text(str(payload.get("ariaLabel") or ""))
        t = scrub_text(str(payload.get("testid") or ""))
        i = scrub_text(str(payload.get("id") or ""))
        bits = [b for b in [a, t, i] if b]
        selector = scrub_text(str(payload.get("selector") or ""), max_len=90)
        hint = " / ".join(bits) if bits else (selector or "(unknown element)")
        return f"Click [{role}] {hint}\n{host}{path}"
    if kind == "SHORTCUT":
        return f"Shortcut {payload.get('combo')}\n{host}{path}"
    if kind == "KEYBOARD":
        k = scrub_text(str(payload.get("key") or ""), max_len=40)
        return f"Keyboard {k}\n{host}{path}"
    if kind == "NAV":
        return f"Navigate\n{host}{path}"
    if kind == "TAB":
        return f"Tab\n{host}{path}"
    if kind == "DOM":
        return f"DOM change\n{host}{path}"
    if kind == "STATE":
        testids = payload.get("testids") or []
        preview = ""
        if isinstance(testids, list) and len(testids) > 0:
            shown = [scrub_text(str(t), max_len=28) for t in testids[:4]]
            preview = ", ".join(shown)
            if len(testids) > 4:
                preview += f" +{len(testids) - 4}"
        else:
            preview = scrub_text(str(payload.get("sig") or ""), max_len=80) or "(no testids)"
        return f"State\n{preview}\n{host}{path}"
    return f"{kind}\n{host}{path}"


def event_to_action(ev: RawEvent) -> Action:
    url = ev.url or ev.payload.get("url") or ev.payload.get("to") or ""
    host = safe_host(url)
    path = safe_path(url)

    # normalize event -> action kind
    if ev.type == "POINTER_DOWN":
        kind = "CLICK"
        payload = {
            "selector": ev.payload.get("selector"),
            "tag": ev.payload.get("tag"),
            "ariaLabel": ev.payload.get("ariaLabel"),
            "testid": ev.payload.get("testid"),
            "id": ev.payload.get("id"),
        }
    elif ev.type == "KEY_SHORTCUT":
        kind = "SHORTCUT"
        payload = {"combo": ev.payload.get("combo")}
    elif ev.type == "KEY_DOWN":
        kind = "KEYBOARD"
        payload = {"key": ev.payload.get("key")}
    elif ev.type in ("NAV_COMMITTED", "URL_CHANGED"):
        kind = "NAV"
        # store full url for replay; still privacy-sensitive, but this is local demo
        payload = {"url": url}
    elif ev.type in ("TAB_CREATED", "TAB_CLOSED"):
        kind = "TAB"
        payload = {"url": url}
    elif ev.type == "DOM_MUTATION":
        kind = "DOM"
        payload = {"added": ev.payload.get("added"), "removed": ev.payload.get("removed"), "attrs": ev.payload.get("attrs")}
    elif ev.type == "STATE_SNAPSHOT":
        kind = "STATE"
        raw = ev.payload.get("testids") or []
        testids = [str(t) for t in raw] if isinstance(raw, list) else []
        testids = sorted(set(testids))
        sig = "|".join(testids)
        payload = {
            "reason": ev.payload.get("reason"),
            "testids": testids,
            "sig": scrub_text(sig, max_len=500),
            "n": len(testids),
        }
    else:
        kind = "OTHER"
        payload = {}

    aid = action_id_for(kind, host, path, payload)
    label = label_for_action(kind, host, path, payload)

    return Action(
        id=aid,
        ts=ev.ts,
        kind=kind,  # type: ignore
        url=url,
        host=host,
        path=path,
        label=label,
        payload=payload,
    )


async def on_event(ev: RawEvent) -> None:
    # store + broadcast event
    await store.append_event(ev)
    act = event_to_action(ev)
    await store.append_action(act)

    # update memory opportunistically
    # simplistic: store last few transitions as "procedure hints"
    # (good enough for MVP; replace with real procedure mining later)
    last = await store.get_last_action_id()
    if last:
        store.memory.upsert(
            item_id=f"hint:{store.session_id or 'nosess'}:{last}",
            title="Recent step",
            text=act.label,
            tags=[act.host],
        )

    await ws_mgr.broadcast_json({"type": "event", "event": ev.model_dump()})
    # periodic graph snapshots are handled client-side by polling endpoint,
    # but we can also push a lightweight hint:
    await ws_mgr.broadcast_json({"type": "action", "action": act.model_dump()})


@app.get("/api/state", response_model=StateResponse)
async def get_state():
    return StateResponse(recording=store.recording, session_id=store.session_id, allowed_hosts=settings.allowed_hosts)


from fastapi import HTTPException

@app.post("/api/session/start", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest):
    if store.recording:
        return StartSessionResponse(ok=True, session_id=store.session_id)

    url = req.url.strip()
    host = safe_host(url)

    if host not in settings.allowed_hosts:
        raise HTTPException(
            status_code=400,
            detail=f"Host not allowed: {host}. allowed_hosts={settings.allowed_hosts}",
        )

    # Session boundary: do NOT allow edges to connect across recorder sessions.
    # Also prevent stale session_id during the initial burst of events from agent.start().
    await store.set_recording(False, None)
    await store.reset_context()

    agent = PlaywrightAgent(
        dom_mutation_sample_ms=settings.dom_mutation_sample_ms,
        allowed_hosts=settings.allowed_hosts,
        on_event=on_event,
    )
    store.agent = agent

    try:
        session_id = await agent.start(url)
    except Exception as e:
        # Make failure explicit and visible
        store.agent = None
        try:
            await agent.stop()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Playwright start failed: {repr(e)}")

    await store.set_recording(True, session_id)
    return StartSessionResponse(ok=True, session_id=session_id)


@app.post("/api/session/stop", response_model=StopSessionResponse)
async def stop_session():
    if not store.recording:
        return StopSessionResponse(ok=True)

    try:
        if store.agent:
            await store.agent.stop()
    finally:
        store.agent = None
        await store.set_recording(False, None)

    return StopSessionResponse(ok=True)


@app.get("/api/graph")
async def get_graph():
    return await store.snapshot_graph()


@app.get("/api/predict", response_model=PredictResponse)
async def predict():
    # Prediction context should be the latest STATE snapshot when available,
    # since it represents the user's current "screen" / affordances.
    ctx = await store.get_last_state_id() or await store.get_last_workflow_action_id()
    ctx_meta = await store.get_node_meta(ctx) if ctx else None
    preds = await store.predict_next(k=5)
    return PredictResponse(ok=True, context_node=ctx, context=ctx_meta, predictions=preds)  # type: ignore


@app.post("/api/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest):
    if not store.recording or not store.agent:
        return ExecuteResponse(ok=False, error="No active session")

    # find action by id (recent window)
    action: Action | None = None
    for a in reversed(store.actions):
        if a.id == req.action_id:
            action = a
            break

    if not action:
        return ExecuteResponse(ok=False, error="Action not found")

    try:
        await store.agent.execute(action)
        return ExecuteResponse(ok=True)
    except Exception as e:
        return ExecuteResponse(ok=False, error=str(e))


@app.get("/api/memory/search", response_model=MemorySearchResponse)
async def memory_search(q: str = ""):
    results = store.memory.search(q, limit=10)
    return MemorySearchResponse(ok=True, results=results)  # type: ignore


@app.post("/api/clear")
async def clear_all():
    await store.clear()
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_mgr.connect(ws)
    try:
        await ws.send_json({"type": "hello", "recording": store.recording, "session_id": store.session_id})
        while True:
            # keep alive / allow future commands
            msg = await ws.receive_text()
            if msg.strip() == "ping":
                await ws.send_text("pong")
    except Exception:
        pass
    finally:
        await ws_mgr.disconnect(ws)