from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List
import time
import re


def now_ms() -> int:
    return int(time.time() * 1000)


def compact_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


@dataclass
class MemoryStore:
    # Minimal searchable memory: store "procedures" discovered from repeated edges and recent sequences.
    items: Dict[str, dict] = field(default_factory=dict)

    def upsert(self, item_id: str, title: str, text: str, tags: List[str] | None = None) -> None:
        self.items[item_id] = {
            "id": item_id,
            "title": compact_whitespace(title)[:120],
            "text": compact_whitespace(text)[:2000],
            "updated_at": now_ms(),
            "tags": tags or [],
        }

    def search(self, q: str, limit: int = 10) -> List[dict]:
        qn = q.lower().strip()
        if not qn:
            return []
        scored = []
        for it in self.items.values():
            hay = (it["title"] + " " + it["text"]).lower()
            score = hay.count(qn)
            if score > 0:
                scored.append((score, it))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [it for _, it in scored[:limit]]
