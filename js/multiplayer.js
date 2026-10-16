const ROOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CONNECTION_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 900;
const RELAY_API_ORIGIN = "https://sinuca3d.vercel.app";

function getRelayEndpoint() {
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) return "/api/multiplayer";
  return `${RELAY_API_ORIGIN}/api/multiplayer`;
}

function makeClientId() {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function relayRequest(action, { method = "GET", body, params = {} } = {}) {
  const baseUrl = typeof window !== "undefined" ? window.location.href : RELAY_API_ORIGIN;
  const url = new URL(getRelayEndpoint(), baseUrl);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "O servidor da partida não respondeu.");
  return payload;
}

export function createRoomCode() {
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return [...values].map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

export class MultiplayerSession {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.role = null;
    this.code = null;
    this.clientId = makeClientId();
    this.connection = null;
    this.after = 0;
    this.timeout = null;
    this.pollTimer = null;
    this.closed = false;
  }

  async host(code) {
    this.role = "host";
    this.code = code;
    this.onStatus?.("connecting");
    try {
      await relayRequest("create", { method: "POST", body: { code, clientId: this.clientId } });
      if (this.closed) return;
      this.onStatus?.("waiting");
      await this._poll();
    } catch (error) {
      this._fail("error", error);
    }
  }

  async join(code) {
    this.role = "join";
    this.code = code;
    this.onStatus?.("connecting");
    this._setTimeout();
    try {
      await relayRequest("join", { method: "POST", body: { code, clientId: this.clientId } });
      if (this.closed) return;
      await this._poll();
    } catch (error) {
      this._fail("error", error);
    }
  }

  async _poll() {
    if (this.closed) return;
    try {
      const { events = [] } = await relayRequest("poll", {
        params: { code: this.code, clientId: this.clientId, after: this.after },
      });
      for (const event of events) {
        this.after = Math.max(this.after, Number(event.id) || 0);
        if (event.sender === this.clientId || !event.payload) continue;
        this._markConnected();
        this.onMessage?.(event.payload);
      }
      this._schedulePoll();
    } catch (error) {
      if (!this.closed) this._schedulePoll();
    }
  }

  _schedulePoll() {
    if (!this.closed) this.pollTimer = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
  }

  _markConnected() {
    if (this.connection?.open) return;
    this.connection = { open: true };
    this._clearTimeout();
    this.onStatus?.("connected");
  }

  _setTimeout() {
    this._clearTimeout();
    this.timeout = setTimeout(() => this._fail("timeout"), CONNECTION_TIMEOUT_MS);
  }

  _clearTimeout() {
    if (this.timeout === null) return;
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  _fail(status, error) {
    if (this.closed) return;
    this.closed = true;
    this._clearTimeout();
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.connection = null;
    this.onStatus?.(status, error);
  }

  send(message) {
    if (!this.connection?.open) throw new Error("A conexão com o outro jogador não está aberta.");
    relayRequest("event", { method: "POST", body: { code: this.code, clientId: this.clientId, payload: message } })
      .catch((error) => this._fail("error", error));
  }

  close() {
    this.closed = true;
    this._clearTimeout();
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.connection = null;
  }
}
