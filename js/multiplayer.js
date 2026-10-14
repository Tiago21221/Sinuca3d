import Peer from "peerjs";

const PEER_PREFIX = "sinuq-";
const ROOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CONNECTION_TIMEOUT_MS = 30000;
const PEERJS_ICE_SERVERS = [
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
];
const TURN_API_ORIGIN = "https://sinuca3d.vercel.app";
const OPEN_RELAY_HOST = "staticauth.openrelay.metered.ca";
const OPEN_RELAY_SECRET = "openrelayprojectsecret";
const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60;

function getTurnCredentialsEndpoint() {
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
    return "/api/turn-credentials";
  }
  return `${TURN_API_ORIGIN}/api/turn-credentials`;
}

function base64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function createOpenRelayIceServers() {
  // Open Relay publishes this static-auth endpoint and secret for compatible
  // clients. The browser creates a short-lived TURN credential; the secret is
  // not a private application credential. Ports 80 and 443 make this work on
  // networks that block WebRTC's usual UDP port.
  const username = `${Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS}:sinuquinha`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(OPEN_RELAY_SECRET),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));

  return [
    {
      urls: [
        `turn:${OPEN_RELAY_HOST}:80?transport=udp`,
        `turn:${OPEN_RELAY_HOST}:80?transport=tcp`,
        `turn:${OPEN_RELAY_HOST}:443?transport=udp`,
        `turn:${OPEN_RELAY_HOST}:443?transport=tcp`,
        `turns:${OPEN_RELAY_HOST}:443?transport=tcp`,
      ],
      username,
      credential: base64(signature),
    },
  ];
}

async function fetchManagedIceServers() {
  const response = await fetch(getTurnCredentialsEndpoint(), { cache: "no-store" });
  if (!response.ok) throw new Error("O relay gerenciado não está disponível.");
  const payload = await response.json();
  if (!Array.isArray(payload?.iceServers) || payload.iceServers.length === 0) {
    throw new Error("O relay gerenciado retornou uma configuração inválida.");
  }
  return payload.iceServers;
}

async function createPeerOptions(onRelayUnavailable) {
  let iceServers;
  try {
    // When configured on Vercel, this uses short-lived credentials generated
    // by our serverless function. It is the reliable production path.
    iceServers = await fetchManagedIceServers();
  } catch (error) {
    onRelayUnavailable?.(error);
    // Keep a public TURN fallback for deployments without managed credentials.
    iceServers = await createOpenRelayIceServers();
  }

  return {
    config: {
      // Prefer a direct path when possible; TURN-only mode prevents even
      // same-network connections whenever a public relay is unreachable.
      iceTransportPolicy: "all",
      iceServers: [...PEERJS_ICE_SERVERS, ...iceServers],
      sdpSemantics: "unified-plan",
    },
  };
}

async function createPeer(id, onRelayUnavailable) {
  // Do not pin the PeerJS Cloud address: PeerJS still handles signaling, while
  // the options above supply the relay that carries the game across networks.
  const options = await createPeerOptions(onRelayUnavailable);
  return id ? new Peer(id, options) : new Peer(options);
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

  async host(code) {
    this.role = "host";
    this.onStatus?.("connecting");
    this._setTimeout();
    try {
      this.peer = await createPeer(`${PEER_PREFIX}${code}`, (error) => {
        if (!this.closed) this.onStatus?.("relay-unavailable", error);
      });
    } catch (error) {
      this._fail("error", error);
      return;
    }
    if (this.closed) {
      this.peer.destroy();
      this.peer = null;
      return;
    }
    this._bindPeer();
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
  }

  async join(code) {
    this.role = "join";
    this.onStatus?.("connecting");
    this._setTimeout();
    try {
      this.peer = await createPeer(null, (error) => {
        if (!this.closed) this.onStatus?.("relay-unavailable", error);
      });
    } catch (error) {
      this._fail("error", error);
      return;
    }
    if (this.closed) {
      this.peer.destroy();
      this.peer = null;
      return;
    }
    this._bindPeer();
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
