/* =========================================
 * 在线排行榜配置（Supabase）
 * 1. 在 supabase.com 免费创建项目，执行以下 SQL 建表：
 *
 * create table if not exists scores (
 *   id uuid primary key default gen_random_uuid(),
 *   player_id text not null,
 *   nickname text not null,
 *   score int not null,
 *   mode text not null default 'classic',
 *   created_at timestamptz not null default now()
 * );
 * alter table scores enable row level security;
 * create policy "public read" on scores
 * for select using (true);
 * create policy "public insert" on scores for insert
 * with check (true);
 *
 * 2. 把项目 Settings → API 里的 URL 和 anon key 填到下面两行，
 *    即自动切换为在线排行榜。
 *    留空则使用本地排行榜（仅本设备可见）。
 */
const SUPABASE_URL = "";
// 例如 'https://xxxxxxxx.supabase.co'
const SUPABASE_ANON_KEY = ""; // 例如 'eyJhbGciOi...'
const ONLINE_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/* ================= 模式定义 ================= */
const MODES = {
    classic: {
        name: "经典 30 秒",
        short: "经典",
        time: 30,
        sizeMul: 1,
        speedMul: 1,
        spawnMs: 380,
        desc: "30 秒限时，戳得越多分越高",
    },
    long: {
        name: "长跑 60 秒",
        short: "60秒",
        time: 60,
        sizeMul: 1,
        speedMul: 1.1,
        spawnMs: 420,
        desc: "60 秒耐力战，考验手速与节奏",
    },
    endless: {
        name: "无限模式",
        short: "无限",
        time: 0,
        sizeMul: 1,
        speedMul: 1,
        spawnMs: 400,
        lives: 3,
        desc: "没有时限，漏掉 3 个泡泡即结束",
    },
    hard: {
        name: "困难模式",
        short: "困难",
        time: 30,
        sizeMul: 0.62,
        speedMul: 1.7,
        spawnMs: 280,
        desc: "泡泡更小更快，30 秒极限挑战",
    },
};

/* ================= 主题定义 ================= */
const THEMES = {
    ocean: {
        name: "🌊 海洋",
        body: "theme-ocean",
        colors: [
            ["#6ee7ff", "#0ea5e9"],
            ["#a78bfa", "#7c3aed"],
            ["#f472b6", "#db2777"],
            ["#4ade80", "#16a34a"],
            ["#fbbf24", "#d97706"],
            ["#f87171", "#dc2626"],
        ],
        emoji: null,
    },
    starry: {
        name: "✨ 星空",
        body: "theme-starry",
        colors: [
            ["#e0e7ff", "#6366f1"],
            ["#c4b5fd", "#7c3aed"],
            ["#93c5fd", "#2563eb"],
            ["#fbcfe8", "#db2777"],
            ["#fde68a", "#d97706"],
            ["#a5f3fc", "#0891b2"],
        ],
        emoji: ["⭐", "🌟", "🌙", "💫", "🪐"],
    },
    lava: {
        name: "🔥 熔岩",
        body: "theme-lava",
        colors: [
            ["#fdba74", "#ea580c"],
            ["#fca5a5", "#dc2626"],
            ["#fbbf24", "#b45309"],
            ["#f87171", "#991b1b"],
            ["#fb923c", "#c2410c"],
            ["#fef08a", "#ca8a04"],
        ],
        emoji: ["🔥", "☄️", "🌋", "💥"],
    },
    cat: {
        name: "🐱 猫咪",
        body: "theme-cat",
        colors: [
            ["#f9a8d4", "#db2777"],
            ["#fbcfe8", "#be185d"],
            ["#fda4af", "#e11d48"],
            ["#d8b4fe", "#9333ea"],
            ["#fef3c7", "#d97706"],
            ["#a5f3fc", "#0e7490"],
        ],
        emoji: ["🐱", "🐾", "🐟", "🧶", "😺"],
    },
};

