# ThirdLayer Sample: Browser Workflow Graphs + Next-Step Agent + Memory (CDP/Playwright)

This repo demonstrates:
- Browser-native observability using Playwright/CDP (mouse, safe keyboard shortcuts, SPA nav, tab/page lifecycle, coarse DOM mutations).
- Normalization into replayable "Actions".
- Online workflow graph construction (nodes/edges + latency stats).
- Next-step prediction (Markov baseline) and one-step execution (guardrailed).
- Searchable memory store ("procedures" + affordances) that self-updates.

## Safety / Privacy
- Does NOT record typed text.
- Does NOT record key events inside input/textarea/contenteditable.
- Does NOT record password field interactions.
- Element identity uses role/name/testid/id/selector with aggressive sanitization.

---

## Prereqs
- Node.js 20+
- Python 3.11+
- A working local Chrome/Chromium is NOT required (Playwright installs its own)

---

## Setup

### 1) Backend
From repo root:
```bash
cd backend
python -m venv .venv
# mac/linux:
source .venv/bin/activate
# windows (powershell):
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
python -m playwright install chromium
