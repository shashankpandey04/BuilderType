const STATUS_POLL_MS = 10000;
const BOARD_POLL_MS = 5000;
const MEDALS = ["🥇", "🥈", "🥉"];

// ── TV Mode Toggle ─────────────────────────────────────────────────────────
const queryParams = new URLSearchParams(window.location.search);
const isTvMode = queryParams.get("tv") === "1";
if (isTvMode) {
  document.documentElement.classList.add("tv-mode");
}

const refreshTimerEl = document.getElementById("refresh-timer");
const liveTimeEl = document.getElementById("live-time");
const highestWpmEl = document.getElementById("highest-wpm");
const totalPlayersEl = document.getElementById("total-players");
const podiumGridEl = document.getElementById("podium-grid");
const leaderListEl = document.getElementById("leader-list");
const feedStatusEl = document.getElementById("feed-status");
const roundSelectEl = document.getElementById("round-select");
const roundRangeEl = document.getElementById("round-range");
const roundWinnerEl = document.getElementById("round-winner");
const listNoteEl = document.querySelector(".list-note");
const voiceToggleEl = document.getElementById("voice-toggle");

let localSecsUntil = null;
let prevKeySet = new Set();
let selectedRound = "current";
let currentRoundStart = null;
let roundsCache = [];
// ══════════════════════════════════════════
// VOICE ENGINE — gTTS via Flask /api/tts
// ══════════════════════════════════════════
let voiceEnabled = true;
let leaderVoiceKey = "";
let lastVoiceAt = 0;
let voiceLoopTimer = null;
let currentAudio = null;

const MIN_ANNOUNCE_GAP_MS = 5000;
const AMBIENT_MIN_MS = 14000;
const AMBIENT_MAX_MS = 22000;

const AMBIENT_LINES = [
  "Hey everyone! Welcome to BuilderType — the live cloud typing sprint. Think you've got fast fingers? Head over to the main screen and find out.",
  "The challenge is simple. Type as fast and accurately as you can in just 45 seconds. Your score shows up here, live, in real time.",
  "See those names up on the board? They were sitting right where you are. Go give it a shot — you might surprise yourself.",
  "BuilderType is live right now. Walk up, enter your name, and let's see what you've got. Every second counts.",
  "Whether you type 30 words a minute or 70, every attempt counts. Come on up and take the challenge.",
  "The leaderboard updates every few seconds. Your name could be up there next — all it takes is one run.",
];

function dynamicAmbientLine() {
  const playerCount = Number(totalPlayersEl?.textContent || "0");
  const topWpm      = Number(highestWpmEl?.textContent   || "0");
  const dynamic = [
    `We've got ${playerCount} players on the board so far. Will you be the one to knock off the top spot?`,
    `The fastest speed right now is ${topWpm} words per minute. Think you can beat that? There's only one way to find out.`,
    `${playerCount} people have already taken the challenge. Head to the main screen and add your name to the list.`,
    `Top speed is sitting at ${topWpm} WPM. The leaderboard is live, and it's wide open.`,
  ];
  const pool = AMBIENT_LINES.concat(dynamic);
  return pool[Math.floor(Math.random() * pool.length)];
}

function updateVoiceToggleLabel() {
  if (!voiceToggleEl) return;
  voiceToggleEl.textContent = voiceEnabled ? "Voice: ON" : "Voice: OFF";
  voiceToggleEl.classList.toggle("off", !voiceEnabled);
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

async function speakLine(text, important = false) {
  if (!voiceEnabled) return;

  const now = Date.now();
  if (!important && now - lastVoiceAt < MIN_ANNOUNCE_GAP_MS) return;
  if (currentAudio && !currentAudio.paused && !important) return;

  if (important) stopCurrentAudio();

  try {
    const url = `/api/tts?text=${encodeURIComponent(text)}`;
    const audio = new Audio(url);
    currentAudio = audio;
    lastVoiceAt = Date.now();
    await audio.play();
    await new Promise(resolve => {
      audio.onended = resolve;
      audio.onerror = resolve;
    });
  } catch { /* keep leaderboard running */ }
}

function stopVoiceLoop() {
  clearTimeout(voiceLoopTimer);
  voiceLoopTimer = null;
}

function scheduleVoiceLoop(immediate = false) {
  stopVoiceLoop();
  if (!voiceEnabled) return;
  const delay = immediate
    ? 2000
    : AMBIENT_MIN_MS + Math.floor(Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS));

  voiceLoopTimer = setTimeout(async () => {
    await speakLine(dynamicAmbientLine(), false);
    scheduleVoiceLoop(false);
  }, delay);
}

