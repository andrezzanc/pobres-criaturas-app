const STORAGE_KEY = "pobresCriaturasPassport";
const SESSION_KEY = "pobresCriaturasSession";
const APP_VERSION = 2;
const CLOUD_STATE_ID = "default-club-state";
const supabaseSettings = window.POBRES_CRIATURAS_SUPABASE || {};
const clubDb = window.supabase && supabaseSettings.url && supabaseSettings.publishableKey
  ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.publishableKey)
  : null;

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
let currentView = "home";
let selectedBookId = latestBook()?.id || "";
let meetingEditing = false;
let bookFormMode = null;
let feedComposerOpen = false;
let feedEditId = null;
let feedCommentId = null;
let rulesEditing = false;
let reviewFormOpen = false;
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSavePending = false;
let cloudUpdatedAt = null;
let cloudRefreshInFlight = false;
let notificationHistoryOpen = false;

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

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "books") {
      openBooks();
      return;
    }
    setView(button.dataset.view);
  });
});

window.addEventListener("popstate", () => {
  if (!notificationPanel.classList.contains("hidden")) {
    closeNotificationPanel(false);
  }
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
      await loadCloudState();
      const user = ensureClubUser(data.session.user);
      session = { email: user.email };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveState();
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

    await loadCloudState();
    const user = ensureClubUser(data.user, { name, profile });
    saveState();
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

  await loadCloudState();
  const user = ensureClubUser(data.user);
  saveState();
  startSession(user);
  submitButton.disabled = false;
}

async function loadCloudState() {
  const { data, error } = await clubDb
    .from("club_state")
    .select("data, updated_at")
    .eq("id", CLOUD_STATE_ID)
    .maybeSingle();

  if (error) {
    notify("Nao consegui carregar os dados online. Confira se o SQL da Etapa 7 foi executado.");
    return;
  }

  if (data) {
    applyCloudState(data.data || {}, data.updated_at);
    return;
  }

  queueCloudSave();
}

function applyCloudState(cloudData, updatedAt = null) {
  state = withStateDefaults({ ...clone(seed), ...(cloudData || {}) });
  cloudUpdatedAt = updatedAt;
  selectedBookId = latestBook()?.id || "";
  persistLocalState();
}

async function refreshCloudState({ render = false } = {}) {
  if (!clubDb || !session || cloudRefreshInFlight) return false;
  cloudRefreshInFlight = true;
  const { data, error } = await clubDb
    .from("club_state")
    .select("data, updated_at")
    .eq("id", CLOUD_STATE_ID)
    .maybeSingle();
  cloudRefreshInFlight = false;
  if (error || !data) return false;
  const remoteTime = Date.parse(data.updated_at || "");
  const knownTime = Date.parse(cloudUpdatedAt || "");
  if (cloudUpdatedAt && remoteTime <= knownTime) return false;

  applyCloudState(data.data || {}, data.updated_at);
  const { data: authData } = await clubDb.auth.getSession();
  if (authData.session?.user) {
    ensureClubUser(authData.session.user);
    persistLocalState();
  }
  if (render && appShell && !appShell.classList.contains("hidden")) {
    showApp();
  }
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
  const current = await fetchCloudState();
  if (current) {
    const remoteTime = Date.parse(current.updated_at || "");
    const knownTime = Date.parse(cloudUpdatedAt || "");
    if (!cloudUpdatedAt || remoteTime > knownTime) {
      state = mergeClubStates(withStateDefaults({ ...clone(seed), ...(current.data || {}) }), state);
      cloudUpdatedAt = current.updated_at;
      persistLocalState();
    }
  }
  const payload = clone(state);
  delete payload.__cloudError;
  payload.users = (payload.users || []).map(({ password, ...user }) => user);
  const savedAt = new Date().toISOString();
  const { error } = await clubDb
    .from("club_state")
    .upsert({
      id: CLOUD_STATE_ID,
      data: payload,
      updated_at: savedAt,
    });
  cloudSaveInFlight = false;
  if (error) {
    console.warn("Nao foi possivel salvar no Supabase", error);
    return false;
  }
  if (cloudSavePending) {
    cloudSavePending = false;
    return saveCloudState();
  }
  cloudUpdatedAt = savedAt;
  return true;
}

async function fetchCloudState() {
  const { data, error } = await clubDb
    .from("club_state")
    .select("data, updated_at")
    .eq("id", CLOUD_STATE_ID)
    .maybeSingle();
  if (error) {
    console.warn("Nao foi possivel conferir a versao online", error);
    return null;
  }
  return data;
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

function mergeClubStates(cloudState, localState) {
  const merged = withStateDefaults({ ...clone(seed), ...cloudState, ...localState });
  merged.users = mergeUsers(cloudState.users, localState.users);
  merged.participants = mergeById(cloudState.participants, localState.participants);
  merged.books = mergeById(cloudState.books, localState.books);
  merged.feed = mergeById(cloudState.feed, localState.feed).sort(sortNewestFirst);
  merged.notifications = mergeById(cloudState.notifications, localState.notifications).sort(sortNewestFirst).slice(0, 40);
  merged.reviews = mergeReviews(cloudState.reviews, localState.reviews);
  merged.progress = mergeNestedObjects(cloudState.progress, localState.progress);
  merged.favorites = mergeArrayMap(cloudState.favorites, localState.favorites);
  merged.notificationSettings = {
    ...(cloudState.notificationSettings || {}),
    ...(localState.notificationSettings || {}),
    reminders: {
      ...(cloudState.notificationSettings?.reminders || {}),
      ...(localState.notificationSettings?.reminders || {}),
    },
  };
  merged.indicationOrder = mergeOrder(cloudState.indicationOrder, localState.indicationOrder, merged.participants);
  merged.meeting = cloudState.meeting || localState.meeting || clone(seed.meeting);
  merged.rules = cloudState.rules || localState.rules || seed.rules;
  return withStateDefaults(merged);
}

function mergeById(cloudItems = [], localItems = []) {
  const map = new Map();
  [...(cloudItems || []), ...(localItems || [])].forEach((item) => {
    if (!item) return;
    const key = item.id || item.email || fallbackKey(item);
    map.set(key, { ...(map.get(key) || {}), ...item });
  });
  return [...map.values()];
}

function mergeUsers(cloudUsers = [], localUsers = []) {
  const map = new Map();
  [...(cloudUsers || []), ...(localUsers || [])].forEach((user) => {
    if (!user) return;
    const key = user.supabaseUserId || user.email || user.participantId || fallbackKey(user);
    map.set(key, { ...(map.get(key) || {}), ...user });
  });
  return [...map.values()];
}

function mergeReviews(cloudReviews = {}, localReviews = {}) {
  const result = {};
  [...new Set([...Object.keys(cloudReviews || {}), ...Object.keys(localReviews || {})])].forEach((bookId) => {
    result[bookId] = mergeByParticipant(cloudReviews?.[bookId], localReviews?.[bookId]);
  });
  return result;
}

function mergeByParticipant(cloudItems = [], localItems = []) {
  const map = new Map();
  [...(cloudItems || []), ...(localItems || [])].forEach((item) => {
    if (!item) return;
    const key = item.participantId || fallbackKey(item);
    map.set(key, { ...(map.get(key) || {}), ...item });
  });
  return [...map.values()];
}

function mergeNestedObjects(cloudValue = {}, localValue = {}) {
  const result = { ...(cloudValue || {}) };
  Object.entries(localValue || {}).forEach(([key, value]) => {
    result[key] = { ...(result[key] || {}), ...(value || {}) };
  });
  return result;
}

function mergeArrayMap(cloudValue = {}, localValue = {}) {
  const result = { ...(cloudValue || {}) };
  Object.entries(localValue || {}).forEach(([key, value]) => {
    result[key] = [...new Set([...(result[key] || []), ...(value || [])])];
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

function fallbackKey(item) {
  return JSON.stringify(item);
}

function withStateDefaults(value) {
  value.notifications ||= [];
  value.notificationSettings ||= {};
  value.notificationSettings.pushEnabled ||= false;
  value.notificationSettings.reminders ||= {};
  value.indicationOrder ||= [];
  value.feed ||= [];
  value.feed.forEach((item) => {
    item.likedBy ||= [];
    item.comments ||= [];
    item.likes = item.likedBy.length;
  });
  return value;
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
  setView(currentView);
}

function showAuth() {
  bootScreen.classList.add("hidden");
  appShell.classList.add("hidden");
  authScreen.classList.remove("hidden");
}

function setView(view) {
  currentView = view;
  const titles = {
    home: "Início",
    passport: "Passaporte",
    books: "Livros do mês",
    feed: "Feed de leitura",
    rules: "Ordem e Regras",
    favorites: "Favoritos",
    stats: "Estatísticas",
    profile: "Meu perfil",
  };
  viewTitle.textContent = titles[view];
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const renderers = {
    home: renderHome,
    passport: renderPassport,
    books: renderBooks,
    feed: renderFeed,
    rules: renderRules,
    favorites: renderFavorites,
    stats: renderStats,
    profile: renderProfile,
  };
  renderers[view]();
}

function openBooks(bookId = "") {
  selectedBookId = bookId || latestBook()?.id || "";
  reviewFormOpen = false;
  bookFormMode = null;
  setView("books");
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
    role: generateRole(profile),
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

function generateRole(profile) {
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
          <div class="stamp"><span>Livro favorito</span><strong>${escapeHtml(participant.favoriteBook)}</strong></div>
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
            <h3>${escapeHtml(featuredBook.title)}</h3>
          </div>
          <button class="secondary-button" data-jump="books">Avaliar livro</button>
        </div>
        <div class="book-showcase">
          ${coverHtml(featuredBook)}
          <div>
            <p>${escapeHtml(featuredBook.synopsis || "Sem sinopse cadastrada ainda.")}</p>
            <div class="rating-big">${formatRating(averageFor(featuredBook.id))} <span class="star-row">${stars(averageFor(featuredBook.id))}</span></div>
            <div class="progress-track" aria-label="Progresso ${featuredProgress}%"><div class="progress-fill" style="--value: ${featuredProgress}%"></div></div>
            <p class="muted">${featuredProgress}% lido por você. Média calculada com ${reviewsFor(featuredBook.id).length} avaliação${reviewsFor(featuredBook.id).length === 1 ? "" : "ões"}.</p>
          </div>
        </div>
      </section>
    ` : emptyBooksPanel()}

    <section class="quick-grid">
      ${quickStat("Integrantes inscritas", String(state.participants.length), "aparecem conforme cadastro")}
      ${quickStat("Livros lidos no ano", String(totalReadCurrentYear()), String(new Date().getFullYear()))}
      ${quickStat("Livros lidos no clube", String(totalReadInClub()), "desde a entrada das integrantes")}
    </section>

    <section class="mobile-shortcuts">
      <button class="secondary-button" type="button" data-jump="stats">Ver estatísticas</button>
    </section>
  `;

  document.querySelector("[data-edit-meeting]")?.addEventListener("click", () => {
    meetingEditing = true;
    renderHome();
  });
  document.querySelector("#meeting-form")?.addEventListener("submit", saveMeeting);
  document.querySelector("[data-cancel-meeting]")?.addEventListener("click", () => {
    meetingEditing = false;
    renderHome();
  });
  document.querySelector("[data-jump='books']")?.addEventListener("click", () => openBooks());
  document.querySelector("[data-jump='stats']")?.addEventListener("click", () => setView("stats"));
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
        <div class="stamp"><span>Livro</span><strong>${book ? escapeHtml(book.title) : "A definir"}</strong></div>
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
}

function renderBooks() {
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
      <section class="month-strip" aria-label="Meses">
        ${sortedBooks().map((book) => `<button class="month-button ${book.id === selected?.id ? "active" : ""}" data-book="${book.id}">${escapeHtml(book.month)} ${book.year}</button>`).join("")}
      </section>
      ${selected ? bookReviewArea(selected) : ""}
    ` : emptyBooksPanel()}
  `;

  document.querySelector("[data-open-book-form]")?.addEventListener("click", () => {
    bookFormMode = "create";
    renderBooks();
  });
  document.querySelector("#book-form")?.addEventListener("submit", saveBook);
  document.querySelector("[data-cancel-book-form]")?.addEventListener("click", () => {
    bookFormMode = null;
    renderBooks();
  });
  document.querySelectorAll("[data-book]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedBookId = button.dataset.book;
      if (bookFormMode === "edit") bookFormMode = null;
      reviewFormOpen = false;
      renderBooks();
    });
  });
  wireReviewControls(selected);
}

function bookReviewArea(selected) {
  const ownReview = myReview(selected.id);
  return `
    <section class="review-layout">
      <article class="panel">
        <div class="book-showcase">
          ${coverHtml(selected)}
          <div>
            <p class="eyebrow">${escapeHtml(selected.month)} ${selected.year} | indicado por ${escapeHtml(nameById(selected.indicatedBy))}</p>
            <h3>${escapeHtml(selected.title)}</h3>
            <p class="muted">${escapeHtml(selected.author)} | ${escapeHtml(selected.genre || "Sem gênero")} | ${selected.pages || "?"} páginas</p>
            <div class="rating-big">${formatRating(averageFor(selected.id))} <span class="star-row">${stars(averageFor(selected.id))}</span></div>
            <button class="favorite-toggle ${isFavorite(selected.id) ? "active" : ""}" data-favorite="${selected.id}">
              ${isFavorite(selected.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            </button>
            <button class="ghost-button" type="button" data-edit-book>Editar livro</button>
          </div>
        </div>
      </article>
      ${reviewFormOpen ? reviewFormHtml(selected, ownReview) : reviewSummaryHtml(selected, ownReview)}
    </section>
    <section class="review-list">
      ${reviewsFor(selected.id).length ? reviewsFor(selected.id).map(reviewCard).join("") : emptyPanel("Ainda sem avaliações", "Quando as integrantes salvarem estrelas, a média aparece aqui.")}
    </section>
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
        <button class="save-button" type="button" data-open-review-form>${ownReview ? "Editar avaliação" : "Criar avaliação"}</button>
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
  return `
    <article class="panel my-review">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Minha avaliação</p>
          <h3>${ownReview ? "Editar avaliação" : "Criar avaliação"}</h3>
        </div>
      </div>
      <form id="review-form" class="review-form">
        <label>
          <span>Estrelas</span>
          <input id="review-rating" name="rating" type="text" inputmode="decimal" placeholder="Ex.: 0,2 | 2,5 | 3,8" value="${escapeAttr(ownReview ? formatRatingInput(ownReview.rating) : "")}" />
        </label>
        <label>
          <span>3 palavras para descrever o livro</span>
          <input name="threeWords" maxlength="80" placeholder="Ex.: tenso, rápido, surpreendente" value="${escapeAttr(ownReview?.threeWords || "")}" />
        </label>
        <label>
          <span>Resenha mais profunda</span>
          <textarea name="deepReview" placeholder="Escreva sua opinião com mais calma aqui.">${escapeHtml(ownReview?.deepReview || ownReview?.comment || "")}</textarea>
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
  return `
    <form id="book-form" class="book-form">
      <input type="hidden" name="bookId" value="${book?.id || ""}" />
      <label><span>Título</span><input name="title" required placeholder="Nome do livro" value="${escapeAttr(book?.title || "")}" /></label>
      <label><span>Autoria</span><input name="author" required placeholder="Autora ou autor" value="${escapeAttr(book?.author || "")}" /></label>
      <label><span>Mês</span>${monthSelect(book?.month)}</label>
      <label><span>Ano</span><input name="year" type="number" min="1900" max="2100" value="${book?.year || new Date().getFullYear()}" required /></label>
      <label><span>Quem indicou</span>${participantSelect(book?.indicatedBy)}</label>
      <label><span>Gênero</span><input name="genre" placeholder="Suspense, romance, fantasia..." value="${escapeAttr(book?.genre || "")}" /></label>
      <label><span>Páginas</span><input name="pages" type="number" min="1" placeholder="304" value="${book?.pages || ""}" /></label>
      <label><span>${isEdit ? "Alterar capa" : "Capa do livro"}</span><input name="coverImage" type="file" accept="image/*" /></label>
      <label class="wide"><span>Sinopse ou observação</span><textarea name="synopsis" placeholder="Por que esse livro entrou no clube?">${escapeHtml(book?.synopsis || "")}</textarea></label>
      <div class="button-row wide">
        <button class="save-button" type="submit">${isEdit ? "Salvar alterações" : "Salvar livro"}</button>
        <button class="ghost-button" type="button" data-cancel-book-form>Cancelar</button>
      </div>
    </form>
  `;
}

function wireReviewControls(selected) {
  if (!selected) return;
  document.querySelectorAll("[data-open-review-form]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewFormOpen = true;
      renderBooks();
    });
  });
  document.querySelector("[data-cancel-review]")?.addEventListener("click", () => {
    reviewFormOpen = false;
    renderBooks();
  });
  document.querySelector("#review-form")?.addEventListener("submit", (event) => saveReview(event, selected.id));
  document.querySelector("[data-favorite]")?.addEventListener("click", () => toggleFavorite(selected.id));
  document.querySelector("[data-edit-book]")?.addEventListener("click", () => {
    bookFormMode = "edit";
    renderBooks();
  });
}

