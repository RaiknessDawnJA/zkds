/**
 * A controllable stand-in for the browser WebSocket global, for tests that
 * need to drive the connect -> open -> message -> close lifecycle by hand
 * without a real server. Install via `vi.stubGlobal("WebSocket", FakeWebSocket)`.
 */
type Listener = (event: { data?: string }) => void;

export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static reset() {
    FakeWebSocket.instances = [];
  }
  /** The most recently constructed instance — usually what a test wants. */
  static get latest(): FakeWebSocket {
    const instance = FakeWebSocket.instances.at(-1);
    if (!instance) throw new Error("No FakeWebSocket has been constructed yet");
    return instance;
  }

  readonly url: string;
  readyState = 0;
  private listeners: Partial<Record<string, Listener[]>> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: Listener) {
    (this.listeners[type] ??= []).push(handler);
  }

  removeEventListener(type: string, handler: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((h) => h !== handler);
  }

  close() {
    this.readyState = 3;
    this.emit("close", {});
  }

  private emit(type: string, event: { data?: string }) {
    for (const handler of this.listeners[type] ?? []) handler(event);
  }

  /** Test-only: simulate the server accepting the connection. */
  simulateOpen() {
    this.readyState = 1;
    this.emit("open", {});
  }

  /** Test-only: simulate a broadcast arriving from the server. */
  simulateMessage(data: unknown) {
    this.emit("message", { data: JSON.stringify(data) });
  }

  /** Test-only: simulate the connection dropping. */
  simulateClose() {
    this.close();
  }
}
