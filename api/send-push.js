const { json, readBody, requireEnv, getUserFromRequest, sendPushToAll } = require("./_push-utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Metodo nao permitido" });

  try {
    requireEnv();
    const user = await getUserFromRequest(req);
    if (!user?.id) return json(res, 401, { error: "Entre no app para enviar push." });

    const body = await readBody(req);
    const title = String(body.title || "Pobres Criaturas").slice(0, 90);
    const message = String(body.message || "Nova atualizacao do clube.").slice(0, 240);
    const result = await sendPushToAll({ title, body: message, url: "/" });
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "Erro ao enviar push." });
  }
};