function renderFeed() {
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
    renderFeed();
  });
  document.querySelector("[data-cancel-feed-form]")?.addEventListener("click", () => {
    feedComposerOpen = false;
    feedEditId = null;
    renderFeed();
  });
  document.querySelector("#feed-form")?.addEventListener("submit", saveFeed);
  document.querySelectorAll("[data-edit-feed]").forEach((button) => {
    button.addEventListener("click", () => {
      feedEditId = button.dataset.editFeed;
      feedComposerOpen = false;
      feedCommentId = null;
      renderFeed();
    });
  });
  document.querySelectorAll("[data-like-feed]").forEach((button) => {
    button.addEventListener("click", () => toggleFeedLike(button.dataset.likeFeed));
  });
  document.querySelectorAll("[data-comment-feed]").forEach((button) => {
    button.addEventListener("click", () => {
      feedCommentId = feedCommentId === button.dataset.commentFeed ? null : button.dataset.commentFeed;
      feedEditId = null;
      feedComposerOpen = false;
      renderFeed();
    });
  });
  document.querySelectorAll("[data-cancel-feed-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      feedCommentId = null;
      renderFeed();
    });
  });
  document.querySelectorAll("[data-feed-comment-form]").forEach((form) => {
    form.addEventListener("submit", saveFeedComment);
  });
}

