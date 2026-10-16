import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerSession } from "../js/multiplayer.js";

function jsonResponse(payload, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(payload) };
}

describe("conexão entre dispositivos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { location: { hostname: "sinuca3d.vercel.app", href: "https://sinuca3d.vercel.app/" } });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("conecta o anfitrião quando recebe a entrada do outro jogador", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ events: [{ id: 1, sender: "b".repeat(32), payload: { type: "join" } }] }));
    const onStatus = vi.fn();
    const onMessage = vi.fn();
    const session = new MultiplayerSession({ onStatus, onMessage });

    await session.host("abc234");
    await vi.runAllTicks();

    expect(onStatus).toHaveBeenCalledWith("waiting");
    expect(onStatus).toHaveBeenCalledWith("connected");
    expect(onMessage).toHaveBeenCalledWith({ type: "join" });
    expect(fetch.mock.calls[0][0].toString()).toContain("action=create");
  });

  it("encerra a entrada quando nenhum anfitrião responde", async () => {
    fetch.mockResolvedValue(jsonResponse({ events: [] }));
    const onStatus = vi.fn();
    const session = new MultiplayerSession({ onStatus });

    await session.join("abc234");
    await vi.advanceTimersByTimeAsync(180000);

    expect(onStatus).toHaveBeenCalledWith("timeout", undefined);
  });

  it("publica mensagens da partida pelo relay HTTPS", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ events: [{ id: 1, sender: "b".repeat(32), payload: { type: "join" } }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const session = new MultiplayerSession({ onStatus: vi.fn() });

    await session.host("abc234");
    await vi.runAllTicks();
    session.send({ type: "shot", shot: { power: 0.5 } });
    await vi.runAllTicks();

    const request = fetch.mock.calls.find(([url]) => url.toString().includes("action=event"));
    expect(request[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(request[1].body).payload).toEqual({ type: "shot", shot: { power: 0.5 } });
  });
});
