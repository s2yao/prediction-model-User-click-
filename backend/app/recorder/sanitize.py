from __future__ import annotations
import re

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
LONG_NUM_RE = re.compile(r"\b\d{6,}\b")

def scrub_text(s: str, max_len: int = 64) -> str:
    if not s:
        return ""
    s = s.strip()
    s = EMAIL_RE.sub("[redacted-email]", s)
    s = LONG_NUM_RE.sub("[redacted-number]", s)
    s = re.sub(r"\s+", " ", s)
    return s[:max_len]

def safe_host(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc
    except Exception:
        return ""

def safe_path(url: str) -> str:
    try:
        from urllib.parse import urlparse
        p = urlparse(url).path or "/"
        return p
    except Exception:
        return "/"

def normalize_combo(combo: str) -> str:
    # injected script sends: Ctrl+Shift+K etc
    # Playwright expects: Control+Shift+K
    if not combo:
        return ""
    parts = combo.split("+")
    out = []
    for p in parts:
        if p == "Ctrl":
            out.append("Control")
        elif p == "Meta":
            out.append("Meta")
        else:
            out.append(p)
    return "+".join(out)