function feedFormHtml(item, currentBook, participant) {
  const selectedBookIdForForm = item?.bookId || currentBook?.id;
  const selectedType = item?.type || "Começou a ler";
  const progress = item?.progress ?? state.progress[participant.id]?.[selectedBookIdForForm] ?? 0;
  const options = ["Começou a ler", "Atualizou progresso", "Marcou como lido", "Fez um histórico de leitura"];
  return `
    <form id="feed-form" class="feed-form">
      <input type="hidden" name="feedId" value="${escapeAttr(item?.id || "")}" />
      <label><span>Livro</span>${bookSelect(selectedBookIdForForm)}</label>
      <label><span>Status</span>
        <select name="type">
          ${options.map((option) => `<option ${option === selectedType ? "selected" : ""}>${option}</option>`).join("")}
        </select>
      </label>
      <label><span>Progresso</span><input name="progress" type="number" min="0" max="100" value="${progress}" /></label>
      <button class="save-button" type="submit">${item ? "Salvar histórico" : "Publicar"}</button>
      <label style="grid-column: 1 / -1"><span>Comentário</span><textarea name="text" placeholder="Ex.: capítulo 12 e já desconfio de todo mundo">${escapeHtml(item?.text || "")}</textarea></label>
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
  document.querySelector("#rules-form")?.addEventListener("submit", saveRules);
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
  document.querySelectorAll("[data-open-book]").forEach((button) => {
    button.addEventListener("click", () => {
      openBooks(button.dataset.openBook);
    });
  });
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
  viewRoot.innerHTML = `
    <section class="stats-grid">
      ${statCard("Maior nota do ano", bestYear?.title || "A definir", bestYear ? averageFor(bestYear.id).toFixed(1) : "0.0")}
      ${statCard("Maior nota da história", bestHistory?.title || "A definir", bestHistory ? averageFor(bestHistory.id).toFixed(1) : "0.0")}
      ${statCard("Menor nota do ano", worstYear?.title || "A definir", worstYear ? averageFor(worstYear.id).toFixed(1) : "0.0")}
      ${statCard("Menor nota da história", worstHistory?.title || "A definir", worstHistory ? averageFor(worstHistory.id).toFixed(1) : "0.0")}
      ${statCard("Indica melhores livros", recommender?.name || "A definir", recommender ? recommender.score.toFixed(1) : "0.0")}
      ${statCard("Indica os piores", lowRecommender?.name || "A definir", lowRecommender ? lowRecommender.score.toFixed(1) : "0.0")}
      ${statCard("Comentários registrados", String(totalReviews()), "avaliações")}
      ${statCard("Livros lidos no ano", String(totalReadCurrentYear()), String(new Date().getFullYear()))}
      ${statCard("Livros lidos no clube", String(totalReadInClub()), "declarados pelas integrantes")}
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
  document.querySelector("#profile-form").addEventListener("submit", saveProfile);
}

