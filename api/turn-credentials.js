const TURN_API_BASE = "https://rtc.live.cloudflare.com/v1/turn/keys";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) {
    response.status(503).json({ error: "Relay gerenciado ainda não foi configurado." });
    return;
  }

  try {
    const relayResponse = await fetch(
      `${TURN_API_BASE}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 3600 }),
      }
    );
    const payload = await relayResponse.json();
    if (!relayResponse.ok || !Array.isArray(payload?.iceServers)) {
      throw new Error("A Cloudflare não retornou credenciais TURN válidas.");
    }

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({ iceServers: payload.iceServers });
  } catch (error) {
    response.status(502).json({ error: error.message || "Não foi possível obter as credenciais do relay." });
  }
}
