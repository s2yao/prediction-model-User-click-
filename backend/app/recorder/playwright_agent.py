from __future__ import annotations

import asyncio
import time
import uuid
from typing import Optional, Callable, Any

from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from ..schemas import RawEvent, Action
from .sanitize import scrub_text, safe_host, safe_path, normalize_combo


def now_ms() -> int:
    return int(time.time() * 1000)



INJECTED_SCRIPT = r"""
(() => {
  const now = () => Date.now();

  const isTextInputTarget = (t) => {
    if (!t || t.nodeType !== 1) return false;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") return true;
    if (t.isContentEditable) return true;
    return false;
  };

  const safeKeyCombo = (e) => {
    const k = e.key;
    const modifier = e.ctrlKey || e.altKey || e.metaKey;

    const isSpecial =
      k === "Escape" || k === "Enter" || k === "Tab" ||
      k === "Backspace" || k === "Delete" ||
      (k && k.startsWith && k.startsWith("Arrow")) ||
      /^F\d{1,2}$/.test(k);

    if (!modifier && !isSpecial) return null;

    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.metaKey) parts.push("Meta");
    if (e.shiftKey) parts.push("Shift");
    parts.push(k);
    return parts.join("+");
  };

  const cssEsc = (s) => {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s));
    return String(s).replace(/["\\]/g, "\\$&");
  };

  const stableSelector = (el) => {
    if (!el || el.nodeType !== 1) return null;
    const maxDepth = 6;
    const parts = [];
    let cur = el;

    for (let depth = 0; depth < maxDepth && cur && cur.nodeType === 1; depth++) {
      const tag = cur.tagName.toLowerCase();

      const testid = cur.getAttribute("data-testid");
      if (testid) { parts.unshift(`${tag}[data-testid="${cssEsc(testid)}"]`); break; }

      const aria = cur.getAttribute("aria-label");
      if (aria && aria.length <= 64) { parts.unshift(`${tag}[aria-label="${cssEsc(aria)}"]`); break; }

      const id = cur.id;
      if (id && id.length <= 64) { parts.unshift(`${tag}#${cssEsc(id)}`); break; }

      const cls = (cur.className && typeof cur.className === "string")
        ? cur.className.trim().split(/\s+/).slice(0, 3).filter(Boolean)
        : [];
      const clsPart = cls.length ? "." + cls.map(cssEsc).join(".") : "";

      let nth = "";
      if (cur.parentElement) {
        const sameTag = Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName);
        if (sameTag.length > 1) nth = `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }

      parts.unshift(`${tag}${clsPart}${nth}`);
      cur = cur.parentElement;
    }

    return parts.join(" > ");
  };

  const emit = (type, payload) => {
    try {
      window.__wgr_emit({ v: 1, ts: now(), source: "injected", type, url: location.href, title: document.title || null, payload });
    } catch {}
  };

  document.addEventListener("pointerdown", (e) => {
    const path = (typeof e.composedPath === "function") ? e.composedPath() : null;
    const target = (path && path[0] && path[0].nodeType === 1) ? path[0] : e.target;

    emit("POINTER_DOWN", {
      button: e.button,
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      selector: stableSelector(target),
      tag: target && target.tagName ? String(target.tagName).toLowerCase() : null,
      ariaLabel: target && target.getAttribute ? target.getAttribute("aria-label") : null,
      testid: target && target.getAttribute ? target.getAttribute("data-testid") : null,
      id: target && target.id ? target.id : null
    });
  }, true);

  document.addEventListener("keydown", (e) => {
    if (isTextInputTarget(e.target)) return;
    const combo = safeKeyCombo(e);
    if (!combo) return;
    emit("KEY_SHORTCUT", { combo });
  }, true);

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  const navChanged = (from, to) => emit("URL_CHANGED", { from, to });

  history.pushState = function (...args) {
    const from = location.href;
    const ret = origPush.apply(this, args);
    const to = location.href;
    if (from !== to) navChanged(from, to);
    return ret;
  };

  history.replaceState = function (...args) {
    const from = location.href;
    const ret = origReplace.apply(this, args);
    const to = location.href;
    if (from !== to) navChanged(from, to);
    return ret;
  };

  window.addEventListener("popstate", () => navChanged(null, location.href));

  let last = 0;
  const mo = new MutationObserver((mutations) => {
    const ms = Number(window.__wgr_dom_ms || 1000);
    const t = now();
    if (t - last < ms) return;
    last = t;

    let added = 0, removed = 0, attrs = 0;
    for (const m of mutations) {
      if (m.type === "childList") {
        added += m.addedNodes ? m.addedNodes.length : 0;
        removed += m.removedNodes ? m.removedNodes.length : 0;
      } else if (m.type === "attributes") {
        attrs += 1;
      }
    }
    if (added + removed + attrs === 0) return;
    emit("DOM_MUTATION", { added, removed, attrs });
  });

  const startMO = () => {
    const root = document.body || document.documentElement;
    mo.observe(root, { childList: true, subtree: true, attributes: true });
  };

  if (document.readyState === "complete" || document.readyState === "interactive") startMO();
  else window.addEventListener("DOMContentLoaded", startMO);

  emit("PAGE_READY", { readyState: document.readyState });
})();
"""


