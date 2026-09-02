const STORAGE_KEY = "pobresCriaturasPassport";
const SESSION_KEY = "pobresCriaturasSession";
const APP_VERSION = 34;
const CLOUD_STATE_ID = "default-club-state";
const supabaseSettings = window.POBRES_CRIATURAS_SUPABASE || {};
const clubDb = window.supabase && supabaseSettings.url && supabaseSettings.publishableKey
  ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.publishableKey)
  : null;
const TABLE_CONFLICTS = {
  club_state: "id",
  club_members: "user_id",
  club_meeting: "id",
  club_books: "id",
  club_settings: "id",
  club_reviews: "book_id,participant_id",
  club_member_library: "participant_id",
  club_feed: "id",
  club_notifications: "id",
};
const REACTION_OPTIONS = [
  { key: "heart", emoji: "\u2764\uFE0F", label: "Coração" },
  { key: "laugh", emoji: "\u{1F602}", label: "Riso" },
  { key: "tears", emoji: "\u{1F62D}", label: "Lágrimas" },
  { key: "sick", emoji: "\u{1F922}", label: "Enjoo" },
  { key: "shock", emoji: "\u{1F62E}", label: "Choque" },
  { key: "write", emoji: "\u270D\uFE0F", label: "Anotando" },
  { key: "dove", emoji: "\u{1F54A}\uFE0F", label: "Paz" },
  { key: "hug", emoji: "\u{1FAC2}", label: "Abraço" },
];
const BOOK_TAG_OPTIONS = [
  { key: "recomendo", label: "Recomendo" },
  { key: "nao-recomendo", label: "Não recomendo" },
  { key: "favorito", label: "Favorito" },
  { key: "quero-reler", label: "Quero reler" },
  { key: "leitura-rapida", label: "Leitura rápida" },
  { key: "leitura-pesada", label: "Leitura pesada" },
  { key: "me-surpreendeu", label: "Me surpreendeu" },
  { key: "debate-bom", label: "Rendeu debate" },
];

const seed = {
  __version: APP_VERSION,
  users: [],
  participants: [],
  meeting: {
    date: "",
    time: "",
    place: "",
    bookId: "",
    notes: "",
  },
  books: [],
  reviews: {},
  progress: {},
  favorites: {},
  feed: [],
  notifications: [],
  notificationSettings: {
    pushEnabled: false,
    reminders: {},
  },
  indicationOrder: [],
  rules: `ORDEM DE INDICAÇÕES DO CLUBE DO LIVRO
A ordem pode ser editada conforme novas integrantes entrarem no clube.

INDICAÇÃO DE LIVROS
A pessoa responsável pela indicação do livro do mês apresenta sua escolha e pode trocar caso outra integrante já tenha lido o livro inicialmente escolhido.

OBRIGAÇÃO DE LEITURA
As participantes combinam a leitura dentro do mês estabelecido. Caso alguém não consiga ler, o grupo decide junto como fica a próxima rodada.

REUNIÃO
A data, o local e as observações da reunião podem ser ajustados por qualquer integrante no passaporte digital.`,
};

let state = loadState();
let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
let authMode = "login";
let currentView = "feed";
let selectedBookId = latestBook()?.id || "";
let selectedParticipantId = "";
let meetingEditing = false;
let bookFormMode = null;
let bookFormDraft = null;
let readingDetailsOpen = false;
let bookHistoryOpen = false;
let bookHistoryScope = "all";
let feedComposerOpen = false;
let feedEditId = null;
let feedCommentId = null;
let reviewFormDraft = null;
let feedFormDraft = null;
let feedCommentDraft = null;
let rulesEditing = false;
let reviewFormOpen = false;
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSavePending = false;
let cloudUpdatedAt = null;
let lastCloudState = null;
let cloudRefreshInFlight = false;
let notificationHistoryOpen = false;
let suppressCloudAlerts = false;
let lastProfileSaveIssue = "";
let internalNavigationReady = false;
let restoringHistory = false;
let lastRouteKey = "";
let lastSavedMemberProfile = null;
let lastSavedMemberLibrary = null;

const bootScreen = document.querySelector("#boot-screen");
const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const viewRoot = document.querySelector("#view-root");
const viewTitle = document.querySelector("#view-title");
const toast = document.querySelector("#toast");
const signupQuestions = document.querySelector("#signup-questions");
const notificationButton = document.querySelector("#notification-button");
const notificationCount = document.querySelector("#notification-count");
const notificationPanel = document.querySelector("#notification-panel");
const installButton = document.querySelector("#install-button");
let installPromptEvent = null;

registerPwa();

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    authMode = button.dataset.authMode;
    document.querySelectorAll("[data-auth-mode]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector("#auth-name").closest("label").style.display = authMode === "signup" ? "grid" : "none";
    signupQuestions.style.display = authMode === "signup" ? "grid" : "none";
    document.querySelector("#auth-message").textContent = "";
  });
});

document.querySelector("#auth-name").closest("label").style.display = "none";
signupQuestions.style.display = "none";

document.querySelector("#auth-form").addEventListener("submit", handleCloudAuth, true);

document.querySelector("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#auth-name").value.trim();
  const email = document.querySelector("#auth-email").value.trim().toLowerCase();
  const password = document.querySelector("#auth-password").value;
  const message = document.querySelector("#auth-message");

  if (authMode === "signup") {
    if (!name) {
      message.textContent = "Coloque seu nome para emitir o passaporte.";
      return;
    }
    if (state.users.some((item) => item.email === email)) {
      message.textContent = "Essa conta já existe. Use entrar para abrir seu passaporte.";
      return;
    }
    const profile = {
      personality: document.querySelector("#auth-personality").value,
      genre: document.querySelector("#auth-genre").value.trim() || "Leituras surpresa",
      discussion: document.querySelector("#auth-discussion").value,
      booksReadYear: Number(document.querySelector("#auth-read-year").value || 0),
      booksReadClub: Number(document.querySelector("#auth-read-club").value || 0),
      goal: Number(document.querySelector("#auth-goal").value || 12),
    };
    const participant = createParticipant(name, profile);
    const user = { name, email, password, participantId: participant.id };
    state.participants.push(participant);
    state.users.push(user);
    state.indicationOrder.push(participant.id);
    state.progress[participant.id] = {};
    state.favorites[participant.id] = [];
    saveState();
    startSession(user);
    return;
  }

  const user = state.users.find((item) => item.email === email);
  if (!user) {
    message.textContent = "Não achei essa conta. Use cadastrar para entrar pela primeira vez.";
    return;
  }
  if (user.password !== password) {
    message.textContent = "Senha diferente da cadastrada neste navegador.";
    return;
  }
  startSession(user);
});

document.querySelector("#logout-button").addEventListener("click", () => {
  if (clubDb) clubDb.auth.signOut();
  localStorage.removeItem(SESSION_KEY);
  session = null;
  showAuth();
});

notificationButton.addEventListener("click", toggleNotificationPanel);

installButton.addEventListener("click", async () => {
  if (installPromptEvent) {
    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    installPromptEvent = null;
    updateInstallButton();
    notify(choice.outcome === "accepted" ? "App instalado." : "Instalação cancelada.");
    return;
  }
  notify(installHelpText());
});

function submitWithLoading(handler, loadingText = "Salvando...") {
  return async (event) => {
    const form = event.currentTarget;
    if (!startFormLoading(form, loadingText)) {
      event.preventDefault();
      return;
    }
    try {
      await handler(event);
    } finally {
      stopFormLoading(form);
    }
  };
}

function startFormLoading(form, loadingText) {
  if (!form || form.dataset.saving === "true") return false;
  form.dataset.saving = "true";
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((button) => {
    button.dataset.wasDisabled = button.disabled ? "true" : "false";
    button.disabled = true;
  });
  const submitButton = form.querySelector('button[type="submit"]') || buttons[0];
  if (submitButton) {
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = loadingText;
    submitButton.classList.add("is-saving");
  }
  return true;
}

function stopFormLoading(form) {
  if (!form) return;
  const submitButton = form.querySelector("[data-original-text]");
  if (submitButton) {
    submitButton.textContent = submitButton.dataset.originalText;
    delete submitButton.dataset.originalText;
    submitButton.classList.remove("is-saving");
  }
  form.querySelectorAll("button").forEach((button) => {
    button.disabled = button.dataset.wasDisabled === "true";
    delete button.dataset.wasDisabled;
  });
  delete form.dataset.saving;
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "books") {
      openBooks();
      return;
    }
    setView(button.dataset.view);
  });
});

window.addEventListener("popstate", (event) => {
  if (!notificationPanel.classList.contains("hidden")) {
    closeNotificationPanel(false);
    if (event.state?.pobresCriaturasRoute) lastRouteKey = routeKey(event.state);
    return;
  }
  restoreRoute(event.state);
});

initApp();

window.setInterval(() => {
  if (session && getUser()) checkMeetingReminders();
}, 60000);

window.setInterval(() => {
  refreshCloudState({ render: true });
}, 30000);

window.addEventListener("focus", () => refreshCloudState({ render: true }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshCloudState({ render: true });
});

async function initApp() {
  if (clubDb) {
    const { data, error } = await clubDb.auth.getSession();
    if (!error && data.session?.user) {
      const loaded = await loadCloudState();
      if (!loaded) {
        showAuth();
        notify("Nao consegui sincronizar a nuvem. Entre novamente em alguns segundos.");
        return;
      }
      const beforeUserSync = stableJson({ users: state.users, participants: state.participants });
      const user = ensureClubUser(data.session.user);
      session = { email: user.email };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      await ensureMemberProfileRecord(data.session.user, user);
      if (stableJson({ users: state.users, participants: state.participants }) !== beforeUserSync) {
        persistLocalState();
      }
    } else {
      session = null;
      localStorage.removeItem(SESSION_KEY);
    }
  }

  if (session && getUser()) {
    showApp();
  } else {
    localStorage.removeItem(SESSION_KEY);
    showAuth();
  }
}

async function handleCloudAuth(event) {
  if (!clubDb) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const message = document.querySelector("#auth-message");
  const name = document.querySelector("#auth-name").value.trim();
  const email = document.querySelector("#auth-email").value.trim().toLowerCase();
  const password = document.querySelector("#auth-password").value;

  submitButton.disabled = true;
  message.textContent = "Abrindo o passaporte...";

  if (authMode === "signup") {
    if (!name) {
      message.textContent = "Coloque seu nome para emitir o passaporte.";
      submitButton.disabled = false;
      return;
    }

    const profile = {
      personality: document.querySelector("#auth-personality").value,
      genre: document.querySelector("#auth-genre").value.trim() || "Leituras surpresa",
      discussion: document.querySelector("#auth-discussion").value,
      booksReadYear: Number(document.querySelector("#auth-read-year").value || 0),
      booksReadClub: Number(document.querySelector("#auth-read-club").value || 0),
      goal: Number(document.querySelector("#auth-goal").value || 12),
    };
    const { data, error } = await clubDb.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      message.textContent = authErrorMessage(error);
      submitButton.disabled = false;
      return;
    }
    if (!data.session) {
      message.textContent = "Conta criada, mas o Supabase ainda esta pedindo confirmacao por e-mail. Desative essa confirmacao em Auth > Providers > Email.";
      submitButton.disabled = false;
      return;
    }

    const loaded = await loadCloudState();
    if (!loaded) {
      message.textContent = "Conta criada, mas nao consegui abrir os dados online agora. Tente entrar novamente.";
      submitButton.disabled = false;
      return;
    }
    const user = ensureClubUser(data.user, { name, profile });
    session = { email: user.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await saveMemberProfile(data.user, user, participantById(user.participantId));
    persistLocalState();
    startSession(user);
    submitButton.disabled = false;
    return;
  }

  const { data, error } = await clubDb.auth.signInWithPassword({ email, password });
  if (error) {
    message.textContent = authErrorMessage(error);
    submitButton.disabled = false;
    return;
  }

  const loaded = await loadCloudState();
  if (!loaded) {
    message.textContent = "Nao consegui carregar os dados online. Tente entrar novamente em alguns segundos.";
    submitButton.disabled = false;
    return;
  }
  const beforeUserSync = stableJson({ users: state.users, participants: state.participants });
  const user = ensureClubUser(data.user);
  session = { email: user.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await ensureMemberProfileRecord(data.user, user);
  if (stableJson({ users: state.users, participants: state.participants }) !== beforeUserSync) {
    persistLocalState();
  }
  startSession(user);
  submitButton.disabled = false;
}

async function loadCloudState() {
  const structuredLoaded = await loadStructuredClubData();
  if (structuredLoaded) {
    return true;
  }

  const current = await fetchCloudState();
  if (!current && state.__cloudError) {
    notify("Nao consegui carregar os dados online. Confira se o SQL da Etapa 7 foi executado.");
    return false;
  }

  if (current) {
    applyCloudState(current.data || {}, current.updated_at);
    await loadStructuredClubData();
    return true;
  }

  queueCloudSave();
  return true;
}

function applyCloudState(cloudData, updatedAt = null) {
  state = withStateDefaults({ ...clone(seed), ...(cloudData || {}) });
  cloudUpdatedAt = updatedAt;
  lastCloudState = clone(state);
  selectedBookId = latestBook()?.id || "";
  persistLocalState();
}

async function refreshCloudState({ render = false } = {}) {
  if (!clubDb || !session || cloudRefreshInFlight) return false;
  cloudRefreshInFlight = true;
  const before = stableJson(state);
  const structuredLoaded = await loadStructuredClubData();
  const backupLoaded = structuredLoaded ? false : await loadCloudBackupState();

  if (!structuredLoaded && !backupLoaded) {
    const current = await fetchCloudState();
    if (current) {
      const remoteTime = Date.parse(current.updated_at || "");
      const knownTime = Date.parse(cloudUpdatedAt || "");
      if (!cloudUpdatedAt || remoteTime > knownTime) {
        applyCloudState(current.data || {}, current.updated_at);
      }
    }
  }

  const { data: authData } = await clubDb.auth.getSession();
  if (authData.session?.user) ensureClubUser(authData.session.user);
  persistLocalState();
  cloudRefreshInFlight = false;

  const changed = before !== stableJson(state);
  if (changed && render && appShell && !appShell.classList.contains("hidden")) {
    if (hasActiveEditor()) {
      captureOpenDrafts();
    } else {
      showApp();
    }
  }
  return changed || structuredLoaded || backupLoaded;
}

async function loadCloudBackupState() {
  const current = await fetchCloudState();
  if (!current?.data) return false;
  const backupState = withStateDefaults({ ...clone(seed), ...(current.data || {}) });
  state = mergeClubStates(state, backupState, lastCloudState);
  cloudUpdatedAt = current.updated_at;
  lastCloudState = clone(state);
  selectedBookId = bookById(selectedBookId)?.id || latestBook()?.id || selectedBookId || "";
  persistLocalState();
  return true;
}

function queueCloudSave() {
  if (!clubDb) return;
  if (cloudSaveInFlight) {
    cloudSavePending = true;
    return;
  }
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(saveCloudState, 400);
}

async function saveCloudState() {
  if (!clubDb) return true;
  if (cloudSaveInFlight) {
    cloudSavePending = true;
    return false;
  }
  window.clearTimeout(cloudSaveTimer);
  cloudSaveInFlight = true;
  const payload = clone(state);
  delete payload.__cloudError;
  payload.users = (payload.users || []).map(({ password, ...user }) => user);
  const savedAt = new Date().toISOString();
  const saved = await saveRecordOnServer("club_state", {
    id: CLOUD_STATE_ID,
    data: payload,
    updated_at: savedAt,
  });
  cloudSaveInFlight = false;
  if (!saved.ok) {
    console.warn("Nao foi possivel salvar no Supabase", saved.error);
    return false;
  }
  if (cloudSavePending) {
    cloudSavePending = false;
    return saveCloudState();
  }
  cloudUpdatedAt = savedAt;
  lastCloudState = clone(state);
  return true;
}

async function saveCloudSnapshot() {
  if (!clubDb) return true;
  const payload = clone(state);
  delete payload.__cloudError;
  payload.users = (payload.users || []).map(({ password, ...user }) => user);
  const savedAt = new Date().toISOString();
  const saved = await saveRecordOnServer("club_state", {
    id: CLOUD_STATE_ID,
    data: payload,
    updated_at: savedAt,
  });
  if (!saved.ok) {
    console.warn("Nao foi possivel atualizar a copia geral do clube", saved.error);
    return false;
  }
  cloudUpdatedAt = savedAt;
  lastCloudState = clone(state);
  return true;
}

async function saveRecordOnServer(table, payload) {
  let serverError = "";
  try {
    const token = await accessToken();
    if (!token) return saveRecordDirect(table, payload, "sessao ausente");
    const response = await fetch("./api/save-record", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ table, payload }),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = { error: await response.text() };
    }
    if (!response.ok || !body?.ok) {
      serverError = body?.error || "servidor nao confirmou o salvamento";
      return saveRecordDirect(table, payload, serverError);
    }
    return { ok: true, data: body.data || null };
  } catch (error) {
    console.warn("Servidor de salvamento indisponivel", error);
    serverError = error.message || "servidor de salvamento indisponivel";
    return saveRecordDirect(table, payload, serverError);
  }
}

async function saveRecordDirect(table, payload, serverError = "") {
  if (!clubDb || !TABLE_CONFLICTS[table]) return { ok: false, error: serverError || "Supabase indisponivel" };
  try {
    const { data, error } = await clubDb
      .from(table)
      .upsert(payload, { onConflict: TABLE_CONFLICTS[table] })
      .select("*")
      .maybeSingle();
    if (error) {
      return { ok: false, error: serverError ? `${serverError}; fallback: ${error.message}` : error.message };
    }
    return { ok: true, data: data || payload };
  } catch (error) {
    return { ok: false, error: serverError ? `${serverError}; fallback: ${error.message}` : error.message };
  }
}

async function deleteRecordOnServer(table, filter) {
  let serverError = "";
  try {
    const token = await accessToken();
    if (!token) return deleteRecordDirect(table, filter, "sessao ausente");
    const response = await fetch("./api/delete-record", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ table, filter }),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = { error: await response.text() };
    }
    if (!response.ok || !body?.ok) {
      serverError = body?.error || "servidor nao confirmou a exclusao";
      return deleteRecordDirect(table, filter, serverError);
    }
    return { ok: true };
  } catch (error) {
    serverError = error.message || "servidor de exclusao indisponivel";
    return deleteRecordDirect(table, filter, serverError);
  }
}

async function deleteRecordDirect(table, filter, serverError = "") {
  if (!clubDb || !TABLE_CONFLICTS[table]) return { ok: false, error: serverError || "Supabase indisponivel" };
  try {
    let query = clubDb.from(table).delete();
    Object.entries(filter || {}).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    const { error } = await query;
    if (error) {
      return { ok: false, error: serverError ? `${serverError}; fallback: ${error.message}` : error.message };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: serverError ? `${serverError}; fallback: ${error.message}` : error.message };
  }
}

