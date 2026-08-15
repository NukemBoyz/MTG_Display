const MATCH_COUNT = 20;
const PAGE_SIZE = 5;
const STARTING_LIFE = 20;
const POLL_MS = 1200;
const DEFAULT_CYCLE_SECONDS = 15;
const LIFE_MODES = { mtg: 20, yugioh: 8000 };
const DEFAULT_LIFE_MODE = "mtg";
const MATCH_COLOR_THEMES = [
  { key: "blue", qrColor: "14-58-138" },
  { key: "red", qrColor: "139-19-35" },
  { key: "green", qrColor: "20-104-58" },
  { key: "orange", qrColor: "155-72-0" },
  { key: "purple", qrColor: "78-29-115" }
];

const matchesEl = document.getElementById("matches");
const emptyStateEl = document.getElementById("emptyState");
const template = document.getElementById("matchTemplate");
const pageTitle = document.getElementById("pageTitle");
const displayModeBtn = document.getElementById("displayModeBtn");
const operatorBtn = document.getElementById("operatorBtn");
let operatorWindow = null;

let state = createDefaultState();
let cards = [];
let saveHandle = null;
let isPolling = false;
let qrBaseOrigin = window.location.origin;
let currentPage = 0;
let autoCycleEnabled = false;
let autoCycleSeconds = DEFAULT_CYCLE_SECONDS;
let autoCycleHandle = null;

init();

async function init() {
  qrBaseOrigin = await fetchQrBaseOrigin();
  state = await fetchState();

  for (let i = 0; i < PAGE_SIZE; i += 1) {
    const card = buildMatchCard();
    cards.push(card);
    matchesEl.appendChild(card);
  }

  renderAll();
  syncFullscreenUi();
  document.addEventListener("fullscreenchange", syncFullscreenUi);

  displayModeBtn.addEventListener("click", async () => {
    if (document.fullscreenElement) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  });

  operatorBtn.addEventListener("click", () => {
    openOperatorWindow();
  });

  setInterval(refreshState, POLL_MS);
}

function openOperatorWindow() {
  if (operatorWindow && !operatorWindow.closed) {
    operatorWindow.focus();
    return;
  }
  operatorWindow = window.open("/operator.html", "mtgOperator", "width=460,height=820");
  if (!operatorWindow) {
    window.alert("Could not open the operator window. Check your browser's pop-up blocker.");
  }
}

// Exposed for the operator popup window (same-origin, opened via window.open)
// to call back into this page's state and rendering directly.
window.mtgOperator = {
  getStatus() {
    return {
      pageLabel: getPageLabel(currentPage),
      pageCount: getPageCount(),
      activeCount: visibleMatchIndexes().length,
      autoCycleEnabled,
      autoCycleSeconds,
      lifeMode: state.lifeMode
    };
  },
  listMatches() {
    return state.matches.map((match, index) => ({
      index,
      title: normalizeText(match.title, `#${index + 1}`),
      hidden: Boolean(match.hidden),
      players: [
        { name: normalizeText(match.players[0].name, "Player 1"), life: parseLife(match.players[0].life) },
        { name: normalizeText(match.players[1].name, "Player 2"), life: parseLife(match.players[1].life) }
      ]
    }));
  },
  setMatchHidden(matchIndex, hidden) {
    if (!state.matches[matchIndex]) return;
    state.matches[matchIndex].hidden = Boolean(hidden);
    renderAll();
    scheduleSave();
  },
  hideCurrentPage() {
    getPageMatchIndexes(currentPage).forEach((matchIndex) => {
      state.matches[matchIndex].hidden = true;
    });
    renderAll();
    scheduleSave();
  },
  showAllMatches() {
    // Hiding is one-way per match (a hidden match drops off the page
    // entirely), so this is the way back from a hidden or empty board.
    state.matches.forEach((match) => {
      match.hidden = false;
    });
    currentPage = 0;
    renderAll();
    scheduleSave();
  },
  advancePage() {
    advancePage();
  },
  toggleAutoCycle() {
    autoCycleEnabled = !autoCycleEnabled;
    syncAutoCycle();
    renderAll();
  },
  setCycleSeconds(seconds) {
    autoCycleSeconds = Number(seconds) || DEFAULT_CYCLE_SECONDS;
    syncAutoCycle();
  },
  resetVisibleLife() {
    const life = lifeForMode(state.lifeMode);
    getPageMatchIndexes(currentPage).forEach((matchIndex) => {
      const match = state.matches[matchIndex];
      match.players[0].life = life;
      match.players[1].life = life;
    });
    renderAll();
    scheduleSave();
  },
  resetEverything() {
    const mode = state.lifeMode;
    state = createDefaultState();
    state.lifeMode = mode;
    applyLifeToAllMatches(lifeForMode(mode));
    currentPage = 0;
    renderAll();
    scheduleSave();
  },
  setLifeMode(mode) {
    if (!(mode in LIFE_MODES) || state.lifeMode === mode) return;
    state.lifeMode = mode;
    applyLifeToAllMatches(lifeForMode(mode));
    renderAll();
    scheduleSave();
  }
};

