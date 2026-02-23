const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";
  
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export type GraphSnapshot = {
  v: number;
  generated_at: number;
  nodes: { id: string; label: string; kind: string; count: number }[];
  edges: { from: string; to: string; count: number; median_ms: number; avg_ms: number }[];
};
