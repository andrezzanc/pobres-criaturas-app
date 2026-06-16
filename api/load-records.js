const { json, serviceHeaders, supabaseError, supabaseJson, getUserFromRequest } = require("./_push-utils");

const TABLES = new Set([
  "club_state",
  "club_members",
  "club_meeting",
  "club_books",
  "club_settings",
  "club_reviews",
  "club_member_library",
  "club_feed",
  "club_notifications",
]);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Metodo nao permitido" });

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { error: "Variaveis do Supabase ausentes no Vercel." });
    }

    const user = await getUserFromRequest(req);
    if (!user?.id) return json(res, 401, { error: "Entre novamente no app antes de sincronizar." });

    const url = new URL(req.url, "https://local.app");
    const table = url.searchParams.get("table");
    if (!TABLES.has(table)) return json(res, 400, { error: "Tabela nao permitida para sincronizacao." });

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: serviceHeaders(),
    });

    if (!response.ok) {
      return json(res, 500, {
        error: await supabaseError(response, `Nao consegui carregar ${table}`),
      });
    }

    const rows = await supabaseJson(response);
    return json(res, 200, { ok: true, data: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "Erro ao carregar no servidor." });
  }
};