function lifeForMode(mode) {
  return LIFE_MODES[mode] || LIFE_MODES[DEFAULT_LIFE_MODE];
}

function applyLifeToAllMatches(life) {
  state.matches.forEach((match) => {
    match.players[0].life = life;
    match.players[1].life = life;
  });
}

function buildMatchCard() {
  const clone = template.content.firstElementChild.cloneNode(true);

  const playerSections = clone.querySelectorAll(".player");
  playerSections.forEach((playerEl, playerIdx) => {
    const qrImage = playerEl.querySelector("[data-player-qr]");
    const qrUrl = playerEl.querySelector("[data-player-qr-url]");
    const phoneLink = playerEl.querySelector("[data-phone-link]");

    playerEl.dataset.playerNumber = String(playerIdx + 1);
    qrImage.dataset.playerQr = "true";
    qrUrl.dataset.playerQrUrl = "true";
    phoneLink.dataset.phoneLink = "true";
  });

  const titleInput = clone.querySelector(".match-title");
  titleInput.addEventListener("input", () => {
    const matchIndex = getCardMatchIndex(clone);
    state.matches[matchIndex].title = normalizeText(titleInput.value, `#${matchIndex + 1}`);
    renderMatchCard(clone, matchIndex);
    scheduleSave();
  });

  const playerInputs = clone.querySelectorAll(".player-name");
  playerInputs.forEach((input, playerIdx) => {
    input.addEventListener("input", () => {
      const matchIndex = getCardMatchIndex(clone);
      state.matches[matchIndex].players[playerIdx].name = normalizeText(input.value, `Player ${playerIdx + 1}`);
      renderMatchCard(clone, matchIndex);
      scheduleSave();
    });
  });

  const lifeBtns = clone.querySelectorAll(".life-btn");
  lifeBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const playerEl = btn.closest(".player");
      const playerNumber = Number(playerEl.dataset.player || 1);
      const delta = Number(btn.dataset.change || 0);
      await adjustLife(getCardMatchIndex(clone), playerNumber, delta);
    });
  });

  const toggleBtn = clone.querySelector(".toggle-visibility");
  toggleBtn.addEventListener("click", () => {
    const matchIndex = getCardMatchIndex(clone);
    state.matches[matchIndex].hidden = !state.matches[matchIndex].hidden;
    renderMatchCard(clone, matchIndex);
    scheduleSave();
  });

  const resetBtn = clone.querySelector(".reset-match");
  resetBtn.addEventListener("click", async () => {
    await resetMatch(getCardMatchIndex(clone));
  });

  return clone;
}

function isLoopbackHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
}

async function fetchQrBaseOrigin() {
  // If this page was reached over the network, the address bar is proof that
  // the address works. Trust it over any server-side guess, which can pick a
  // VPN or virtual adapter on machines with several network interfaces.
  if (!isLoopbackHost()) {
    return window.location.origin;
  }
  try {
    const res = await fetch("/api/server-info", { cache: "no-store" });
    if (!res.ok) throw new Error("bad response");
    const info = await res.json();
    if (typeof info.lan_origin === "string" && info.lan_origin) {
      return info.lan_origin;
    }
  } catch {
    // Fall back to the current page origin if server info is unavailable.
  }
  return window.location.origin;
}

