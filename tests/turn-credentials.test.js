import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../api/turn-credentials.js";

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("API de credenciais TURN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("permite que GitHub Pages solicite credenciais sem expor segredos", async () => {
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "");
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "");
    const response = createResponse();

    await handler(
      { method: "GET", headers: { origin: "https://tiago21221.github.io" } },
      response
    );

    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://tiago21221.github.io");
    expect(response.headers.Vary).toBe("Origin");
    expect(response.statusCode).toBe(503);
  });

  it("responde ao preflight CORS do site Vercel", async () => {
    const response = createResponse();

    await handler(
      { method: "OPTIONS", headers: { origin: "https://sinuca3d.vercel.app" } },
      response
    );

    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://sinuca3d.vercel.app");
    expect(response.statusCode).toBe(204);
  });

  it("não autoriza origens que não sejam os sites publicados", async () => {
    const response = createResponse();

    await handler(
      { method: "GET", headers: { origin: "https://example.com" } },
      response
    );

    expect(response.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
