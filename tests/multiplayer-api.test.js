import { afterEach, describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import handler from "../api/multiplayer.js";

vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));

function createResponse() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

describe("API de partidas", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("informa quando a conexão secreta do Neon não foi configurada", async () => {
    vi.stubEnv("NEON_DATABASE_URL", "");
    const response = createResponse();
    await handler({ method: "GET", headers: {}, query: {} }, response);
    expect(response.statusCode).toBe(503);
  });

  it("cria uma sala sem expor a URL do banco ao navegador", async () => {
    vi.stubEnv("NEON_DATABASE_URL", "postgresql://secret");
    const sql = vi.fn();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ code: "abc234" }]);
    neon.mockReturnValue(sql);
    const response = createResponse();

    await handler({ method: "POST", headers: { origin: "https://tiago21221.github.io" }, query: { action: "create" }, body: { code: "abc234", clientId: "a".repeat(32) } }, response);

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(neon).toHaveBeenCalledWith("postgresql://secret");
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://tiago21221.github.io");
  });
});