/* ================= 成就定义 ================= */
const ACHIEVEMENTS = [
    {
        id: "first_play",
        icon: "🎮",
        name: "初来乍到",
        desc: "完成第一局游戏",
    },
    {
        id: "combo_20",
        icon: "⚡",
        name: "手速惊人",
        desc: "达成 20 连击",
    },
    {
        id: "pops_100",
        icon: "🫧",
        name: "百泡斩",
        desc: "单局戳破 100 个泡泡",
    },
    {
        id: "score_500",
        icon: "🏆",
        name: "高分选手",
        desc: "单局得分达到 500",
    },
    {
        id: "crit_10",
        icon: "💥",
        name: "暴击达人",
        desc: "单局触发 10 次暴击",
    },
    {
        id: "endless_60",
        icon: "♾️",
        name: "无限坚守",
        desc: "无限模式坚持 60 秒",
    },
];

/* ================= 运行状态 ================= */
const COMBO_WINDOW = 1000;
const MAX_BUBBLES = 16;
const LB_SIZE = 50;
const LB_MIN_PLAYERS = 10;

const STATE = { IDLE: 0, PLAYING: 1, ENDED: 2 };
let currentState = STATE.IDLE;
let currentMode = store_get("mode", "classic");
let currentTheme = store_get("theme", "ocean");

let score = 0;
let combo = 0;
let maxCombo = 0;
let lastClickTime = 0;
let pops = 0;
let crits = 0;
let gameStartTime = 0;
let timebarTimer = null;
let spawnerTimer = null;
let lastTickSecond = null;
let lives = 0;
let lastShareText = "";

const $ = (id) => document.getElementById(id);
const playfield = $("playfield");

function store_get(k, d) {
    try {
        const v = localStorage.getItem(k);

        return v === null ? d : JSON.parse(v);
    } catch (e) {
        return d;
    }
}

function store_set(k, v) {
    try {
        localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
}

function getPlayerId() {
    let id = store_get("playerId", null);

    if (!id) {
        id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        store_set("playerId", id);
    }

    return id;
}

/* ============== 数据层：本地 / Supabase 双通道 ============== */
function localScores() {
    return store_get("leaderboard", []);
}

function saveLocalScore(rec) {
    const lb = localScores();

    lb.push(rec);
    lb.sort((a, b) => b.score - a.score || a.created_at - b.created_at);
    store_set("leaderboard", lb.slice(0, LB_SIZE));
}

function sbHeaders() {
    return {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    };
}

async function getScores(modeFilter) {
    // modeFilter: null=全部，否则 mode 字符串
    if (ONLINE_ENABLED) {
        try {
            let url = SUPABASE_URL + "/rest/v1/scores?order=score.desc&" + "order=created_at.asc&limit=" + LB_SIZE;

            if (modeFilter) url += "&mode=eq." + encodeURIComponent(modeFilter);
            const res = await fetch(url, {
                headers: sbHeaders(),
            });

            if (res.ok) return await res.json();
        } catch (e) {
            console.warn("在线排行榜获取失败，回退本地", e);
        }
    }
    const lb = localScores();

    return (modeFilter ? lb.filter((r) => r.mode === modeFilter) : lb).slice(0, LB_SIZE);
}

async function submitScoreRecord(rec) {
    if (ONLINE_ENABLED) {
        try {
            const res = await fetch(SUPABASE_URL + "/rest/v1/scores", {
                method: "POST",
                headers: sbHeaders(),
                body: JSON.stringify(rec),
            });

            if (res.ok) return { online: true };
        } catch (e) {
            console.warn("在线提交失败，回退本地", e);
        }
    }
    saveLocalScore(rec);

    return { online: false };
}

/* ============== 音效（Web Audio API 合成） ============== */
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freqFrom, freqTo, duration, volume, type = "sine", when = 0) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
}

function playPopSound() {
    const base = 360 + Math.random() * 160;

    tone(base, 140, 0.05, 0.3, "sine");
}

function playCritSound() {
    tone(523, 523, 0.09, 0.28, "triangle");
    tone(659, 659, 0.09, 0.28, "triangle", 0.08);
    tone(784, 784, 0.16, 0.3, "triangle", 0.16);
    tone(1047, 784, 0.22, 0.22, "sine", 0.24);
}

function playTickSound() {
    tone(1200, 900, 0.05, 0.18, "square");
}