async function loadRecordsFromServer(table) {
  let serverError = "";
  try {
    const token = await accessToken();
    if (!token) return loadRecordsDirect(table, "sessao ausente");
    const response = await fetch(`./api/load-records?table=${encodeURIComponent(table)}&t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = { error: await response.text() };
    }
    if (!response.ok || !body?.ok) {
      serverError = body?.error || "servidor nao confirmou a sincronizacao";
      return loadRecordsDirect(table, serverError);
    }
    return { ok: true, data: Array.isArray(body.data) ? body.data : [] };
  } catch (error) {
    console.warn("Servidor de sincronizacao indisponivel", error);
    serverError = error.message || "servidor de sincronizacao indisponivel";
    return loadRecordsDirect(table, serverError);
  }
}

async function loadRecordsDirect(table, serverError = "") {
  if (!clubDb || !TABLE_CONFLICTS[table]) return { ok: false, error: serverError || "Supabase indisponivel", data: [] };
  try {
    const { data, error } = await clubDb.from(table).select("*");
    if (error) {
      return { ok: false, error: serverError ? `${serverError}; fallback: ${error.message}` : error.message, data: [] };
    }
    return { ok: true, data: data || [] };
  } catch (error) {
    return { ok: false, error: serverError ? `${serverError}; fallback: ${error.message}` : error.message, data: [] };
  }
}

async function fetchCloudState() {
  const result = await loadRecordsFromServer("club_state");
  if (!result.ok) {
    console.warn("Nao foi possivel conferir a versao online", result.error);
    state.__cloudError = result.error || "erro ao carregar copia geral";
    return null;
  }
  delete state.__cloudError;
  return result.data.find((row) => row.id === CLOUD_STATE_ID) || null;
}

async function loadStructuredClubData() {
  if (!clubDb) return false;
  let loadedAny = false;
  loadedAny = (await loadMemberProfiles()) || loadedAny;
  loadedAny = (await loadBookRecords()) || loadedAny;
  loadedAny = (await loadMeetingRecord()) || loadedAny;
  loadedAny = (await loadClubSettings()) || loadedAny;
  loadedAny = (await loadReviewRecords()) || loadedAny;
  loadedAny = (await loadMemberLibraryRecords()) || loadedAny;
  loadedAny = (await loadFeedRecords()) || loadedAny;
  loadedAny = (await loadNotificationRecords()) || loadedAny;
  persistLocalState();
  return loadedAny;
}

async function migrateLegacyStateToTables() {
  if (!clubDb) return;
  suppressCloudAlerts = true;
  try {
    if (state.meeting && (state.meeting.date || state.meeting.time || state.meeting.place || state.meeting.notes || state.meeting.bookId)) {
      const { data } = await clubDb.from("club_meeting").select("date,time,book_id,place,notes").eq("id", "current").maybeSingle();
      const hasMeeting = data?.date || data?.time || data?.book_id || data?.place || data?.notes;
      if (!hasMeeting) await saveMeetingRecord();
    }

    const { data: bookRows } = await clubDb.from("club_books").select("id").limit(1);
    if (!bookRows?.length && state.books?.length) {
      for (const book of state.books) await saveBookRecord(book);
    }

    const { data: reviewRows } = await clubDb.from("club_reviews").select("book_id").limit(1);
    if (!reviewRows?.length) {
      for (const [bookId, reviews] of Object.entries(state.reviews || {})) {
        for (const review of reviews || []) await saveReviewRecord(bookId, review);
      }
    }

    const { data: libraryRows } = await clubDb.from("club_member_library").select("participant_id").limit(1);
    if (!libraryRows?.length) {
      for (const participant of state.participants || []) await saveMemberLibraryRecord(participant);
    }

    const { data: feedRows } = await clubDb.from("club_feed").select("id").limit(1);
    if (!feedRows?.length) {
      for (const item of state.feed || []) await saveFeedRecord(item);
    }

    const { data: settings } = await clubDb.from("club_settings").select("rules,indication_order").eq("id", "main").maybeSingle();
    const hasSettings = settings?.rules || (Array.isArray(settings?.indication_order) && settings.indication_order.length);
    if (!hasSettings && (state.rules || state.indicationOrder?.length)) await saveClubSettingsRecord();

    const { data: notificationRows } = await clubDb.from("club_notifications").select("id").limit(1);
    if (!notificationRows?.length) {
      for (const item of (state.notifications || []).slice(0, 40)) await saveNotificationRecord(item);
    }
  } catch (error) {
    console.warn("Migracao automatica para tabelas oficiais nao concluiu", error);
  } finally {
    suppressCloudAlerts = false;
  }
}

function reportCloudSaveError(area, error) {
  const detail = error?.message || error?.details || error?.hint || "erro sem detalhe";
  console.warn(`Nao foi possivel salvar ${area}`, error);
  if (!suppressCloudAlerts) {
    notify(`Erro ao salvar ${area}: ${detail}`);
  }
}

async function loadMeetingRecord() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_meeting");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar reuniao oficial", result.error);
    return false;
  }
  const data = result.data.find((row) => row.id === "current");
  if (!data) return false;
  const hasMeeting = data.date || data.time || data.book_id || data.place || data.notes;
  if (!hasMeeting) return false;
  state.meeting = {
    date: data.date || "",
    time: data.time || "",
    bookId: data.book_id || "",
    place: data.place || "",
    notes: data.notes || "",
  };
  return true;
}

async function saveMeetingRecord() {
  if (!clubDb) return saveCloudState();
  const saved = await saveRecordOnServer("club_meeting", {
    id: "current",
    date: state.meeting.date || "",
    time: state.meeting.time || "",
    book_id: state.meeting.bookId || "",
    place: state.meeting.place || "",
    notes: state.meeting.notes || "",
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok) {
    reportCloudSaveError("reuniao", { message: saved.error });
    return false;
  }
  persistLocalState();
  await saveCloudSnapshot();
  return true;
}

async function loadBookRecords() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_books");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar livros oficiais", result.error);
    return false;
  }
  const data = result.data
    .slice()
    .sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(b.month_index || 0) - Number(a.month_index || 0) || Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  if (!data?.length) return false;
  const officialBooks = data.map(bookFromRecord);
  state.books = mergeById(officialBooks, state.books, lastCloudState?.books);
  officialBooks.forEach((book) => {
    state.reviews[book.id] ||= [];
  });
  if (!bookById(selectedBookId)) selectedBookId = latestBook()?.id || "";
  return true;
}

async function saveBookRecord(book) {
  if (!clubDb || !book) return saveCloudState();
  const saved = await saveRecordOnServer("club_books", bookRecordFromBook(book));
  if (!saved.ok) {
    reportCloudSaveError("livro", { message: saved.error });
    return false;
  }
  if (saved.data) {
    const confirmedBook = bookFromRecord(saved.data);
    state.books = mergeById([confirmedBook], state.books.filter((item) => item.id !== confirmedBook.id), lastCloudState?.books);
    state.reviews[confirmedBook.id] ||= [];
    selectedBookId = confirmedBook.id;
  }
  await loadBookRecords();
  if (!bookById(book.id)) {
    state.books.push(book);
    selectedBookId = book.id;
  }
  persistLocalState();
  await saveCloudSnapshot();
  return true;
}

function bookRecordFromBook(book) {
  return {
    id: book.id,
    title: book.title || "",
    author: book.author || "",
    month: book.month || "",
    month_index: monthIndex(book.month),
    year: Number(book.year || new Date().getFullYear()),
    indicated_by: book.indicatedBy || "",
    genre: book.genre || "",
    pages: Number(book.pages || 0),
    cover: book.cover || randomCover(0),
    cover_image: book.coverImage || "",
    synopsis: book.synopsis || "",
    updated_at: new Date().toISOString(),
  };
}

function bookFromRecord(row) {
  return {
    id: row.id,
    title: row.title || "",
    author: row.author || "",
    month: row.month || "",
    year: Number(row.year || new Date().getFullYear()),
    indicatedBy: row.indicated_by || "",
    genre: row.genre || "",
    pages: Number(row.pages || 0),
    cover: row.cover || randomCover(0),
    coverImage: row.cover_image || "",
    synopsis: row.synopsis || "",
  };
}

async function loadClubSettings() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_settings");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar regras oficiais", result.error);
    return false;
  }
  const data = result.data.find((row) => row.id === "main");
  if (!data) return false;
  if (data.rules) state.rules = data.rules;
  if (Array.isArray(data.indication_order)) state.indicationOrder = data.indication_order;
  normalizeIndicationOrder();
  return true;
}

async function saveClubSettingsRecord() {
  if (!clubDb) return saveCloudState();
  const saved = await saveRecordOnServer("club_settings", {
    id: "main",
    rules: state.rules || "",
    indication_order: state.indicationOrder || [],
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok) {
    reportCloudSaveError("regras", { message: saved.error });
    return false;
  }
  persistLocalState();
  await saveCloudSnapshot();
  return true;
}

async function loadReviewRecords() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_reviews");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar avaliacoes oficiais", result.error);
    return false;
  }
  const reactionBackup = await reviewReactionBackupMap();
  const data = result.data.slice().sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
  const officialReviews = {};
  state.books.forEach((book) => {
    officialReviews[book.id] = [];
  });
  (data || []).forEach((row) => {
    officialReviews[row.book_id] ||= [];
    const reactions = reactionBackup.get(reviewLikeKey(row.book_id, row.participant_id)) || {};
    officialReviews[row.book_id].push({
      participantId: row.participant_id,
      rating: Number(row.rating || 0),
      threeWords: row.three_words || "",
      deepReview: row.deep_review || "",
      comment: row.deep_review || "",
      reactions,
      likedBy: reactions.heart || [],
    });
  });
  state.reviews = officialReviews;
  return true;
}

async function reviewReactionBackupMap() {
  const sources = [lastCloudState?.reviews, state.reviews];
  const current = await fetchCloudState();
  if (current?.data?.reviews) sources.push(current.data.reviews);
  return collectReviewReactions(sources);
}

function collectReviewReactions(sources = []) {
  const reactionsByReview = new Map();
  sources.filter(Boolean).forEach((reviewsByBook) => {
    Object.entries(reviewsByBook || {}).forEach(([bookId, reviews]) => {
      (reviews || []).forEach((review) => {
        const reactions = normalizedReactions(review);
        if (reactionTotal(reactions)) reactionsByReview.set(reviewLikeKey(bookId, review.participantId), reactions);
      });
    });
  });
  return reactionsByReview;
}

function reviewLikeKey(bookId, participantId) {
  return `${bookId || ""}::${participantId || ""}`;
}

async function saveReviewRecord(bookId, review) {
  if (!clubDb) return saveCloudState();
  const saved = await saveRecordOnServer("club_reviews", {
    book_id: bookId,
    participant_id: review.participantId,
    rating: Number(review.rating || 0),
    three_words: review.threeWords || "",
    deep_review: review.deepReview || review.comment || "",
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok) {
    reportCloudSaveError("avaliacao", { message: saved.error });
    return false;
  }
  persistLocalState();
  await saveCloudSnapshot();
  return true;
}

async function loadMemberLibraryRecords() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_member_library");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar biblioteca das integrantes", result.error);
    return false;
  }
  const data = result.data;
  if (!data?.length) return false;
  mergeMemberLibraryRows(data || []);
  return true;
}

async function saveMemberLibraryRecord(participant = currentParticipant()) {
  if (!clubDb || !participant) return saveCloudState();
  const saved = await saveRecordOnServer("club_member_library", {
    participant_id: participant.id,
    current_book_id: participant.currentBookId || "",
    completed_book_ids: participant.completedBookIds || [],
    progress: state.progress[participant.id] || {},
    favorites: state.favorites[participant.id] || [],
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok) {
    reportCloudSaveError("biblioteca da integrante", { message: saved.error });
    return false;
  }
  lastSavedMemberLibrary = saved.data || null;
  if (saved.data) mergeMemberLibraryRows([saved.data]);
  persistLocalState();
  await saveCloudSnapshot();
  return true;
}

function mergeMemberLibraryRows(rows = []) {
  (rows || []).forEach((row) => {
    const participant = participantById(row.participant_id);
    if (participant) {
      participant.currentBookId = row.current_book_id || "";
      participant.completedBookIds = Array.isArray(row.completed_book_ids) ? row.completed_book_ids : [];
    }
    state.progress[row.participant_id] = row.progress && typeof row.progress === "object" ? row.progress : {};
    state.favorites[row.participant_id] = Array.isArray(row.favorites) ? row.favorites : [];
  });
  persistLocalState();
}

async function loadFeedRecords() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_feed");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar feed oficial", result.error);
    return false;
  }
  const reactionBackup = await feedReactionBackupMap();
  const data = result.data.slice().sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  const officialFeed = (data || []).map((row) => {
    const readDate = inputDateFromDisplay(row.date || row.created_at) || todayInputDate();
    const reactions = reactionBackup.get(row.id) || normalizedReactions({ likedBy: row.liked_by });
    return {
      id: row.id,
      participantId: row.participant_id,
      date: displayReadDate(readDate),
      readDate,
      type: row.type || "",
      bookId: row.book_id || "",
      text: row.text || "",
      progress: Number(row.progress || 0),
      reactions,
      likes: reactionTotal(reactions),
      likedBy: reactions.heart || [],
      comments: normalizeFeedComments(row.comments),
      editedAt: row.edited_at || "",
    };
  });
  state.feed = officialFeed.sort(sortNewestFirst);
  return true;
}

async function feedReactionBackupMap() {
  const sources = [lastCloudState?.feed, state.feed];
  const current = await fetchCloudState();
  if (current?.data?.feed) sources.push(current.data.feed);
  const reactionsByFeed = new Map();
  sources.filter(Boolean).forEach((feedItems) => {
    (feedItems || []).forEach((item) => {
      const reactions = normalizedReactions(item);
      if (item?.id && reactionTotal(reactions)) reactionsByFeed.set(item.id, reactions);
    });
  });
  return reactionsByFeed;
}

function normalizeFeedComments(comments = []) {
  return (Array.isArray(comments) ? comments : []).map((comment) => ({
    ...comment,
    reactions: normalizedReactions(comment),
    likedBy: normalizedReactions(comment).heart || [],
  }));
}

async function saveFeedRecord(item) {
  if (!clubDb || !item) return saveCloudState();
  const reactions = normalizedReactions(item);
  const saved = await saveRecordOnServer("club_feed", {
    id: item.id,
    participant_id: item.participantId,
    book_id: item.bookId,
    date: displayReadDate(item.readDate || item.date) || new Date().toLocaleDateString("pt-BR"),
    type: item.type || "",
    text: item.text || "",
    progress: Number(item.progress || 0),
    liked_by: reactions.heart || [],
    comments: normalizeFeedComments(item.comments),
    edited_at: item.editedAt || "",
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok) {
    reportCloudSaveError("feed", { message: saved.error });
    return false;
  }
  persistLocalState();
  await saveCloudSnapshot();
  return true;
}

async function loadNotificationRecords() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_notifications");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar notificacoes oficiais", result.error);
    return false;
  }
  const data = result.data.slice().sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)).slice(0, 40);
  if (!data?.length) return false;
  const localReads = new Set([
    ...notificationReadIds(),
    ...(state.notifications || []).filter((item) => item.read).map((item) => item.id),
  ]);
  const officialNotifications = (data || []).map((row) => ({
    id: row.id,
    type: row.type || "",
    title: row.title || "",
    message: row.message || "",
    date: row.date || new Date(row.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    read: localReads.has(row.id),
  }));
  state.notifications = mergeById(officialNotifications, state.notifications, lastCloudState?.notifications).sort(sortNewestFirst).slice(0, 40);
  applyNotificationReadState();
  return true;
}

async function saveNotificationRecord(item) {
  if (!clubDb || !item) return false;
  const saved = await saveRecordOnServer("club_notifications", {
    id: item.id,
    type: item.type || "",
    title: item.title || "",
    message: item.message || "",
    date: item.date || "",
    created_at: new Date().toISOString(),
  });
  if (!saved.ok) {
    console.warn("Nao foi possivel salvar notificacao oficial", saved.error);
    return false;
  }
  await saveCloudSnapshot();
  return true;
}

async function saveMemberProfile(authUser, user = getUser(), participantOverride = null) {
  if (!clubDb || !authUser) return false;
  const participant = participantOverride || participantById(user?.participantId);
  if (!participant) return false;
  const email = (user?.email || authUser.email || "").toLowerCase();
  const payload = {
    user_id: authUser.id,
    email,
    participant_id: participant.id,
    name: participant.name || user?.name || email,
    role: participant.role || "",
    tone: participant.tone || "gold",
    favorite_book: participant.favoriteBook || "",
    favorite_character: participant.favoriteCharacter || "",
    quote: participant.quote || "",
    goal: Number(participant.goal || 12),
    books_read_year: Number(participant.booksReadYear || 0),
    books_read_club: Number(participant.booksReadClub || 0),
    genres: participant.genres || [],
    personality: participant.personality || "emocao",
    discussion: participant.discussion || "debater",
    photo: participant.photo || "",
    updated_at: new Date().toISOString(),
  };
  participant.profileUpdatedAt = payload.updated_at;
  const saved = await saveRecordOnServer("club_members", payload);
  if (!saved.ok) {
    reportCloudSaveError("perfil da integrante", { message: saved.error });
    return false;
  }
  const savedProfile = saved.data || payload;
  const savedCountersDiffer =
    Number(savedProfile?.books_read_year || 0) !== Number(payload.books_read_year || 0) ||
    Number(savedProfile?.books_read_club || 0) !== Number(payload.books_read_club || 0);
  if (savedCountersDiffer) {
    reportCloudSaveError("perfil da integrante", { message: `servidor voltou ${Number(savedProfile?.books_read_year || 0)}/${Number(savedProfile?.books_read_club || 0)}, mas tentei salvar ${payload.books_read_year}/${payload.books_read_club}` });
    return false;
  }
  lastSavedMemberProfile = savedProfile || null;
  if (savedProfile) mergeMemberProfiles([savedProfile]);
  await saveCloudSnapshot();
  return true;
}

async function ensureMemberProfileRecord(authUser, user = getUser()) {
  if (!clubDb || !authUser || !user) return false;
  const { data, error } = await clubDb
    .from("club_members")
    .select("*")
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (error) {
    reportCloudSaveError("perfil da integrante", error);
    return false;
  }
  if (data) {
    mergeMemberProfiles([data]);
    return true;
  }
  return saveMemberProfile(authUser, user);
}

async function verifyMemberProfileSaved(authUser, participant) {
  lastProfileSaveIssue = "";
  let profile = lastSavedMemberProfile?.user_id === authUser.id ? lastSavedMemberProfile : null;
  if (!profile) {
    let { data, error: profileError } = await clubDb
      .from("club_members")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (!data && !profileError) {
      const fallback = await clubDb
        .from("club_members")
        .select("*")
        .eq("participant_id", participant.id)
        .maybeSingle();
      data = fallback.data;
      profileError = fallback.error;
    }
    if (profileError || !data) {
      lastProfileSaveIssue = profileError?.message || "perfil nao encontrado apos salvar";
      reportCloudSaveError("confirmacao do perfil", profileError || { message: lastProfileSaveIssue });
      return false;
    }
    profile = data;
  }

  let library = lastSavedMemberLibrary?.participant_id === participant.id ? lastSavedMemberLibrary : null;
  if (!library) {
    const { data, error: libraryError } = await clubDb
      .from("club_member_library")
      .select("*")
      .eq("participant_id", participant.id)
      .maybeSingle();
    if (libraryError || !data) {
      lastProfileSaveIssue = libraryError?.message || "biblioteca nao encontrada apos salvar";
      reportCloudSaveError("confirmacao da biblioteca da integrante", libraryError || { message: lastProfileSaveIssue });
      return false;
    }
    library = data;
  }

  const differences = [];
  if ((profile.name || "") !== (participant.name || "")) differences.push("nome");
  if ((profile.favorite_book || "") !== (participant.favoriteBook || "")) differences.push("livro favorito");
  if ((profile.favorite_character || "") !== (participant.favoriteCharacter || "")) differences.push("personagem favorito");
  if (Number(profile.goal || 0) !== Number(participant.goal || 0)) differences.push("meta");
  if (stableJson(normalizeList(profile.genres)) !== stableJson(normalizeList(participant.genres))) differences.push("generos");
  if (Number(profile.books_read_year || 0) !== Number(participant.booksReadYear || 0)) differences.push("lidos no ano");
  if (Number(profile.books_read_club || 0) !== Number(participant.booksReadClub || 0)) differences.push("lidos no clube");

  if (differences.length) {
    lastProfileSaveIssue = `campos nao confirmados: ${differences.join(", ")}; tentei ${participant.booksReadYear || 0}/${participant.booksReadClub || 0}, servidor confirmou ${Number(profile.books_read_year || 0)}/${Number(profile.books_read_club || 0)}`;
    notify(`O Supabase salvou diferente: ${differences.join(", ")}.`);
    console.warn("Divergencia ao confirmar perfil", { differences, profile, library, participant });
    return false;
  }

  mergeMemberProfiles([profile]);
  mergeMemberLibraryRows([library]);
  return true;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

async function loadMemberProfiles() {
  if (!clubDb) return false;
  const result = await loadRecordsFromServer("club_members");
  if (!result.ok) {
    console.warn("Nao foi possivel carregar integrantes do Supabase", result.error);
    return false;
  }
  const data = result.data
    .slice()
    .sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0) || Date.parse(a.updated_at || 0) - Date.parse(b.updated_at || 0));
  mergeMemberProfiles(data || []);
  return true;
}

function mergeMemberProfiles(rows = []) {
  rows.forEach((row) => {
    const participant = participantFromMemberRow(row);
    const linkedUser = state.users.find((item) => item.supabaseUserId === row.user_id || item.email === row.email);
    const existingParticipant = participantById(participant.id) || participantById(linkedUser?.participantId);
    if (existingParticipant) {
      const existingTime = Date.parse(existingParticipant.profileUpdatedAt || existingParticipant.updatedAt || 0);
      const incomingTime = Date.parse(participant.profileUpdatedAt || participant.updatedAt || 0);
      if (!existingTime || !incomingTime || incomingTime >= existingTime) {
        Object.assign(existingParticipant, { ...existingParticipant, ...participant });
      }
    } else {
      state.participants.push(participant);
    }

    const existingUser = state.users.find((item) => item.supabaseUserId === row.user_id || item.email === row.email);
    const user = {
      name: participant.name,
      email: row.email,
      participantId: participant.id,
      supabaseUserId: row.user_id,
    };
    if (existingUser) {
      Object.assign(existingUser, { ...existingUser, ...user });
    } else {
      state.users.push(user);
    }
    state.progress[participant.id] ||= {};
    state.favorites[participant.id] ||= [];
  });
  normalizeIndicationOrder();
  persistLocalState();
}

function participantFromMemberRow(row) {
  const memberName = row.name || row.email?.split("@")[0] || "Integrante";
  const profile = {
    personality: row.personality || "emocao",
    genre: Array.isArray(row.genres) && row.genres.length ? row.genres[0] : "Leituras surpresa",
    discussion: row.discussion || "debater",
    booksReadYear: Number(row.books_read_year || 0),
    booksReadClub: Number(row.books_read_club || 0),
    goal: Number(row.goal || 12),
  };
  return {
    id: row.participant_id || row.user_id,
    name: memberName,
    role: generateRole(profile, memberName),
    tone: row.tone || toneFor(profile.personality),
    favoriteBook: row.favorite_book || "Ainda escolhendo",
    favoriteCharacter: row.favorite_character || "Ainda escolhendo",
    quote: row.quote || "Meu passaporte começou hoje.",
    goal: profile.goal,
    booksReadYear: profile.booksReadYear,
    booksReadClub: profile.booksReadClub,
    genres: Array.isArray(row.genres) ? row.genres : [profile.genre],
    personality: profile.personality,
    discussion: profile.discussion,
    photo: row.photo || "",
    profileUpdatedAt: row.updated_at || row.created_at || "",
  };
}

function ensureClubUser(authUser, signupData = null) {
  const email = authUser.email.toLowerCase();
  let user = state.users.find((item) => item.email === email || item.supabaseUserId === authUser.id);
  if (user) {
    user.supabaseUserId = authUser.id;
    if (!participantById(user.participantId)) {
      const fallbackProfile = {
        personality: "emocao",
        genre: "Leituras surpresa",
        discussion: "debater",
        booksReadYear: 0,
        booksReadClub: 0,
        goal: 12,
      };
      const participant = createParticipant(user.name || email.split("@")[0], fallbackProfile, user.participantId || authUser.id);
      state.participants.push(participant);
      user.participantId = participant.id;
    }
    return user;
  }

  const name = signupData?.name || authUser.user_metadata?.name || email.split("@")[0];
  const profile = signupData?.profile || {
    personality: "emocao",
    genre: "Leituras surpresa",
    discussion: "debater",
    booksReadYear: 0,
    booksReadClub: 0,
    goal: 12,
  };
  const participant = createParticipant(name, profile, authUser.id);
  user = { name, email, participantId: participant.id, supabaseUserId: authUser.id };
  addUserToState(user, participant);
  return user;
}

function addUserToState(user, participant) {
  state.participants.push(participant);
  state.users.push(user);
  state.indicationOrder.push(participant.id);
  state.progress[participant.id] = {};
  state.favorites[participant.id] = [];
}

function authErrorMessage(error) {
  const text = error?.message || "";
  if (/invalid login credentials/i.test(text)) return "E-mail ou senha incorretos.";
  if (/already registered|already exists|user already/i.test(text)) return "Essa conta ja existe. Use Entrar para abrir seu passaporte.";
  if (/password/i.test(text)) return "A senha precisa ter pelo menos 6 caracteres.";
  return `Nao consegui entrar: ${text}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return clone(seed);
  try {
    const parsed = JSON.parse(saved);
    if (parsed.__version !== APP_VERSION) return clone(seed);
    return withStateDefaults({ ...clone(seed), ...parsed });
  } catch {
    return clone(seed);
  }
}

function saveState() {
  state.__version = APP_VERSION;
  state.__localUpdatedAt = new Date().toISOString();
  persistLocalState();
  queueCloudSave();
}

function persistLocalState() {
  state.__version = APP_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function mergeClubStates(cloudState, localState, baseState = null) {
  const merged = withStateDefaults({ ...clone(seed), ...cloudState, ...localState });
  merged.users = mergeUsers(cloudState.users, localState.users, baseState?.users);
  merged.participants = mergeById(cloudState.participants, localState.participants, baseState?.participants);
  merged.books = mergeById(cloudState.books, localState.books, baseState?.books);
  merged.feed = mergeById(cloudState.feed, localState.feed, baseState?.feed).sort(sortNewestFirst);
  merged.notifications = mergeById(cloudState.notifications, localState.notifications, baseState?.notifications).sort(sortNewestFirst).slice(0, 40);
  merged.reviews = mergeReviews(cloudState.reviews, localState.reviews, baseState?.reviews);
  merged.progress = mergeNestedObjects(cloudState.progress, localState.progress, baseState?.progress);
  merged.favorites = mergeArrayMap(cloudState.favorites, localState.favorites, baseState?.favorites);
  merged.notificationSettings = localChanged(localState.notificationSettings, baseState?.notificationSettings)
    ? {
      ...(cloudState.notificationSettings || {}),
      ...(localState.notificationSettings || {}),
    reminders: {
      ...(cloudState.notificationSettings?.reminders || {}),
      ...(localState.notificationSettings?.reminders || {}),
    },
    }
    : cloudState.notificationSettings || localState.notificationSettings || {};
  merged.indicationOrder = mergeOrder(cloudState.indicationOrder, localState.indicationOrder, merged.participants);
  merged.meeting = localChanged(localState.meeting, baseState?.meeting) ? localState.meeting : cloudState.meeting || localState.meeting || clone(seed.meeting);
  merged.rules = localChanged(localState.rules, baseState?.rules) ? localState.rules : cloudState.rules || localState.rules || seed.rules;
  return withStateDefaults(merged);
}

function mergeById(cloudItems = [], localItems = [], baseItems = []) {
  const map = new Map();
  const baseMap = itemMap(baseItems);
  (cloudItems || []).forEach((item) => {
    if (!item) return;
    const key = item.id || item.email || fallbackKey(item);
    map.set(key, item);
  });
  (localItems || []).forEach((item) => {
    if (!item) return;
    const key = item.id || item.email || fallbackKey(item);
    const cloudItem = map.get(key);
    const baseItem = baseMap.get(key);
    const cloudTime = itemTime(cloudItem);
    const localTime = itemTime(item);
    if (cloudItem && cloudTime && localTime && cloudTime !== localTime) {
      map.set(key, localTime > cloudTime ? { ...cloudItem, ...item } : { ...item, ...cloudItem });
      return;
    }
    if (!cloudItem || localChanged(item, baseItem)) {
      map.set(key, { ...(cloudItem || {}), ...item });
    }
  });
  return [...map.values()];
}

function itemTime(item) {
  return Date.parse(item?.profileUpdatedAt || item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at || 0) || 0;
}

function mergeUsers(cloudUsers = [], localUsers = [], baseUsers = []) {
  const map = new Map();
  const baseMap = userMap(baseUsers);
  (cloudUsers || []).forEach((user) => {
    if (!user) return;
    const key = user.supabaseUserId || user.email || user.participantId || fallbackKey(user);
    map.set(key, user);
  });
  (localUsers || []).forEach((user) => {
    if (!user) return;
    const key = user.supabaseUserId || user.email || user.participantId || fallbackKey(user);
    const cloudUser = map.get(key);
    const baseUser = baseMap.get(key);
    if (!cloudUser || localChanged(user, baseUser)) {
      map.set(key, { ...(cloudUser || {}), ...user });
    }
  });
  return [...map.values()];
}

function mergeReviews(cloudReviews = {}, localReviews = {}, baseReviews = {}) {
  const result = {};
  [...new Set([...Object.keys(cloudReviews || {}), ...Object.keys(localReviews || {})])].forEach((bookId) => {
    result[bookId] = mergeByParticipant(cloudReviews?.[bookId], localReviews?.[bookId], baseReviews?.[bookId]);
  });
  return result;
}

function mergeByParticipant(cloudItems = [], localItems = [], baseItems = []) {
  const map = new Map();
  const baseMap = participantMap(baseItems);
  (cloudItems || []).forEach((item) => {
    if (!item) return;
    const key = item.participantId || fallbackKey(item);
    map.set(key, item);
  });
  (localItems || []).forEach((item) => {
    if (!item) return;
    const key = item.participantId || fallbackKey(item);
    const cloudItem = map.get(key);
    const baseItem = baseMap.get(key);
    if (!cloudItem || localChanged(item, baseItem)) {
      map.set(key, { ...(cloudItem || {}), ...item });
    }
  });
  return [...map.values()];
}

function mergeNestedObjects(cloudValue = {}, localValue = {}, baseValue = {}) {
  const result = { ...(cloudValue || {}) };
  Object.entries(localValue || {}).forEach(([key, value]) => {
    result[key] ||= {};
    Object.entries(value || {}).forEach(([childKey, childValue]) => {
      const baseChild = baseValue?.[key]?.[childKey];
      if (!(childKey in result[key]) || localChanged(childValue, baseChild)) {
        result[key][childKey] = childValue;
      }
    });
  });
  return result;
}

function mergeArrayMap(cloudValue = {}, localValue = {}, baseValue = {}) {
  const result = { ...(cloudValue || {}) };
  Object.entries(localValue || {}).forEach(([key, value]) => {
    result[key] = localChanged(value, baseValue?.[key])
      ? [...new Set([...(result[key] || []), ...(value || [])])]
      : result[key] || value || [];
  });
  return result;
}

function mergeOrder(cloudOrder = [], localOrder = [], participants = []) {
  const ids = [...(cloudOrder || []), ...(localOrder || []), ...(participants || []).map((item) => item.id)];
  return [...new Set(ids.filter(Boolean))];
}

function sortNewestFirst(a, b) {
  return Date.parse(b.createdAt || b.date || 0) - Date.parse(a.createdAt || a.date || 0);
}

function itemMap(items = []) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item) map.set(item.id || item.email || fallbackKey(item), item);
  });
  return map;
}