function saveMeeting(event) {
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
  const data = new FormData(event.currentTarget);
  const title = data.get("title").trim();
  const author = data.get("author").trim();
  const year = Number(data.get("year"));
  const month = data.get("month");
  const coverFile = event.currentTarget.elements.coverImage.files[0];
  const coverImage = coverFile ? await readPhoto(coverFile) : "";
  const editingId = data.get("bookId");
  const existing = editingId ? bookById(editingId) : null;

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
    createNotification({
      type: "book",
      title: "Livro atualizado",
      message: `${title} foi atualizado na biblioteca do clube.`,
      push: true,
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
    createNotification({
      type: "book",
      title: "Novo livro cadastrado",
      message: `${title}, de ${author}, entrou no passaporte do clube.`,
      push: true,
    });
  }
  bookFormMode = null;
  saveState();
  const savedOnline = await saveCloudState();
  if (!savedOnline) {
    notify("Livro salvo neste aparelho. A sincronização online ainda está tentando concluir.");
  }
  renderBooks();
}

function saveReview(event, bookId) {
  event.preventDefault();
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
    state.reviews[bookId].push({ participantId: participant.id, rating, threeWords, deepReview, comment: deepReview });
  }
  saveState();
  reviewFormOpen = false;
  notify("Avaliação salva com estrelas e comentário.");
  createNotification({
    type: "review",
    title: "Nova avaliação",
    message: `${participant.name} avaliou ${bookById(bookId)?.title || "um livro"} com ${formatRating(rating)} estrelas.`,
    push: true,
  });
  renderBooks();
}

