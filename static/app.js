// ── TV Mode Toggle ─────────────────────────────────────────────────────────
if (new URLSearchParams(window.location.search).get('tv') === '1') {
  document.documentElement.classList.add('tv-mode');
}

const PARAGRAPHS = [
  "building scalable systems on aws is not just about writing code that works on your local machine, it is about designing applications that can handle unpredictable traffic patterns, sudden spikes in usage, and real world failures without breaking down. when thousands of users access your system simultaneously, every millisecond matters and every inefficiency gets amplified. developers must think about caching layers, database indexing, load balancing, and asynchronous processing while writing even the simplest endpoints. the real challenge is not getting the system to work once, but ensuring that it continues to work reliably under stress where downtime directly impacts user trust, reputation, and business outcomes.",
  "modern cloud architecture is centered around the idea of elasticity where systems automatically adapt to changing workloads without manual intervention. services like aws ec2, lambda, and s3 provide the building blocks, but simply using them does not guarantee a well architected system. developers must carefully design how these services interact, how data flows between components, and how failures are handled gracefully. poor decisions early in development often lead to systems that become expensive, slow, and difficult to maintain as they scale, which is why thinking long term from the beginning is not optional but essential.",
  "performance optimization is an ongoing responsibility that does not end after deployment, instead it evolves as the system grows and user behavior changes. developers need to continuously monitor logs, analyze metrics, and identify bottlenecks that may not have been visible during initial testing. optimizing database queries, reducing unnecessary api calls, implementing caching strategies, and minimizing latency across regions are all part of maintaining a high performing system. even a small delay in response time can significantly impact user experience when multiplied across thousands of requests per second.",
  "in high pressure environments such as hackathons or builder centers, developers are expected to deliver functional and presentable solutions within extremely limited timeframes. this requires a balance between speed and quality where decisions must be made quickly without compromising the core functionality of the product. tools like serverless architectures, managed databases, and prebuilt authentication systems help accelerate development, but the real advantage comes from clarity of thought and the ability to prioritize what truly matters in the given timeframe.",
  "team collaboration is often the hidden factor behind successful projects, as even technically strong individuals can struggle without proper coordination. effective teams communicate clearly, divide responsibilities logically, and support each other during critical moments. misunderstandings, unclear requirements, or lack of ownership can slow down progress significantly, especially under tight deadlines. a strong team not only builds faster but also builds better by combining different perspectives and strengths.",
  "security is one of the most critical aspects of any application, yet it is frequently overlooked during early stages of development when the focus is primarily on features and functionality. developers must implement proper authentication, authorization, and data protection mechanisms from the start rather than treating security as an afterthought. cloud platforms offer powerful tools for securing applications, but misconfigurations such as exposed credentials or improperly set permissions can lead to serious vulnerabilities that compromise the entire system.",
  "designing fault tolerant systems requires developers to assume that failures are inevitable rather than rare exceptions. servers can crash, networks can fail, and external services can become unavailable at any time. building resilient systems involves implementing retries, fallbacks, redundancy, and monitoring so that failures are handled gracefully without affecting the end user experience. reliability is achieved not by avoiding failures entirely but by managing them effectively when they occur.",
  "real world applications must handle highly unpredictable usage patterns where traffic can fluctuate dramatically within short periods of time. systems that are designed with fixed capacity often fail under such conditions, while those built with elastic scaling can adapt dynamically to changing demand. this requires careful planning of infrastructure, efficient use of resources, and continuous optimization to ensure that performance remains consistent without unnecessary cost increases.",
  "creating meaningful products involves more than just technical execution, it requires a deep understanding of the problem being solved and the needs of the users. developers who focus only on adding features may end up building complex systems that do not deliver real value. instead, the goal should be to create solutions that are intuitive, efficient, and impactful, ensuring that every component of the system contributes to a better user experience.",
  "consider building a real time attendance system where cheating is virtually impossible and every action is tracked with precision. such a system would need to verify device identity, restrict multiple logins, ensure physical presence through qr based validation, and maintain secure logs for auditing purposes. it must handle peak loads when hundreds of users attempt to check in simultaneously while maintaining speed and accuracy. building such a system requires not only technical knowledge but also practical experience, continuous iteration, and a strong focus on reliability and security."
];

