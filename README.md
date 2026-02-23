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
---

### How to use
- Click start session to open http://localhost:3000/demo, where all user action will be recorded
- Recorded actions are displayed in Workflow Graph (go fullscreen) and Live Timeline
- Next-step prediction is made using Markov Baseline
- "Most likely next step" is shown, based on the user's number of clicks in each state

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
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

### 2) Frontend
cd frontend
npm install
npm run dev
