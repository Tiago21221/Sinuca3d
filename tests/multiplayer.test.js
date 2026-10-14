import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Peer from "peerjs";
import { MultiplayerSession } from "../js/multiplayer.js";

vi.mock("peerjs", () => ({ default: vi.fn() }));

function createEmitter(methods = {}) {
  const listeners = new Map();
  return {
    on(event, callback) {
      const callbacks = listeners.get(event) || [];
      callbacks.push(callback);
      listeners.set(event, callbacks);
      return this;
    },
    emit(event, ...args) {
      for (const callback of listeners.get(event) || []) callback(...args);
    },
    ...methods,
  };
}

describe("conexão entre dispositivos", () => {
  let peer;
  let connection;

  beforeEach(() => {
    vi.useFakeTimers();
    connection = createEmitter({
      open: false,
      send: vi.fn(),
      close: vi.fn(),
    });
    peer = createEmitter({
      destroy: vi.fn(),
      connect: vi.fn(() => connection),
    });
    Peer.mockReturnValue(peer);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("encerra uma tentativa que fica presa ao abrir o canal WebRTC", async () => {
    const onStatus = vi.fn();
    const session = new MultiplayerSession({ onStatus });

    await session.join("abc234");
    peer.emit("open");
    vi.advanceTimersByTime(30000);

    expect(onStatus).toHaveBeenCalledWith("timeout", undefined);
    expect(peer.destroy).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("limpa o timeout e envia a entrada quando o canal abre", async () => {
    const onStatus = vi.fn();
    const session = new MultiplayerSession({ onStatus });

    await session.join("abc234");
    peer.emit("open");
    connection.open = true;
    connection.emit("open");
    vi.advanceTimersByTime(30000);

    expect(onStatus).toHaveBeenCalledWith("connected");
    expect(onStatus).not.toHaveBeenCalledWith("timeout", expect.anything());
    expect(connection.send).toHaveBeenCalledWith({ type: "join" });
    expect(peer.destroy).not.toHaveBeenCalled();
  });

  it("só informa que a sala está pronta depois do registro no servidor", async () => {
    const onStatus = vi.fn();
    const session = new MultiplayerSession({ onStatus });

    await session.host("abc234");
    expect(onStatus).toHaveBeenCalledWith("connecting");

    peer.emit("open");
    expect(onStatus).toHaveBeenLastCalledWith("waiting");
  });

  it("informa a falha quando o canal fecha antes de conectar", async () => {
    const onStatus = vi.fn();
    const session = new MultiplayerSession({ onStatus });

    await session.join("abc234");
    peer.emit("open");
    connection.emit("close");

    expect(onStatus).toHaveBeenCalledWith("error", expect.any(Error));
    expect(peer.destroy).toHaveBeenCalledOnce();
  });

  it("allows direct ICE connections while keeping TURN relays available", async () => {
    const session = new MultiplayerSession({ onStatus: vi.fn() });

    await session.host("abc234");

    const options = Peer.mock.calls[0][1];
    expect(options.config.iceTransportPolicy).toBe("all");
    expect(options.config.iceServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ urls: "stun:stun.l.google.com:19302" }),
        expect.objectContaining({
          username: "peerjs",
          credential: "peerjsp",
        }),
      ])
    );
  });
});