const RANKS = [
  { min: 0,   label: "🐢 Warming Up",      color: "#94a3b8" },
  { min: 20,  label: "⚡ Getting There",    color: "#60a5fa" },
  { min: 40,  label: "🔥 Solid Builder",    color: "#34d399" },
  { min: 60,  label: "🚀 Cloud Native Dev", color: "#a78bfa" },
  { min: 80,  label: "☁️ AWS Architect",    color: "#9d5cf6" },
  { min: 100, label: "⚡ 10x Engineer",     color: "#f59e0b" },
];

const GAME_SECONDS = 45;

const SESSION_KEY = "buildertype_session_id";

function getOrCreateSessionId() {
  const current = sessionStorage.getItem(SESSION_KEY);
  if (current) return current;

  const generated = (window.crypto && typeof window.crypto.randomUUID === "function")
    ? window.crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  sessionStorage.setItem(SESSION_KEY, generated);
  return generated;
}

// ── State ──────────────────────────────────────────────────────────────────
let playerName   = '';
let currentPara  = 0, chars = [], currentIndex = 0;
let timer = GAME_SECONDS, gameInterval = null;
let started = false, finished = false;
let correctCount = 0, errorCount = 0, totalTyped = 0;
let lastWpm = 0, lastAcc = 0;
let launchCountdown = null;
let replayCountdown = null;
let charStates = [];
const playerSessionId = getOrCreateSessionId();

// ── DOM refs ───────────────────────────────────────────────────────────────
const textDisplay   = document.getElementById('text-display');
const inputBox      = document.getElementById('input-box');
const timerEl       = document.getElementById('timer');
const wpmEl         = document.getElementById('wpm');
const accEl         = document.getElementById('accuracy');
const typingArea    = document.getElementById('typing-area');
const timerBox      = document.getElementById('timer-box');
const resultOverlay = document.getElementById('result-overlay');
const nameModal     = document.getElementById('name-modal');
const playerNameEl  = document.getElementById('player-name');
const nameError     = document.getElementById('name-error');
const nameCountdown = document.getElementById('name-countdown');
const enterGameBtn  = document.getElementById('enter-game-btn');
const globalRankEl  = document.getElementById('global-rank');
const retryBtn      = document.getElementById('retry-btn');
const newPlayerBtn  = document.getElementById('new-player-btn');

// ── Pre-game name entry ────────────────────────────────────────────────────
enterGameBtn.addEventListener('click', confirmName);
playerNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') confirmName(); });

function confirmName() {
  const val = playerNameEl.value.trim();
  if (!val || val.length < 1 || val.length > 30) {
    nameError.classList.remove('hidden');
    playerNameEl.style.borderColor = 'var(--incorrect)';
    playerNameEl.focus();
    return;
  }

  nameError.classList.add('hidden');
  playerNameEl.style.borderColor = '';
  playerName = val;
  currentPara = Math.floor(Math.random() * PARAGRAPHS.length);
  runLaunchCountdown();
}

function runLaunchCountdown() {
  if (launchCountdown) clearInterval(launchCountdown);

  playerNameEl.disabled = true;
  enterGameBtn.disabled = true;
  enterGameBtn.textContent = 'Preparing...';
  nameCountdown.classList.remove('hidden');

  let remaining = 3;
  nameCountdown.textContent = `Starting in ${remaining}...`;

  launchCountdown = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      nameCountdown.textContent = `Starting in ${remaining}...`;
      return;
    }

    clearInterval(launchCountdown);
    launchCountdown = null;
    nameCountdown.textContent = 'Go!';

    setTimeout(() => {
      nameModal.classList.add('hidden');
      nameCountdown.classList.add('hidden');
      playerNameEl.disabled = false;
      enterGameBtn.disabled = false;
      enterGameBtn.textContent = 'Enter Arena';
      resetGame();
      startGame();
    }, 250);
  }, 1000);
}

