import { neon } from "@neondatabase/serverless";

const ALLOWED_ORIGINS = new Set(["https://tiago21221.github.io", "https://sinuca3d.vercel.app"]);
const ROOM_CODE = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;
const CLIENT_ID = /^[a-f0-9]{32}$/;

function setCors(request, response) {
  const origin = request.headers.origin;
  response.setHeader("Vary", "Origin");
  if (ALLOWED_ORIGINS.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function validRoom(code) { return typeof code === "string" && ROOM_CODE.test(code); }
function validClient(id) { return typeof id === "string" && CLIENT_ID.test(id); }

async function prepareDatabase(sql) {
  await sql`CREATE TABLE IF NOT EXISTS sinuq_rooms (code varchar(6) PRIMARY KEY, host_id varchar(32) NOT NULL, join_id varchar(32), expires_at timestamptz NOT NULL DEFAULT now() + interval '4 hours')`;
  await sql`CREATE TABLE IF NOT EXISTS sinuq_events (id bigserial PRIMARY KEY, room_code varchar(6) NOT NULL REFERENCES sinuq_rooms(code) ON DELETE CASCADE, sender_id varchar(32) NOT NULL, recipient_id varchar(32), payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS sinuq_events_room_id ON sinuq_events(room_code, id)`;
  await sql`DELETE FROM sinuq_rooms WHERE expires_at < now()`;
}

function parseBody(body) { return typeof body === "string" ? JSON.parse(body) : body || {}; }
function decodePayload(payload) {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  setCors(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ error: "Método não permitido." });
  if (!process.env.NEON_DATABASE_URL) return response.status(503).json({ error: "Servidor de partidas ainda não foi configurado." });

  try {
    const sql = neon(process.env.NEON_DATABASE_URL);
    await prepareDatabase(sql);
    const action = request.query?.action;
    const input = request.method === "POST" ? parseBody(request.body) : request.query || {};
    const { code, clientId } = input;
    if (!validRoom(code) || !validClient(clientId)) return response.status(400).json({ error: "Dados da sala inválidos." });

    if (action === "create") {
      const rows = await sql`INSERT INTO sinuq_rooms (code, host_id) VALUES (${code}, ${clientId}) ON CONFLICT DO NOTHING RETURNING code`;
      if (!rows.length) return response.status(409).json({ error: "Este código de sala já está em uso. Crie outra sala." });
      return response.status(201).json({ ok: true });
    }
    if (action === "join") {
      const rooms = await sql`UPDATE sinuq_rooms SET join_id = ${clientId} WHERE code = ${code} AND expires_at > now() AND (join_id IS NULL OR join_id = ${clientId}) RETURNING host_id`;
      if (!rooms.length) return response.status(404).json({ error: "Sala inexistente, expirada ou já cheia." });
      await sql`INSERT INTO sinuq_events (room_code, sender_id, recipient_id, payload) VALUES (${code}, ${clientId}, ${rooms[0].host_id}, ${JSON.stringify({ type: "join" })}::jsonb)`;
      return response.status(200).json({ ok: true });
    }

    const rooms = await sql`SELECT host_id, join_id FROM sinuq_rooms WHERE code = ${code} AND expires_at > now()`;
    const room = rooms[0];
    if (!room || (room.host_id !== clientId && room.join_id !== clientId)) return response.status(404).json({ error: "Sala inexistente ou acesso não autorizado." });
    if (action === "event") {
      const payload = input.payload;
      if (!payload || typeof payload !== "object" || typeof payload.type !== "string") return response.status(400).json({ error: "Mensagem inválida." });
      const text = JSON.stringify(payload);
      if (text.length > 16000) return response.status(413).json({ error: "Mensagem muito grande." });
      await sql`INSERT INTO sinuq_events (room_code, sender_id, payload) VALUES (${code}, ${clientId}, ${text}::jsonb)`;
      return response.status(202).json({ ok: true });
    }
    if (action === "poll") {
      const after = Math.max(0, Number.parseInt(input.after, 10) || 0);
      const events = await sql`SELECT id, sender_id, payload FROM sinuq_events WHERE room_code = ${code} AND id > ${after} AND (recipient_id IS NULL OR recipient_id = ${clientId}) ORDER BY id ASC LIMIT 50`;
      return response.status(200).json({
        events: events.map((event) => ({
          id: event.id,
          sender: event.sender_id,
          payload: decodePayload(event.payload),
        })),
      });
    }
    return response.status(400).json({ error: "Ação inválida." });
  } catch (error) {
    return response.status(500).json({ error: error?.message || "Falha no servidor de partidas." });
  }
}
