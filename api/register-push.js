const { json, readBody, requireEnv, serviceHeaders, supabaseError, getUserFromRequest } = require("./_push-utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Metodo nao permitido" });

  try {
    requireEnv();
    const user = await getUserFromRequest(req);
    if (!user?.id) return json(res, 401, { error: "Entre no app antes de ativar push." });

    const body = await readBody(req);
    const subscription = body.subscription;
    const keys = subscription?.keys || {};
    if (!subscription?.endpoint || !keys.p256dh || !keys.auth) {
      return json(res, 400, { error: "Inscricao de push incompleta." });
    }

    const endpointParam = encodeURIComponent(`eq.${subscription.endpoint}`);
    const deleteResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=${endpointParam}`, {
      method: "DELETE",
      headers: serviceHeaders({
        Prefer: "return=minimal",
      }),
    });

    if (!deleteResponse.ok) {
      return json(res, 500, { error: await supabaseError(deleteResponse, "Nao consegui remover inscricao antiga de push") });
    }

    const insertResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: serviceHeaders({
        Prefer: "return=minimal",
      }),
      body: JSON.stringify({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers["user-agent"] || "",
        updated_at: new Date().toISOString(),
      }),
    });

    if (!insertResponse.ok) {
      return json(res, 500, { error: await supabaseError(insertResponse, "Nao consegui salvar este aparelho no servidor de push") });
    }
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "Erro ao registrar push." });
  }
};