function toggleFavorite(bookId) {
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
  saveState();
  renderBooks();
}

function saveFeed(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const participant = currentParticipant();
  const feedId = data.get("feedId");
  const bookId = data.get("bookId");
  const progress = Math.max(0, Math.min(100, Number(data.get("progress") || 0)));
  const type = data.get("type");
  const text = data.get("text");
  state.progress[participant.id] ||= {};
  state.progress[participant.id][bookId] = progress;
  participant.currentBookId = bookId;
  syncCompletedBook(participant, bookId, type, progress);

  const existing = feedId ? state.feed.find((item) => item.id === feedId && item.participantId === participant.id) : null;
  if (existing) {
    existing.type = type;
    existing.bookId = bookId;
    existing.text = text;
    existing.progress = progress;
    existing.editedAt = new Date().toLocaleDateString("pt-BR");
  } else {
    state.feed.unshift({
      id: `f${Date.now()}`,
      participantId: participant.id,
      date: new Date().toLocaleDateString("pt-BR"),
      type,
      bookId,
      text,
      progress,
      likes: 0,
      likedBy: [],
      comments: [],
    });
  }
  saveState();
  notify(existing ? "Histórico atualizado." : "Atualização publicada no feed.");
  createNotification({
    type: "feed",
    title: existing ? "Histórico editado" : "Histórico de leitura",
    message: `${participant.name} atualizou ${bookById(bookId)?.title || "uma leitura"} para ${progress}%.`,
    push: true,
  });
  feedComposerOpen = false;
  feedEditId = null;
  renderFeed();
}

