import { create } from "zustand";
import type { GraphSnapshot } from "@/lib/api";

type Event = {
  ts: number;
  type: string;
  url?: string;
  title?: string | null;
  payload?: any;
  source?: string;
};

type Action = {
  id: string;
  ts: number;
  kind: string;
  label: string;
  payload?: any;
};

type MemoryItem = {
  id: string;
  title: string;
  text: string;
  updated_at: number;
  tags: string[];
};

type State = {
  recording: boolean;
  sessionId: string | null;

  targetUrl: string;

  events: Event[];
  actions: Action[];

  graph: GraphSnapshot | null;

  predictions: { id: string; label: string; kind: string; count: number }[];

  memoryQuery: string;
  memoryResults: MemoryItem[];

  setTargetUrl: (u: string) => void;
  setRecording: (r: boolean, sessionId: string | null) => void;

  pushEvent: (e: Event) => void;
  pushAction: (a: Action) => void;

  setGraph: (g: GraphSnapshot) => void;
  setPredictions: (p: State["predictions"]) => void;

  setMemoryQuery: (q: string) => void;
  setMemoryResults: (r: MemoryItem[]) => void;

  clearLocal: () => void;
};

export const useAppStore = create<State>((set, get) => ({
  recording: false,
  sessionId: null,

  targetUrl: "http://localhost:3000/demo",

  events: [],
  actions: [],
  graph: null,
  predictions: [],
  memoryQuery: "",
  memoryResults: [],

  setTargetUrl: (u) => set({ targetUrl: u }),
  setRecording: (r, sessionId) => set({ recording: r, sessionId }),

  pushEvent: (e) => {
    const next = [...get().events, e].slice(-2000);
    set({ events: next });
  },
  pushAction: (a) => {
    const next = [...get().actions, a].slice(-2000);
    set({ actions: next });
  },

  setGraph: (g) => set({ graph: g }),
  setPredictions: (p) => set({ predictions: p }),

  setMemoryQuery: (q) => set({ memoryQuery: q }),
  setMemoryResults: (r) => set({ memoryResults: r }),

  clearLocal: () => set({ events: [], actions: [], graph: null, predictions: [], memoryResults: [] })
}));
