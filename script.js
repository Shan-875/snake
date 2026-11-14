(() => {
  const COLS = 16;
  const ROWS = 16;
  const CELL = 24;
  const BASE_STEP = 150;
  const MIN_STEP = 58;
  const DIRS = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("high");
  const speedEl = document.getElementById("speed");
  const modeEl = document.getElementById("mode");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlay-kicker");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const overlayStats = document.getElementById("overlay-stats");
  const overlayHint = document.getElementById("overlay-hint");
  const autoFlag = document.getElementById("auto-flag");
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnRestart = document.getElementById("btn-restart");
  const btnAutoplay = document.getElementById("btn-autoplay");
  const btnDemo = document.getElementById("btn-demo");
  const btnSound = document.getElementById("btn-sound");

  const KEY_DIR = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };

  const STORAGE_HIGH = "nokia-snake-high";
  const STORAGE_SOUND = "nokia-snake-sound";

  const state = {
    snake: [],
    dir: { x: 1, y: 0 },
    queued: { x: 1, y: 0 },
    food: { x: 10, y: 8 },
    score: 0,
    high: Number(localStorage.getItem(STORAGE_HIGH) || 0),
    running: false,
    paused: false,
    mode: "MANUAL",
    autoplay: false,
    demo: false,
    sound: localStorage.getItem(STORAGE_SOUND) !== "off",
    eatFlash: 0,
    popups: [],
    demoTimer: null,
  };

  let audioCtx = null;
  let lastTs = 0;
  let acc = 0;
  let loopStarted = false;

  function pad(n) {
    return String(n).padStart(4, "0");
  }

  function key(x, y) {
    return x + "," + y;
  }

  function inside(x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  }

  function opposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function same(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function speedLevel() {
    return Math.min(9, 1 + Math.floor(state.score / 50));
  }

  function stepMs() {
    return Math.max(MIN_STEP, BASE_STEP - (speedLevel() - 1) * 12);
  }

  function occupiedSet(snake, excludeTail) {
    const set = new Set();
    const last = excludeTail ? snake.length - 1 : snake.length;
    for (let i = 0; i < last; i += 1) set.add(key(snake[i].x, snake[i].y));
    return set;
  }

  function randomFood(snake) {
    const blocked = occupiedSet(snake, false);
    const empty = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!blocked.has(key(x, y))) empty.push({ x, y });
      }
    }
    if (!empty.length) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function bfs(snake, goal, eating) {
    const start = snake[0];
    const length = snake.length;
    const queue = [{ x: start.x, y: start.y, d: 0 }];
    const came = new Map();
    const seen = new Set([key(start.x, start.y)]);
    let head = 0;

    while (head < queue.length) {
      const cur = queue[head];
      head += 1;
      if (cur.d > 0 && cur.x === goal.x && cur.y === goal.y) {
        const path = [];
        let node = cur;
        while (node.d > 0) {
          path.push({ x: node.x, y: node.y });
          node = came.get(key(node.x, node.y));
        }
        path.reverse();
        return path;
      }

      for (let i = 0; i < DIRS.length; i += 1) {
        const nx = cur.x + DIRS[i].x;
        const ny = cur.y + DIRS[i].y;
        if (!inside(nx, ny)) continue;
        const nd = cur.d + 1;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        const grows = eating && nx === goal.x && ny === goal.y;
        const vacated = grows ? cur.d : nd;
        const limit = length - vacated;
        let blocked = false;
        for (let s = 0; s < limit; s += 1) {
          if (snake[s].x === nx && snake[s].y === ny) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        seen.add(k);
        came.set(k, cur);
        queue.push({ x: nx, y: ny, d: nd });
      }
    }
    return null;
  }

  function simulate(snake, path, food) {
    const next = snake.map((p) => ({ x: p.x, y: p.y }));
    let ate = false;
    for (let i = 0; i < path.length; i += 1) {
      next.unshift({ x: path[i].x, y: path[i].y });
      if (!ate && path[i].x === food.x && path[i].y === food.y) {
        ate = true;
      } else {
        next.pop();
      }
    }
    return next;
  }

  function canReachTail(snake) {
    if (snake.length <= 2) return true;
    const tail = snake[snake.length - 1];
    return Boolean(bfs(snake, tail, false));
  }

  function flood(snake, origin) {
    const blocked = occupiedSet(snake, true);
    const q = [origin];
    const seen = new Set([key(origin.x, origin.y)]);
    let n = 0;
    while (q.length) {
      const cur = q.pop();
      n += 1;
      for (let i = 0; i < DIRS.length; i += 1) {
        const nx = cur.x + DIRS[i].x;
        const ny = cur.y + DIRS[i].y;
        const k = key(nx, ny);
        if (!inside(nx, ny) || seen.has(k) || blocked.has(k)) continue;
        seen.add(k);
        q.push({ x: nx, y: ny });
      }
    }
    return n;
  }

  function safeNeighbors(snake, dir) {
    const head = snake[0];
    const blocked = occupiedSet(snake, true);
    const options = [];
    for (let i = 0; i < DIRS.length; i += 1) {
      const d = DIRS[i];
      if (opposite(d, dir)) continue;
      const x = head.x + d.x;
      const y = head.y + d.y;
      if (!inside(x, y) || blocked.has(key(x, y))) continue;
      options.push(d);
    }
    if (options.length) return options;
    for (let i = 0; i < DIRS.length; i += 1) {
      const d = DIRS[i];
      const x = head.x + d.x;
      const y = head.y + d.y;
      if (inside(x, y) && !blocked.has(key(x, y))) options.push(d);
    }
    return options;
  }

  function autoMove(snake, food, dir) {
    const toFood = food ? bfs(snake, food, true) : null;
    if (toFood && toFood.length) {
      const after = simulate(snake, toFood, food);
      if (canReachTail(after)) {
        return { x: toFood[0].x - snake[0].x, y: toFood[0].y - snake[0].y };
      }
    }

    const tail = snake[snake.length - 1];
    const toTail = bfs(snake, tail, false);
    if (toTail && toTail.length) {
      return { x: toTail[0].x - snake[0].x, y: toTail[0].y - snake[0].y };
    }

    const options = safeNeighbors(snake, dir);
    if (!options.length) return dir;
    let best = options[0];
    let bestScore = -Infinity;
    for (let i = 0; i < options.length; i += 1) {
      const d = options[i];
      const nx = { x: snake[0].x + d.x, y: snake[0].y + d.y };
      const nextSnake = [{ x: nx.x, y: nx.y }, ...snake.slice(0, -1)];
      let score = flood(nextSnake, nx) * 10;
      if (food) score -= Math.abs(food.x - nx.x) + Math.abs(food.y - nx.y);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function beep(freq, dur, type, gain) {
    const ctxAudio = ensureAudio();
    if (!ctxAudio) return;
    const osc = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    g.gain.value = gain || 0.04;
    osc.connect(g);
    g.connect(ctxAudio.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctxAudio.currentTime + dur);
    osc.stop(ctxAudio.currentTime + dur);
  }

  function sfx(kind) {
    if (!state.sound) return;
    if (kind === "eat") {
      beep(420, 0.07, "square", 0.05);
      setTimeout(() => beep(620, 0.08, "square", 0.04), 50);
    } else if (kind === "die") {
      beep(220, 0.12, "sawtooth", 0.05);
      setTimeout(() => beep(140, 0.18, "sawtooth", 0.05), 90);
    } else if (kind === "start") {
      beep(330, 0.08, "square", 0.04);
      setTimeout(() => beep(440, 0.08, "square", 0.04), 90);
      setTimeout(() => beep(550, 0.12, "square", 0.04), 180);
    } else if (kind === "pause") {
      beep(280, 0.06, "triangle", 0.03);
    } else if (kind === "click") {
      beep(190, 0.04, "square", 0.025);
    }
  }

  function resetSnake() {
    const x = Math.floor(COLS / 2) - 1;
    const y = Math.floor(ROWS / 2);
    state.snake = [
      { x, y },
      { x: x - 1, y },
      { x: x - 2, y },
    ];
    state.dir = { x: 1, y: 0 };
    state.queued = { x: 1, y: 0 };
    state.score = 0;
    state.food = randomFood(state.snake);
    state.eatFlash = 0;
    state.popups = [];
    acc = 0;
  }

  function updateHud() {
    scoreEl.textContent = pad(state.score);
    highEl.textContent = pad(state.high);
    speedEl.textContent = String(speedLevel());
    modeEl.textContent = state.mode;
    autoFlag.classList.toggle("hidden", !(state.autoplay && state.running && !state.paused));
    btnAutoplay.classList.toggle("active", state.autoplay && !state.demo);
    btnDemo.classList.toggle("active", state.demo);
    btnPause.classList.toggle("active", state.paused);
    btnSound.textContent = state.sound ? "SOUND ON" : "SOUND OFF";
    btnPause.textContent = state.paused ? "RESUME" : "PAUSE";
  }

  function showOverlay(opts) {
    overlay.classList.remove("hidden");
    overlayKicker.textContent = opts.kicker;
    overlayTitle.textContent = opts.title;
    overlayCopy.textContent = opts.copy;
    overlayHint.textContent = opts.hint;
    if (opts.stats) {
      overlayStats.classList.remove("hidden");
      overlayStats.innerHTML = opts.stats;
    } else {
      overlayStats.classList.add("hidden");
      overlayStats.innerHTML = "";
    }
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function drawCell(x, y, color, inset) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
  }

  function drawFood(food, t) {
    if (!food) return;
    const pulse = 1 + Math.round((Math.sin(t / 120) + 1) / 2);
    const px = food.x * CELL;
    const py = food.y * CELL;
    ctx.fillStyle = "#1e2e0a";
    ctx.fillRect(px + 8, py + 4 + pulse, 8, 14 - pulse);
    ctx.fillRect(px + 4, py + 8, 16, 8);
    ctx.fillRect(px + 10, py + 2, 4, 4);
    if (state.eatFlash > 0) {
      ctx.fillStyle = "rgba(30,46,10,0.28)";
      ctx.fillRect(px, py, CELL, CELL);
    }
  }

  function drawSnake() {
    const { snake, dir } = state;
    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const part = snake[i];
      const inset = i === 0 ? 2 : 3;
      drawCell(part.x, part.y, "#1e2e0a", inset);
      ctx.fillStyle = "#314c16";
      ctx.fillRect(part.x * CELL + inset + 2, part.y * CELL + inset + 2, 4, 4);
      if (i === 0) {
        const ex = part.x * CELL + CELL / 2 + dir.x * 4;
        const ey = part.y * CELL + CELL / 2 + dir.y * 4;
        ctx.fillStyle = "#9cbc4c";
        ctx.fillRect(ex - 5, ey - 3, 3, 3);
        ctx.fillRect(ex + 2, ey - 3, 3, 3);
      }
    }
  }

  function draw() {
    ctx.fillStyle = "#8fb344";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(30,46,10,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i <= ROWS; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(canvas.width, i * CELL + 0.5);
      ctx.stroke();
    }

    drawFood(state.food, performance.now());
    drawSnake();

    ctx.strokeStyle = "#1e2e0a";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);

    for (let i = state.popups.length - 1; i >= 0; i -= 1) {
      const p = state.popups[i];
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillStyle = `rgba(30,46,10,${Math.max(p.life, 0)})`;
      ctx.fillText("+10", p.x, p.y);
      p.y -= 0.35;
      p.life -= 0.02;
      if (p.life <= 0) state.popups.splice(i, 1);
    }

    if (state.paused && state.running) {
      ctx.fillStyle = "rgba(143,179,68,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1e2e0a";
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
      ctx.textAlign = "left";
    }
  }

  function hits(next) {
    if (!inside(next.x, next.y)) return true;
    const eating = state.food && same(next, state.food);
    const limit = eating ? state.snake.length : state.snake.length - 1;
    for (let i = 0; i < limit; i += 1) {
      if (state.snake[i].x === next.x && state.snake[i].y === next.y) return true;
    }
    return false;
  }

  function winGame() {
    state.running = false;
    state.paused = false;
    sfx("start");
    if (state.score > state.high) {
      state.high = state.score;
      localStorage.setItem(STORAGE_HIGH, String(state.high));
    }
    showOverlay({
      kicker: "BOARD CLEAR",
      title: "YOU WIN",
      copy: "The snake filled the screen.",
      hint: "PRESS START",
      stats: `SCORE ${pad(state.score)}<br>HIGH ${pad(state.high)}`,
    });
    updateHud();
    scheduleDemo();
  }

  function gameOver() {
    state.running = false;
    state.paused = false;
    sfx("die");
    if (state.score > state.high) {
      state.high = state.score;
      localStorage.setItem(STORAGE_HIGH, String(state.high));
    }
    showOverlay({
      kicker: "GAME OVER",
      title: "SNAKE",
      copy: "The snake could not survive.",
      hint: "PRESS START",
      stats: `SCORE ${pad(state.score)}<br>HIGH ${pad(state.high)}`,
    });
    updateHud();
    scheduleDemo();
  }

  function tick() {
    if (state.autoplay) {
      state.queued = autoMove(state.snake, state.food, state.dir);
    }
    if (!opposite(state.queued, state.dir)) state.dir = state.queued;
    const head = state.snake[0];
    const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
    if (hits(next)) {
      gameOver();
      return;
    }
    state.snake.unshift(next);
    if (state.food && same(next, state.food)) {
      state.score += 10;
      state.eatFlash = 8;
      state.popups.push({
        x: next.x * CELL + 4,
        y: next.y * CELL - 2,
        life: 1,
      });
      sfx("eat");
      state.food = randomFood(state.snake);
      if (!state.food) {
        winGame();
        return;
      }
    } else {
      state.snake.pop();
    }
    if (state.eatFlash > 0) state.eatFlash -= 1;
    updateHud();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    if (state.running && !state.paused) {
      acc += dt;
      const step = stepMs();
      while (acc >= step) {
        acc -= step;
        tick();
        if (!state.running) break;
      }
    }
    draw();
  }

  function clearDemoTimer() {
    if (state.demoTimer) {
      clearTimeout(state.demoTimer);
      state.demoTimer = null;
    }
  }

  function scheduleDemo() {
    clearDemoTimer();
    if (state.running) return;
    state.demoTimer = setTimeout(() => {
      if (!state.running) startGame({ demo: true });
    }, 7000);
  }

  function startGame(opts) {
    const demo = Boolean(opts && opts.demo);
    const forceAuto = Boolean(opts && opts.auto);
    const forceManual = Boolean(opts && opts.manual);
    clearDemoTimer();
    resetSnake();
    state.running = true;
    state.paused = false;
    state.demo = demo;
    if (demo) state.autoplay = true;
    else if (forceAuto) state.autoplay = true;
    else if (forceManual) state.autoplay = false;
    state.mode = demo ? "DEMO" : state.autoplay ? "AUTOPLAY" : "MANUAL";
    hideOverlay();
    sfx("start");
    updateHud();
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    acc = 0;
    sfx("pause");
    updateHud();
  }

  function restart() {
    sfx("click");
    startGame({ demo: false });
  }

  function setAutoplay(on, fromDemo) {
    state.autoplay = on;
    if (!fromDemo) state.demo = false;
    if (state.running) {
      state.mode = state.demo ? "DEMO" : on ? "AUTOPLAY" : "MANUAL";
    } else {
      state.mode = on ? "AUTOPLAY" : "MANUAL";
    }
    updateHud();
  }

  function queueDir(dir) {
    if (!dir) return;
    if (state.demo || state.autoplay) {
      state.demo = false;
      setAutoplay(false);
    }
    if (!state.running || state.paused) return;
    if (!opposite(dir, state.dir)) state.queued = dir;
  }

  function onKey(e) {
    const dir = KEY_DIR[e.key] || KEY_DIR[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      if (!state.running) startGame({ demo: false });
      queueDir(dir);
      return;
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePause();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      restart();
    } else if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      setAutoplay(!(state.autoplay && !state.demo));
      sfx("click");
      if (state.autoplay && !state.running) startGame({ demo: false, auto: true });
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleSound();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!state.running) startGame({ demo: false });
      else togglePause();
    }
  }

  function toggleSound() {
    state.sound = !state.sound;
    localStorage.setItem(STORAGE_SOUND, state.sound ? "on" : "off");
    if (state.sound) sfx("click");
    updateHud();
  }

  btnStart.addEventListener("click", () => {
    ensureAudio();
    startGame({ demo: false, manual: true });
  });
  btnPause.addEventListener("click", () => {
    ensureAudio();
    togglePause();
  });
  btnRestart.addEventListener("click", () => {
    ensureAudio();
    restart();
  });
  btnAutoplay.addEventListener("click", () => {
    ensureAudio();
    const next = !(state.autoplay && !state.demo);
    setAutoplay(next);
    sfx("click");
    if (next && !state.running) startGame({ demo: false, auto: true });
  });
  btnDemo.addEventListener("click", () => {
    ensureAudio();
    startGame({ demo: true });
  });
  btnSound.addEventListener("click", () => {
    ensureAudio();
    toggleSound();
  });
  document.getElementById("pad-ok").addEventListener("click", () => {
    ensureAudio();
    if (!state.running) startGame({ demo: false });
    else togglePause();
  });

  document.querySelectorAll(".pad-btn[data-dir]").forEach((btn) => {
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    let touched = false;
    const apply = (event) => {
      event.preventDefault();
      ensureAudio();
      if (!state.running) startGame({ demo: false, manual: true });
      queueDir(map[btn.dataset.dir]);
    };
    btn.addEventListener("touchstart", (event) => {
      touched = true;
      apply(event);
    }, { passive: false });
    btn.addEventListener("click", (event) => {
      if (touched) {
        touched = false;
        return;
      }
      apply(event);
    });
  });

  window.addEventListener("keydown", onKey);
  overlay.addEventListener("click", () => {
    ensureAudio();
    if (!state.running) startGame({ demo: false });
  });

  resetSnake();
  updateHud();
  showOverlay({
    kicker: "3310 EDITION",
    title: "SNAKE",
    copy: "Classic arcade. Manual, autoplay, or demo.",
    hint: "PRESS START",
  });
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(frame);
  }
  scheduleDemo();

  window.__snake = {
    state,
    tick,
    startGame,
    togglePause,
    autoMove,
    bfs,
    hits,
    speedLevel,
    stepMs,
  };
})();