function syncCompletedBook(participant, bookId, type, progress) {
  const completed = type === "Marcou como lido" || Number(progress) >= 100;
  if (!completed || !bookId) return;
  participant.completedBookIds ||= [];
  if (participant.completedBookIds.includes(bookId)) return;
  participant.completedBookIds.push(bookId);
  participant.booksReadClub = Number(participant.booksReadClub || 0) + 1;
  participant.booksReadYear = Number(participant.booksReadYear || 0) + 1;
}

function toggleFeedLike(feedId) {
  const participant = currentParticipant();
  const item = state.feed.find((feedItem) => feedItem.id === feedId);
  if (!item || !participant) return;
  item.likedBy ||= [];
  if (item.likedBy.includes(participant.id)) {
    item.likedBy = item.likedBy.filter((id) => id !== participant.id);
    notify("Curtida removida.");
  } else {
    item.likedBy.push(participant.id);
    notify("Histórico curtido.");
  }
  item.likes = item.likedBy.length;
  saveState();
  renderFeed();
}

function saveFeedComment(event) {
  event.preventDefault();
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
  item.comments.push({
    id: `c${Date.now()}`,
    participantId: participant.id,
    text,
    date: new Date().toLocaleDateString("pt-BR"),
  });
  feedCommentId = null;
  saveState();
  notify("Comentário publicado.");
  renderFeed();
}