function runReplayCountdown() {
  window.location.reload();
}

// ── Text display ───────────────────────────────────────────────────────────
function buildDisplay(paraIndex) {
  chars = PARAGRAPHS[paraIndex].split('');
  charStates = new Array(chars.length).fill(0);
  textDisplay.innerHTML = chars
    .map((c, i) => `<span class="char" data-i="${i}">${c === ' ' ? '&nbsp;' : c}</span>`)
    .join('');
  updateCursor();
}

function getCharEl(i) {
  return textDisplay.querySelector(`[data-i="${i}"]`);
}

function updateCursor() {
  const prev = textDisplay.querySelector('.cursor');
  if (prev) prev.classList.remove('cursor');
  const el = getCharEl(currentIndex);
  if (el) el.classList.add('cursor');
}

// ── Stats ──────────────────────────────────────────────────────────────────
function calcWPM() {
  const elapsed = GAME_SECONDS - timer;
  if (elapsed <= 0) return 0;
  return Math.round((correctCount / 5) / (elapsed / 60));
}

function calcAcc() {
  if (totalTyped === 0) return 0;
  return Math.round((correctCount / totalTyped) * 100);
}

function updateStats() {
  lastWpm = calcWPM();
  lastAcc = calcAcc();
  wpmEl.textContent = lastWpm;
  accEl.textContent = lastAcc + '%';
}

// ── Game flow ──────────────────────────────────────────────────────────────
function startGame() {
  if (started || !playerName) return;
  started = true;
  inputBox.disabled = false;
  inputBox.focus();
  typingArea.classList.add('active');
  gameInterval = setInterval(() => {
    timer--;
    timerEl.textContent = timer;
    updateStats();
    if (timer <= 5) timerBox.classList.add('danger');
    if (timer <= 0) endGame();
  }, 1000);
}

function resetGame() {
  clearInterval(gameInterval);
  if (replayCountdown) {
    clearInterval(replayCountdown);
    replayCountdown = null;
  }
  timer = GAME_SECONDS; currentIndex = 0;
  correctCount = 0; errorCount = 0; totalTyped = 0;
  started = false; finished = false;
  lastWpm = 0; lastAcc = 0;

  timerEl.textContent = String(GAME_SECONDS);
  wpmEl.textContent = '0';
  accEl.textContent = '0%';
  timerBox.classList.remove('danger');
  typingArea.classList.remove('active');
  inputBox.value = '';
  inputBox.disabled = true;
  resultOverlay.classList.add('hidden');
  const prizeModal = document.getElementById('prize-modal');
  if (prizeModal) prizeModal.classList.add('hidden');
  globalRankEl.textContent = '';

  buildDisplay(currentPara);
}

async function endGame() {
  clearInterval(gameInterval);
  finished = true;
  inputBox.disabled = true;
  typingArea.classList.remove('active');
  lastWpm = calcWPM();
  lastAcc = calcAcc();

  // Auto-submit with the pre-entered name
  let globalRank = null;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:      playerName,
        session_id: playerSessionId,
        wpm:       lastWpm,
        accuracy:  lastAcc,
        errors:    errorCount,
        correct:   correctCount,
        paragraph: currentPara
      })
    });
    const data = await res.json();
    globalRank = data.rank || null;
  } catch { /* show result anyway */ }

  showResult(globalRank);
  showPrizeIfEarned(lastWpm, globalRank);
}

