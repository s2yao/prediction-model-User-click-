const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";

function httpToWs(url: string) {
  if (url.startsWith("https://")) return url.replace("https://", "wss://");
  if (url.startsWith("http://")) return url.replace("http://", "ws://");
  return url; // fallback
}

export function connectWS(onMessage: (data: any) => void): WebSocket {
  const wsUrl = `${httpToWs(BASE)}/ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)); } catch {}
  };

  return ws;
}