function renderAll() {
  clampCurrentPage();
  const indexes = getPageMatchIndexes(currentPage);

  document.body.dataset.lifeMode = state.lifeMode;
  pageTitle.textContent = getPageLabel(currentPage);
  emptyStateEl.hidden = visibleMatchIndexes().length > 0;
  matchesEl.hidden = visibleMatchIndexes().length === 0;

  for (let i = 0; i < PAGE_SIZE; i += 1) {
    const matchIndex = indexes[i];
    const card = cards[i];
    if (matchIndex === undefined) {
      card.hidden = true;
      continue;
    }
    card.hidden = false;
    renderMatchCard(card, matchIndex);
  }
}

function clampCurrentPage() {
  const count = getPageCount();
  if (currentPage >= count) currentPage = count - 1;
  if (currentPage < 0) currentPage = 0;
}

function advancePage() {
  currentPage = (currentPage + 1) % getPageCount();
  renderAll();
}

function renderMatchCard(card, matchIndex) {
  const match = state.matches[matchIndex];
  if (!card || !match) return;
  card.dataset.matchIndex = String(matchIndex);
  const theme = getMatchColorTheme(matchIndex);
  card.dataset.matchColor = theme.key;

  const defaultTitle = `#${matchIndex + 1}`;
  const title = normalizeText(match.title, defaultTitle);
  const titleInput = card.querySelector(".match-title");
  const titleDisplay = card.querySelector("[data-match-title-display]");
  setInputValue(titleInput, title);
  titleDisplay.textContent = title;

  const playerInputs = card.querySelectorAll(".player-name");
  const playerNameDisplays = card.querySelectorAll("[data-player-name-display]");
  const lifeEls = card.querySelectorAll("[data-life-total]");

  for (let i = 0; i < 2; i += 1) {
    const player = match.players[i];
    const name = normalizeText(player.name, `Player ${i + 1}`);
    setInputValue(playerInputs[i], name);
    playerNameDisplays[i].textContent = name;
    lifeEls[i].textContent = String(parseLife(player.life));
    updateLifeColor(lifeEls[i]);
  }

  card.querySelectorAll(".player").forEach((playerEl, playerIdx) => {
    const playerNumber = playerIdx + 1;
    const playerUrl = `${qrBaseOrigin}/match/${matchIndex + 1}/player/${playerNumber}`;
    const qrImage = playerEl.querySelector("[data-player-qr]");
    const qrUrl = playerEl.querySelector("[data-player-qr-url]");
    const phoneLink = playerEl.querySelector("[data-phone-link]");

    qrImage.src = buildQrCodeUrl(playerUrl, theme);
    qrImage.alt = `QR code for match ${matchIndex + 1} player ${playerNumber}`;
    qrUrl.textContent = playerUrl;
    phoneLink.href = `/match/${matchIndex + 1}/player/${playerNumber}`;
    phoneLink.textContent = `Player ${playerNumber} Phone`;
  });

  // A rendered card is, by definition, an active (non-hidden) match - hidden
  // matches are filtered out of the page entirely (see getPageMatchIndexes),
  // so this button only ever needs to say "Hide"; re-showing happens from
  // the master match list in the Operator window.
}

async function refreshState() {
  // A local edit (checkbox, name, life, ...) is debounced behind saveHandle
  // before it reaches the server. Fetching now would pull the pre-edit
  // server copy and silently revert that unsaved change. The local state
  // is already ahead of the server here, so just wait for the pending
  // save to flush instead of overwriting it.
  if (isPolling || saveHandle) return;
  isPolling = true;
  try {
    state = await fetchState();
    renderAll();
  } finally {
    isPolling = false;
  }
}

function scheduleSave() {
  if (saveHandle) {
    clearTimeout(saveHandle);
  }
  saveHandle = setTimeout(async () => {
    saveHandle = null;
    await saveState();
    await refreshState();
  }, 220);
}

function getCardMatchIndex(card) {
  return Number(card.dataset.matchIndex || "0");
}

function visibleMatchIndexes() {
  const indexes = [];
  for (let i = 0; i < MATCH_COUNT; i += 1) {
    if (!state.matches[i].hidden) indexes.push(i);
  }
  return indexes;
}

function getPageMatchIndexes(pageIndex) {
  const start = pageIndex * PAGE_SIZE;
  return visibleMatchIndexes().slice(start, start + PAGE_SIZE);
}

