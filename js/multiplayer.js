import Peer from "peerjs";

const PEER_PREFIX = "sinuq-";
const ROOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CONNECTION_TIMEOUT_MS = 30000;
const PEER_OPTIONS = {
  // Keep PeerJS Cloud as the signaling service, but include TURN over TCP as
  // well as UDP. Mobile carriers and some routers block UDP, which otherwise
  // makes a room work on the same Wi-Fi but fail between distant networks.
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: [
          "turn:eu-0.turn.peerjs.com:3478?transport=udp",
          "turn:eu-0.turn.peerjs.com:3478?transport=tcp",
          "turn:us-0.turn.peerjs.com:3478?transport=udp",
          "turn:us-0.turn.peerjs.com:3478?transport=tcp",
        ],
        username: "peerjs",
        credential: "peerjsp",
      },
    ],
    sdpSemantics: "unified-plan",
  },
};

function createPeer(id) {
  // Do not pin the PeerJS Cloud address here. The library selects its current
  // cloud signaling endpoint; only the ICE fallback is customized above.
  return id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
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
    this.peer = null;
    this.connection = null;
    this.role = null;
    this.timeout = null;
    this.closed = false;
    this.connected = false;
  }

  host(code) {
    this.role = "host";
    this.peer = createPeer(`${PEER_PREFIX}${code}`);
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
    this.peer = createPeer();
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
    this.connected = false;
    this._setTimeout();
    connection.on("open", () => {
      if (this.closed || this.connection !== connection) return;
      this._clearTimeout();
      this.connected = true;
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
      if (this.closed) return;

      // A channel that closes before it ever opens used to leave the lobby
      // looking as if it were still connecting. Surface a terminal failure
      // instead, so the player can return and try the code again.
      if (!this.connected) {
        this._fail("error", new Error("Não foi possível abrir a conexão com esta sala."));
        return;
      }
      this.onStatus?.("disconnected");
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
