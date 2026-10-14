import Peer from "peerjs";

const PEER_PREFIX = "sinuq-";
const PEER_OPTIONS = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
};
const ROOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

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
  }

  host(code) {
    this.role = "host";
    this.peer = new Peer(`${PEER_PREFIX}${code}`, PEER_OPTIONS);
    this._bindPeer();
    this.peer.on("connection", (connection) => {
      if (this.connection) {
        connection.close();
        return;
      }
      this._bindConnection(connection);
    });
    this.onStatus?.("waiting");
  }

  join(code) {
    this.role = "join";
    this.peer = new Peer(undefined, PEER_OPTIONS);
    this._bindPeer();
    this.peer.on("open", () => {
      this.onStatus?.("connecting");
      const connection = this.peer.connect(`${PEER_PREFIX}${code}`, { reliable: true });
      this._bindConnection(connection);
    });
  }

  _bindPeer() {
    this.peer.on("error", (error) => {
      this.onStatus?.("error", error);
    });
    this.peer.on("disconnected", () => {
      this.onStatus?.("disconnected");
    });
  }

  _bindConnection(connection) {
    this.connection = connection;
    connection.on("open", () => {
      this.onStatus?.("connected");
      if (this.role === "join") this.send({ type: "join" });
    });
    connection.on("data", (message) => this.onMessage?.(message));
    connection.on("error", (error) => this.onStatus?.("error", error));
    connection.on("close", () => {
      if (this.connection === connection) this.connection = null;
      this.onStatus?.("disconnected");
    });
  }

  send(message) {
    if (!this.connection?.open) {
      throw new Error("A conexão com o outro jogador não está aberta.");
    }
    this.connection.send(message);
  }

  close() {
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
  }
}