function userMap(items = []) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item) map.set(item.supabaseUserId || item.email || item.participantId || fallbackKey(item), item);
  });
  return map;
}

function participantMap(items = []) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item) map.set(item.participantId || fallbackKey(item), item);
  });
  return map;
}

function localChanged(localValue, baseValue) {
  if (baseValue === undefined) return true;
  return stableJson(localValue) !== stableJson(baseValue);
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function fallbackKey(item) {
  return JSON.stringify(item);
}

function withStateDefaults(value) {
  value.users ||= [];
  value.participants ||= [];
  value.books ||= [];
  value.reviews ||= {};
  value.progress ||= {};
  value.favorites ||= {};
  value.notifications ||= [];
  value.notificationSettings ||= {};
  value.notificationSettings.pushEnabled ||= false;
  value.notificationSettings.reminders ||= {};
  value.notificationSettings.readNotificationIds ||= [];
  value.indicationOrder ||= [];
  value.feed ||= [];
  value.feed.forEach((item) => {
    item.reactions = normalizedReactions(item);
    item.likedBy = item.reactions.heart || [];
    item.comments ||= [];
    item.comments.forEach((comment) => {
      comment.reactions = normalizedReactions(comment);
      comment.likedBy = comment.reactions.heart || [];
    });
    item.likes = reactionTotal(item.reactions);
  });
  Object.values(value.reviews || {}).forEach((reviews) => {
    (reviews || []).forEach((review) => {
      review.reactions = normalizedReactions(review);
      review.likedBy = review.reactions.heart || [];
    });
  });
  Object.values(value.progress || {}).forEach(normalizeReadingProgress);
  return value;
}

function normalizeReadingProgress(progress = {}) {
  if (!progress || typeof progress !== "object") return {};
  progress.__startedDates = progress.__startedDates && typeof progress.__startedDates === "object" ? progress.__startedDates : {};
  progress.__completedDates = progress.__completedDates && typeof progress.__completedDates === "object" ? progress.__completedDates : {};
  progress.__bookTags = progress.__bookTags && typeof progress.__bookTags === "object" ? progress.__bookTags : {};
  return progress;
}

function memberProgress(participantId = currentParticipant()?.id || "") {
  if (!participantId) return normalizeReadingProgress({});
  state.progress[participantId] ||= {};
  return normalizeReadingProgress(state.progress[participantId]);
}

function normalizedReactions(target = {}) {
  const result = {};
  REACTION_OPTIONS.forEach((option) => {
    result[option.key] = Array.isArray(target.reactions?.[option.key])
      ? [...new Set(target.reactions[option.key])]
      : [];
  });
  if (Array.isArray(target.likedBy) && target.likedBy.length) {
    result.heart = [...new Set([...(result.heart || []), ...target.likedBy])];
  }
  return result;
}

function reactionTotal(reactions = {}) {
  return REACTION_OPTIONS.reduce((sum, option) => sum + (reactions[option.key]?.length || 0), 0);
}

function toggleReactionOnTarget(target, participantId, reactionKey) {
  target.reactions = normalizedReactions(target);
  const previousKey = REACTION_OPTIONS.find((option) => target.reactions[option.key].includes(participantId))?.key || "";
  REACTION_OPTIONS.forEach((option) => {
    target.reactions[option.key] = target.reactions[option.key].filter((id) => id !== participantId);
  });
  if (previousKey !== reactionKey) {
    target.reactions[reactionKey] ||= [];
    target.reactions[reactionKey].push(participantId);
  }
  target.likedBy = target.reactions.heart || [];
  target.likes = reactionTotal(target.reactions);
}

function startSession(user) {
  session = { email: user.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  showApp();
}

function showApp() {
  const user = getUser();
  if (!user) {
    showAuth();
    return;
  }
  bootScreen.classList.add("hidden");
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  document.querySelector("#session-name").textContent = user.name;
  document.querySelector("#session-initials").textContent = initials(user.name);
  checkMeetingReminders();
  updateNotificationBadge();
  setView(currentView, { history: internalNavigationReady ? "none" : "replace" });
}

function showAuth() {
  bootScreen.classList.add("hidden");
  appShell.classList.add("hidden");
  authScreen.classList.remove("hidden");
  internalNavigationReady = false;
  lastRouteKey = "";
}

function routeState() {
  return {
    pobresCriaturasRoute: true,
    view: currentView,
    selectedBookId: selectedBookId || "",
    selectedParticipantId: selectedParticipantId || "",
    bookHistoryOpen: Boolean(bookHistoryOpen),
    bookHistoryScope: bookHistoryScope || "all",
  };
}

function routeKey(route = routeState()) {
  const view = route.view || "feed";
  const bookId = view === "books" ? route.selectedBookId || "" : "";
  const participantId = view === "participant" ? route.selectedParticipantId || "" : "";
  const history = view === "books" && route.bookHistoryOpen ? "history" : "";
  const scope = history ? route.bookHistoryScope || "all" : "";
  return `${view}|${bookId}|${participantId}|${history}|${scope}`;
}

function rememberRoute(mode = "push") {
  if (restoringHistory || !window.history?.pushState) return;
  const route = routeState();
  const key = routeKey(route);

  if (!internalNavigationReady || mode === "replace") {
    window.history.replaceState(route, "", window.location.href);
    internalNavigationReady = true;
    lastRouteKey = key;
    return;
  }

  if (mode === "none" || key === lastRouteKey) return;
  window.history.pushState(route, "", window.location.href);
  lastRouteKey = key;
}

function restoreRoute(route) {
  if (!route?.pobresCriaturasRoute) return false;
  restoringHistory = true;
  selectedBookId = route.selectedBookId || selectedBookId || "";
  selectedParticipantId = route.selectedParticipantId || selectedParticipantId || "";
  bookHistoryOpen = route.view === "books" ? Boolean(route.bookHistoryOpen) : false;
  bookHistoryScope = route.view === "books" ? route.bookHistoryScope || "all" : "all";
  setView(route.view || "feed", { history: "none" });
  restoringHistory = false;
  lastRouteKey = routeKey(routeState());
  return true;
}

function setView(view, options = {}) {
  const titles = {
    home: "Início",
    passport: "Passaporte",
    books: "Livros do mês",
    feed: "Feed de leitura",
    rules: "Ordem e Regras",
    favorites: "Favoritos",
    stats: "Estatísticas",
    participant: "Perfil da integrante",
    profile: "Meu perfil",
  };
  const renderers = {
    home: renderHome,
    passport: renderPassport,
    books: renderBooks,
    feed: renderFeed,
    rules: renderRules,
    favorites: renderFavorites,
    stats: renderStats,
    participant: renderParticipantProfile,
    profile: renderProfile,
  };
  if (!renderers[view]) {
    view = "feed";
  }
  currentView = view;
  viewTitle.textContent = titles[view];
  const activeView = view === "participant" ? "passport" : view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === activeView));
  renderers[view]();
  rememberRoute(options.history || "push");
}

function openBooks(bookId = "") {
  selectedBookId = bookId || latestBook()?.id || "";
  reviewFormOpen = false;
  bookFormMode = null;
  readingDetailsOpen = false;
  bookHistoryOpen = false;
  bookHistoryScope = "all";
  setView("books");
}

function openParticipant(participantId = "") {
  selectedParticipantId = participantId || currentParticipant()?.id || "";
  setView("participant");
}

function wireNavigationLinks(root = viewRoot) {
  root.querySelectorAll("[data-open-book]").forEach((element) => {
    bindNavigationTrigger(element, () => openBooks(element.dataset.openBook));
  });
  root.querySelectorAll("[data-open-participant]").forEach((element) => {
    bindNavigationTrigger(element, () => openParticipant(element.dataset.openParticipant));
  });
}

function bindNavigationTrigger(element, action) {
  if (!element || element.dataset.navigationReady === "true") return;
  element.dataset.navigationReady = "true";
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  if (element.tagName !== "BUTTON" && element.tagName !== "A") {
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      action();
    });
  }
}

async function runReactionAction(button, action) {
  if (!button || button.dataset.reacting === "true") return;
  const widget = button.closest(".reaction-widget");
  const options = widget ? [...widget.querySelectorAll(".reaction-option")] : [button];
  button.dataset.reacting = "true";
  button.classList.add("is-reacting");
  widget?.classList.add("is-reacting");
  options.forEach((option) => {
    option.dataset.wasDisabled = option.disabled ? "true" : "false";
    option.disabled = true;
  });
  try {
    await action();
  } finally {
    button.classList.remove("is-reacting");
    delete button.dataset.reacting;
    widget?.classList.remove("is-reacting");
    options.forEach((option) => {
      option.disabled = option.dataset.wasDisabled === "true";
      delete option.dataset.wasDisabled;
    });
  }
}

function getUser() {
  return state.users.find((user) => user.email === session?.email);
}

function currentParticipant() {
  const user = getUser();
  return state.participants.find((participant) => participant.id === user?.participantId) || state.participants[0];
}

function createParticipant(name, profile, preferredId = "") {
  const id = preferredId || uniqueId(slug(name), state.participants.map((item) => item.id));
  return {
    id,
    name,
    role: generateRole(profile, name),
    tone: toneFor(profile.personality),
    favoriteBook: "Ainda escolhendo",
    favoriteCharacter: "Ainda escolhendo",
    quote: "Meu passaporte começou hoje.",
    goal: profile.goal,
    booksReadYear: profile.booksReadYear,
    booksReadClub: profile.booksReadClub,
    genres: [profile.genre],
    personality: profile.personality,
    discussion: profile.discussion,
  };
}

function generateRole(profile, name = "") {
  return generateVariedRole(profile, name);
  const openings = {
    teorias: "Ministra das teorias impossíveis",
    emocao: "Curadora das leituras que deixam marca",
    fantasia: "Cartógrafa dos mundos estranhos",
    critica: "Auditora das estrelas difíceis",
    romance: "Diplomata dos romances intensos",
  };
  const endings = {
    investigar: "e dos detalhes sublinhados",
    sentir: "e das frases guardadas no peito",
    debater: "e dos debates sem hora para acabar",
    ouvir: "e dos vereditos precisos",
  };
  return `${openings[profile.personality]} ${endings[profile.discussion]}`;
}

function generateVariedRole(profile = {}, name = "") {
  const openings = {
    teorias: ["Ministra das teorias impossiveis", "Investigadora dos detalhes suspeitos", "Oraculista dos finais improvaveis"],
    emocao: ["Curadora das leituras que deixam marca", "Guardia das frases que ficam", "Colecionadora de cenas que apertam o peito"],
    fantasia: ["Cartografa dos mundos estranhos", "Viajante das terras impossiveis", "Embaixadora dos reinos inventados"],
    critica: ["Auditora das estrelas dificeis", "Juiza das tramas bem amarradas", "Fiscal dos furos de roteiro"],
    romance: ["Diplomata dos romances intensos", "Especialista em personagens dramaticos", "Conselheira dos coracoes literarios"],
  };
  const endings = {
    investigar: ["e dos detalhes sublinhados", "com lupa nas pistas do capitulo", "que sempre suspeita de alguem"],
    sentir: ["e das frases guardadas no peito", "que le com o coracao aberto", "dos surtos discretos no meio da leitura"],
    debater: ["e dos debates sem hora para acabar", "que chega pronta para defender uma teoria", "das conversas que viram madrugada"],
    ouvir: ["e dos vereditos precisos", "que escuta tudo antes do golpe final", "das opinioes calmas e certeiras"],
  };
  const genre = normalizeList(profile.genre || profile.genres?.[0] || "")[0] || "leituras surpresa";
  const seedText = `${name}|${profile.personality}|${profile.discussion}|${genre}|${profile.booksReadYear || 0}|${profile.booksReadClub || 0}`;
  const seed = hashText(seedText);
  const openingList = openings[profile.personality] || openings.emocao;
  const endingList = endings[profile.discussion] || endings.debater;
  return `${openingList[seed % openingList.length]} ${endingList[Math.floor(seed / 3) % endingList.length]}`;
}

