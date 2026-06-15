const { json, requireEnv, serviceHeaders, sendPushToAll } = require("./_push-utils");

const STATE_ID = "default-club-state";

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(res, 401, { error: "Nao autorizado." });
  }

  try {
    requireEnv();
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/club_state?id=eq.${STATE_ID}&select=data`, {
      headers: serviceHeaders(),
    });
    if (!response.ok) return json(res, 500, { error: await response.text() });

    const [row] = await response.json();
    const state = row?.data || {};
    const meeting = state.meeting || {};
    if (!meeting.date) return json(res, 200, { ok: true, skipped: "Sem reuniao marcada." });

    state.notificationSettings ||= {};
    state.notificationSettings.serverReminders ||= {};

    const days = daysUntil(meeting.date);
    const reminder =
      days === 7
        ? { key: `server-week-${meeting.date}`, title: "Falta 1 semana para a reunião", prefix: "Faltam 7 dias." }
        : days === 0
          ? { key: `server-today-${meeting.date}`, title: "É hoje!", prefix: "Hoje é dia de encontro." }
          : null;

    if (!reminder) return json(res, 200, { ok: true, skipped: `Faltam ${days} dias.` });
    if (state.notificationSettings.serverReminders[reminder.key]) {
      return json(res, 200, { ok: true, skipped: "Lembrete ja enviado." });
    }

    const message = meetingText(meeting, state.books || [], reminder.prefix);
    const result = await sendPushToAll({ title: reminder.title, body: message, url: "/" });

    state.notificationSettings.serverReminders[reminder.key] = true;
    state.notifications ||= [];
    state.notifications.unshift({
      id: `server-${Date.now()}`,
      type: "reminder",
      title: reminder.title,
      message,
      date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      read: false,
    });
    state.notifications = state.notifications.slice(0, 40);

    await fetch(`${process.env.SUPABASE_URL}/rest/v1/club_state?id=eq.${STATE_ID}`, {
      method: "PATCH",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ data: state, updated_at: new Date().toISOString() }),
    });

    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "Erro ao enviar lembrete." });
  }
};

function daysUntil(dateText) {
  const today = dateInSaoPaulo();
  const todayDate = new Date(`${today}T12:00:00Z`);
  const meetingDate = new Date(`${dateText}T12:00:00Z`);
  return Math.round((meetingDate - todayDate) / 86400000);
}

function dateInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function meetingText(meeting, books, prefix) {
  const book = books.find((item) => item.id === meeting.bookId);
  const time = meeting.time ? ` às ${meeting.time}` : "";
  const place = meeting.place ? ` em ${meeting.place}` : "";
  const bookText = book ? ` Livro: ${book.title}.` : "";
  return `${prefix} Encontro marcado para ${formatDate(meeting.date)}${time}${place}.${bookText}`;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