function getPageCount() {
  return Math.max(1, Math.ceil(visibleMatchIndexes().length / PAGE_SIZE));
}

function getPageLabel(pageIndex) {
  const active = visibleMatchIndexes().length;
  return `Page ${pageIndex + 1} of ${getPageCount()} (${active} active)`;
}

function getMatchColorTheme(matchIndex) {
  return MATCH_COLOR_THEMES[matchIndex % MATCH_COLOR_THEMES.length];
}

function buildQrCodeUrl(playerUrl, theme) {
  const params = new URLSearchParams({
    size: "180x180",
    bgcolor: "FFFFFF",
    color: theme.qrColor,
    qzone: "4",
    data: playerUrl
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

function syncAutoCycle() {
  if (autoCycleHandle) {
    clearInterval(autoCycleHandle);
    autoCycleHandle = null;
  }

  if (!autoCycleEnabled) {
    return;
  }

  autoCycleHandle = setInterval(() => {
    advancePage();
  }, autoCycleSeconds * 1000);
}

async function saveState() {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
  } catch {
    // Keep local UI state and retry on next edit/poll.
  }
}

async function adjustLife(matchIndex, playerNumber, delta) {
  const match = state.matches[matchIndex];
  const playerIdx = playerNumber - 1;
  match.players[playerIdx].life = parseLife(match.players[playerIdx].life) + delta;
  renderAll();

  try {
    await fetch(`/api/match/${matchIndex + 1}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: playerNumber, delta })
    });
    await refreshState();
  } catch {
    await refreshState();
  }
}

async function resetMatch(matchIndex) {
  const match = state.matches[matchIndex];
  const life = lifeForMode(state.lifeMode);
  match.players[0].life = life;
  match.players[1].life = life;
  renderAll();

  try {
    await fetch(`/api/match/${matchIndex + 1}/reset`, {
      method: "POST"
    });
    await refreshState();
  } catch {
    await refreshState();
  }
}

async function fetchState() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("bad response");
    const json = await res.json();
    return normalizeState(json);
  } catch {
    return normalizeState(state);
  }
}

function createDefaultState() {
  return {
    lifeMode: DEFAULT_LIFE_MODE,
    matches: Array.from({ length: MATCH_COUNT }, (_, index) => ({
      title: `#${index + 1}`,
      hidden: false,
      players: [
        { name: "Player 1", life: STARTING_LIFE },
        { name: "Player 2", life: STARTING_LIFE }
      ]
    }))
  };
}

function normalizeState(raw) {
  const safe = createDefaultState();
  if (!raw || !Array.isArray(raw.matches)) return safe;

  safe.lifeMode = raw.lifeMode in LIFE_MODES ? raw.lifeMode : DEFAULT_LIFE_MODE;

  safe.matches = Array.from({ length: MATCH_COUNT }, (_, index) => {
    const src = raw.matches[index] || {};
    return {
      title: normalizeText(src.title, `#${index + 1}`),
      hidden: Boolean(src.hidden),
      players: [
        {
          name: normalizeText(src.players?.[0]?.name, "Player 1"),
          life: parseLife(src.players?.[0]?.life)
        },
        {
          name: normalizeText(src.players?.[1]?.name, "Player 2"),
          life: parseLife(src.players?.[1]?.life)
        }
      ]
    };
  });

  return safe;
}

function setInputValue(input, value) {
  if (document.activeElement !== input) {
    input.value = value;
  }
}

function parseLife(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : STARTING_LIFE;
}

function updateLifeColor(lifeEl) {
  const value = Number(lifeEl.textContent);
  const base = lifeForMode(state.lifeMode);
  lifeEl.classList.toggle("low", value <= base * 0.5);
  lifeEl.classList.toggle("high", value >= base * 1.5);
}

function normalizeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function enterFullscreen() {
  if (document.fullscreenElement) return true;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    // Browsers require the request to originate from a user gesture on
    // this window - a click relayed from the operator popup does not
    // count, so this reliably fails there. Reported back to the caller
    // so the operator UI can explain instead of silently doing nothing.
    return false;
  }
}

async function exitFullscreen() {
  if (!document.fullscreenElement) return true;
  try {
    await document.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}

function syncFullscreenUi() {
  document.body.classList.toggle("is-fullscreen", Boolean(document.fullscreenElement));
}