function saveRules(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.rules = data.get("rules");
  normalizeIndicationOrder();
  rulesEditing = false;
  saveState();
  notify("Ordem e regras salvas.");
  renderRules();
}

async function saveProfile(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const participant = currentParticipant();
  participant.favoriteBook = data.get("favoriteBook");
  participant.favoriteCharacter = data.get("favoriteCharacter");
  participant.booksReadYear = Number(data.get("booksReadYear") || 0);
  participant.booksReadClub = Number(data.get("booksReadClub") || 0);
  participant.goal = Number(data.get("goal") || 12);
  participant.genres = data.get("genres").split(",").map((item) => item.trim()).filter(Boolean);
  participant.quote = data.get("quote");
  const photo = event.currentTarget.elements.photo.files[0];
  if (photo) participant.photo = await readPhoto(photo);
  saveState();
  notify("Perfil salvo no passaporte.");
  renderProfile();
}

function bookSelect(selectedId, allowEmpty = false) {
  const empty = allowEmpty ? `<option value="">A definir</option>` : "";
  return `<select name="bookId">${empty}${sortedBooks().map((book) => `<option value="${book.id}" ${book.id === selectedId ? "selected" : ""}>${escapeHtml(book.title)} (${escapeHtml(book.month)} ${book.year})</option>`).join("")}</select>`;
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
  return `
    <article class="participant-card">
      <div class="book-line">
        ${avatarHtml(participant)}
        <div>
          <h3>${escapeHtml(participant.name)}</h3>
          <p class="muted">${escapeHtml(participant.role)}</p>
        </div>
      </div>
      <div class="stamp"><span>Lidos no ano</span><strong>${participant.booksReadYear || 0} livros</strong></div>
      <div class="stamp"><span>Lidos no clube</span><strong>${participant.booksReadClub || 0} livros</strong></div>
      <div class="stamp"><span>Livro favorito</span><strong>${escapeHtml(participant.favoriteBook)}</strong></div>
      <div class="stamp"><span>Personagem fav</span><strong>${escapeHtml(participant.favoriteCharacter)}</strong></div>
      <p>${escapeHtml(participant.quote)}</p>
      <div class="tags">${(participant.genres || []).map((genre) => `<span class="tag">${escapeHtml(genre)}</span>`).join("")}</div>
    </article>
  `;
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

function moveOrder(participantId, direction) {
  normalizeIndicationOrder();
  const index = state.indicationOrder.indexOf(participantId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.indicationOrder.length) return;
  const [item] = state.indicationOrder.splice(index, 1);
  state.indicationOrder.splice(nextIndex, 0, item);
  saveState();
  renderRules();
}

function reviewCard(review) {
  const isMine = review.participantId === currentParticipant().id;
  return `
    <article class="review-card">
      <header>
        <strong>${escapeHtml(nameById(review.participantId))}</strong>
        <span><strong>${formatRating(review.rating)}</strong> <span class="star-row">${stars(review.rating)}</span></span>
      </header>
      ${review.threeWords ? `<p class="three-words">${escapeHtml(review.threeWords)}</p>` : ""}
      <p>${escapeHtml(review.deepReview || review.comment || "Sem resenha, só o carimbo das estrelas.")}</p>
      ${isMine ? `<button class="ghost-button" type="button" data-open-review-form>Editar minha avaliação</button>` : ""}
    </article>
  `;
}

function feedCard(item) {
  const participant = participantById(item.participantId);
  const book = bookById(item.bookId);
  if (!participant || !book) return "";
  item.likedBy ||= [];
  item.comments ||= [];
  item.likes = item.likedBy.length;
  const current = currentParticipant();
  const isMine = item.participantId === current.id;
  const liked = item.likedBy.includes(current.id);
  return `
    <article class="feed-card">
      <header class="feed-author">
        <div>
          ${avatarHtml(participant, "width: 48px; height: 48px; border-radius: 50%; font-size: 15px")}
          <div><strong>${escapeHtml(participant.name)}</strong><p class="muted">${escapeHtml(item.type)}</p></div>
        </div>
        <span class="muted">${escapeHtml(item.date)}</span>
      </header>
      ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
      ${item.progress !== undefined ? `<div><div class="mini-row"><span>${item.progress}%</span><span class="muted">${book.pages || "?"} páginas</span></div><div class="progress-track"><div class="progress-fill" style="--value: ${item.progress}%"></div></div></div>` : ""}
      <div class="feed-book">
        <div>
          <strong>${escapeHtml(book.title)}</strong>
          <p class="muted">${escapeHtml(book.author)}</p>
        </div>
        ${miniCoverHtml(book)}
      </div>
      <div class="feed-actions">
        <button class="like-button ${liked ? "active" : ""}" type="button" data-like-feed="${item.id}">
          ${liked ? "Descurtir" : "Curtir"} · ${item.likes || 0} curtida${item.likes === 1 ? "" : "s"}
        </button>
        <button class="comment-button" type="button" data-comment-feed="${item.id}">
          Comentar · ${item.comments.length}
        </button>
        ${isMine ? `<button class="ghost-button" type="button" data-edit-feed="${item.id}">Editar histórico</button>` : ""}
      </div>
      ${item.comments.length ? `
        <div class="feed-comments">
          ${item.comments.map(feedCommentHtml).join("")}
        </div>
      ` : ""}
      ${feedCommentId === item.id ? `
        <form class="feed-comment-form" data-feed-comment-form>
          <input type="hidden" name="feedId" value="${escapeAttr(item.id)}" />
          <label>
            <span>Comentário</span>
            <textarea name="comment" placeholder="Escreva sua reação a esse histórico"></textarea>
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

function feedCommentHtml(comment) {
  return `
    <div class="feed-comment">
      <strong>${escapeHtml(nameById(comment.participantId))}</strong>
      <span>${escapeHtml(comment.date || "")}</span>
      <p>${escapeHtml(comment.text)}</p>
    </div>
  `;
}

function bookFavoriteCard(book) {
  return `
    <article class="book-card panel">
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

function quickStat(label, value, aux) {
  return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p class="muted">${escapeHtml(aux)}</p></article>`;
}

function statCard(label, value, aux) {
  return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p class="muted">${escapeHtml(aux)}</p></article>`;
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
  return state.participants.reduce((sum, participant) => sum + Number(participant.booksReadYear || 0), 0);
}

function totalReadInClub() {
  return state.participants.reduce((sum, participant) => sum + Number(participant.booksReadClub || 0), 0);
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
    saveState();
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
  saveState();
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
      saveState();
      notify("Push real ativado neste aparelho.");
      sendPushPrototype("Notificações ativadas", "O Pobres Criaturas vai avisar sobre livros e reuniões.");
    } else {
      state.notificationSettings.pushEnabled = false;
      saveState();
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
      saveState();
      notify("Push real ativado neste aparelho.");
      sendPushPrototype("Notificações ativadas", "Você receberá alertas do clube neste aparelho.");
    } else {
      state.notificationSettings.pushEnabled = false;
      saveState();
    }
  } else {
    state.notificationSettings.pushEnabled = false;
    saveState();
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
  (state.notifications || []).forEach((item) => {
    item.read = true;
  });
  saveState();
  updateNotificationBadge();
  renderNotificationPanel();
}

function updateNotificationBadge() {
  const count = (state.notifications || []).filter((item) => !item.read).length;
  notificationCount.textContent = String(count);
  notificationButton.classList.toggle("has-unread", count > 0);
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
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}