function playEndSound() {
    tone(660, 660, 0.14, 0.25);
    tone(440, 440, 0.2, 0.25, "sine", 0.12);
    tone(330, 220, 0.4, 0.25, "sine", 0.26);
}

function playLoseLifeSound() {
    tone(300, 120, 0.25, 0.3, "sawtooth");
}

function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

/* ================= 页面切换 ================= */
function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("screen-" + name).classList.add("active");
}

/* ================= 模式 / 主题选择 UI ================= */
function renderModeChips() {
    const row = $("mode-row");

    row.innerHTML = "";
    Object.entries(MODES).forEach(([key, m]) => {
        const c = document.createElement("div");

        c.className = "chip" + (key === currentMode ? " sel" : "");
        c.textContent = m.name;
        c.onclick = () => {
            currentMode = key;
            store_set("mode", key);
            renderModeChips();
        };
        row.appendChild(c);
    });
    $("mode-desc").textContent = MODES[currentMode].desc;
}

function renderThemeChips() {
    const row = $("theme-row");

    row.innerHTML = "";
    Object.entries(THEMES).forEach(([key, t]) => {
        const c = document.createElement("div");

        c.className = "chip" + (key === currentTheme ? " sel" : "");
        c.textContent = t.name;
        c.onclick = () => {
            currentTheme = key;
            store_set("theme", key);
            applyTheme();
            renderThemeChips();
        };
        row.appendChild(c);
    });
}

function applyTheme() {
    document.body.className = THEMES[currentTheme].body;
}

/* ================= 成就 ================= */
function getUnlocked() {
    return store_get("achievements", []);
}