function hashText(text = "") {
  return [...String(text)].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function toneFor(personality) {
  return {
    teorias: "blue",
    emocao: "rose",
    fantasia: "green",
    critica: "gold",
    romance: "rose",
  }[personality] || "gold";
}

function renderHome() {
  const participant = currentParticipant();
  const featuredBook = latestBook();
  const readingBook = currentReadingBook(participant) || featuredBook;
  const favoriteBook = bookByTitle(participant.favoriteBook);
  const featuredProgress = featuredBook ? state.progress[participant.id]?.[featuredBook.id] || 0 : 0;
  const readingProgress = readingBook ? state.progress[participant.id]?.[readingBook.id] || 0 : 0;
  viewRoot.innerHTML = `
    <section class="hero-grid">
      <article class="passport-page">
        <div class="passport-title has-portrait">
          <img src="./assets/logo-pobres-criaturas.png" alt="Logo Pobres Criaturas" />
          <div>
            <p class="eyebrow">Esse passaporte pertence a</p>
            <h3>${escapeHtml(participant.name)}</h3>
            <p class="muted">${escapeHtml(participant.role)}</p>
          </div>
          ${passportPortraitHtml(participant)}
        </div>
        <div class="passport-meta">
          <div class="stamp ${favoriteBook ? "clickable-stamp" : ""}" ${favoriteBook ? `role="button" tabindex="0" data-open-book="${escapeAttr(favoriteBook.id)}"` : ""}><span>Livro favorito</span><strong>${escapeHtml(participant.favoriteBook)}</strong></div>
          <div class="stamp"><span>Lidos no ano</span><strong>${participant.booksReadYear || 0} livros</strong></div>
          <div class="stamp"><span>Lidos no clube</span><strong>${participant.booksReadClub || 0} livros</strong></div>
          <div class="stamp"><span>Meta do ano</span><strong>${participant.goal || 0} livros</strong></div>
          <div class="stamp"><span>Carimbo atual</span><strong>${readingBook ? `${readingProgress}% de ${escapeHtml(readingBook.title)}` : "Nenhum livro cadastrado"}</strong></div>
        </div>
      </article>
      ${meetingEditing ? meetingForm() : meetingSummary()}
    </section>

    ${featuredBook ? `
      <section class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Leitura em destaque</p>
            <h3><button class="inline-link book-title-link" type="button" data-open-book="${escapeAttr(featuredBook.id)}">${escapeHtml(featuredBook.title)}</button></h3>
          </div>
          <button class="secondary-button" data-open-featured-book="${escapeAttr(featuredBook.id)}">Abrir livro</button>
        </div>
        <div class="book-showcase">
          <div class="book-cover-link clickable-book" role="button" tabindex="0" data-open-book="${escapeAttr(featuredBook.id)}">
            ${coverHtml(featuredBook)}
          </div>
          <div>
            ${synopsisTeaserHtml(featuredBook.synopsis)}
            <div class="rating-big">${formatRating(averageFor(featuredBook.id))} <span class="star-row">${stars(averageFor(featuredBook.id))}</span></div>
            <div class="progress-track" aria-label="Progresso ${featuredProgress}%"><div class="progress-fill" style="--value: ${featuredProgress}%"></div></div>
            <p class="muted">${featuredProgress}% lido por você. Média calculada com ${reviewsFor(featuredBook.id).length} avaliação${reviewsFor(featuredBook.id).length === 1 ? "" : "ões"}.</p>
          </div>
        </div>
      </section>
    ` : emptyBooksPanel()}

  `;

  document.querySelector("[data-edit-meeting]")?.addEventListener("click", () => {
    meetingEditing = true;
    renderHome();
  });
  document.querySelector("#meeting-form")?.addEventListener("submit", submitWithLoading(saveMeeting, "Salvando reuni\u00e3o..."));
  document.querySelector("[data-cancel-meeting]")?.addEventListener("click", () => {
    meetingEditing = false;
    renderHome();
  });
  document.querySelector("[data-jump='books']")?.addEventListener("click", () => openBooks());
  document.querySelector("[data-open-featured-book]")?.addEventListener("click", () => openBooks(featuredBook?.id));
  wireNavigationLinks();
}

function meetingSummary() {
  const book = bookById(state.meeting.bookId);
  const hasMeeting = state.meeting.date || state.meeting.time || state.meeting.place || state.meeting.notes || book;
  return `
    <article class="panel meeting-summary">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Próxima reunião</p>
          <h3>${hasMeeting ? `${state.meeting.date ? formatDate(state.meeting.date) : "Data a definir"}${state.meeting.time ? ` às ${state.meeting.time}` : ""}` : "Reunião ainda não marcada"}</h3>
        </div>
        <button class="icon-button" data-edit-meeting title="Alterar reunião" aria-label="Alterar reunião">✎</button>
      </div>
      <div class="meeting-facts">
        <div class="stamp ${book ? "clickable-stamp" : ""}" ${book ? `role="button" tabindex="0" data-open-book="${escapeAttr(book.id)}"` : ""}><span>Livro</span><strong>${book ? escapeHtml(book.title) : "A definir"}</strong></div>
        <div class="stamp"><span>Local</span><strong>${state.meeting.place ? escapeHtml(state.meeting.place) : "A definir"}</strong></div>
        <div class="stamp"><span>Informações</span><strong>${state.meeting.notes ? escapeHtml(state.meeting.notes) : "Sem observações"}</strong></div>
      </div>
    </article>
  `;
}

function meetingForm() {
  return `
    <article class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Editar reunião</p>
          <h3>Dados da próxima reunião</h3>
        </div>
      </div>
      <form class="meeting-form" id="meeting-form">
        <label><span>Data</span><input type="date" name="date" value="${state.meeting.date || ""}" /></label>
        <label><span>Hora</span><input type="time" name="time" value="${state.meeting.time || ""}" /></label>
        <label><span>Livro</span>${bookSelect(state.meeting.bookId, true)}</label>
        <label><span>Local</span><input name="place" value="${escapeAttr(state.meeting.place)}" /></label>
        <label><span>Informações necessárias</span><textarea name="notes">${escapeHtml(state.meeting.notes)}</textarea></label>
        <div class="button-row">
          <button class="save-button" type="submit">Salvar reunião</button>
          <button class="ghost-button" type="button" data-cancel-meeting>Cancelar</button>
        </div>
      </form>
    </article>
  `;
}

function renderPassport() {
  viewRoot.innerHTML = `
    <section class="passport-page">
      <div class="passport-title">
        <img src="./assets/selo-republica-livro.png" alt="Selo República Federativa do Livro" />
        <div>
          <p class="eyebrow">Cabeçalho das integrantes</p>
          <h3>República Federativa do Livro</h3>
          <p class="muted">As integrantes aparecem aqui conforme entram e se inscrevem no clube.</p>
        </div>
      </div>
    </section>
    ${state.participants.length ? `<section class="participants-grid">${state.participants.map(participantCard).join("")}</section>` : emptyPanel("Nenhuma integrante inscrita ainda", "Quando alguém se cadastrar, o passaporte dela aparece aqui.")}
  `;
  wireNavigationLinks();
}

function renderParticipantProfile() {
  const participant = participantById(selectedParticipantId) || currentParticipant();
  if (!participant) {
    setView("passport");
    return;
  }
  selectedParticipantId = participant.id;
  viewTitle.textContent = participant.name;
  const indicatedBooks = sortedBooks().filter((book) => book.indicatedBy === participant.id);
  const reviewRows = participantReviewEntries(participant.id);
  const completedRows = participantCompletedEntries(participant.id);
  const favoriteBooks = (state.favorites[participant.id] || []).map(bookById).filter(Boolean);
  const currentBook = currentReadingBook(participant);
  const profileFavoriteBook = bookByTitle(participant.favoriteBook);
  const currentProgress = currentBook ? Number(state.progress[participant.id]?.[currentBook.id] || 0) : 0;
  const indicatedScores = indicatedBooks.map((book) => averageFor(book.id)).filter(Boolean);
  const reviewScores = reviewRows.map((item) => Number(item.review.rating || 0)).filter(Boolean);

  viewRoot.innerHTML = `
    <section class="passport-page participant-profile">
      <div class="section-heading">
        <button class="ghost-button" type="button" data-back-club>Voltar para Clube</button>
      </div>
      <div class="passport-title has-portrait">
        <div>
          <p class="eyebrow">Passaporte da integrante</p>
          <h3>${escapeHtml(participant.name)}</h3>
          <p class="muted">${escapeHtml(participant.role)}</p>
        </div>
        ${passportPortraitHtml(participant)}
      </div>
      <div class="profile-facts">
        <div class="stamp ${profileFavoriteBook ? "clickable-stamp" : ""}" ${profileFavoriteBook ? `role="button" tabindex="0" data-open-book="${escapeAttr(profileFavoriteBook.id)}"` : ""}><span>Livro favorito</span><strong>${escapeHtml(participant.favoriteBook || "Ainda escolhendo")}</strong></div>
        <div class="stamp"><span>Personagem fav</span><strong>${escapeHtml(participant.favoriteCharacter || "Ainda escolhendo")}</strong></div>
        <div class="stamp ${currentBook ? "clickable-stamp" : ""}" ${currentBook ? `role="button" tabindex="0" data-open-book="${escapeAttr(currentBook.id)}"` : ""}><span>Leitura atual</span><strong>${currentBook ? `${currentProgress}% de ${escapeHtml(currentBook.title)}` : "Nenhum livro cadastrado"}</strong></div>
        <div class="stamp"><span>Gêneros favoritos</span><strong>${escapeHtml((participant.genres || []).join(", ") || "Ainda escolhendo")}</strong></div>
      </div>
      <p>${escapeHtml(participant.quote || "Meu passaporte começou hoje.")}</p>
    </section>

    <section class="stats-grid">
      ${statCard("Lidos no ano", String(participant.booksReadYear || 0), String(new Date().getFullYear()))}
      ${statCard("Lidos no clube", String(participant.booksReadClub || 0), "desde a entrada")}
      ${statCard("Indicações cadastradas", String(indicatedBooks.length), "livros escolhidos por ela")}
      ${statCard("Média das indicações", averageLabel(indicatedScores), "pelas avaliações do clube")}
      ${statCard("Avaliações feitas", String(reviewRows.length), "resenhas ou estrelas")}
      ${statCard("Média das notas dela", averageLabel(reviewScores), "como avaliadora")}
      ${statCard("Favoritos", String(favoriteBooks.length), "estante pessoal")}
      ${statCard("Gêneros indicados", participantGenreLine(participant.id), "mais frequentes")}
    </section>

    <section class="participant-detail-grid">
      <article class="panel">
        <p class="eyebrow">Indicações</p>
        <h3>Livros indicados por ${escapeHtml(participant.name)}</h3>
        ${groupedBookList(indicatedBooks, "Nenhum livro indicado ainda.", (book) => `${book.month} ${book.year} · média ${averageFor(book.id).toFixed(1)}`)}
      </article>

      <article class="panel">
        <p class="eyebrow">Leituras concluídas</p>
        <h3>Histórico de finalizações</h3>
        ${completedBookList(completedRows)}
      </article>

      <article class="panel">
        <p class="eyebrow">Avaliações</p>
        <h3>O que ${escapeHtml(participant.name)} avaliou</h3>
        ${participantReviewList(reviewRows)}
      </article>

      <article class="panel">
        <p class="eyebrow">Favoritos</p>
        <h3>Estante afetiva</h3>
        ${linkedBookList(favoriteBooks, "Nenhum favorito marcado ainda.", (book) => `${book.author} · média ${averageFor(book.id).toFixed(1)}`)}
      </article>
    </section>
  `;

  document.querySelector("[data-back-club]")?.addEventListener("click", () => setView("passport"));
  wireNavigationLinks();
}

function renderBooks() {
  captureOpenDrafts();
  const selected = bookById(selectedBookId) || latestBook();
  if (selected) selectedBookId = selected.id;
  viewRoot.innerHTML = `
    <section class="panel compact-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Biblioteca do clube</p>
          <h3>${bookFormMode === "edit" ? "Editar livro selecionado" : bookFormMode === "create" ? "Cadastrar livro" : "Livros passados, atuais e futuros"}</h3>
        </div>
        ${bookFormMode ? "" : `<button class="save-button" type="button" data-open-book-form>Cadastrar livro</button>`}
      </div>
      ${bookFormMode ? bookFormHtml(bookFormMode === "edit" ? selected : null) : `<p class="muted">Use o botão quando precisar incluir um livro novo ou editar um livro já cadastrado.</p>`}
    </section>

    ${state.books.length ? `
      ${bookYearGroupsHtml(selected?.id)}
      ${selected ? bookReviewArea(selected) : ""}
    ` : emptyBooksPanel()}
  `;

  document.querySelector("[data-open-book-form]")?.addEventListener("click", () => {
    bookFormMode = "create";
    bookFormDraft = null;
    renderBooks();
  });
  document.querySelector("#book-form")?.addEventListener("submit", submitWithLoading(saveBook, "Salvando livro..."));
  document.querySelector("#book-form")?.addEventListener("input", captureBookFormDraft);
  document.querySelector("#book-form")?.addEventListener("change", captureBookFormDraft);
  document.querySelector("[data-cancel-book-form]")?.addEventListener("click", () => {
    bookFormMode = null;
    bookFormDraft = null;
    renderBooks();
  });
  document.querySelectorAll("[data-book]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedBookId = button.dataset.book;
      if (bookFormMode === "edit") {
        bookFormMode = null;
        bookFormDraft = null;
      }
      reviewFormOpen = false;
      reviewFormDraft = null;
      readingDetailsOpen = false;
      bookHistoryOpen = false;
      bookHistoryScope = "all";
      renderBooks();
    });
  });
  wireReviewControls(selected);
  wireBookDetailControls(selected);
  wireNavigationLinks();
}

function bookReviewArea(selected) {
  const ownReview = myReview(selected.id);
  return `
    <section class="book-detail-stack">
      <section class="review-layout">
        <article class="panel">
          <div class="book-showcase">
            ${coverHtml(selected)}
            <div>
              <p class="eyebrow">${escapeHtml(selected.month)} ${selected.year} | indicado por <button class="inline-link compact-link" type="button" data-open-participant="${escapeAttr(selected.indicatedBy)}">${escapeHtml(nameById(selected.indicatedBy))}</button></p>
              <h3>${escapeHtml(selected.title)}</h3>
              <p class="muted">${escapeHtml(selected.author)} | ${escapeHtml(selected.genre || "Sem gênero")} | ${selected.pages || "?"} páginas</p>
              <div class="rating-big">${formatRating(averageFor(selected.id))} <span class="star-row">${stars(averageFor(selected.id))}</span></div>
              <div class="button-row">
                <button class="favorite-toggle ${isFavorite(selected.id) ? "active" : ""}" data-favorite="${selected.id}">
                  ${isFavorite(selected.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                </button>
                <button class="ghost-button" type="button" data-edit-book>Editar livro</button>
              </div>
              ${selected.synopsis ? `<div class="book-synopsis">${synopsisTeaserHtml(selected.synopsis, 320)}</div>` : ""}
            </div>
          </div>
        </article>
        ${bookReadingPanel(selected)}
      </section>
      ${reviewFormOpen ? reviewFormHtml(selected, ownReview) : reviewSummaryHtml(selected, ownReview)}
    </section>
    ${bookHistoryOpen ? bookReadingHistoryPanel(selected) : ""}
    <section class="review-list">
      <article class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Avaliações do clube</p>
            <h3>Resenhas e estrelas</h3>
          </div>
        </div>
        <div class="review-list">
          ${reviewsFor(selected.id).length ? reviewsFor(selected.id).map((review) => reviewCard(review, selected.id)).join("") : `<p class="muted">Ainda sem avaliações. Quando as integrantes salvarem estrelas, a média aparece aqui.</p>`}
        </div>
      </article>
    </section>
  `;
}

function bookReadingPanel(book) {
  const participant = currentParticipant();
  const meta = readingMeta(participant.id, book.id);
  const ownReview = myReview(book.id);
  const historyCount = bookFeedItems(book.id, participant.id).length;
  const allHistoryCount = bookFeedItems(book.id).length;
  return `
    <article class="panel my-reading-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Minha leitura</p>
          <h3>Dados deste livro</h3>
        </div>
        ${readingDetailsOpen ? "" : `<button class="save-button" type="button" data-open-reading-details>Editar dados</button>`}
      </div>
      ${readingDetailsOpen ? readingDetailsFormHtml(book, meta) : `
        <div class="book-options-grid">
          ${bookOptionCard("Status", readingStatusFromProgress(meta.progress), `${meta.progress}% registrado`)}
          ${bookOptionCard("Minha nota", ownReview ? `${formatRating(ownReview.rating)} estrelas` : "Ainda sem nota", ownReview?.threeWords || "Avaliação opcional")}
          ${bookOptionCard("Data de leitura", readingDateRangeLabel(meta), readingDurationLabel(meta.startDate, meta.finishDate), "data-open-reading-details")}
          ${bookOptionCard("Etiquetas", tagListText(meta.tags), meta.tags.length ? "Clique para editar" : "Clique para marcar", "data-open-reading-details")}
          ${bookOptionCard("Histórico", bookHistoryOpen ? "Histórico aberto" : historyUpdateLabel(allHistoryCount), bookHistoryOpen ? "Toque para ocultar" : personalHistoryLabel(historyCount), "data-toggle-book-history")}
        </div>
      `}
    </article>
  `;
}

function bookOptionCard(label, value, aux = "", attrs = "") {
  const tag = attrs ? "button" : "div";
  const type = attrs ? ` type="button"` : "";
  return `
    <${tag} class="book-option-card ${attrs ? "clickable-option" : ""}"${type} ${attrs}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${aux ? `<small>${escapeHtml(aux)}</small>` : ""}
    </${tag}>
  `;
}

