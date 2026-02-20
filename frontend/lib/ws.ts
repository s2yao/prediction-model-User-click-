export function connectWS(onMessage: (data: any) => void): WebSocket {
  const ws = new WebSocket("ws://localhost:8000/ws");
  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      // ignore
    }
  };
  return ws;
}
