const STARTING_LIFE = 20;
const POLL_MS = 1000;
const MATCH_COUNT = 20;
const LIFE_MODES = { mtg: 20, yugioh: 8000 };

const matchContext = getMatchContext();
const matchNumber = matchContext?.matchNumber ?? null;
const selectedPlayer = matchContext?.playerNumber ?? null;
let isPolling = false;
let currentLifeMode = "mtg";

const player1NameEl = document.getElementById("player1Name");
const player2NameEl = document.getElementById("player2Name");
const player1NameInput = document.getElementById("player1NameInput");
const player2NameInput = document.getElementById("player2NameInput");
const player1LifeEl = document.getElementById("player1Life");
const player2LifeEl = document.getElementById("player2Life");
const player2ResetBtn = document.getElementById("player2ResetBtn");
const phoneFullscreenBtn = document.getElementById("phoneFullscreenBtn");
let nameSaveHandle = null;

if (!matchNumber) {
  console.error("Invalid match URL");
} else {
  if (selectedPlayer) {
    document.body.dataset.playerView = String(selectedPlayer);
  }

  syncFullscreenButton();
  document.addEventListener("fullscreenchange", syncFullscreenButton);

  phoneFullscreenBtn.addEventListener("click", async () => {
    if (document.fullscreenElement) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  });

  player2ResetBtn.textContent = "Reset Match";
  player1NameInput.addEventListener("input", scheduleNameSave);
  player2NameInput.addEventListener("input", scheduleNameSave);
  refresh();
  setInterval(refresh, POLL_MS);

  player2ResetBtn.addEventListener("click", async () => {
    const resetLife = LIFE_MODES[currentLifeMode] || STARTING_LIFE;
    player1LifeEl.textContent = String(resetLife);
    player2LifeEl.textContent = String(resetLife);
    updateLifeColor(player1LifeEl);
    updateLifeColor(player2LifeEl);
    try {
      await fetch(`/api/match/${matchNumber}/reset`, {
        method: "POST"
      });
    } finally {
      await refresh();
    }
  });

  document.querySelectorAll(".phone-btn[data-delta]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const player = Number(btn.dataset.player || 1);
      const delta = Number(btn.dataset.delta || 0);
      const lifeEl = player === 1 ? player1LifeEl : player2LifeEl;
      lifeEl.textContent = String(Number(lifeEl.textContent) + delta);
      updateLifeColor(lifeEl);

      try {
        await fetch(`/api/match/${matchNumber}/adjust`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player, delta })
        });
      } finally {
        await refresh();
      }
    });
  });
}

async function refresh() {
  if (!matchNumber || isPolling) return;
  isPolling = true;
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("state fetch failed");
    const state = await res.json();
    const match = state.matches?.[matchNumber - 1];
    if (!match) return;

    currentLifeMode = state.lifeMode in LIFE_MODES ? state.lifeMode : "mtg";
    document.body.dataset.lifeMode = currentLifeMode;

    const p1Name = normalizeText(match.players?.[0]?.name, "Player 1");
    const p2Name = normalizeText(match.players?.[1]?.name, "Player 2");
    setInputValue(player1NameInput, p1Name);
    setInputValue(player2NameInput, p2Name);

    // While typing, use live input values so polling doesn't momentarily revert UI state.
    const p1LiveName = document.activeElement === player1NameInput
      ? normalizeText(player1NameInput.value, "Player 1")
      : p1Name;
    const p2LiveName = document.activeElement === player2NameInput
      ? normalizeText(player2NameInput.value, "Player 2")
      : p2Name;
    player1NameEl.textContent = p1LiveName;
    player2NameEl.textContent = p2LiveName;
    player1LifeEl.textContent = String(parseLife(match.players?.[0]?.life));
    player2LifeEl.textContent = String(parseLife(match.players?.[1]?.life));
    updateLifeColor(player1LifeEl);
    updateLifeColor(player2LifeEl);
  } catch {
    // Keep last rendered values on transient failures.
  } finally {
    isPolling = false;
  }
}

function getMatchContext() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const matchMaybe = Number(parts[1]);
  if (!Number.isInteger(matchMaybe) || matchMaybe < 1 || matchMaybe > MATCH_COUNT) return null;

  if (parts.length >= 4 && parts[2] === "player") {
    const playerMaybe = Number(parts[3]);
    if (!Number.isInteger(playerMaybe) || playerMaybe < 1 || playerMaybe > 2) return null;
    return { matchNumber: matchMaybe, playerNumber: playerMaybe };
  }

  return { matchNumber: matchMaybe, playerNumber: null };
}

function parseLife(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : STARTING_LIFE;
}

function normalizeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function updateLifeColor(el) {
  const value = Number(el.textContent);
  const base = LIFE_MODES[currentLifeMode] || STARTING_LIFE;
  el.classList.toggle("low", value <= base * 0.5);
  el.classList.toggle("high", value >= base * 1.5);
}


function scheduleNameSave() {
  if (!matchNumber) return;
  if (nameSaveHandle) clearTimeout(nameSaveHandle);

  const p1 = normalizeText(player1NameInput.value, "Player 1");
  const p2 = normalizeText(player2NameInput.value, "Player 2");
  player1NameEl.textContent = p1;
  player2NameEl.textContent = p2;

  nameSaveHandle = setTimeout(async () => {
    nameSaveHandle = null;
    try {
      await fetch(`/api/match/${matchNumber}/names`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1: p1, player2: p2 })
      });
    } finally {
      await refresh();
    }
  }, 250);
}

function setInputValue(input, value) {
  if (document.activeElement !== input) {
    input.value = value;
  }
}

async function enterFullscreen() {
  if (document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    // Browser blocked fullscreen request.
  }
}

async function exitFullscreen() {
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Ignore browser exit errors.
  }
}

function syncFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  phoneFullscreenBtn.textContent = active ? "Exit Full Screen" : "Full Screen";
}
