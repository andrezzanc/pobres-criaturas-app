const { json, readBody, serviceHeaders, supabaseError, supabaseJson, getUserFromRequest } = require("./_push-utils");

const TABLES = {
  club_state: { conflict: "id" },
  club_members: { conflict: "user_id", forceUserId: true },
  club_meeting: { conflict: "id" },
  club_books: { conflict: "id" },
  club_settings: { conflict: "id" },
  club_reviews: { conflict: "book_id,participant_id" },
  club_member_library: { conflict: "participant_id" },
  club_feed: { conflict: "id" },
  club_notifications: { conflict: "id" },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Metodo nao permitido" });

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { error: "Variaveis do Supabase ausentes no Vercel." });
    }

    const user = await getUserFromRequest(req);
    if (!user?.id) return json(res, 401, { error: "Entre novamente no app antes de salvar." });

    const body = await readBody(req);
    const config = TABLES[body.table];
    if (!config) return json(res, 400, { error: "Tabela nao permitida para salvamento." });
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return json(res, 400, { error: "Dados incompletos para salvar." });
    }

    const payload = { ...body.payload };
    if (config.forceUserId) payload.user_id = user.id;

    const params = new URLSearchParams({ on_conflict: config.conflict });
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${body.table}?${params}`, {
      method: "POST",
      headers: serviceHeaders({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return json(res, 500, {
        error: await supabaseError(response, `Nao consegui salvar ${body.table}`),
      });
    }

    const saved = await supabaseJson(response);
    let savedRow = Array.isArray(saved) ? saved[0] : saved;
    if (!savedRow) {
      const readResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${body.table}?${recordFilter(config.conflict, payload)}&select=*`, {
        headers: serviceHeaders(),
      });
      if (!readResponse.ok) {
        return json(res, 500, {
          error: await supabaseError(readResponse, `Salvei, mas nao consegui confirmar ${body.table}`),
        });
      }
      const rows = await supabaseJson(readResponse);
      savedRow = Array.isArray(rows) ? rows[0] : rows;
    }
    return json(res, 200, { ok: true, data: savedRow });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "Erro ao salvar no servidor." });
  }
};

function recordFilter(conflict, payload) {
  const params = new URLSearchParams();
  conflict.split(",").forEach((column) => {
    const name = column.trim();
    params.set(name, `eq.${payload[name]}`);
  });
  return params.toString();
}