class PlaywrightAgent:
    def __init__(
        self,
        dom_mutation_sample_ms: int,
        allowed_hosts: list[str],
        on_event: Callable[[RawEvent], Any],
    ) -> None:
        self.dom_mutation_sample_ms = dom_mutation_sample_ms
        self.allowed_hosts = set(allowed_hosts)
        self.on_event = on_event

        self._pw = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.session_id: Optional[str] = None

        # Guard against double-registering the same binding on the same page.
        self._bridge_lock = asyncio.Lock()
        self._bridged_pages: set[int] = set()

    def _host_allowed(self, url: str) -> bool:
        h = safe_host(url)
        return h in self.allowed_hosts

    async def start(self, url: str) -> str:
        if not self._host_allowed(url):
            raise RuntimeError(f"Host not allowed: {safe_host(url)}")

        self.session_id = str(uuid.uuid4())

        self._pw = await async_playwright().start()
        self.browser = await self._pw.chromium.launch(headless=False)
        self.context = await self.browser.new_context()

        # Ensure init scripts are installed for ALL pages (recommended)
        await self.context.add_init_script(f"window.__wgr_dom_ms = {int(self.dom_mutation_sample_ms)};")
        await self.context.add_init_script(INJECTED_SCRIPT)

        # Create initial page + bridge it first.
        self.page = await self.context.new_page()
        await self._install_bridge(self.page)

        # Correct async handler registration for future pages (popups, new tabs).
        self.context.on("page", lambda p: asyncio.create_task(self._on_new_page(p)))

        print("PLAYWRIGHT_GOTO:", url)
        try:
            resp = await self.page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            print("PLAYWRIGHT_GOTO_DONE:", resp.status if resp else None, "CURRENT_URL:", self.page.url)
        except Exception as e:
            print("GOTO_FAILED:", repr(e))
            await self.stop()
            raise

        await self._emit_backend("TAB_CREATED", {"url": url, "session_id": self.session_id})
        return self.session_id

    async def stop(self) -> None:
        try:
            if self.context:
                await self.context.close()
        except Exception:
            pass
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass
        try:
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass

        self._pw = None
        self.browser = None
        self.context = None
        self.page = None
        self.session_id = None

        # Reset bridge tracking for next session.
        async with self._bridge_lock:
            self._bridged_pages.clear()

    async def _emit_backend(self, typ: str, payload: dict) -> None:
        ev = RawEvent(
            v=1,
            ts=now_ms(),
            source="backend",
            type=typ,  # type: ignore
            url=self.page.url if self.page else "",
            title=None,
            payload=payload,
        )
        await self.on_event(ev)

    async def _on_new_page(self, page: Page) -> None:
        try:
            await self._install_bridge(page)
            await self._emit_backend("TAB_CREATED", {"url": page.url})
            page.on("close", lambda: asyncio.create_task(self._emit_backend("TAB_CLOSED", {"url": page.url})))
        except Exception:
            pass

    async def _install_bridge(self, page: Page) -> None:
        # Idempotent: avoid double expose_binding("__wgr_emit", ...) on the same page
        async with self._bridge_lock:
            pid = id(page)
            if pid in self._bridged_pages:
                return
            self._bridged_pages.add(pid)

        async def _emit_binding(source, payload):
            try:
                ev = RawEvent(**payload)
            except Exception:
                return

            if ev.url and not self._host_allowed(ev.url):
                return

            if ev.type == "POINTER_DOWN":
                p = ev.payload
                p["ariaLabel"] = scrub_text(str(p.get("ariaLabel") or ""))
                p["testid"] = scrub_text(str(p.get("testid") or ""))
                p["id"] = scrub_text(str(p.get("id") or ""))
                sel = str(p.get("selector") or "")
                p["selector"] = sel[:240] if sel else None

            if ev.type == "KEY_SHORTCUT":
                ev.payload["combo"] = scrub_text(str(ev.payload.get("combo") or ""), max_len=32)

            await self.on_event(ev)

        await page.expose_binding("__wgr_emit", _emit_binding)

        page.on(
            "framenavigated",
            lambda frame: asyncio.create_task(
                self._emit_backend("NAV_COMMITTED", {"url": frame.url})
                if frame == page.main_frame
                else asyncio.sleep(0)
            ),
        )

    async def execute(self, action: Action) -> None:
        if not self.page:
            raise RuntimeError("No active page")

        if action.host not in self.allowed_hosts:
            raise RuntimeError("Execution blocked: host not allowed")

        kind = action.kind
        if kind == "CLICK":
            selector = str(action.payload.get("selector") or "")
            if not selector:
                raise RuntimeError("No selector to click")
            await self.page.locator(selector).first.click(timeout=5000)

        elif kind == "NAV":
            url = str(action.payload.get("url") or action.url or "")
            if not url:
                raise RuntimeError("No url to navigate")
            if not self._host_allowed(url):
                raise RuntimeError("Navigation blocked: host not allowed")
            await self.page.goto(url, wait_until="domcontentloaded")

        elif kind == "SHORTCUT":
            combo = normalize_combo(str(action.payload.get("combo") or ""))
            if not combo:
                raise RuntimeError("No shortcut combo")
            await self.page.keyboard.press(combo)

        else:
            raise RuntimeError(f"Execution not implemented for kind={kind}")