if (voiceToggleEl) {
  voiceToggleEl.addEventListener("click", () => {
    voiceEnabled = !voiceEnabled;
    if (!voiceEnabled) {
      stopCurrentAudio();
      stopVoiceLoop();
    } else {
      scheduleVoiceLoop(true);
    }
    updateVoiceToggleLabel();
  });
}

updateVoiceToggleLabel();

function rowLimitForViewport() {
  if (document.documentElement.classList.contains("tv-compact")) {
    if (window.innerHeight <= 900) return 6;
    return 8;
  }
  if (window.innerHeight <= 900) return 7;
  if (window.innerHeight <= 1100) return 9;
  return 12;
}

function applyCompactMode() {
  const compactLargeScreen = window.innerWidth >= 1366 && window.innerHeight <= 1200;
  const compactTvMode = isTvMode && window.innerHeight <= 1200;
  const isCompact = compactLargeScreen || compactTvMode;
  document.documentElement.classList.toggle("tv-compact", isCompact);

  if (listNoteEl) {
    listNoteEl.textContent = `Top ${rowLimitForViewport()} performers`;
  }
}

applyCompactMode();
window.addEventListener("resize", applyCompactMode);

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

function toIstDate(utcValue) {
  if (!utcValue) return "-";
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

function toIstSlot(utcValue) {
  if (!utcValue) return "-";
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

function findRound(roundStart) {
  return roundsCache.find((r) => r.round_start === roundStart);
}

function activeRoundStart() {
  if (selectedRound === "all") return null;
  if (selectedRound === "current") return currentRoundStart;
  return selectedRound;
}

function updateRoundInfoBar() {
  if (selectedRound === "all") {
    roundRangeEl.textContent = "All-time attempts";
    roundWinnerEl.textContent = "Winner shown from current filtered leaderboard.";
    return;
  }

  const start = activeRoundStart();
  const round = findRound(start);
  if (!round) {
    roundRangeEl.textContent = "Round details syncing...";
    roundWinnerEl.textContent = "Round winner will appear here.";
    return;
  }

  roundRangeEl.textContent = `${toIstSlot(round.round_start)} - ${toIstSlot(round.round_end)} IST | ${round.attempts} attempts`;
  if (round.winner) {
    roundWinnerEl.textContent = `Round winner: ${round.winner.name} (${round.winner.wpm} wpm, ${round.winner.accuracy}% acc)`;
  } else {
    roundWinnerEl.textContent = "No attempts yet for this round.";
  }
}

function rebuildRoundSelect() {
  const previous = roundSelectEl.value || selectedRound;

  roundSelectEl.innerHTML = [
    '<option value="current">Current 15-min round</option>',
    '<option value="all">All-time attempts</option>'
  ].join("");

  roundsCache.forEach((round) => {
    const label = `${toIstDate(round.round_start)} - ${toIstSlot(round.round_end)} (${round.attempts})`;
    roundSelectEl.insertAdjacentHTML(
      "beforeend",
      `<option value="${round.round_start}">${label}</option>`
    );
  });

  const optionExists = [...roundSelectEl.options].some((opt) => opt.value === previous);
  selectedRound = optionExists ? previous : "current";
  roundSelectEl.value = selectedRound;
}

function setFeedStatus(text) {
  feedStatusEl.textContent = text;
}

function updateRefreshTimer(secs) {
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  refreshTimerEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderPodium(entries) {
  const topThree = entries.slice(0, 3);
  if (!topThree.length) {
    podiumGridEl.innerHTML = '<div class="empty-state">Waiting for first score...</div>';
    return;
  }

  podiumGridEl.innerHTML = topThree.map((entry, index) => `
    <article class="podium-card rank-${index + 1}">
      <div class="podium-top">
        <span class="podium-medal">${MEDALS[index]}</span>
        <span class="podium-speed">${entry.wpm} wpm</span>
      </div>
      <div class="podium-name">${esc(entry.name)}</div>
      <div class="podium-meta">${entry.accuracy}% accuracy</div>
    </article>
  `).join("");
}

function renderRows(entries) {
  if (!entries.length) {
    leaderListEl.innerHTML = '<div class="empty-state">No scores yet. Start the challenge.</div>';
    return;
  }

  const rowLimit = rowLimitForViewport();
  if (listNoteEl) {
    listNoteEl.textContent = `Top ${rowLimit} performers`;
  }

  const top = entries.slice(0, rowLimit);
  const keySet = new Set(top.map(e => `${e.name}-${e.wpm}-${e.timestamp}`));

  leaderListEl.innerHTML = top.map((entry, idx) => {
    const rank = idx + 1;
    const badge = rank <= 3 ? MEDALS[idx] : `#${rank}`;
    const isNew = !prevKeySet.has(`${entry.name}-${entry.wpm}-${entry.timestamp}`);

    return `
      <div class="row rank-${rank <= 3 ? rank : 0}" style="outline:${isNew ? "1px solid rgba(68,217,230,0.45)" : "none"}">
        <div class="row-rank">${badge}</div>
        <div class="row-name">${esc(entry.name)}</div>
        <div class="row-wpm">${entry.wpm}</div>
        <div class="row-acc">${entry.accuracy}% acc</div>
        <div class="row-time">${toIstDate(entry.timestamp)}</div>
      </div>
    `;
  }).join("");

  prevKeySet = keySet;
}

function updateSummary(entries) {
  highestWpmEl.textContent = entries.length ? String(entries[0].wpm) : "0";
  totalPlayersEl.textContent = String(entries.length);
}

async function fetchRounds() {
  try {
    const response = await fetch("/api/rounds?limit=32");
    const data = await response.json();
    currentRoundStart = data.current_round_start;
    roundsCache = Array.isArray(data.rounds) ? data.rounds : [];
    rebuildRoundSelect();
    updateRoundInfoBar();
  } catch {
    setFeedStatus("round feed issue");
  }
}

async function fetchLeaderboard() {
  try {
    const params = new URLSearchParams();
    const roundStart = activeRoundStart();
    if (roundStart) {
      params.set("round_start", roundStart);
    }
    const query = params.toString();
    const response = await fetch(`/api/leaderboard${query ? `?${query}` : ""}`);
    const entries = await response.json();
    if (!Array.isArray(entries)) {
      setFeedStatus("feed parse issue");
      return;
    }

    updateSummary(entries);
    renderPodium(entries);
    renderRows(entries);
    if (entries[0]) {
      roundWinnerEl.textContent = `Round winner: ${entries[0].name} (${entries[0].wpm} wpm, ${entries[0].accuracy}% acc)`;

      const top = entries[0];
        const topKey = `${top.name}-${top.wpm}-${top.timestamp}`;
        if (topKey !== leaderVoiceKey) {
          leaderVoiceKey = topKey;
          const lines = [
            `${top.name} just took the top spot with ${top.wpm} words per minute! Can anyone beat that?`,
            `New leader! ${top.name} is sitting at ${top.wpm} WPM with ${top.accuracy} percent accuracy. The board just changed.`,
            `${top.name} is now number one — ${top.wpm} words per minute. The challenge is on!`,
          ];
          speakLine(lines[Math.floor(Math.random() * lines.length)], true);
        }    }
    setFeedStatus("live feed");
  } catch {
    setFeedStatus("connection issue");
  }
}

async function pollStatus() {
  try {
    const response = await fetch("/api/leaderboard/status");
    const data = await response.json();
    localSecsUntil = data.secs_until;
    updateRefreshTimer(localSecsUntil);

    if (data.due) {
      fetchLeaderboard();
    }
  } catch {
    refreshTimerEl.textContent = "--:--";
  }
}

setInterval(() => {
  liveTimeEl.textContent = formatClock();

  if (localSecsUntil === null) return;
  if (localSecsUntil > 0) {
    localSecsUntil -= 1;
    updateRefreshTimer(localSecsUntil);
  }
}, 1000);

roundSelectEl.addEventListener("change", () => {
  selectedRound = roundSelectEl.value;
  updateRoundInfoBar();
  fetchLeaderboard();
});

liveTimeEl.textContent = formatClock();
fetchRounds();
fetchLeaderboard();
pollStatus();

scheduleVoiceLoop(true);

setInterval(fetchLeaderboard, BOARD_POLL_MS);
setInterval(pollStatus, STATUS_POLL_MS);
setInterval(fetchRounds, 30000);