function readingDetailsFormHtml(book, meta) {
  return `
    <form id="reading-details-form" class="reading-details-form">
      <input type="hidden" name="bookId" value="${escapeAttr(book.id)}" />
      <label>
        <span>Data em que começou</span>
        <input name="startedDate" type="date" value="${escapeAttr(meta.startDate || "")}" />
      </label>
      <label>
        <span>Data em que terminou</span>
        <input name="finishedDate" type="date" value="${escapeAttr(meta.finishDate || "")}" />
      </label>
      <fieldset class="tag-fieldset">
        <legend>Etiquetas</legend>
        <div class="tag-checkboxes">
          ${BOOK_TAG_OPTIONS.map((option) => `
            <label class="tag-checkbox">
              <input type="checkbox" name="tags" value="${escapeAttr(option.key)}" ${meta.tags.includes(option.key) ? "checked" : ""} />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
      <div class="button-row">
        <button class="save-button" type="submit">Salvar dados da leitura</button>
        <button class="ghost-button" type="button" data-cancel-reading-details>Cancelar</button>
      </div>
    </form>
  `;
}

function bookReadingHistoryPanel(book) {
  const currentId = currentParticipant()?.id || "";
  const allItems = bookFeedItems(book.id);
  const mineItems = bookFeedItems(book.id, currentId);
  const scope = bookHistoryScope === "mine" ? "mine" : "all";
  const items = scope === "mine" ? mineItems : allItems;
  return `
    <section class="panel book-history-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Histórico de leitura</p>
          <h3>Atualizações deste livro</h3>
        </div>
        <div class="button-row">
          <span class="muted">${items.length} registro${items.length === 1 ? "" : "s"}</span>
          <button class="ghost-button" type="button" data-close-book-history>Fechar histórico</button>
        </div>
      </div>
      <div class="history-filter" role="group" aria-label="Filtrar histórico do livro">
        <button class="${scope === "all" ? "active" : ""}" type="button" data-book-history-scope="all">
          Todas <span>${allItems.length}</span>
        </button>
        <button class="${scope === "mine" ? "active" : ""}" type="button" data-book-history-scope="mine">
          Só minhas <span>${mineItems.length}</span>
        </button>
      </div>
      ${items.length ? `<div class="book-history-list">${items.map(bookHistoryCard).join("")}</div>` : `<p class="muted">${scope === "mine" ? "Você ainda não publicou atualização no feed para este livro." : "Quando alguém publicar progresso no feed para este livro, as atualizações aparecem aqui também."}</p>`}
    </section>
  `;
}

function bookHistoryCard(item) {
  const participant = participantById(item.participantId);
  if (!participant) return "";
  item.reactions = normalizedReactions(item);
  const progress = Number(item.progress || 0);
  return `
    <article class="book-history-card">
      <header class="feed-author">
        <div class="identity-link" role="button" tabindex="0" data-open-participant="${escapeAttr(participant.id)}">
          ${avatarHtml(participant, "width: 42px; height: 42px; border-radius: 50%; font-size: 13px")}
          <div><strong>${escapeHtml(participant.name)}</strong><p class="muted">${escapeHtml(readingStatusFromProgress(progress))}</p></div>
        </div>
        <span class="muted">${escapeHtml(displayReadDate(item.readDate || item.date) || item.date || "")}</span>
      </header>
      ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
      <div>
        <div class="mini-row"><span>${progress}%</span><span class="muted">progresso</span></div>
        <div class="progress-track"><div class="progress-fill" style="--value: ${progress}%"></div></div>
      </div>
      ${reactionControlsHtml(item, `data-react-book-feed data-feed-id="${escapeAttr(item.id)}"`)}
    </article>
  `;
}

function reviewSummaryHtml(book, ownReview) {
  return `
    <article class="panel my-review">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Minha avaliação</p>
          <h3>${ownReview ? "Sua avaliação salva" : "Você ainda não avaliou"}</h3>
        </div>
        <div class="button-row">
          <button class="save-button" type="button" data-open-review-form>${ownReview ? "Editar avaliação" : "Criar avaliação"}</button>
          ${ownReview ? `<button class="ghost-button danger-button" type="button" data-delete-review>Excluir avaliação</button>` : ""}
        </div>
      </div>
      ${ownReview ? `
        <div class="review-summary">
          <strong>${formatRating(ownReview.rating)} estrelas</strong>
          <span class="star-row">${stars(ownReview.rating)}</span>
          <p><span>3 palavras:</span> ${escapeHtml(ownReview.threeWords || "Não preenchido")}</p>
          <p><span>Resenha:</span> ${escapeHtml(ownReview.deepReview || ownReview.comment || "Não preenchida")}</p>
        </div>
      ` : `<p class="muted">Quando quiser registrar sua opinião sobre ${escapeHtml(book.title)}, clique no botão acima.</p>`}
    </article>
  `;
}

function reviewFormHtml(book, ownReview) {
  const draft = reviewFormDraft && reviewFormDraft.bookId === book.id ? reviewFormDraft : {};
  const field = (name, fallback = "") => draft[name] ?? fallback ?? "";
  return `
    <article class="panel my-review">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Minha avaliação</p>
          <h3>${ownReview ? "Editar avaliação" : "Criar avaliação"}</h3>
        </div>
      </div>
      <form id="review-form" class="review-form">
        <input type="hidden" name="bookId" value="${escapeAttr(book.id)}" />
        <label>
          <span>Estrelas</span>
          <input id="review-rating" name="rating" type="text" inputmode="decimal" placeholder="Ex.: 0,2 | 2,5 | 3,8" value="${escapeAttr(field("rating", ownReview ? formatRatingInput(ownReview.rating) : ""))}" />
        </label>
        <label>
          <span>3 palavras para descrever o livro</span>
          <input name="threeWords" maxlength="80" placeholder="Ex.: tenso, rápido, surpreendente" value="${escapeAttr(field("threeWords", ownReview?.threeWords || ""))}" />
        </label>
        <label>
          <span>Resenha mais profunda</span>
          <textarea name="deepReview" placeholder="Escreva sua opinião com mais calma aqui.">${escapeHtml(field("deepReview", ownReview?.deepReview || ownReview?.comment || ""))}</textarea>
        </label>
        <div class="button-row">
          <button class="save-button" type="submit">Salvar avaliação</button>
          <button class="ghost-button" type="button" data-cancel-review>Cancelar</button>
        </div>
      </form>
    </article>
  `;
}

function bookFormHtml(book) {
  const isEdit = Boolean(book);
  const draft = bookFormDraft && (bookFormDraft.bookId || "") === (book?.id || "") ? bookFormDraft : {};
  const field = (name, fallback = "") => draft[name] ?? fallback ?? "";
  return `
    <form id="book-form" class="book-form">
      <input type="hidden" name="bookId" value="${escapeAttr(field("bookId", book?.id || ""))}" />
      <label><span>Título</span><input name="title" required placeholder="Nome do livro" value="${escapeAttr(field("title", book?.title || ""))}" /></label>
      <label><span>Autoria</span><input name="author" required placeholder="Autora ou autor" value="${escapeAttr(field("author", book?.author || ""))}" /></label>
      <label><span>Mês</span>${monthSelect(field("month", book?.month))}</label>
      <label><span>Ano</span><input name="year" type="number" min="1900" max="2100" value="${escapeAttr(field("year", book?.year || new Date().getFullYear()))}" required /></label>
      <label><span>Quem indicou</span>${participantSelect(field("indicatedBy", book?.indicatedBy || currentParticipant()?.id))}</label>
      <label><span>Gênero</span><input name="genre" placeholder="Suspense, romance, fantasia..." value="${escapeAttr(field("genre", book?.genre || ""))}" /></label>
      <label><span>Páginas</span><input name="pages" type="number" min="1" placeholder="304" value="${escapeAttr(field("pages", book?.pages || ""))}" /></label>
      <label><span>${isEdit ? "Alterar capa" : "Capa do livro"}</span><input name="coverImage" type="file" accept="image/*" /></label>
      <label class="wide"><span>Sinopse ou observação</span><textarea name="synopsis" placeholder="Por que esse livro entrou no clube?">${escapeHtml(field("synopsis", book?.synopsis || ""))}</textarea></label>
      <div class="button-row wide">
        <button class="save-button" type="submit">${isEdit ? "Salvar alterações" : "Salvar livro"}</button>
        <button class="ghost-button" type="button" data-cancel-book-form>Cancelar</button>
      </div>
    </form>
  `;
}

function captureBookFormDraft() {
  const form = document.querySelector("#book-form");
  if (!form) return;
  const data = new FormData(form);
  bookFormDraft = {
    bookId: data.get("bookId") || "",
    title: data.get("title") || "",
    author: data.get("author") || "",
    month: data.get("month") || "",
    year: data.get("year") || "",
    indicatedBy: data.get("indicatedBy") || "",
    genre: data.get("genre") || "",
    pages: data.get("pages") || "",
    synopsis: data.get("synopsis") || "",
  };
}

function captureReviewFormDraft() {
  const form = document.querySelector("#review-form");
  if (!form) return;
  const data = new FormData(form);
  reviewFormDraft = {
    bookId: data.get("bookId") || selectedBookId || "",
    rating: data.get("rating") || "",
    threeWords: data.get("threeWords") || "",
    deepReview: data.get("deepReview") || "",
  };
}

function captureFeedFormDraft() {
  const form = document.querySelector("#feed-form");
  if (!form) return;
  const data = new FormData(form);
  feedFormDraft = {
    feedId: data.get("feedId") || "",
    bookId: data.get("bookId") || "",
    progress: data.get("progress") || "",
    readDate: data.get("readDate") || "",
    text: data.get("text") || "",
  };
}

function captureFeedCommentDraft() {
  const form = document.querySelector("[data-feed-comment-form]");
  if (!form) return;
  const data = new FormData(form);
  feedCommentDraft = {
    feedId: data.get("feedId") || "",
    comment: data.get("comment") || "",
  };
}

function captureOpenDrafts() {
  if (bookFormMode) captureBookFormDraft();
  if (reviewFormOpen) captureReviewFormDraft();
  if (feedComposerOpen || feedEditId) captureFeedFormDraft();
  if (feedCommentId) captureFeedCommentDraft();
}

function hasActiveEditor() {
  return Boolean(
    document.querySelector("#book-form") ||
    document.querySelector("#review-form") ||
    document.querySelector("#feed-form") ||
    document.querySelector("[data-feed-comment-form]") ||
    document.querySelector("#meeting-form") ||
    document.querySelector("#profile-form") ||
    document.querySelector("#rules-form")
  );
}

function wireReviewControls(selected) {
  if (!selected) return;
  document.querySelectorAll("[data-open-review-form]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewFormOpen = true;
      reviewFormDraft = null;
      renderBooks();
    });
  });
  document.querySelector("[data-cancel-review]")?.addEventListener("click", () => {
    reviewFormOpen = false;
    reviewFormDraft = null;
    renderBooks();
  });
  document.querySelector("#review-form")?.addEventListener("submit", submitWithLoading((event) => saveReview(event, selected.id), "Salvando avalia\u00e7\u00e3o..."));
  document.querySelector("#review-form")?.addEventListener("input", captureReviewFormDraft);
  document.querySelector("#review-form")?.addEventListener("change", captureReviewFormDraft);
  document.querySelectorAll("[data-delete-review]").forEach((button) => {
    button.addEventListener("click", () => deleteReview(selected.id));
  });
  document.querySelectorAll("[data-react-review]").forEach((button) => {
    button.addEventListener("click", () => runReactionAction(button, () => toggleReviewReaction(button.dataset.bookId, button.dataset.participantId, button.dataset.reaction)));
  });
  document.querySelector("[data-favorite]")?.addEventListener("click", () => toggleFavorite(selected.id));
  document.querySelector("[data-edit-book]")?.addEventListener("click", () => {
    bookFormMode = "edit";
    bookFormDraft = null;
    renderBooks();
  });
}

function wireBookDetailControls(selected) {
  if (!selected) return;
  document.querySelectorAll("[data-open-reading-details]").forEach((button) => {
    button.addEventListener("click", () => {
      readingDetailsOpen = true;
      bookHistoryOpen = false;
      renderBooks();
    });
  });
  document.querySelector("[data-cancel-reading-details]")?.addEventListener("click", () => {
    readingDetailsOpen = false;
    renderBooks();
  });
  document.querySelector("[data-toggle-book-history]")?.addEventListener("click", () => {
    if (bookHistoryOpen) {
      bookHistoryOpen = false;
      if (window.history.state?.pobresCriaturasRoute && window.history.state.bookHistoryOpen) {
        window.history.back();
        return;
      }
      renderBooks();
      rememberRoute("replace");
      return;
    }
    readingDetailsOpen = false;
    bookHistoryOpen = true;
    bookHistoryScope = "all";
    renderBooks();
    rememberRoute("push");
    window.setTimeout(() => document.querySelector(".book-history-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  });
  document.querySelector("[data-close-book-history]")?.addEventListener("click", () => {
    bookHistoryOpen = false;
    bookHistoryScope = "all";
    if (window.history.state?.pobresCriaturasRoute && window.history.state.bookHistoryOpen) {
      window.history.back();
      return;
    }
    renderBooks();
    rememberRoute("replace");
  });
  document.querySelectorAll("[data-book-history-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      bookHistoryScope = button.dataset.bookHistoryScope === "mine" ? "mine" : "all";
      renderBooks();
      rememberRoute("replace");
      window.setTimeout(() => document.querySelector(".book-history-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    });
  });
  document.querySelector("#reading-details-form")?.addEventListener("submit", submitWithLoading(saveReadingDetails, "Salvando dados..."));
  document.querySelectorAll("[data-react-book-feed]").forEach((button) => {
    button.addEventListener("click", () => runReactionAction(button, () => toggleFeedReaction(button.dataset.feedId, button.dataset.reaction, "books")));
  });
}

function renderFeed() {
  captureOpenDrafts();
  const participant = currentParticipant();
  const currentBook = currentReadingBook(participant) || latestBook();
  const editingFeed = state.feed.find((item) => item.id === feedEditId && item.participantId === participant.id);
  const formOpen = state.books.length && (feedComposerOpen || editingFeed);
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Histórico de leitura</p>
          <h3>Feed do clube</h3>
        </div>
        ${state.books.length && !formOpen ? `<button class="save-button" type="button" data-open-feed-form>Fazer histórico de leitura</button>` : ""}
      </div>
      ${formOpen ? feedFormHtml(editingFeed, currentBook, participant) : `<p class="muted">${state.books.length ? "Quando quiser atualizar progresso, começar ou concluir leitura, clique no botão acima." : "Cadastre um livro primeiro para publicar progresso no feed."}</p>`}
    </section>
    <section class="feed-list">
      ${state.feed.length ? state.feed.map(feedCard).join("") : emptyPanel("Feed vazio por enquanto", "As atualizações de leitura vão aparecer aqui.")}
    </section>
  `;
  document.querySelector("[data-open-feed-form]")?.addEventListener("click", () => {
    feedComposerOpen = true;
    feedFormDraft = null;
    renderFeed();
  });
  document.querySelector("[data-cancel-feed-form]")?.addEventListener("click", () => {
    feedComposerOpen = false;
    feedEditId = null;
    feedFormDraft = null;
    renderFeed();
  });
  document.querySelector("#feed-form")?.addEventListener("submit", submitWithLoading(saveFeed, feedEditId ? "Salvando hist\u00f3rico..." : "Publicando..."));
  document.querySelector("#feed-form")?.addEventListener("input", captureFeedFormDraft);
  document.querySelector("#feed-form")?.addEventListener("change", captureFeedFormDraft);
  document.querySelectorAll("[data-edit-feed]").forEach((button) => {
    button.addEventListener("click", () => {
      feedEditId = button.dataset.editFeed;
      feedComposerOpen = false;
      feedCommentId = null;
      feedFormDraft = null;
      feedCommentDraft = null;
      renderFeed();
    });
  });
  document.querySelectorAll("[data-delete-feed]").forEach((button) => {
    button.addEventListener("click", () => deleteFeedItem(button.dataset.deleteFeed));
  });
  document.querySelectorAll("[data-react-feed]").forEach((button) => {
    button.addEventListener("click", () => runReactionAction(button, () => toggleFeedReaction(button.dataset.feedId, button.dataset.reaction)));
  });
  document.querySelectorAll("[data-react-feed-comment]").forEach((button) => {
    button.addEventListener("click", () => runReactionAction(button, () => toggleFeedCommentReaction(button.dataset.feedId, button.dataset.commentId, button.dataset.reaction)));
  });
  document.querySelectorAll("[data-comment-feed]").forEach((button) => {
    button.addEventListener("click", () => {
      feedCommentId = feedCommentId === button.dataset.commentFeed ? null : button.dataset.commentFeed;
      feedEditId = null;
      feedComposerOpen = false;
      feedCommentDraft = null;
      renderFeed();
    });
  });
  document.querySelectorAll("[data-cancel-feed-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      feedCommentId = null;
      feedCommentDraft = null;
      renderFeed();
    });
  });
  document.querySelectorAll("[data-feed-comment-form]").forEach((form) => {
    form.addEventListener("submit", submitWithLoading(saveFeedComment, "Publicando..."));
    form.addEventListener("input", captureFeedCommentDraft);
    form.addEventListener("change", captureFeedCommentDraft);
  });
  document.querySelectorAll("[data-delete-feed-comment]").forEach((button) => {
    button.addEventListener("click", () => deleteFeedComment(button.dataset.feedId, button.dataset.commentId));
  });
  wireNavigationLinks();
}

function feedFormHtml(item, currentBook, participant) {
  const draft = feedFormDraft && (feedFormDraft.feedId || "") === (item?.id || "") ? feedFormDraft : {};
  const field = (name, fallback = "") => draft[name] ?? fallback ?? "";
  const selectedBookIdForForm = field("bookId", item?.bookId || currentBook?.id);
  const progress = field("progress", item?.progress ?? state.progress[participant.id]?.[selectedBookIdForForm] ?? 0);
  const readDate = field("readDate", item?.readDate || inputDateFromDisplay(item?.date) || todayInputDate());
  return `
    <form id="feed-form" class="feed-form">
      <input type="hidden" name="feedId" value="${escapeAttr(field("feedId", item?.id || ""))}" />
      <label><span>Livro</span>${bookSelect(selectedBookIdForForm)}</label>
      <label><span>Progresso</span><input name="progress" type="number" min="0" max="100" value="${progress}" /></label>
      <label><span>Data da leitura</span><input name="readDate" type="date" value="${escapeAttr(readDate)}" /></label>
      <button class="save-button" type="submit">${item ? "Salvar histórico" : "Publicar"}</button>
      <label style="grid-column: 1 / -1"><span>Comentário</span><textarea name="text" placeholder="Ex.: capítulo 12 e já desconfio de todo mundo">${escapeHtml(field("text", item?.text || ""))}</textarea></label>
      <button class="ghost-button" type="button" data-cancel-feed-form>Cancelar</button>
    </form>
  `;
}

function renderRules() {
  const order = effectiveIndicationOrder();
  viewRoot.innerHTML = `
    <section class="passport-page">
      <div class="passport-title">
        <img src="./assets/selo-republica-livro.png" alt="Selo República Federativa do Livro" />
        <div>
          <p class="eyebrow">Contrato do clube</p>
          <h3>Ordem de indicação e regras</h3>
          <p class="muted">A ordem acompanha as integrantes cadastradas e pode ser reorganizada quando o clube mudar.</p>
        </div>
      </div>
    </section>

    <section class="rules-grid">
      <article class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Ordem de indicação</p>
            <h3>Rodada das próximas escolhas</h3>
          </div>
          ${rulesEditing ? "" : `<button class="save-button" type="button" data-edit-rules>Editar ordem e regras</button>`}
        </div>
        ${order.length ? `
          <ol class="order-list">
            ${order.map((participant, index) => `
              <li>
                <span>${index + 1}</span>
                ${avatarHtml(participant, "width: 42px; height: 42px; border-radius: 50%; font-size: 14px")}
                <strong>${escapeHtml(participant.name)}</strong>
                ${rulesEditing ? `
                  <div class="order-actions">
                    <button class="ghost-button" type="button" data-order-up="${participant.id}" ${index === 0 ? "disabled" : ""}>Subir</button>
                    <button class="ghost-button" type="button" data-order-down="${participant.id}" ${index === order.length - 1 ? "disabled" : ""}>Descer</button>
                  </div>
                ` : ""}
              </li>
            `).join("")}
          </ol>
        ` : emptyPanel("Sem integrantes na ordem", "Quando alguém se cadastrar, o nome entra automaticamente aqui.")}
      </article>

      <article class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Regras</p>
            <h3>Combinados do Pobres Criaturas</h3>
          </div>
        </div>
        ${rulesEditing ? `
          <form id="rules-form" class="rules-form">
            <label><span>Texto das regras</span><textarea name="rules">${escapeHtml(state.rules || "")}</textarea></label>
            <div class="button-row">
              <button class="save-button" type="submit">Salvar ordem e regras</button>
              <button class="ghost-button" type="button" data-cancel-rules>Cancelar</button>
            </div>
          </form>
        ` : `<div class="rules-text">${formatRules(state.rules || "")}</div>`}
      </article>
    </section>
  `;

  document.querySelector("[data-edit-rules]")?.addEventListener("click", () => {
    rulesEditing = true;
    normalizeIndicationOrder();
    renderRules();
  });
  document.querySelector("[data-cancel-rules]")?.addEventListener("click", () => {
    rulesEditing = false;
    renderRules();
  });
  document.querySelector("#rules-form")?.addEventListener("submit", submitWithLoading(saveRules, "Salvando regras..."));
  document.querySelectorAll("[data-order-up]").forEach((button) => {
    button.addEventListener("click", () => moveOrder(button.dataset.orderUp, -1));
  });
  document.querySelectorAll("[data-order-down]").forEach((button) => {
    button.addEventListener("click", () => moveOrder(button.dataset.orderDown, 1));
  });
}

