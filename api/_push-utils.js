const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:pobrescriaturas@example.com";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!VAPID_PUBLIC_KEY) missing.push("VAPID_PUBLIC_KEY");
  if (!VAPID_PRIVATE_KEY) missing.push("VAPID_PRIVATE_KEY");
  if (missing.length) {
    const error = new Error(`Variaveis ausentes no Vercel: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function getUserFromRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function listSubscriptions() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function deleteSubscription(endpoint) {
  const params = new URLSearchParams({ endpoint: `eq.${endpoint}` });
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${params}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });
}

async function sendPushToAll({ title, body, url = "/" }) {
  requireEnv();
  const rows = await listSubscriptions();
  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.allSettled(
    rows
      .filter((row) => row.endpoint && row.p256dh && row.auth)
      .map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: {
                p256dh: row.p256dh,
                auth: row.auth,
              },
            },
            payload
          );
          return true;
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            await deleteSubscription(row.endpoint);
          }
          throw error;
        }
      })
  );
  return {
    total: rows.length,
    sent: results.filter((item) => item.status === "fulfilled").length,
    failed: results.filter((item) => item.status === "rejected").length,
  };
}

module.exports = {
  json,
  readBody,
  requireEnv,
  serviceHeaders,
  getUserFromRequest,
  sendPushToAll,
};
