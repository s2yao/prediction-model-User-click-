from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Tuple, List


@dataclass
class MarkovPredictor:
    # transitions[(a,b)] = count
    transitions: Dict[Tuple[str, str], int] = field(default_factory=dict)
    # outgoing[a] = total outgoing count
    outgoing: Dict[str, int] = field(default_factory=dict)

    def observe(self, a: str, b: str) -> None:
        key = (a, b)
        self.transitions[key] = self.transitions.get(key, 0) + 1
        self.outgoing[a] = self.outgoing.get(a, 0) + 1

    def top_k(self, a: str, k: int = 5) -> List[Tuple[str, int]]:
        # returns [(b, count)]
        cands: List[Tuple[str, int]] = []
        for (frm, to), cnt in self.transitions.items():
            if frm == a:
                cands.append((to, cnt))
        cands.sort(key=lambda x: x[1], reverse=True)
        return cands[:k]