function renderFavorites() {
  const ids = state.favorites[currentParticipant().id] || [];
  const favorites = state.books.filter((book) => ids.includes(book.id));
  viewRoot.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Estante afetiva</p>
      <h3>Livros favoritos</h3>
      <p class="muted">Marque favoritos na aba Livros para montar sua estante pessoal.</p>
    </section>
    <section class="favorites-grid">
      ${favorites.length ? favorites.map(bookFavoriteCard).join("") : emptyPanel("Nenhum favorito ainda", "Abra um livro cadastrado e toque em adicionar aos favoritos.")}
    </section>
  `;
  wireNavigationLinks();
}

function renderStats() {
  if (!state.books.length) {
    viewRoot.innerHTML = emptyPanel("Sem estatísticas ainda", "Cadastre livros e avaliações para liberar rankings do clube.");
    return;
  }
  const bestYear = bestBook(new Date().getFullYear());
  const bestHistory = bestBook();
  const worstYear = worstBook(new Date().getFullYear());
  const worstHistory = worstBook();
  const recommender = bestRecommender();
  const lowRecommender = worstRecommender();
  const genreRows = genreStats();
  const readYearRows = readYearStats();
  const maxReadYearCount = Math.max(1, ...readYearRows.map((row) => row.count));
  viewRoot.innerHTML = `
    <section class="stats-grid">
      ${statCard("Maior nota do ano", bestYear?.title || "A definir", bestYear ? averageFor(bestYear.id).toFixed(1) : "0.0", bestYear ? `data-open-book="${escapeAttr(bestYear.id)}"` : "")}
      ${statCard("Maior nota da história", bestHistory?.title || "A definir", bestHistory ? averageFor(bestHistory.id).toFixed(1) : "0.0", bestHistory ? `data-open-book="${escapeAttr(bestHistory.id)}"` : "")}
      ${statCard("Menor nota do ano", worstYear?.title || "A definir", worstYear ? averageFor(worstYear.id).toFixed(1) : "0.0", worstYear ? `data-open-book="${escapeAttr(worstYear.id)}"` : "")}
      ${statCard("Menor nota da história", worstHistory?.title || "A definir", worstHistory ? averageFor(worstHistory.id).toFixed(1) : "0.0", worstHistory ? `data-open-book="${escapeAttr(worstHistory.id)}"` : "")}
      ${statCard("Indica melhores livros", recommender?.name || "A definir", recommender ? recommender.score.toFixed(1) : "0.0", recommender ? `data-open-participant="${escapeAttr(recommender.id)}"` : "")}
      ${statCard("Indica os piores", lowRecommender?.name || "A definir", lowRecommender ? lowRecommender.score.toFixed(1) : "0.0", lowRecommender ? `data-open-participant="${escapeAttr(lowRecommender.id)}"` : "")}
      ${statCard("Comentários registrados", String(totalReviews()), "avaliações")}
      ${statCard("Livros lidos no ano", String(totalReadCurrentYear()), `${new Date().getFullYear()} pela data da leitura`)}
      ${statCard("Livros lidos no clube", String(totalReadInClub()), "leituras concluídas registradas")}
    </section>
    <section class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Linha do tempo</p>
          <h3>Livros lidos por ano</h3>
        </div>
      </div>
      <div class="chart-bars">
        ${readYearRows.length ? readYearRows.map((row) => `
          <div class="bar-row">
            <strong>${row.year}</strong>
            <div class="bar"><span style="--value: ${(row.count / maxReadYearCount) * 100}%"></span></div>
            <span>${row.count}</span>
          </div>
        `).join("") : `<p class="muted">Quando um histórico for marcado como lido com data, ele aparece no ano correto aqui.</p>`}
      </div>
    </section>
    <section class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Mapa de gêneros</p>
          <h3>Gêneros mais indicados</h3>
        </div>
      </div>
      <div class="chart-bars">
        ${genreRows.length ? genreRows.map((row) => `
          <div class="bar-row">
            <strong>${escapeHtml(row.name)}</strong>
            <div class="bar"><span style="--value: ${(row.count / genreRows[0].count) * 100}%"></span></div>
            <span>${row.count}</span>
          </div>
        `).join("") : `<p class="muted">Ainda não há gêneros cadastrados.</p>`}
      </div>
    </section>
    <section class="panel">
      <p class="eyebrow">Média por indicação</p>
      <h3>Ranking das indicadoras</h3>
      <div class="review-list">
        ${recommenderStats().length ? recommenderStats().map((item, index) => `
          <article class="review-card">
            <header><strong>${index + 1}. ${escapeHtml(item.name)}</strong><span class="star-row">${stars(Math.round(item.score))}</span></header>
            <p class="muted">Média ${item.score.toFixed(2)} em ${item.count} indicação${item.count === 1 ? "" : "ões"}.</p>
          </article>
        `).join("") : `<p class="muted">As médias aparecem quando livros indicados recebem avaliações.</p>`}
      </div>
    </section>
  `;
  wireNavigationLinks();
}

function renderProfile() {
  const participant = currentParticipant();
  viewRoot.innerHTML = `
    <section class="passport-page">
      <div class="passport-title">
        ${avatarHtml(participant)}
        <div>
          <p class="eyebrow">Meu documento literário</p>
          <h3>${escapeHtml(participant.name)}</h3>
          <p class="muted">${escapeHtml(participant.role)}</p>
        </div>
      </div>
    </section>
    <section class="panel">
      <form id="profile-form" class="meeting-form">
        <label><span>Nome da integrante</span><input name="name" required value="${escapeAttr(participant.name)}" /></label>
        <label><span>Frase do passaporte</span><textarea name="role" placeholder="Ex.: Curadora dos surtos literários e dos debates sem hora">${escapeHtml(participant.role || "")}</textarea></label>
        <label><span>Livro favorito</span><input name="favoriteBook" value="${escapeAttr(participant.favoriteBook)}" /></label>
        <label><span>Personagem favorito</span><input name="favoriteCharacter" value="${escapeAttr(participant.favoriteCharacter)}" /></label>
        <label><span>Livros lidos neste ano</span><input name="booksReadYear" type="number" min="0" value="${participant.booksReadYear || 0}" /></label>
        <label><span>Livros lidos no clube</span><input name="booksReadClub" type="number" min="0" value="${participant.booksReadClub || 0}" /></label>
        <label><span>Meta de livros no ano</span><input name="goal" type="number" min="1" value="${participant.goal || 12}" /></label>
        <label><span>Gêneros favoritos</span><input name="genres" value="${escapeAttr((participant.genres || []).join(", "))}" /></label>
        <label><span>Foto da integrante</span><input name="photo" type="file" accept="image/*" /></label>
        <label><span>Citação literária favorita</span><textarea name="quote">${escapeHtml(participant.quote)}</textarea></label>
        <button class="save-button" type="submit">Salvar perfil</button>
      </form>
    </section>
  `;
  document.querySelector("#profile-form").addEventListener("submit", submitWithLoading(saveProfile, "Salvando perfil..."));
}

async function saveMeeting(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.meeting = {
    date: data.get("date"),
    time: data.get("time"),
    bookId: data.get("bookId"),
    place: data.get("place"),
    notes: data.get("notes"),
  };
  meetingEditing = false;
  const pushPayload = {
    type: "meeting",
    title: "Reunião atualizada",
    message: meetingNotificationText(),
  };
  createNotification({ ...pushPayload, push: false });
  const savedOnline = await saveMeetingRecord();
  if (!savedOnline) {
    notify("Nao consegui salvar a reuniao na nuvem. Tente novamente antes de avisar o clube.");
    renderHome();
    return;
  }
  notify("Reunião salva no passaporte do clube.");
  sendClubPush(pushPayload.title, pushPayload.message, pushPayload.type);
  renderHome();
  return;
  saveState();
  notify("Reunião salva no passaporte do clube.");
  createNotification({
    type: "meeting",
    title: "Reunião atualizada",
    message: meetingNotificationText(),
    push: true,
  });
  renderHome();
}

async function saveBook(event) {
  event.preventDefault();
  captureBookFormDraft();
  const data = new FormData(event.currentTarget);
  const title = data.get("title").trim();
  const author = data.get("author").trim();
  const year = Number(data.get("year"));
  const month = data.get("month");
  const coverFile = event.currentTarget.elements.coverImage.files[0];
  const coverImage = coverFile ? await readPhoto(coverFile) : "";
  const editingId = data.get("bookId");
  const existing = editingId ? bookById(editingId) : null;
  let bookPushPayload = null;

  if (existing) {
    existing.title = title;
    existing.author = author;
    existing.month = month;
    existing.year = year;
    existing.indicatedBy = data.get("indicatedBy");
    existing.genre = data.get("genre").trim() || "Sem gênero";
    existing.pages = Number(data.get("pages") || 0);
    existing.synopsis = data.get("synopsis").trim();
    if (coverImage) existing.coverImage = coverImage;
    selectedBookId = existing.id;
    notify("Livro atualizado.");
    bookPushPayload = {
      title: "Livro atualizado",
      message: `${title} foi atualizado na biblioteca do clube.`,
      type: "book",
    };
    createNotification({
      type: "book",
      title: "Livro atualizado",
      message: `${title} foi atualizado na biblioteca do clube.`,
      push: false,
    });
  } else {
    const id = uniqueId(slug(`${title}-${month}-${year}`), state.books.map((book) => book.id));
    const book = {
      id,
      title,
      author,
      month,
      year,
      indicatedBy: data.get("indicatedBy"),
      genre: data.get("genre").trim() || "Sem gênero",
      pages: Number(data.get("pages") || 0),
      cover: randomCover(state.books.length),
      coverImage,
      synopsis: data.get("synopsis").trim(),
    };
    state.books.push(book);
    state.reviews[id] = [];
    selectedBookId = id;
    if (!state.meeting.bookId) state.meeting.bookId = id;
    notify("Livro salvo no clube.");
    bookPushPayload = {
      title: "Novo livro cadastrado",
      message: `${title}, de ${author}, entrou no passaporte do clube.`,
      type: "book",
    };
    createNotification({
      type: "book",
      title: "Novo livro cadastrado",
      message: `${title}, de ${author}, entrou no passaporte do clube.`,
      push: false,
    });
  }
  const savedBook = bookById(selectedBookId);
  const savedOnline = await saveBookRecord(savedBook);
  if (!savedOnline) {
    notify("Nao consegui salvar o livro na nuvem. Tente novamente antes de avisar o clube.");
    renderBooks();
    return;
  }
  bookFormMode = null;
  bookFormDraft = null;
  if (bookPushPayload) {
    sendClubPush(bookPushPayload.title, bookPushPayload.message, bookPushPayload.type);
  }
  renderBooks();
}

async function saveReview(event, bookId) {
  event.preventDefault();
  captureReviewFormDraft();
  const participant = currentParticipant();
  const data = new FormData(event.currentTarget);
  const rating = parseRating(data.get("rating"));
  const threeWords = data.get("threeWords").trim();
  const deepReview = data.get("deepReview").trim();
  if (rating === null) {
    notify("Digite uma nota entre 0 e 5. Pode usar vírgula, tipo 3,8.");
    return;
  }
  state.reviews[bookId] ||= [];
  const existing = state.reviews[bookId].find((review) => review.participantId === participant.id);
  if (existing) {
    existing.rating = rating;
    existing.threeWords = threeWords;
    existing.deepReview = deepReview;
    existing.comment = deepReview;
  } else {
    state.reviews[bookId].push({ participantId: participant.id, rating, threeWords, deepReview, comment: deepReview, reactions: {}, likedBy: [] });
  }
  const review = state.reviews[bookId].find((item) => item.participantId === participant.id);
  const savedOnline = await saveReviewRecord(bookId, review);
  if (!savedOnline) {
    renderBooks();
    return;
  }
  reviewFormOpen = false;
  reviewFormDraft = null;
  notify("Avaliação salva com estrelas e comentário.");
  createNotification({
    type: "review",
    title: "Nova avaliação",
    message: `${participant.name} avaliou ${bookById(bookId)?.title || "um livro"} com ${formatRating(rating)} estrelas.`,
    push: true,
  });
  renderBooks();
}

async function deleteReview(bookId) {
  const participant = currentParticipant();
  const current = myReview(bookId);
  if (!participant || !current) return;
  if (!window.confirm("Excluir sua avaliação deste livro?")) return;
  const previous = [...(state.reviews[bookId] || [])];
  state.reviews[bookId] = previous.filter((review) => review.participantId !== participant.id);
  const deleted = clubDb
    ? await deleteRecordOnServer("club_reviews", { book_id: bookId, participant_id: participant.id })
    : { ok: true };
  if (!deleted.ok) {
    state.reviews[bookId] = previous;
    notify("Nao consegui excluir a avaliacao na nuvem. Tente novamente.");
    renderBooks();
    return;
  }
  persistLocalState();
  await saveCloudSnapshot();
  reviewFormOpen = false;
  reviewFormDraft = null;
  notify("Avaliação excluída.");
  renderBooks();
}

async function saveReadingDetails(event) {
  event.preventDefault();
  const participant = currentParticipant();
  const user = getUser();
  if (!participant || !user) return;
  const data = new FormData(event.currentTarget);
  const bookId = data.get("bookId");
  const progress = memberProgress(participant.id);
  const startedDate = data.get("startedDate") || "";
  const finishedDate = data.get("finishedDate") || "";
  const tags = data.getAll("tags").filter((tag) => BOOK_TAG_OPTIONS.some((option) => option.key === tag));
  const previousFinishedDate = progress.__completedDates?.[bookId] || "";

  if (startedDate && finishedDate && Date.parse(`${finishedDate}T12:00:00`) < Date.parse(`${startedDate}T12:00:00`)) {
    notify("A data de fim nao pode ser anterior ao comeco da leitura.");
    return;
  }

  if (startedDate) {
    progress.__startedDates[bookId] = startedDate;
    if (!participant.currentBookId) participant.currentBookId = bookId;
  } else {
    delete progress.__startedDates[bookId];
  }

  if (finishedDate) {
    progress[bookId] = Math.max(Number(progress[bookId] || 0), 100);
    syncCompletedBook(participant, bookId, "Leitura concluída", 100, finishedDate, previousFinishedDate);
  } else if (Number(progress[bookId] || 0) < 100) {
    delete progress.__completedDates[bookId];
  }

  if (tags.length) {
    progress.__bookTags[bookId] = tags;
  } else {
    delete progress.__bookTags[bookId];
  }

  persistLocalState();
  const savedLibrary = await saveMemberLibraryRecord(participant);
  let savedProfile = true;
  if (clubDb) {
    const { data: authData } = await clubDb.auth.getSession();
    if (authData.session?.user) savedProfile = await saveMemberProfile(authData.session.user, user, participant);
  }
  if (!savedLibrary || !savedProfile) {
    notify("Nao consegui salvar os dados dessa leitura na nuvem. Tente novamente.");
    renderBooks();
    return;
  }
  readingDetailsOpen = false;
  notify("Dados da leitura salvos.");
  renderBooks();
}

async function toggleFavorite(bookId) {
  const participant = currentParticipant();
  state.favorites[participant.id] ||= [];
  const list = state.favorites[participant.id];
  if (list.includes(bookId)) {
    state.favorites[participant.id] = list.filter((id) => id !== bookId);
    notify("Livro removido dos favoritos.");
  } else {
    list.push(bookId);
    notify("Livro adicionado aos favoritos.");
  }
  const savedOnline = await saveMemberLibraryRecord(participant);
  if (!savedOnline) {
    notify("Nao consegui salvar os favoritos na nuvem. Tente novamente.");
  }
  renderBooks();
}

async function toggleReviewReaction(bookId, participantId, reactionKey) {
  const current = currentParticipant();
  const review = (state.reviews[bookId] || []).find((item) => item.participantId === participantId);
  if (!current || !review || !REACTION_OPTIONS.some((option) => option.key === reactionKey)) return;
  const previous = normalizedReactions(review);
  toggleReactionOnTarget(review, current.id, reactionKey);
  const savedOnline = await saveCloudSnapshot();
  if (!savedOnline) {
    review.reactions = previous;
    review.likedBy = previous.heart || [];
    notify("Nao consegui salvar a reação da avaliacao. Tente novamente.");
    renderBooks();
    return;
  }
  persistLocalState();
  renderBooks();
}

async function saveFeed(event) {
  event.preventDefault();
  captureFeedFormDraft();
  const data = new FormData(event.currentTarget);
  const participant = currentParticipant();
  const feedId = data.get("feedId");
  const bookId = data.get("bookId");
  const progress = Math.max(0, Math.min(100, Number(data.get("progress") || 0)));
  const type = readingStatusFromProgress(progress);
  const text = data.get("text");
  const readDate = data.get("readDate") || todayInputDate();
  const progressState = memberProgress(participant.id);
  progressState[bookId] = progress;
  if (progress > 0 && !progressState.__startedDates[bookId]) {
    progressState.__startedDates[bookId] = readDate;
  }
  participant.currentBookId = bookId;

  const existing = feedId ? state.feed.find((item) => item.id === feedId && item.participantId === participant.id) : null;
  const previousReadDate = existing?.readDate || inputDateFromDisplay(existing?.date);
  let savedFeedItem;
  if (existing) {
    existing.type = type;
    existing.bookId = bookId;
    existing.text = text;
    existing.progress = progress;
    existing.readDate = readDate;
    existing.date = displayReadDate(readDate);
    existing.editedAt = new Date().toLocaleDateString("pt-BR");
    savedFeedItem = existing;
  } else {
    savedFeedItem = {
      id: `f${Date.now()}`,
      participantId: participant.id,
      date: displayReadDate(readDate),
      readDate,
      type,
      bookId,
      text,
      progress,
      likes: 0,
      likedBy: [],
      reactions: {},
      comments: [],
    };
    state.feed.unshift(savedFeedItem);
  }
  syncCompletedBook(participant, bookId, type, progress, readDate, previousReadDate);
  const savedLibrary = await saveMemberLibraryRecord(participant);
  const savedFeed = await saveFeedRecord(savedFeedItem);
  let savedProfile = true;
  if (clubDb) {
    const { data: authData } = await clubDb.auth.getSession();
    const user = getUser();
    if (authData.session?.user && user) {
      savedProfile = await saveMemberProfile(authData.session.user, user, participant);
    }
  }
  if (!savedLibrary || !savedFeed || !savedProfile) {
    notify("Nao consegui salvar o historico na nuvem. Tente novamente.");
    renderFeed();
    return;
  }
  notify(existing ? "Histórico atualizado." : "Atualização publicada no feed.");
  createNotification({
    type: "feed",
    title: existing ? "Histórico editado" : "Histórico de leitura",
    message: `${participant.name} atualizou ${bookById(bookId)?.title || "uma leitura"} para ${progress}%.`,
    push: true,
  });
  feedComposerOpen = false;
  feedEditId = null;
  feedFormDraft = null;
  renderFeed();
}

async function deleteFeedItem(feedId) {
  const participant = currentParticipant();
  const item = state.feed.find((feedItem) => feedItem.id === feedId && feedItem.participantId === participant.id);
  if (!item) return;
  if (!window.confirm("Excluir este histórico do feed?")) return;
  const previous = [...state.feed];
  state.feed = state.feed.filter((feedItem) => feedItem.id !== feedId);
  const deleted = clubDb
    ? await deleteRecordOnServer("club_feed", { id: feedId, participant_id: participant.id })
    : { ok: true };
  if (!deleted.ok) {
    state.feed = previous;
    notify("Nao consegui excluir o historico na nuvem. Tente novamente.");
    renderFeed();
    return;
  }
  persistLocalState();
  await saveCloudSnapshot();
  feedComposerOpen = false;
  feedEditId = null;
  feedFormDraft = null;
  notify("Histórico excluído.");
  renderFeed();
}

function syncCompletedBook(participant, bookId, type, progress, readDate = todayInputDate(), previousReadDate = "") {
  const completed = type === "Marcou como lido" || Number(progress) >= 100;
  if (!bookId) return;
  participant.completedBookIds ||= [];
  const progressState = memberProgress(participant.id);
  const completedDates = progressState.__completedDates || {};
  progressState.__completedDates = completedDates;
  const wasCompleted = participant.completedBookIds.includes(bookId);
  const previousYear = readYear(previousReadDate || completedDates[bookId]);
  const nextYear = readYear(readDate);
  const currentYear = new Date().getFullYear();

  if (!completed) {
    if (wasCompleted) {
      participant.completedBookIds = participant.completedBookIds.filter((id) => id !== bookId);
      participant.booksReadClub = Math.max(0, Number(participant.booksReadClub || 0) - 1);
      if (previousYear === currentYear) {
        participant.booksReadYear = Math.max(0, Number(participant.booksReadYear || 0) - 1);
      }
      delete completedDates[bookId];
    }
    return;
  }

  if (!wasCompleted) {
    participant.completedBookIds.push(bookId);
    participant.booksReadClub = Number(participant.booksReadClub || 0) + 1;
    if (nextYear === currentYear) {
      participant.booksReadYear = Number(participant.booksReadYear || 0) + 1;
    }
  } else if (previousYear && previousYear !== nextYear) {
    if (previousYear === currentYear) {
      participant.booksReadYear = Math.max(0, Number(participant.booksReadYear || 0) - 1);
    }
    if (nextYear === currentYear) {
      participant.booksReadYear = Number(participant.booksReadYear || 0) + 1;
    }
  }
  completedDates[bookId] = readDate || todayInputDate();
}

async function toggleFeedReaction(feedId, reactionKey, renderTarget = "feed") {
  const participant = currentParticipant();
  const item = state.feed.find((feedItem) => feedItem.id === feedId);
  if (!item || !participant || !REACTION_OPTIONS.some((option) => option.key === reactionKey)) return;
  const previous = normalizedReactions(item);
  toggleReactionOnTarget(item, participant.id, reactionKey);
  const savedOnline = await saveFeedRecord(item);
  if (!savedOnline) {
    item.reactions = previous;
    item.likedBy = previous.heart || [];
    item.likes = reactionTotal(previous);
    notify("Nao consegui salvar a reação na nuvem. Tente novamente.");
  }
  renderTarget === "books" ? renderBooks() : renderFeed();
}

async function toggleFeedCommentReaction(feedId, commentId, reactionKey) {
  const participant = currentParticipant();
  const item = state.feed.find((feedItem) => feedItem.id === feedId);
  const comment = item?.comments?.find((entry) => entry.id === commentId);
  if (!item || !comment || !participant || !REACTION_OPTIONS.some((option) => option.key === reactionKey)) return;
  const previous = normalizedReactions(comment);
  toggleReactionOnTarget(comment, participant.id, reactionKey);
  const savedOnline = await saveFeedRecord(item);
  if (!savedOnline) {
    comment.reactions = previous;
    comment.likedBy = previous.heart || [];
    notify("Nao consegui salvar a reação do comentario. Tente novamente.");
    renderFeed();
    return;
  }
  renderFeed();
}

async function saveFeedComment(event) {
  event.preventDefault();
  captureFeedCommentDraft();
  const participant = currentParticipant();
  const data = new FormData(event.currentTarget);
  const feedId = data.get("feedId");
  const text = data.get("comment").trim();
  const item = state.feed.find((feedItem) => feedItem.id === feedId);
  if (!item || !participant) return;
  if (!text) {
    notify("Escreva um comentário antes de salvar.");
    return;
  }
  item.comments ||= [];
  const comment = {
    id: `c${Date.now()}`,
    participantId: participant.id,
    text,
    date: new Date().toLocaleDateString("pt-BR"),
    likedBy: [],
    reactions: {},
  };
  item.comments.push(comment);
  const savedOnline = await saveFeedRecord(item);
  if (!savedOnline) {
    item.comments = item.comments.filter((entry) => entry.id !== comment.id);
    notify("Nao consegui salvar o comentario na nuvem. Tente novamente.");
    renderFeed();
    return;
  }
  feedCommentId = null;
  feedCommentDraft = null;
  notify("Comentário publicado.");
  renderFeed();
}

async function deleteFeedComment(feedId, commentId) {
  const participant = currentParticipant();
  const item = state.feed.find((feedItem) => feedItem.id === feedId);
  if (!item || !participant) return;
  const previousComments = [...(item.comments || [])];
  const comment = previousComments.find((entry) => entry.id === commentId && entry.participantId === participant.id);
  if (!comment) return;
  if (!window.confirm("Excluir este comentário?")) return;
  item.comments = previousComments.filter((entry) => entry.id !== commentId);
  const savedOnline = await saveFeedRecord(item);
  if (!savedOnline) {
    item.comments = previousComments;
    notify("Nao consegui excluir o comentario na nuvem. Tente novamente.");
    renderFeed();
    return;
  }
  feedCommentId = null;
  feedCommentDraft = null;
  notify("Comentário excluído.");
  renderFeed();
}

async function saveRules(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.rules = data.get("rules");
  normalizeIndicationOrder();
  rulesEditing = false;
  const savedOnline = await saveClubSettingsRecord();
  if (!savedOnline) {
    renderRules();
    return;
  }
  notify("Ordem e regras salvas.");
  renderRules();
}

async function saveProfile(event) {
  event.preventDefault();
  lastProfileSaveIssue = "";
  const data = new FormData(event.currentTarget);
  const participant = currentParticipant();
  const user = getUser();
  participant.name = data.get("name").trim() || participant.name;
  if (user) user.name = participant.name;
  const customRole = data.get("role").trim();
  participant.favoriteBook = data.get("favoriteBook");
  participant.favoriteCharacter = data.get("favoriteCharacter");
  participant.booksReadYear = Number(data.get("booksReadYear") || 0);
  participant.booksReadClub = Number(data.get("booksReadClub") || 0);
  participant.goal = Number(data.get("goal") || 12);
  participant.genres = data.get("genres").split(",").map((item) => item.trim()).filter(Boolean);
  participant.quote = data.get("quote");
  participant.role = customRole || generateRole({
    personality: participant.personality,
    discussion: participant.discussion,
    genres: participant.genres,
    booksReadYear: participant.booksReadYear,
    booksReadClub: participant.booksReadClub,
  }, participant.name);
  participant.profileUpdatedAt = new Date().toISOString();
  const photo = event.currentTarget.elements.photo.files[0];
  if (photo) participant.photo = await readPhoto(photo);
  let profileSaved = true;
  let librarySaved = true;
  let confirmedOnline = true;
  if (clubDb) {
    const { data: authData } = await clubDb.auth.getSession();
    if (authData.session?.user) {
      if (user) {
        user.supabaseUserId = authData.session.user.id;
        user.participantId = participant.id;
        user.email = (user.email || authData.session.user.email || "").toLowerCase();
      }
      profileSaved = await saveMemberProfile(authData.session.user, user, participant);
      librarySaved = await saveMemberLibraryRecord(participant);
      confirmedOnline = profileSaved && librarySaved
        ? await verifyMemberProfileSaved(authData.session.user, participant)
        : false;
    }
  }
  if (!profileSaved || !librarySaved || !confirmedOnline) {
    notify(lastProfileSaveIssue ? `Nao confirmou (v${APP_VERSION}): ${lastProfileSaveIssue}.` : `Nao consegui confirmar o perfil na nuvem (v${APP_VERSION}). Tente novamente.`);
    renderProfile();
    return;
  }
  notify("Perfil salvo no passaporte.");
  renderProfile();
}

function bookSelect(selectedId, allowEmpty = false) {
  const empty = allowEmpty ? `<option value="">A definir</option>` : "";
  return `<select name="bookId">${empty}${bookOptionsByYearHtml(selectedId)}</select>`;
}

function bookOptionsByYearHtml(selectedId) {
  return bookYearGroups()
    .map(({ year, books }) => `
      <optgroup label="${escapeAttr(String(year))}">
        ${books.map((book) => `<option value="${book.id}" ${book.id === selectedId ? "selected" : ""}>${escapeHtml(book.month)} - ${escapeHtml(book.title)}</option>`).join("")}
      </optgroup>
    `)
    .join("");
}

function bookYearGroupsHtml(selectedId) {
  const selectedYear = Number(bookById(selectedId)?.year || bookYearGroups()[0]?.year || 0);
  return `
    <section class="book-year-list" aria-label="Livros por ano">
      ${bookYearGroups().map(({ year, books }) => `
        <details class="book-year-group" ${Number(year) === selectedYear ? "open" : ""}>
          <summary>
            <span>${escapeHtml(String(year))}</span>
            <small>${books.length} livro${books.length === 1 ? "" : "s"}</small>
          </summary>
          <div class="book-month-options">
            ${books.map((book) => `
              <button class="month-button book-month-button ${book.id === selectedId ? "active" : ""}" data-book="${book.id}">
                <span>${escapeHtml(book.month)}</span>
                <small>${escapeHtml(book.title)}</small>
              </button>
            `).join("")}
          </div>
        </details>
      `).join("")}
    </section>
  `;
}

function bookYearGroups() {
  const groups = new Map();
  sortedBooks().forEach((book) => {
    const year = Number(book.year || new Date().getFullYear());
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(book);
  });
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, books]) => ({ year, books }));
}

function participantSelect(selectedId = currentParticipant()?.id) {
  if (!state.participants.length) return `<select name="indicatedBy"><option value="">Sem integrantes ainda</option></select>`;
  return `<select name="indicatedBy">${state.participants.map((participant) => `<option value="${participant.id}" ${participant.id === selectedId ? "selected" : ""}>${escapeHtml(participant.name)}</option>`).join("")}</select>`;
}

function monthSelect(selectedMonth) {
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const current = selectedMonth || months[new Date().getMonth()];
  return `<select name="month">${months.map((month) => `<option ${month === current ? "selected" : ""}>${month}</option>`).join("")}</select>`;
}

function participantCard(participant) {
  const favoriteBook = bookByTitle(participant.favoriteBook);
  return `
    <article class="participant-card clickable-card" role="button" tabindex="0" data-open-participant="${escapeAttr(participant.id)}">
      <div class="book-line">
        ${avatarHtml(participant)}
        <div>
          <h3>${escapeHtml(participant.name)}</h3>
          <p class="muted">${escapeHtml(participant.role)}</p>
        </div>
      </div>
      <div class="stamp"><span>Lidos no ano</span><strong>${participant.booksReadYear || 0} livros</strong></div>
      <div class="stamp"><span>Lidos no clube</span><strong>${participant.booksReadClub || 0} livros</strong></div>
      <div class="stamp ${favoriteBook ? "clickable-stamp" : ""}" ${favoriteBook ? `role="button" tabindex="0" data-open-book="${escapeAttr(favoriteBook.id)}"` : ""}><span>Livro favorito</span><strong>${escapeHtml(participant.favoriteBook)}</strong></div>
      <div class="stamp"><span>Personagem fav</span><strong>${escapeHtml(participant.favoriteCharacter)}</strong></div>
      <p>${escapeHtml(participant.quote)}</p>
      <div class="tags">${(participant.genres || []).map((genre) => `<span class="tag">${escapeHtml(genre)}</span>`).join("")}</div>
      <p class="card-hint">Toque para ver estatísticas, indicações e leituras.</p>
    </article>
  `;
}

function participantReviewEntries(participantId) {
  return Object.entries(state.reviews || {})
    .flatMap(([bookId, reviews]) => (reviews || [])
      .filter((review) => review.participantId === participantId)
      .map((review) => ({ book: bookById(bookId), review })))
    .filter((item) => item.book)
    .sort((a, b) => bookSortValue(b.book) - bookSortValue(a.book));
}

function participantCompletedEntries(participantId) {
  return completedReadEntries()
    .filter((entry) => entry.participantId === participantId)
    .map((entry) => ({ ...entry, book: bookById(entry.bookId) }))
    .filter((entry) => entry.book)
    .sort((a, b) => Date.parse(b.readDate || 0) - Date.parse(a.readDate || 0));
}

function linkedBookList(books, emptyText, metaFn = (book) => `${book.month} ${book.year}`) {
  if (!books.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="linked-list">
      ${books.map((book) => `
        <button class="linked-list-item" type="button" data-open-book="${escapeAttr(book.id)}">
          <strong>${escapeHtml(book.title)}</strong>
          <span>${escapeHtml(metaFn(book))}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function groupedBookList(books, emptyText, metaFn = (book) => `${book.month} ${book.year}`) {
  if (!books.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  const groups = new Map();
  books.forEach((book) => {
    const year = Number(book.year || new Date().getFullYear());
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(book);
  });
  return `
    <div class="linked-year-list">
      ${[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([year, yearBooks], index) => `
        <details class="linked-year-group" ${index === 0 ? "open" : ""}>
          <summary><span>${year}</span><small>${yearBooks.length} livro${yearBooks.length === 1 ? "" : "s"}</small></summary>
          ${linkedBookList(yearBooks.sort((a, b) => bookSortValue(b) - bookSortValue(a)), "", metaFn)}
        </details>
      `).join("")}
    </div>
  `;
}

function completedBookList(entries) {
  if (!entries.length) return `<p class="muted">Nenhuma leitura concluída registrada no feed ainda.</p>`;
  const groups = new Map();
  entries.forEach((entry) => {
    const year = Number(entry.year || readYear(entry.readDate) || new Date().getFullYear());
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(entry);
  });
  return `
    <div class="linked-year-list">
      ${[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([year, yearEntries], index) => `
        <details class="linked-year-group" ${index === 0 ? "open" : ""}>
          <summary><span>${year}</span><small>${yearEntries.length} leitura${yearEntries.length === 1 ? "" : "s"}</small></summary>
          <div class="linked-list">
            ${yearEntries.map((entry) => `
              <button class="linked-list-item" type="button" data-open-book="${escapeAttr(entry.book.id)}">
                <strong>${escapeHtml(entry.book.title)}</strong>
                <span>${escapeHtml(displayReadDate(entry.readDate) || String(entry.year))}</span>
              </button>
            `).join("")}
          </div>
        </details>
      `).join("")}
    </div>
  `;
}

function participantReviewList(rows) {
  if (!rows.length) return `<p class="muted">Nenhuma avaliação salva ainda.</p>`;
  const groups = new Map();
  rows.forEach((row) => {
    const year = Number(row.book.year || new Date().getFullYear());
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(row);
  });
  return `
    <div class="linked-year-list">
      ${[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([year, yearRows], index) => `
        <details class="linked-year-group" ${index === 0 ? "open" : ""}>
          <summary><span>${year}</span><small>${yearRows.length} avaliação${yearRows.length === 1 ? "" : "ões"}</small></summary>
          <div class="linked-list">
            ${yearRows.map(({ book, review }) => `
              <button class="linked-list-item" type="button" data-open-book="${escapeAttr(book.id)}">
                <strong>${escapeHtml(book.title)} · ${formatRating(review.rating)} estrelas</strong>
                <span>${escapeHtml(review.threeWords || review.deepReview || review.comment || "Sem comentário")}</span>
              </button>
            `).join("")}
          </div>
        </details>
      `).join("")}
    </div>
  `;
}

function averageLabel(values = []) {
  return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "0.0";
}

function participantGenreLine(participantId) {
  const counts = new Map();
  state.books
    .filter((book) => book.indicatedBy === participantId)
    .forEach((book) => counts.set(book.genre || "Sem gênero", (counts.get(book.genre || "Sem gênero") || 0) + 1));
  const genres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([genre]) => genre);
  return genres.length ? genres.join(", ") : "A definir";
}

function effectiveIndicationOrder() {
  const known = new Set(state.participants.map((participant) => participant.id));
  const orderedIds = (state.indicationOrder || []).filter((id) => known.has(id));
  const missingIds = state.participants.map((participant) => participant.id).filter((id) => !orderedIds.includes(id));
  return [...orderedIds, ...missingIds].map(participantById).filter(Boolean);
}

function normalizeIndicationOrder() {
  state.indicationOrder = effectiveIndicationOrder().map((participant) => participant.id);
}

async function moveOrder(participantId, direction) {
  normalizeIndicationOrder();
  const index = state.indicationOrder.indexOf(participantId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.indicationOrder.length) return;
  const [item] = state.indicationOrder.splice(index, 1);
  state.indicationOrder.splice(nextIndex, 0, item);
  await saveClubSettingsRecord();
  renderRules();
}

function reviewCard(review, bookId) {
  const isMine = review.participantId === currentParticipant().id;
  review.reactions = normalizedReactions(review);
  return `
    <article class="review-card">
      <header>
        <button class="inline-link" type="button" data-open-participant="${escapeAttr(review.participantId)}">${escapeHtml(nameById(review.participantId))}</button>
        <span><strong>${formatRating(review.rating)}</strong> <span class="star-row">${stars(review.rating)}</span></span>
      </header>
      ${review.threeWords ? `<p class="three-words">${escapeHtml(review.threeWords)}</p>` : ""}
      <p>${escapeHtml(review.deepReview || review.comment || "Sem resenha, só o carimbo das estrelas.")}</p>
      ${reactionControlsHtml(review, `data-react-review data-book-id="${escapeAttr(bookId)}" data-participant-id="${escapeAttr(review.participantId)}"`)}
      ${isMine ? `
        <div class="button-row">
          <button class="ghost-button" type="button" data-open-review-form>Editar minha avaliação</button>
          <button class="ghost-button danger-button" type="button" data-delete-review>Excluir avaliação</button>
        </div>
      ` : ""}
    </article>
  `;
}

function feedCard(item) {
  const participant = participantById(item.participantId);
  const book = bookById(item.bookId);
  if (!participant || !book) return "";
  item.comments ||= [];
  item.reactions = normalizedReactions(item);
  item.likes = reactionTotal(item.reactions);
  const current = currentParticipant();
  const isMine = item.participantId === current.id;
  const displayType = readingStatusFromProgress(item.progress);
  return `
    <article class="feed-card">
      <header class="feed-author">
        <div class="identity-link" role="button" tabindex="0" data-open-participant="${escapeAttr(participant.id)}">
          ${avatarHtml(participant, "width: 48px; height: 48px; border-radius: 50%; font-size: 15px")}
          <div><strong>${escapeHtml(participant.name)}</strong><p class="muted">${escapeHtml(displayType)}</p></div>
        </div>
        <span class="muted">${escapeHtml(item.date)}</span>
      </header>
      ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
      ${item.progress !== undefined ? `<div><div class="mini-row"><span>${item.progress}%</span><span class="muted">${book.pages || "?"} páginas</span></div><div class="progress-track"><div class="progress-fill" style="--value: ${item.progress}%"></div></div></div>` : ""}
      <div class="feed-book clickable-book" role="button" tabindex="0" data-open-book="${escapeAttr(book.id)}">
        <div>
          <strong>${escapeHtml(book.title)}</strong>
          <p class="muted">${escapeHtml(book.author)}</p>
        </div>
        ${miniCoverHtml(book)}
      </div>
      ${reactionControlsHtml(item, `data-react-feed data-feed-id="${escapeAttr(item.id)}"`)}
      <div class="feed-actions">
        <button class="comment-button" type="button" data-comment-feed="${item.id}">
          Comentar · ${item.comments.length}
        </button>
        ${isMine ? `
          <button class="ghost-button" type="button" data-edit-feed="${item.id}">Editar histórico</button>
          <button class="ghost-button danger-button" type="button" data-delete-feed="${item.id}">Excluir histórico</button>
        ` : ""}
      </div>
      ${item.comments.length ? `
        <div class="feed-comments">
          ${item.comments.map((comment) => feedCommentHtml(comment, item.id)).join("")}
        </div>
      ` : ""}
      ${feedCommentId === item.id ? `
        <form class="feed-comment-form" data-feed-comment-form>
          <input type="hidden" name="feedId" value="${escapeAttr(item.id)}" />
          <label>
            <span>Comentário</span>
            <textarea name="comment" placeholder="Escreva sua reação a esse histórico">${escapeHtml(feedCommentDraft?.feedId === item.id ? feedCommentDraft.comment || "" : "")}</textarea>
          </label>
          <div class="button-row">
            <button class="save-button" type="submit">Publicar comentário</button>
            <button class="ghost-button" type="button" data-cancel-feed-comment>Cancelar</button>
          </div>
        </form>
      ` : ""}
    </article>
  `;
}

function feedCommentHtml(comment, feedId) {
  const isMine = comment.participantId === currentParticipant().id;
  comment.reactions = normalizedReactions(comment);
  return `
    <div class="feed-comment">
      <button class="inline-link" type="button" data-open-participant="${escapeAttr(comment.participantId)}">${escapeHtml(nameById(comment.participantId))}</button>
      <div class="feed-comment-meta">
        <span>${escapeHtml(comment.date || "")}</span>
      </div>
      <p>${escapeHtml(comment.text)}</p>
      ${reactionControlsHtml(comment, `data-react-feed-comment data-feed-id="${escapeAttr(feedId)}" data-comment-id="${escapeAttr(comment.id)}"`)}
      ${isMine ? `<button class="ghost-button danger-button" type="button" data-feed-id="${escapeAttr(feedId)}" data-comment-id="${escapeAttr(comment.id)}" data-delete-feed-comment>Excluir comentário</button>` : ""}
    </div>
  `;
}

function reactionControlsHtml(target, attrs = "") {
  const reactions = normalizedReactions(target);
  const currentId = currentParticipant()?.id || "";
  const activeOption = REACTION_OPTIONS.find((option) => reactions[option.key]?.includes(currentId));
  const total = reactionTotal(reactions);
  return `
    <div class="reaction-widget" aria-label="Reações">
      ${total ? reactionSummaryHtml(reactions, total) : ""}
      <details class="reaction-picker">
        <summary>${activeOption ? `<span aria-hidden="true">${activeOption.emoji}</span> ${escapeHtml(activeOption.label)}` : "Reagir"}</summary>
        <div class="reaction-popover" role="menu">
          ${REACTION_OPTIONS.map((option) => {
            const active = reactions[option.key]?.includes(currentId);
            return `
              <button class="reaction-option ${active ? "active" : ""}" type="button" ${attrs} data-reaction="${option.key}" title="${escapeAttr(option.label)}" aria-label="${escapeAttr(option.label)}" role="menuitem">
                <span aria-hidden="true">${option.emoji}</span>
              </button>
            `;
          }).join("")}
        </div>
      </details>
    </div>
    ${reactionDetailsHtml(reactions)}
  `;
}

function reactionSummaryHtml(reactions = {}, total = reactionTotal(reactions)) {
  const visible = REACTION_OPTIONS
    .filter((option) => reactions[option.key]?.length)
    .slice(0, 4);
  return `
    <div class="reaction-summary" title="${escapeAttr(`${total} reação${total === 1 ? "" : "ões"}`)}">
      ${visible.map((option) => `<span aria-hidden="true">${option.emoji}</span>`).join("")}
      <strong>${total}</strong>
    </div>
  `;
}

function reactionDetailsHtml(reactions = {}) {
  const rows = REACTION_OPTIONS
    .map((option) => {
      const names = [...new Set(reactions[option.key] || [])].map(nameById).filter(Boolean);
      return names.length ? `${option.emoji} ${formatNameList(names)}` : "";
    })
    .filter(Boolean);
  return rows.length ? `<p class="reaction-details">${escapeHtml(rows.join(" · "))}</p>` : "";
}

function formatNameList(names = []) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function bookFavoriteCard(book) {
  return `
    <article class="book-card panel clickable-card" role="button" tabindex="0" data-open-book="${escapeAttr(book.id)}">
      <div class="book-showcase">
        ${coverHtml(book)}
        <div>
          <p class="eyebrow">${escapeHtml(book.genre)}</p>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="muted">${escapeHtml(book.author)} | média ${averageFor(book.id).toFixed(1)}</p>
          <button class="favorite-toggle active" data-open-book="${book.id}">Ver avaliação</button>
        </div>
      </div>
    </article>
  `;
}

function coverHtml(book) {
  if (book.coverImage) {
    return `<img class="book-cover image-cover" src="${book.coverImage}" alt="Capa de ${escapeAttr(book.title)}" />`;
  }
  return `<div class="book-cover" style="--cover: ${book.cover}"><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)}</span></div>`;
}

function miniCoverHtml(book) {
  if (book.coverImage) return `<img class="mini-cover" src="${book.coverImage}" alt="Capa de ${escapeAttr(book.title)}" />`;
  return `<div class="mini-cover" style="--cover: ${book.cover}"></div>`;
}

function avatarHtml(participant, style = "") {
  if (participant.photo) {
    return `<img class="avatar" src="${participant.photo}" alt="Foto de ${escapeAttr(participant.name)}" style="${style}" />`;
  }
  return `<div class="avatar" data-tone="${participant.tone}" style="${style}">${initials(participant.name)}</div>`;
}

function passportPortraitHtml(participant) {
  if (participant.photo) {
    return `<img class="passport-portrait" src="${participant.photo}" alt="Foto de ${escapeAttr(participant.name)}" />`;
  }
  return `<div class="passport-portrait empty" aria-label="Foto ainda não enviada">${initials(participant.name)}</div>`;
}

function emptyBooksPanel() {
  return emptyPanel("Nenhum livro cadastrado ainda", "Use a aba Livros para inserir leituras passadas, atuais ou futuras com mês, ano, indicação e capa.");
}

function emptyPanel(title, text) {
  return `<article class="panel empty-state"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(text)}</p></article>`;
}

function synopsisTeaserHtml(text, limit = 230) {
  const synopsis = String(text || "Sem sinopse cadastrada ainda.").trim();
  if (synopsis.length <= limit) return `<p>${escapeHtml(synopsis)}</p>`;
  const short = `${synopsis.slice(0, limit).trim().replace(/[,.!?;:]?$/, "")}...`;
  return `
    <details class="synopsis-teaser">
      <summary>
        <span class="closed-text">${escapeHtml(short)}</span>
        <span class="read-more">Leia mais</span>
        <span class="read-less">Mostrar menos</span>
      </summary>
      <p>${escapeHtml(synopsis)}</p>
    </details>
  `;
}

function quickStat(label, value, aux) {
  return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p class="muted">${escapeHtml(aux)}</p></article>`;
}

function statCard(label, value, aux, navAttrs = "") {
  return `<article class="stat-card ${navAttrs ? "clickable-card" : ""}" ${navAttrs ? `role="button" tabindex="0" ${navAttrs}` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p class="muted">${escapeHtml(aux)}</p></article>`;
}

function reviewsFor(bookId) {
  return state.reviews[bookId] || [];
}

function myReview(bookId) {
  const participant = currentParticipant();
  return reviewsFor(bookId).find((review) => review.participantId === participant.id);
}

function averageFor(bookId) {
  const reviews = reviewsFor(bookId);
  if (!reviews.length) return 0;
  return reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length;
}

function bestBook(year) {
  return filteredBooks(year).filter((book) => reviewsFor(book.id).length).sort((a, b) => averageFor(b.id) - averageFor(a.id))[0];
}

function worstBook(year) {
  return filteredBooks(year).filter((book) => reviewsFor(book.id).length).sort((a, b) => averageFor(a.id) - averageFor(b.id))[0];
}

function filteredBooks(year) {
  return year ? state.books.filter((book) => book.year === year) : state.books;
}

function recommenderStats() {
  return state.participants
    .map((participant) => {
      const books = state.books.filter((book) => book.indicatedBy === participant.id);
      const scores = books.map((book) => averageFor(book.id)).filter(Boolean);
      return {
        id: participant.id,
        name: participant.name,
        count: scores.length,
        score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
      };
    })
    .filter((item) => item.count)
    .sort((a, b) => b.score - a.score);
}

function bestRecommender() {
  return recommenderStats()[0];
}

function worstRecommender() {
  return recommenderStats().sort((a, b) => a.score - b.score)[0];
}

function genreStats() {
  const map = new Map();
  state.books.forEach((book) => map.set(book.genre || "Sem gênero", (map.get(book.genre || "Sem gênero") || 0) + 1));
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function totalReviews() {
  return Object.values(state.reviews).reduce((sum, reviews) => sum + reviews.length, 0);
}

function totalReadCurrentYear() {
  const datedReads = completedReadEntries();
  if (datedReads.length) {
    const currentYear = new Date().getFullYear();
    return datedReads.filter((entry) => entry.year === currentYear).length;
  }
  return state.participants.reduce((sum, participant) => sum + Number(participant.booksReadYear || 0), 0);
}

function totalReadInClub() {
  const datedReads = completedReadEntries();
  if (datedReads.length) return datedReads.length;
  return state.participants.reduce((sum, participant) => sum + Number(participant.booksReadClub || 0), 0);
}

function readYearStats() {
  const map = new Map();
  completedReadEntries().forEach((entry) => {
    map.set(entry.year, (map.get(entry.year) || 0) + 1);
  });
  return [...map.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);
}

function completedReadEntries() {
  const map = new Map();
  state.feed.forEach((item) => {
    if (!isCompletedFeedItem(item) || !item.participantId || !item.bookId) return;
    const year = readYear(item.readDate || item.date);
    if (!year) return;
    const key = `${item.participantId}:${item.bookId}`;
    map.set(key, {
      participantId: item.participantId,
      bookId: item.bookId,
      year,
      readDate: inputDateFromDisplay(item.readDate || item.date),
    });
  });
  return [...map.values()];
}

function isCompletedFeedItem(item) {
  return item?.type === "Marcou como lido" || Number(item?.progress || 0) >= 100;
}

function readingStatusFromProgress(progress) {
  const value = Number(progress || 0);
  if (value >= 100) return "Leitura concluída";
  if (value <= 0) return "Leitura ainda não iniciada";
  return "Leitura em andamento";
}

function readingMeta(participantId, bookId) {
  const progress = memberProgress(participantId);
  const tags = Array.isArray(progress.__bookTags?.[bookId]) ? progress.__bookTags[bookId] : [];
  return {
    progress: Number(progress[bookId] || 0),
    startDate: progress.__startedDates?.[bookId] || inferredStartDate(participantId, bookId),
    finishDate: progress.__completedDates?.[bookId] || inferredFinishDate(participantId, bookId),
    tags,
  };
}

function bookFeedItems(bookId, participantId = "") {
  return state.feed
    .filter((item) => item.bookId === bookId && (!participantId || item.participantId === participantId))
    .slice()
    .sort((a, b) => feedReadTime(b) - feedReadTime(a));
}

function inferredStartDate(participantId, bookId) {
  const entries = bookFeedItems(bookId, participantId)
    .filter((item) => Number(item.progress || 0) > 0)
    .sort((a, b) => feedReadTime(a) - feedReadTime(b));
  return inputDateFromDisplay(entries[0]?.readDate || entries[0]?.date || "");
}

function inferredFinishDate(participantId, bookId) {
  const entries = bookFeedItems(bookId, participantId)
    .filter((item) => Number(item.progress || 0) >= 100)
    .sort((a, b) => feedReadTime(a) - feedReadTime(b));
  return inputDateFromDisplay(entries[0]?.readDate || entries[0]?.date || "");
}

function feedReadTime(item) {
  const input = inputDateFromDisplay(item?.readDate || item?.date || "");
  if (input) return Date.parse(`${input}T12:00:00`);
  return Date.parse(item?.createdAt || item?.editedAt || 0) || 0;
}

function readingDateRangeLabel(meta) {
  if (meta.startDate && meta.finishDate) return `${displayReadDate(meta.startDate)} até ${displayReadDate(meta.finishDate)}`;
  if (meta.startDate) return `Começou em ${displayReadDate(meta.startDate)}`;
  if (meta.finishDate) return `Terminou em ${displayReadDate(meta.finishDate)}`;
  return "Datas não preenchidas";
}

function historyUpdateLabel(count) {
  return `${count} ${count === 1 ? "atualização" : "atualizações"}`;
}

function personalHistoryLabel(count) {
  if (!count) return "Ver atualizações deste livro";
  return count === 1 ? "1 atualização sua" : `${count} atualizações suas`;
}

function readingDurationLabel(startDate, finishDate) {
  if (!startDate || !finishDate) return "Começo e fim opcionais";
  const start = Date.parse(`${inputDateFromDisplay(startDate)}T12:00:00`);
  const finish = Date.parse(`${inputDateFromDisplay(finishDate)}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return "Confira as datas";
  const days = Math.round((finish - start) / 86400000) + 1;
  return `${days} dia${days === 1 ? "" : "s"} de leitura`;
}

function tagListText(tags = []) {
  if (!tags.length) return "Sem etiquetas";
  return tags.map(tagLabel).filter(Boolean).join(", ");
}

function tagLabel(key) {
  return BOOK_TAG_OPTIONS.find((option) => option.key === key)?.label || key;
}

function truncateText(text = "", limit = 80) {
  const value = String(text || "").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim().replace(/[,.!?;:]?$/, "")}...`;
}

function latestBook() {
  return sortedBooks()[0];
}

function currentReadingBook(participant) {
  if (!participant) return null;
  if (participant.currentBookId) return bookById(participant.currentBookId);
  const entries = Object.entries(state.progress[participant.id] || {});
  if (!entries.length) return null;
  const sorted = entries
    .map(([bookId, progress]) => ({ book: bookById(bookId), progress }))
    .filter((item) => item.book)
    .sort((a, b) => bookSortValue(b.book) - bookSortValue(a.book));
  return sorted[0]?.book || null;
}

function isFavorite(bookId) {
  return (state.favorites[currentParticipant().id] || []).includes(bookId);
}

function bookById(id) {
  return state.books.find((book) => book.id === id);
}

function bookByTitle(title = "") {
  const normalized = normalizeLookup(title);
  if (!normalized) return null;
  return state.books.find((book) => normalizeLookup(book.title) === normalized) || null;
}

function normalizeLookup(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function participantById(id) {
  return state.participants.find((participant) => participant.id === id);
}

function nameById(id) {
  return participantById(id)?.name || "Integrante removida";
}

function sortedBooks() {
  return [...state.books].sort((a, b) => bookSortValue(b) - bookSortValue(a));
}

function bookSortValue(book) {
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return Number(book.year || 0) * 12 + months.indexOf(book.month);
}

function monthIndex(month) {
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return Math.max(0, months.indexOf(month));
}

function randomCover(index) {
  const covers = [
    "linear-gradient(145deg, #111923, #8f1f24 58%, #d9a23a)",
    "linear-gradient(145deg, #f1e0c2, #9b2f25 55%, #24170f)",
    "linear-gradient(145deg, #244f65, #f0c37b 48%, #2c2118)",
    "linear-gradient(145deg, #f4a7bd, #b13055 48%, #2b151d)",
    "linear-gradient(145deg, #60321e, #d9a23a 58%, #fff1c7)",
  ];
  return covers[index % covers.length];
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function slug(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}

function uniqueId(base, existing) {
  let id = base;
  let count = 2;
  while (existing.includes(id)) {
    id = `${base}-${count}`;
    count += 1;
  }
  return id;
}

function stars(rating) {
  const rounded = Math.round(Number(rating || 0));
  return "★".repeat(rounded) + "☆".repeat(Math.max(0, 5 - rounded));
}

function parseRating(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const rating = Number(normalized);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return null;
  return Math.round(rating * 10) / 10;
}

function formatRating(value) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatRatingInput(value) {
  return formatRating(value);
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function todayInputDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inputDateFromDisplay(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayReadDate(value) {
  const input = inputDateFromDisplay(value);
  if (!input) return "";
  const [year, month, day] = input.split("-");
  return `${day}/${month}/${year}`;
}

function readYear(value) {
  const input = inputDateFromDisplay(value);
  return input ? Number(input.slice(0, 4)) : 0;
}

function formatRules(value) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderNotificationPanel() {
  const notifications = state.notifications || [];
  notificationPanel.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Notificações</p>
        <h3>Alertas do clube</h3>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" data-enable-push>${pushButtonLabel()}</button>
        ${"Notification" in window && Notification.permission === "granted" ? `<button class="ghost-button" type="button" data-test-push>Testar aviso</button>` : ""}
        <button class="ghost-button" type="button" data-mark-read>Marcar lidas</button>
        <button class="notification-close" type="button" data-close-notifications aria-label="Fechar notificações">×</button>
      </div>
    </div>
    <p class="muted">${pushHelpText()}</p>
    <div class="notification-list">
      ${notifications.length ? notifications.map(notificationCard).join("") : `<article class="notification-card"><strong>Nada por enquanto</strong><p class="muted">Quando houver reunião, livro novo ou histórico de leitura, aparece aqui.</p></article>`}
    </div>
  `;
  notificationPanel.querySelector("[data-enable-push]")?.addEventListener("click", enablePushPrototype);
  notificationPanel.querySelector("[data-test-push]")?.addEventListener("click", () => {
    state.notificationSettings.pushEnabled = true;
    persistLocalState();
    sendClubPush("Teste do Pobres Criaturas", "Se este aviso apareceu, o push real chegou neste aparelho.", "test");
    notify("Teste de push enviado.");
  });
  notificationPanel.querySelector("[data-mark-read]")?.addEventListener("click", markNotificationsRead);
  notificationPanel.querySelector("[data-close-notifications]")?.addEventListener("click", () => closeNotificationPanel());
}

function toggleNotificationPanel() {
  if (notificationPanel.classList.contains("hidden")) {
    openNotificationPanel();
  } else {
    closeNotificationPanel();
  }
}

function openNotificationPanel() {
  renderNotificationPanel();
  notificationPanel.classList.remove("hidden");
  if (!notificationHistoryOpen) {
    notificationHistoryOpen = true;
    window.history.pushState({ notificationPanel: true }, "", window.location.href);
  }
}

function closeNotificationPanel(useHistory = true) {
  notificationPanel.classList.add("hidden");
  notificationHistoryOpen = false;
  if (useHistory && window.history.state?.notificationPanel) {
    window.history.back();
  }
}

async function registerPwa() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update())
      .catch(() => {
        notify("Modo offline indisponível neste navegador.");
      });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    installPromptEvent = null;
    updateInstallButton();
    notify("Pobres Criaturas foi instalado.");
  });

  updateInstallButton();
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
}