function unlock(id) {
    const unlocked = getUnlocked();

    if (unlocked.includes(id)) return;
    unlocked.push(id);
    store_set("achievements", unlocked);
    const a = ACHIEVEMENTS.find((x) => x.id === id);

    if (a) showToast(a.icon + " 成就解锁：" + a.name);
}
let toastTimer = null;
function showToast(text) {
    const t = $("toast");

    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function renderAchievements() {
    const unlocked = getUnlocked();
    const list = $("ach-list");

    list.innerHTML = "";
    ACHIEVEMENTS.forEach((a) => {
        const ok = unlocked.includes(a.id);
        const item = document.createElement("div");

        item.className = "ach-item" + (ok ? " unlocked" : "");
        item.innerHTML =
            '<span class="icon">' +
            a.icon +
            '</span><div><div class="name">' +
            a.name +
            (ok ? " ✓" : "") +
            '</div><div class="desc">' +
            a.desc +
            "</div></div>";
        list.appendChild(item);
    });
}

function checkAchievements() {
    const elapsed = currentState === STATE.PLAYING ? currentElapsed() : 0;

    if (maxCombo >= 20) unlock("combo_20");
    if (pops >= 100) unlock("pops_100");
    if (score >= 500) unlock("score_500");
    if (crits >= 10) unlock("crit_10");
    if (currentMode === "endless" && elapsed >= 60) unlock("endless_60");
}

/* ================= 泡泡 ================= */
function spawnBubble() {
    if (currentState !== STATE.PLAYING) return;
    if (playfield.querySelectorAll(".bubble").length >= MAX_BUBBLES) return;

    const m = MODES[currentMode];
    const theme = THEMES[currentTheme];
    const el = document.createElement("div");

    el.className = "bubble";
    const base = 52 + Math.random() * 44;
    const size = Math.round(base * m.sizeMul);
    const dur = (5.5 + Math.random() * 3.5) / m.speedMul;

    const pair = theme.colors[(Math.random() * theme.colors.length) | 0];

    el.style.width = el.style.height = size + "px";
    el.style.background = "radial-gradient(circle at 32% 28%, " + pair[0] + ", " + pair[1] + ")";
    el.style.boxShadow = "inset -6px -8px 18px rgba(0,0,0,.25), 0 0 14px " + pair[0] + "66";
    if (theme.emoji) {
        el.textContent = theme.emoji[(Math.random() * theme.emoji.length) | 0];
        el.style.fontSize = Math.round(size * 0.55) + "px";
    }

    const shine = document.createElement("div");

    shine.className = "shine";
    el.appendChild(shine);

    el.style.left = Math.random() * (playfield.clientWidth - size) + "px";
    el.style.top = playfield.clientHeight + "px";
    el.style.animationDuration = dur + "s";
    el.addEventListener("pointerdown", onBubbleClick, {
        passive: false,
    });
    playfield.appendChild(el);

    // 无限模式：泡泡飘出顶部未被戳破 → 扣命
    if (currentMode === "endless") {
        setTimeout(
            () => {
                if (el.parentNode && !el.classList.contains("pop") && currentState === STATE.PLAYING) {
                    loseLife();
                    el.remove();
                }
            },
            dur * 1000 + 150,
        );
    } else {
        setTimeout(
            () => {
                if (el.parentNode) el.remove();
            },
            dur * 1000 + 100,
        );
    }
}

function loseLife() {
    lives--;
    playLoseLifeSound();
    vibrate(60);
    renderLives();
    if (lives <= 0) endGame("泡泡漏太多了！");
}

function renderLives() {
    $("lives").textContent = "❤".repeat(Math.max(lives, 0));
}

/* ================= 点击 / 计分 ================= */
function onBubbleClick(e) {
    e.preventDefault();
    if (currentState !== STATE.PLAYING) return;
    const el = e.currentTarget;

    if (el.classList.contains("pop")) return;
    el.classList.add("pop");
    el.textContent = "";
    el.querySelectorAll(".shine").forEach((s) => s.remove());
    setTimeout(() => el.remove(), 300);

    const now = Date.now();

    combo = now - lastClickTime < COMBO_WINDOW ? combo + 1 : 1;
    lastClickTime = now;
    maxCombo = Math.max(maxCombo, combo);
    pops++;

    let points = 1;
    const isCrit = combo % 10 === 0;

    if (isCrit) {
        points *= Math.random() < 0.5 ? 2 : 3;
        crits++;
        showCriticalEffect(e.clientX, e.clientY, points);
    }
    score += points;

    playPopSound();
    vibrate(10);

    const scoreEl = $("score");

    scoreEl.textContent = score;
    scoreEl.classList.remove("bump");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
    const cl = $("combo-label");

    if (combo >= 3) {
        cl.textContent = "×" + combo + " 连击";
        cl.classList.add("show");
    } else cl.classList.remove("show");
    showFloatScore(e.clientX, e.clientY, points);
    checkAchievements();
}

function showFloatScore(x, y, points) {
    const f = document.createElement("div");

    f.className = "float-score";
    f.textContent = "+" + points;
    f.style.left = x - 12 + "px";
    f.style.top = y - 40 + "px";
    f.style.fontSize = points > 1 ? "30px" : "20px";
    f.style.color = points > 1 ? "#fbbf24" : "#ffffff";
    $("screen-game").appendChild(f);
    setTimeout(() => f.remove(), 700);
}

function showCriticalEffect(x, y, points) {
    playCritSound();
    vibrate([20, 40, 20]);
    const burst = $("combo-burst");

    burst.textContent = "暴击！ +" + points;
    burst.style.color = "#fbbf24";
    burst.classList.remove("show");
    void burst.offsetWidth;
    burst.classList.add("show");
    for (let i = 0; i < 22; i++) {
        const p = document.createElement("div");

        p.className = "particle";
        p.style.left = x + "px";
        p.style.top = y + "px";
        $("screen-game").appendChild(p);
        const ang = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 130;

        p.animate(
            [
                {
                    transform: "translate(0,0) scale(1)",
                    opacity: 1,
                },
                {
                    transform:
                        "translate(" + Math.cos(ang) * dist + "px, " + (Math.sin(ang) * dist - 40) + "px) scale(0)",
                    opacity: 0,
                },
            ],
            {
                duration: 600 + Math.random() * 300,
                easing: "cubic-bezier(.2,.6,.3,1)",
            },
        );
        setTimeout(() => p.remove(), 950);
    }
}

/* ================= 游戏流程 ================= */
function startGame() {
    ensureAudio();
    score = 0;
    combo = 0;
    maxCombo = 0;
    lastClickTime = 0;
    pops = 0;
    crits = 0;
    lastTickSecond = null;
    lives = MODES[currentMode].lives || 0;
    playfield.innerHTML = "";
    $("score").textContent = "0";
    $("combo-label").classList.remove("show");
    $("mode-badge").textContent = MODES[currentMode].name;
    $("timebar-wrap").style.display = currentMode === "endless" ? "none" : "block";
    renderLives();
    showScreen("game");
    currentState = STATE.PLAYING;
    gameStartTime = Date.now();

    spawnerTimer = setInterval(spawnBubble, MODES[currentMode].spawnMs);
    for (let i = 0; i < 4; i++) setTimeout(spawnBubble, i * 90);

    if (currentMode !== "endless") {
        timebarTimer = setInterval(updateTimebar, 100);
        updateTimebar();
    } else {
        timebarTimer = setInterval(updateEndlessClock, 100);
        updateEndlessClock();
    }
}

function currentElapsed() {
    return (Date.now() - gameStartTime) / 1000;
}

function updateTimebar() {
    const m = MODES[currentMode];
    const remain = Math.max(m.time - currentElapsed(), 0);

    $("timebar").style.width = (remain / m.time) * 100 + "%";
    $("time-num").textContent = remain.toFixed(1) + " s";
    const last5 = remain <= 5.05;

    $("timebar").classList.toggle("danger", last5);
    $("time-num").classList.toggle("danger", last5);
    const sec = Math.ceil(remain);

    if (last5 && sec !== lastTickSecond && sec > 0) {
        lastTickSecond = sec;
        playTickSound();
    }
    if (remain <= 0) endGame("时间到！");
}

function updateEndlessClock() {
    $("time-num").textContent = "已坚持 " + currentElapsed().toFixed(1) + " s";
}

async function endGame(reason) {
    if (currentState !== STATE.PLAYING) return;
    currentState = STATE.ENDED;
    clearInterval(timebarTimer);
    clearInterval(spawnerTimer);
    playfield.innerHTML = "";
    playEndSound();
    vibrate([30, 60, 30]);
    unlock("first_play");
    checkAchievements();

    $("result-title").textContent = reason || "时间到！";
    $("final-score").textContent = score;
    $("result-mode").textContent = "模式：" + MODES[currentMode].name;
    $("game-stats").textContent = "戳破 " + pops + " 个 · 最高连击 ×" + maxCombo + " · 暴击 " + crits + " 次";
    $("beat-percent").textContent = "击败百分比计算中…";

    // 击败百分比：优先在线数据，样本不足 10 人显示 --
    let totalPlayers = 1;
    let lowerCount = 0;

    try {
        const modeScores = await getScores(currentMode);
        const others = modeScores.filter((r) => (r.player_id || r.id) !== getPlayerId());

        totalPlayers = others.length + 1;
        lowerCount = others.filter((r) => r.score < score).length;
    } catch (e) {}
    const beatPercent = totalPlayers >= LB_MIN_PLAYERS ? Math.round((lowerCount / totalPlayers) * 100) : null;

    $("beat-percent").textContent =
        beatPercent === null ? "击败百分比：--（样本不足）" : "击败了 " + beatPercent + "% 的玩家";

    const highScoreKey = "highScore_" + currentMode;
    const highScore = store_get(highScoreKey, 0);

    if (score > highScore) {
        store_set(highScoreKey, score);
        $("new-record").textContent = "🎉 新纪录！";
    } else {
        $("new-record").textContent = highScore > 0 ? "该模式最高：" + highScore : "";
    }

    lastShareText =
        "我在「限时戳泡泡」· " + MODES[currentMode].name + " 模式得了 " + score +
        " 分" + (beatPercent !== null ? "，击败了 " + beatPercent + "% 的玩家" : "") + "！戳破 " + pops +
        " 个泡泡，最高连击 ×" + maxCombo + "。快来挑战我！";

    $("submit-msg").textContent = "";
    $("btn-submit").disabled = false;
    $("nickname-input").value = store_get("nickname", "") || "";
    showScreen("result");
}

/* ================= 排行榜 ================= */
let lbTab = null; // null=全部
function renderLbTabs() {
    const tabs = $("lb-tabs");

    tabs.innerHTML = "";
    const make = (label, val) => {
        const c = document.createElement("div");

        c.className = "chip" + (lbTab === val ? " sel" : "");
        c.textContent = label;
        c.onclick = () => {
            lbTab = val;
            renderLbTabs();
            renderLeaderboard();
        };
        tabs.appendChild(c);
    };

    make("全部", null);
    Object.entries(MODES).forEach(([k, m]) => make(m.short, k));
}

async function renderLeaderboard() {
    const list = $("lb-list");

    list.innerHTML = '<div class="lb-empty">加载中…</div>';
    const data = await getScores(lbTab);

    list.innerHTML = "";
    if (!data.length) {
        list.innerHTML = '<div class="lb-empty">暂无记录，快来抢占第一！</div>';
        return;
    }
    const myId = getPlayerId();

    data.forEach((r, i) => {
        const row = document.createElement("div");

        row.className = "lb-row";
        if ((r.player_id || r.id) === myId) row.id = "me-row-highlight";
        const rankCls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
        const modeShort = MODES[r.mode] ? MODES[r.mode].short : r.mode || "";

        row.innerHTML =
            '<span class="lb-rank ' +
            rankCls +
            '">' +
            (i + 1) +
            "</span>" +
            '<span class="lb-name">' +
            escapeHtml(r.nickname) +
            "</span>" +
            (lbTab === null ? '<span class="lb-mode">' + escapeHtml(modeShort) + "</span>" : "") +
            '<span class="lb-score">' +
            r.score +
            "</span>";
        list.appendChild(row);
    });
}

function escapeHtml(s) {
    return String(s).replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );
}

