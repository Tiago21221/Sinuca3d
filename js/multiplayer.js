import Peer from "peerjs";

const PEER_PREFIX = "sinuq-";
const PEER_OPTIONS = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
};
const ROOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CONNECTION_TIMEOUT_MS = 30000;

export function createRoomCode() {
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return [...values].map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

export class MultiplayerSession {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.peer = null;
    this.connection = null;
    this.role = null;
    this.timeout = null;
    this.closed = false;
  }

  host(code) {
    this.role = "host";
    this.peer = new Peer(`${PEER_PREFIX}${code}`, PEER_OPTIONS);
    this._bindPeer();
    this._setTimeout();
    this.peer.on("open", () => {
      if (this.closed) return;
      this._clearTimeout();
      this.onStatus?.("waiting");
    });
    this.peer.on("connection", (connection) => {
      if (this.closed) {
        connection.close();
        return;
      }
      if (this.connection) {
        connection.close();
        return;
      }
      this._bindConnection(connection);
    });
    this.onStatus?.("connecting");
  }

  join(code) {
    this.role = "join";
    this.peer = new Peer(undefined, PEER_OPTIONS);
    this._bindPeer();
    this._setTimeout();
    this.peer.on("open", () => {
      if (this.closed) return;
      this._clearTimeout();
      this.onStatus?.("connecting");
      const connection = this.peer.connect(`${PEER_PREFIX}${code}`, { reliable: true });
      this._bindConnection(connection);
    });
  }

  _bindPeer() {
    this.peer.on("error", (error) => {
      this._fail("error", error);
    });
    this.peer.on("disconnected", () => {
      if (!this.closed) this.onStatus?.("disconnected");
    });
  }

  _bindConnection(connection) {
    this.connection = connection;
    this._setTimeout();
    connection.on("open", () => {
      if (this.closed || this.connection !== connection) return;
      this._clearTimeout();
      this.onStatus?.("connected");
      if (this.role === "join") this.send({ type: "join" });
    });
    connection.on("data", (message) => {
      if (!this.closed && this.connection === connection) this.onMessage?.(message);
    });
    connection.on("error", (error) => {
      if (this.connection === connection) this._fail("error", error);
    });
    connection.on("close", () => {
      if (this.connection === connection) this.connection = null;
      this._clearTimeout();
      if (!this.closed) this.onStatus?.("disconnected");
    });
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
    const connection = this.connection;
    const peer = this.peer;
    this.connection = null;
    this.peer = null;
    connection?.close();
    peer?.destroy();
    this.onStatus?.(status, error);
  }

  send(message) {
    if (!this.connection?.open) {
      throw new Error("A conexão com o outro jogador não está aberta.");
    }
    this.connection.send(message);
  }

  close() {
    this.closed = true;
    this._clearTimeout();
    this.connection?.close();
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
  }
}