function updateInstallButton() {
  if (isStandalone()) {
    installButton.classList.add("hidden");
    return;
  }
  installButton.classList.remove("hidden");
  installButton.textContent = isIos() ? "Instalar no iPhone" : "Instalar app";
}

function installHelpText() {
  if (isIos()) return "No iPhone, abra no Safari, toque em Compartilhar e depois Adicionar à Tela de Início.";
  if (isAndroid()) return "No Android, abra no Chrome, toque nos três pontos e escolha Instalar app ou Adicionar à tela inicial.";
  return "Use o menu do navegador e escolha Instalar app ou Adicionar à tela inicial.";
}

function notificationCard(item) {
  return `
    <article class="notification-card ${item.read ? "" : "unread"}">
      <span>${escapeHtml(notificationLabel(item.type))}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.message)}</p>
      <small>${escapeHtml(item.date)}</small>
    </article>
  `;
}

function createNotification({ type, title, message, push = false }) {
  const item = {
    id: `n${Date.now()}${Math.random().toString(16).slice(2)}`,
    type,
    title,
    message,
    date: new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    read: false,
  };
  state.notifications ||= [];
  state.notifications.unshift(item);
  state.notifications = state.notifications.slice(0, 40);
  applyNotificationReadState();
  saveNotificationRecord(item);
  persistLocalState();
  updateNotificationBadge();
  if (!notificationPanel.classList.contains("hidden")) renderNotificationPanel();
  if (push) sendClubPush(title, message, type);
}