async function submitScore() {
    const nickname = $("nickname-input").value.trim().slice(0, 12);

    if (!nickname) {
        $("submit-msg").textContent = "请先输入昵称";
        return;
    }
    const rec = {
        player_id: getPlayerId(),
        nickname: nickname,
        score: score,
        mode: currentMode,
        created_at: Date.now(),
    };

    $("btn-submit").disabled = true;
    $("submit-msg").textContent = "提交中…";
    const r = await submitScoreRecord(rec);

    store_set("nickname", nickname);
    $("submit-msg").textContent = r.online
        ? "已提交到在线排行榜！"
        : "已提交到本地排行榜（配置 Supabase 后可上榜全球榜）";
    renderStartStatus();
}

/* ================= 分享 ================= */
async function shareResult() {
    if (!lastShareText) return;
    if (navigator.share) {
        try {
            await navigator.share({
                title: "限时戳泡泡",
                text: lastShareText,
            });
            return;
        } catch (e) {}
    }
    try {
        await navigator.clipboard.writeText(lastShareText);
        showToast("成绩已复制，去粘贴分享吧！");
    } catch (e) {
        showToast(lastShareText);
    }
}

/* ================= 事件绑定 ================= */
$("btn-start").addEventListener("click", startGame);
$("btn-again").addEventListener("click", startGame);
$("btn-lb").addEventListener("click", () => {
    renderLbTabs();
    renderLeaderboard();
    showScreen("leaderboard");
});
$("btn-result-lb").addEventListener("click", () => {
    renderLbTabs();
    renderLeaderboard();
    showScreen("leaderboard");
});
$("btn-ach").addEventListener("click", () => {
    renderAchievements();
    showScreen("achievements");
});
$("btn-ach-back").addEventListener("click", () => showScreen("start"));
$("btn-lb-back").addEventListener("click", () => {
    if (currentState === STATE.ENDED) showScreen("result");
    else showScreen("start");
});
$("btn-submit").addEventListener("click", submitScore);
$("btn-share").addEventListener("click", shareResult);
document.addEventListener("dblclick", (e) => e.preventDefault());

/* ================= 初始化 ================= */
function renderStartStatus() {
    const hs = store_get("highScore_" + currentMode, 0);

    $("best-score-start").textContent = hs > 0 ? "「" + MODES[currentMode].short + "」最高分：" + hs : "";
    $("lb-status").textContent = ONLINE_ENABLED
        ? "🌐 在线排行榜已启用"
        : "排行榜当前为本地模式，配置 Supabase 后升级为全球榜";
}

(function init() {
    applyTheme();
    renderModeChips();
    renderThemeChips();
    renderStartStatus();
})();
