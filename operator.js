const MATCH_COUNT = 20;
const POLL_MS = 400;

const statusEl = document.getElementById("operatorStatus");
const pageCycleBtn = document.getElementById("opPageCycleBtn");
const hideBtn = document.getElementById("opHideBtn");
const showAllBtn = document.getElementById("opShowAllBtn");
const autoCycleBtn = document.getElementById("opAutoCycleBtn");
const cycleTimerBtns = Array.from(document.querySelectorAll("[data-cycle-seconds]"));
const modeBtns = Array.from(document.querySelectorAll("[data-mode]"));
const resetAllBtn = document.getElementById("opResetAllBtn");
const resetEverythingBtn = document.getElementById("opResetEverythingBtn");
const matchListEl = document.getElementById("opMatchList");

const LIFE_MODE_NAMES = { mtg: "Magic", yugioh: "Yu-Gi-Oh" };

const allButtons = [pageCycleBtn, hideBtn, showAllBtn, autoCycleBtn, resetAllBtn, resetEverythingBtn, ...cycleTimerBtns, ...modeBtns];
const matchRows = buildMatchList();

let transientNote = null;
let transientNoteHandle = null;

function showTransientNote(text) {
  transientNote = text;
  statusEl.textContent = text;
  if (transientNoteHandle) clearTimeout(transientNoteHandle);
  transientNoteHandle = setTimeout(() => {
    transientNote = null;
  }, 6000);
}

pageCycleBtn.addEventListener("click", () => board()?.advancePage());
hideBtn.addEventListener("click", () => board()?.hideCurrentPage());
showAllBtn.addEventListener("click", () => board()?.showAllMatches());
autoCycleBtn.addEventListener("click", () => board()?.toggleAutoCycle());

cycleTimerBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    board()?.setCycleSeconds(Number(btn.dataset.cycleSeconds || "0"));
  });
});

modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const api = board();
    if (!api) return;
    const targetMode = btn.dataset.mode;
    if (api.getStatus().lifeMode === targetMode) return;
    const life = targetMode === "yugioh" ? "8000" : "20";
    const label = LIFE_MODE_NAMES[targetMode] || targetMode;
    if (window.confirm(`Switch life points to ${label} (${life})? This sets ALL 20 matches' life totals to ${life} right now, and every future Reset uses ${life} until you switch again.`)) {
      api.setLifeMode(targetMode);
    }
  });
});

resetAllBtn.addEventListener("click", () => {
  const api = board();
  if (!api) return;
  if (window.confirm("Reset life totals for every match on the current page?")) {
    api.resetVisibleLife();
  }
});

resetEverythingBtn.addEventListener("click", () => {
  const api = board();
  if (!api) return;
  if (window.confirm("Reset ALL 20 matches back to defaults? This clears every match title, both player names, and all life totals back to 20, and un-hides everything. This cannot be undone.")) {
    api.resetEverything();
    showTransientNote("Everything has been reset.");
  }
});

refresh();
setInterval(refresh, POLL_MS);

function board() {
  if (!window.opener || window.opener.closed) return null;
  try {
    return window.opener.mtgOperator || null;
  } catch {
    return null;
  }
}

function buildMatchList() {
  const rows = [];
  for (let index = 0; index < MATCH_COUNT; index += 1) {
    const row = document.createElement("label");
    row.className = "operator-match-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;

    const text = document.createElement("span");
    text.className = "operator-match-row-text";
    text.textContent = `#${index + 1}`;

    row.appendChild(checkbox);
    row.appendChild(text);
    matchListEl.appendChild(row);

    checkbox.addEventListener("change", () => {
      board()?.setMatchHidden(index, !checkbox.checked);
    });

    rows.push({ row, checkbox, text });
  }
  return rows;
}

function setControlsEnabled(enabled) {
  allButtons.forEach((btn) => {
    btn.disabled = !enabled;
  });
  matchRows.forEach(({ checkbox }) => {
    checkbox.disabled = !enabled;
  });
}

function refresh() {
  const api = board();
  if (!api) {
    statusEl.textContent = "Board window is closed. Close this window and reopen it from the board.";
    setControlsEnabled(false);
    return;
  }

  setControlsEnabled(true);
  const status = api.getStatus();

  if (!transientNote) {
    statusEl.textContent = `${status.pageLabel}`;
  }
  pageCycleBtn.textContent = status.pageLabel;

  hideBtn.disabled = status.activeCount === 0;
  showAllBtn.disabled = status.activeCount === MATCH_COUNT;

  autoCycleBtn.textContent = status.autoCycleEnabled
    ? `Cycle On (${status.autoCycleSeconds}s)`
    : "Cycle Off";
  autoCycleBtn.classList.toggle("is-active", status.autoCycleEnabled);

  cycleTimerBtns.forEach((btn) => {
    const seconds = Number(btn.dataset.cycleSeconds || "0");
    btn.classList.toggle("is-active", seconds === status.autoCycleSeconds);
  });

  document.body.dataset.lifeMode = status.lifeMode;
  modeBtns.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === status.lifeMode);
  });

  const matches = api.listMatches();
  matches.forEach((match, index) => {
    const entry = matchRows[index];
    if (!entry || document.activeElement === entry.checkbox) return;
    entry.checkbox.checked = !match.hidden;
    entry.text.textContent = `${match.title} - ${match.players[0].name} vs ${match.players[1].name}`;
    entry.row.classList.toggle("is-hidden-match", match.hidden);
  });
}
