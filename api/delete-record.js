const { json, readBody, serviceHeaders, supabaseError, supabaseJson, getUserFromRequest } = require("./_push-utils");

const TABLES = {
  club_reviews: ["book_id", "participant_id"],
  club_feed: ["id", "participant_id"],
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Metodo nao permitido" });

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { error: "Variaveis do Supabase ausentes no Vercel." });
    }

    const user = await getUserFromRequest(req);
    if (!user?.id) return json(res, 401, { error: "Entre novamente no app antes de excluir." });

    const body = await readBody(req);
    const columns = TABLES[body.table];
    if (!columns) return json(res, 400, { error: "Tabela nao permitida para exclusao." });
    if (!body.filter || typeof body.filter !== "object" || Array.isArray(body.filter)) {
      return json(res, 400, { error: "Dados incompletos para excluir." });
    }

    const participantId = await participantIdForUser(user.id);
    if (!participantId) return json(res, 403, { error: "Nao encontrei sua integrante para confirmar a exclusao." });
    if (body.filter.participant_id !== participantId) {
      return json(res, 403, { error: "Voce so pode excluir seus proprios registros." });
    }

    const params = new URLSearchParams();
    columns.forEach((column) => {
      if (!body.filter[column]) throw new Error(`Filtro ausente: ${column}`);
      params.set(column, `eq.${body.filter[column]}`);
    });

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${body.table}?${params}`, {
      method: "DELETE",
      headers: serviceHeaders({ Prefer: "return=representation" }),
    });

    if (!response.ok) {
      return json(res, 500, {
        error: await supabaseError(response, `Nao consegui excluir ${body.table}`),
      });
    }

    const deleted = await supabaseJson(response);
    return json(res, 200, { ok: true, deleted: Array.isArray(deleted) ? deleted.length : 0 });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "Erro ao excluir no servidor." });
  }
};

async function participantIdForUser(userId) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: "participant_id",
    limit: "1",
  });
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/club_members?${params}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) return "";
  const rows = await supabaseJson(response);
  return Array.isArray(rows) ? rows[0]?.participant_id || "" : "";
}