function showResult(globalRank) {
  document.getElementById('final-wpm').textContent     = lastWpm;
  document.getElementById('final-acc').textContent     = lastAcc + '%';
  document.getElementById('final-correct').textContent = correctCount;
  document.getElementById('final-errors').textContent  = errorCount;

  let rank = RANKS[0];
  for (const r of RANKS) { if (lastWpm >= r.min) rank = r; }
  const rankEl = document.getElementById('result-rank');
  rankEl.textContent = rank.label;
  rankEl.style.color = rank.color;

  document.getElementById('result-title').textContent =
    `Well done, ${playerName}! 🚀`;

  globalRankEl.textContent = globalRank ? `🌍 Global Rank: #${globalRank}` : '';
  resultOverlay.classList.remove('hidden');
}

// ── Prize popup ────────────────────────────────────────────────────────────
function showPrizeIfEarned(wpm) {
  let emoji, title, sub, badge;

  if (wpm > 35) {
    emoji = '✨';
    title = 'Nice Typing Skills!';
    sub   = `${wpm} WPM — solid effort. You've earned:`;
    badge = '🎉 Sticker Sheet';
  } else {
    return; // no prize below 35
  }

  const modal = document.getElementById('prize-modal');
  document.getElementById('prize-emoji').textContent  = emoji;
  document.getElementById('prize-title').textContent  = title;
  document.getElementById('prize-sub').textContent    = sub;
  document.getElementById('prize-badge').textContent  = badge;

  // Show after result card has a moment to appear
  setTimeout(() => modal.classList.remove('hidden'), 800);
}

document.getElementById('prize-close-btn').addEventListener('click', () => {
  document.getElementById('prize-modal').classList.add('hidden');
});

// ── Typing logic ───────────────────────────────────────────────────────────
inputBox.addEventListener('input', () => {
  if (!started || finished) return;
  const val = inputBox.value;
  if (!val.length) return;
  const typed = val[val.length - 1];
  inputBox.value = '';
  if (currentIndex >= chars.length) return;

  const expected = chars[currentIndex];
  const el = getCharEl(currentIndex);
  totalTyped++;

  if (charStates[currentIndex] === 1) {
    correctCount--;
  }

  el.classList.remove('correct', 'incorrect');
  if (typed === expected) {
    el.classList.add('correct');
    charStates[currentIndex] = 1;
    correctCount++;
  } else {
    el.classList.add('incorrect');
    charStates[currentIndex] = -1;
    errorCount++;
  }

  currentIndex++;
  updateCursor();
  updateStats();
  if (currentIndex >= chars.length) endGame();
});

inputBox.addEventListener('keydown', e => {
  if (e.key !== 'Backspace') return;
  e.preventDefault();

  if (!started || finished) return;
  if (currentIndex <= 0) return;

  currentIndex--;
  const el = getCharEl(currentIndex);
  if (!el) return;

  if (charStates[currentIndex] === 1) {
    correctCount--;
  }

  // Preserve error penalty in totalTyped/errorCount; only clear visible char state.
  charStates[currentIndex] = 0;
  el.classList.remove('correct', 'incorrect');
  updateCursor();
  updateStats();
});
typingArea.addEventListener('click', () => { if (started && !finished) inputBox.focus(); });

// ── Paragraph tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.para-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (started && !finished) return;
    document.querySelectorAll('.para-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPara = parseInt(btn.dataset.para);
    resetGame();
  });
});

// ── Start / Reset ──────────────────────────────────────────────────────────
const startBtn = document.getElementById('start-btn');
if (startBtn) startBtn.addEventListener('click', startGame);

const startBtn2 = document.getElementById('start-btn-2');
if (startBtn2) startBtn2.addEventListener('click', startGame);

const resetBtn = document.getElementById('reset-btn');
if (resetBtn) resetBtn.addEventListener('click', resetGame);

if (retryBtn) retryBtn.addEventListener('click', runReplayCountdown);

if (newPlayerBtn) {
  newPlayerBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
// Show name modal on load (no hidden class — it's visible by default)
playerNameEl.focus();
buildDisplay(currentPara);