async function enablePushPrototype() {
  if (!("Notification" in window)) {
    notify("Este navegador não oferece notificações do sistema.");
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    notify("Este aparelho não oferece push web completo. A central interna continua funcionando.");
    return;
  }
  if (Notification.permission === "granted") {
    const registered = await registerPushSubscription();
    if (registered) {
      state.notificationSettings.pushEnabled = true;
      persistLocalState();
      notify("Push real ativado neste aparelho.");
      sendPushPrototype("Notificações ativadas", "O Pobres Criaturas vai avisar sobre livros e reuniões.");
    } else {
      state.notificationSettings.pushEnabled = false;
      persistLocalState();
    }
    renderNotificationPanel();
    return;
  }
  if (Notification.permission === "denied") {
    notify("As notificações estão bloqueadas nas permissões do navegador.");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    const registered = await registerPushSubscription();
    if (registered) {
      state.notificationSettings.pushEnabled = true;
      persistLocalState();
      notify("Push real ativado neste aparelho.");
      sendPushPrototype("Notificações ativadas", "Você receberá alertas do clube neste aparelho.");
    } else {
      state.notificationSettings.pushEnabled = false;
      persistLocalState();
    }
  } else {
    state.notificationSettings.pushEnabled = false;
    persistLocalState();
    notify("Sem permissão de push. A central interna continua funcionando.");
  }
  renderNotificationPanel();
}

async function registerPushSubscription() {
  try {
    const publicKey = supabaseSettings.vapidPublicKey;
    if (!publicKey) {
      notify("Chave publica de push ausente no app.");
      return false;
    }
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const token = await accessToken();
    if (!token) {
      notify("Entre novamente para ativar push.");
      return false;
    }
    const response = await fetch("./api/register-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!response.ok) {
      let serverMessage = "Não consegui salvar este aparelho no servidor de push.";
      try {
        const body = await response.json();
        if (body?.error) serverMessage = body.error;
      } catch {
        serverMessage = await response.text();
      }
      throw new Error(serverMessage);
    }
    return true;
  } catch (error) {
    console.warn("Nao foi possivel registrar push", error);
    notify(error.message || "Não consegui salvar este aparelho no servidor de push.");
    return false;
  }
}

async function sendClubPush(title, message, type) {
  if (!state.notificationSettings?.pushEnabled) return;
  try {
    const token = await accessToken();
    if (!token) throw new Error("Sessao ausente");
    const response = await fetch("./api/send-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, message, type }),
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    console.warn("Push real falhou; usando aviso local", error);
    sendPushPrototype(title, message);
  }
}

async function sendPushPrototype(title, message) {
  if (!state.notificationSettings?.pushEnabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body: message,
        icon: "./assets/logo-pobres-criaturas.png",
        badge: "./assets/icon-192.png",
      });
      return;
    }
    new Notification(title, {
      body: message,
      icon: "./assets/logo-pobres-criaturas.png",
    });
  } catch {
    notify("Notificação do aparelho indisponível agora; o aviso ficou salvo na central do app.");
  }
}

async function accessToken() {
  if (!clubDb) return "";
  const { data } = await clubDb.auth.getSession();
  return data.session?.access_token || "";
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function markNotificationsRead() {
  const ids = new Set(notificationReadIds());
  (state.notifications || []).forEach((item) => {
    item.read = true;
    if (item.id) ids.add(item.id);
  });
  state.notificationSettings ||= {};
  state.notificationSettings.readNotificationIds = [...ids].slice(-200);
  persistLocalState();
  updateNotificationBadge();
  renderNotificationPanel();
  saveCloudSnapshot();
}

function updateNotificationBadge() {
  applyNotificationReadState();
  const count = (state.notifications || []).filter((item) => !item.read).length;
  notificationCount.textContent = String(count);
  notificationButton.classList.toggle("has-unread", count > 0);
}

function notificationReadIds() {
  state.notificationSettings ||= {};
  if (!Array.isArray(state.notificationSettings.readNotificationIds)) {
    state.notificationSettings.readNotificationIds = [];
  }
  return state.notificationSettings.readNotificationIds;
}

function applyNotificationReadState() {
  const ids = new Set(notificationReadIds());
  (state.notifications || []).forEach((item) => {
    if (ids.has(item.id)) item.read = true;
  });
}

function notificationLabel(type) {
  return {
    meeting: "Reunião",
    reminder: "Lembrete",
    book: "Livro",
    review: "Avaliação",
    feed: "Feed",
  }[type] || "Aviso";
}

function pushButtonLabel() {
  if (!("Notification" in window)) return "Push indisponível";
  if (Notification.permission === "granted" && state.notificationSettings?.pushEnabled) return "Push ativado";
  if (Notification.permission === "denied") return "Push bloqueado";
  return "Ativar push";
}

function pushHelpText() {
  if (!("Notification" in window)) return "A central interna funciona, mas este navegador não oferece push.";
  if (location.protocol === "file:") return "Neste protótipo local, o aviso depende da permissão do navegador. No app publicado, ele tenta usar a notificação do aparelho.";
  return "Com push real ativo, este aparelho recebe avisos de livros, reuniões e lembretes mesmo quando o app estiver fechado, desde que o sistema permita.";
}

function checkMeetingReminders() {
  if (!state.meeting?.date) return;
  state.notificationSettings ||= { pushEnabled: false, reminders: {} };
  state.notificationSettings.reminders ||= {};
  const today = startOfDay(new Date());
  const meetingDay = startOfDay(new Date(`${state.meeting.date}T12:00:00`));
  const days = Math.round((meetingDay - today) / 86400000);
  if (days === 7) {
    createReminderOnce(`week-${state.meeting.date}`, "Falta 1 semana para a reunião", meetingNotificationText("Faltam 7 dias."));
  }
  if (days === 0) {
    createReminderOnce(`today-${state.meeting.date}`, "É hoje!", meetingNotificationText("Hoje é dia de encontro."));
  }
}

function createReminderOnce(key, title, message) {
  if (state.notificationSettings.reminders[key]) return;
  state.notificationSettings.reminders[key] = true;
  createNotification({ type: "reminder", title, message, push: true });
}

function meetingNotificationText(prefix = "") {
  const book = bookById(state.meeting.bookId);
  const when = state.meeting.date ? formatDate(state.meeting.date) : "data a definir";
  const time = state.meeting.time ? ` às ${state.meeting.time}` : "";
  const place = state.meeting.place ? ` em ${state.meeting.place}` : "";
  const bookText = book ? ` Livro: ${book.title}.` : "";
  return `${prefix ? `${prefix} ` : ""}Encontro marcado para ${when}${time}${place}.${bookText}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => {
        const maxSide = 520;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      });
      image.addEventListener("error", () => resolve(reader.result));
      image.src = reader.result;
    });
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}
