(function () {
  'use strict';

  const COLS = 6;
  const ROWS = 4;
  const TILES = COLS * ROWS;

  const IMG_SRC = 'asset/Neon QR Code Treasure Map.png';
  const IMG_W = 1672;
  const IMG_H = 941;

  const LEVELS = {
    easy:   { name: 'Casual',         diff: '◆◇◇', snap: 40, ghost: 0.26, hints: 5, limit: 420, cost: 4,  hintCost: { place: 80, peek: 40, mark: 25 } },
    normal: { name: 'Treasure Hunter', diff: '◆◆◇', snap: 28, ghost: 0.11, hints: 3, limit: 300, cost: 7,  hintCost: { place: 120, peek: 60, mark: 40 } },
    hard:   { name: 'Cursed Vault',   diff: '◆◆◆', snap: 19, ghost: 0.00, hints: 1, limit: 210, cost: 11, hintCost: { place: 160, peek: 80, mark: 50 } }
  };

  const $  = (s, r) => (r || document).querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand  = (a, b) => a + Math.random() * (b - a);
  const pick  = (a) => a[(Math.random() * a.length) | 0];

  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  const stage = $('#stage');

  let img = null;
  let ready = false;
  let boardW = 960, boardH = 540, cw = 160, ch = 135, knobU = 30;
  let dpr = 1;

  let pieces = [];
  let order = [];
  let horiz = [], vert = [];

  let level = 'normal';
  let ghostOn = true;
  let soundOn = true;

  let drag = null, dragDX = 0, dragDY = 0;
  let moves = 0, hintsUsed = 0, placedCount = 0;
  let timeLeft = LEVELS.normal.limit;
  let timerId = null, running = false, solved = false;
  let ghostBoostUntil = 0;
  let markPiece = null, markUntil = 0;
  let anims = [];
  let confetti = [];
  let confettiUntil = 0;
  let needsRender = true;
  let actx = null;
  let pausedAt = 0;

  const G = window.JigsawGeom;
  function buildGeometry(preserve) {
    const oldW = boardW, oldH = boardH;

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width || stage.clientWidth));
    const h = Math.round(w * (IMG_H / IMG_W));

    boardW = w; boardH = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(boardW * dpr);
    canvas.height = Math.round(boardH * dpr);

    cw = boardW / COLS;
    ch = boardH / ROWS;
    knobU = Math.min(cw, ch) * 0.26;

    const built = G.build(COLS, ROWS, cw, ch, knobU);
    horiz = built.horiz;
    vert = built.vert;

    const pad = knobU * 1.3;
    const invX = IMG_W / boardW, invY = IMG_H / boardH;

    const fresh = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ops = built.tiles[r * COLS + c].ops;
        const path = new Path2D();
        path.moveTo(0, 0);
        for (const op of ops) {
          if (op.t === 'l') path.lineTo(op.x, op.y);
          else path.bezierCurveTo(op.c1[0], op.c1[1], op.c2[0], op.c2[1], op.p[0], op.p[1]);
        }
        path.closePath();

        const old = preserve ? pieces.find((p) => p.c === c && p.r === r) : null;

        fresh.push({
          c, r,
          x: old ? old.x * (boardW / oldW) : 0,
          y: old ? old.y * (boardH / oldH) : 0,
          placed: old ? old.placed : false,
          path,
          poly: built.tiles[r * COLS + c].poly,
          sx: (c * cw - pad) * invX,
          sy: (r * ch - pad) * invY,
          sw: (cw + 2 * pad) * invX,
          sh: (ch + 2 * pad) * invY,
          dx: c * cw - pad,
          dy: r * ch - pad,
          dw: cw + 2 * pad,
          dh: ch + 2 * pad,
          glow: 0
        });
      }
    }
    pieces = fresh;
    order = pieces.map((_, i) => i);

    placedCount = pieces.filter((p) => p.placed).length;
    if (!preserve) scatter();
    else for (const p of pieces) if (p.placed) { p.x = p.c * cw; p.y = p.r * ch; }

    needsRender = true;
  }

  function scatter() {
    for (const p of pieces) {
      p.x = rand(-cw * 0.18, boardW - cw * 0.82);
      p.y = rand(-ch * 0.18, boardH - ch * 0.82);
      p.placed = false;
      p.glow = 0;
    }
    for (let iter = 0; iter < 70; iter++) {
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          const a = pieces[i], b = pieces[j];
          const ox = (a.x + cw / 2) - (b.x + cw / 2);
          const oy = (a.y + ch / 2) - (b.y + ch / 2);
          const d = Math.hypot(ox, oy);
          const min = cw * 0.82;
          if (d < min && d > 0.001) {
            const push = (min - d) * 0.28;
            a.x += (ox / d) * push; a.y += (oy / d) * push;
            b.x -= (ox / d) * push; b.y -= (oy / d) * push;
          }
        }
      }
      for (const p of pieces) {
        p.x = clamp(p.x, -cw * 0.22, boardW - cw * 0.78);
        p.y = clamp(p.y, -ch * 0.22, boardH - ch * 0.78);
      }
    }
    order = pieces.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
  }

  function blit(im, sx, sy, sw, sh, dx, dy, dw, dh) {
    const ix0 = Math.max(0, sx), iy0 = Math.max(0, sy);
    const ix1 = Math.min(im.width, sx + sw), iy1 = Math.min(im.height, sy + sh);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    const fx0 = (ix0 - sx) / sw, fy0 = (iy0 - sy) / sh;
    const fx1 = (ix1 - sx) / sw, fy1 = (iy1 - sy) / sh;
    ctx.drawImage(im, ix0, iy0, ix1 - ix0, iy1 - iy0,
      dx + dw * fx0, dy + dh * fy0, dw * (fx1 - fx0), dh * (fy1 - fy0));
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, boardW, boardH);

    if (img && placedCount === TILES) {
      blit(img, 0, 0, IMG_W, IMG_H, 0, 0, boardW, boardH);
    } else {
      if (img) {
        const boost = Date.now() < ghostBoostUntil;
        const ga = boost ? 0.85 : (ghostOn ? LEVELS[level].ghost : 0);
        if (ga > 0.001) {
          ctx.globalAlpha = ga;
          blit(img, 0, 0, IMG_W, IMG_H, 0, 0, boardW, boardH);
          ctx.globalAlpha = 1;
        }
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(140,220,255,.10)';
      ctx.lineWidth = 1;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = pieces[r * COLS + c];
          if (p.placed) continue;
          ctx.strokeRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
        }
      }
      ctx.restore();

      if (markPiece && Date.now() < markUntil) {
        const t = (Math.sin(Date.now() / 160) + 1) / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,47,179,' + (0.35 + t * 0.5) + ')';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.strokeRect(markPiece.c * cw + 3, markPiece.r * ch + 3, cw - 6, ch - 6);
        ctx.setLineDash([]);
        ctx.restore();
      }

      for (const idx of order) {
        const p = pieces[idx];
        if (!p) continue;
        ctx.save();
        ctx.translate(p.x, p.y);

        if (!p.placed) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.7)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetY = 6;
          ctx.fillStyle = '#0c0918';
          ctx.fill(p.path);
          ctx.restore();
        }

        if (img) {
          ctx.save();
          ctx.clip(p.path);
          blit(img, p.sx, p.sy, p.sw, p.sh, p.dx - p.x, p.dy - p.y, p.dw, p.dh);
          ctx.restore();
        }

        ctx.lineJoin = 'round';
        if (p.placed) {
          ctx.strokeStyle = 'rgba(56,255,163,.5)';
          ctx.lineWidth = 1.1;
        } else if (drag === p) {
          ctx.strokeStyle = 'rgba(255,179,64,.95)';
          ctx.lineWidth = 2.4;
        } else {
          ctx.strokeStyle = 'rgba(210,235,255,.28)';
          ctx.lineWidth = 1.4;
        }
        ctx.stroke(p.path);

        if (!p.placed && drag !== p) {
          const hx = p.c * cw, hy = p.r * ch;
          if (Math.hypot(p.x - hx, p.y - hy) < LEVELS[level].snap * 2.2) {
            ctx.save();
            ctx.strokeStyle = 'rgba(56,255,163,.5)';
            ctx.lineWidth = 2.4;
            ctx.stroke(p.path);
            ctx.restore();
          }
        }
        ctx.restore();
      }
    }

    if (confetti.length) {
      for (const c of confetti) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.globalAlpha = Math.max(0, c.life);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
    }
  }

  function frame(now) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const k = clamp((now - a.t0) / a.dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      a.p.x = a.x0 + (a.x1 - a.x0) * e;
      a.p.y = a.y0 + (a.y1 - a.y0) * e;
      if (k >= 1) { anims.splice(i, 1); if (a.done) a.done(); }
      needsRender = true;
    }

    if (confetti.length) {

      if (Date.now() > confettiUntil) {
        confetti = [];
      } else {
        for (const c of confetti) {
          c.x += c.vx; c.y += c.vy; c.vy += 0.14; c.rot += c.vr; c.life -= 0.011;
        }
        confetti = confetti.filter((c) => c.life > 0);
      }
      needsRender = true;
    }

    if (running && !solved && !pausedAt) {
      const left = Math.max(0, timeLeft - (Date.now() - startedAt) / 1000);
      $('#hudTime').textContent = fmtTime(left);
      if (left < 30) $('#hudTime').classList.add('is-warn');
      if (left <= 0 && !timedOut) {
        timedOut = true;
        toast('Time is up — the time bonus is gone.', 'warn');
      }
    }

    if (needsRender) { render(); needsRender = false; }
    requestAnimationFrame(frame);
  }

  let startedAt = 0, timedOut = false;

  function toBoard(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (boardW / rect.width),
      y: (e.clientY - rect.top) * (boardH / rect.height)
    };
  }

  function hitTest(x, y) {
    for (let i = order.length - 1; i >= 0; i--) {
      const p = pieces[order[i]];
      if (G.inPoly(p.poly, x - p.x, y - p.y)) return p;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!ready || solved) return;
    const pt = toBoard(e);
    const p = hitTest(pt.x, pt.y);
    if (!p) return;

    if (p.placed) { p.placed = false; placedCount--; updateHud(); }

    drag = p;
    dragDX = pt.x - p.x;
    dragDY = pt.y - p.y;
    order.splice(order.indexOf(pieces.indexOf(p)), 1);
    order.push(pieces.indexOf(p));
    canvas.classList.add('is-dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    needsRender = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = toBoard(e);

    drag.x = clamp(pt.x - dragDX, -cw * 0.45, boardW - cw * 0.55);
    drag.y = clamp(pt.y - dragDY, -ch * 0.45, boardH - ch * 0.55);
    needsRender = true;
  });

  function endDrag() {
    if (!drag) return;
    const p = drag;
    drag = null;
    canvas.classList.remove('is-dragging');
    moves++;
    const hx = p.c * cw, hy = p.r * ch;
    if (Math.hypot(p.x - hx, p.y - hy) <= LEVELS[level].snap) {
      animate(p, hx, hy, 190, () => placeTile(p));
      tone('place');
    } else {
      tone('drop');
      toast('Not this one — that tile does not belong there.', 'warn');
    }
    updateHud();
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function animate(p, x1, y1, dur, done) {
    anims.push({ p, x0: p.x, y0: p.y, x1, y1, t0: performance.now(), dur, done });
  }

  function placeTile(p) {
    p.x = p.c * cw; p.y = p.r * ch; p.placed = true;
    placedCount++;
    updateHud();
    if (placedCount === TILES) win();
  }

  function currentScore() {
    const L = LEVELS[level];
    let s = 1000;
    s -= Math.max(0, moves - TILES) * L.cost;
    s -= hintPenalty;
    s += Math.min(150, Math.max(0, timeLeft) * 2);
    return clamp(Math.round(s), 0, 1000);
  }

  function stars() {
    const s = currentScore();
    return s >= 900 ? 3 : s >= 700 ? 2 : 1;
  }

  function updateHud() {
    $('#hudMoves').textContent = moves;
    $('#hudPlaced').innerHTML = placedCount + '<em>/24</em>';
    $('#hudScore').textContent = currentScore();
    $('#progressBar').style.width = (placedCount / TILES * 100) + '%';
    const L = LEVELS[level];
    $('#btnHintPlace').disabled = hintsUsed >= L.hints || solved;
    $('#btnHintPeek').disabled = hintsUsed >= L.hints || solved;
    $('#btnHintMark').disabled = hintsUsed >= L.hints || solved;
    $('#btnHintPlace').innerHTML = '▣ Place a tile <em>−' + L.hintCost.place + '</em>';
    $('#btnHintPeek').innerHTML = '◉ Peek at the map <em>−' + L.hintCost.peek + '</em>';
    $('#btnHintMark').innerHTML = '◎ Mark a slot <em>−' + L.hintCost.mark + '</em>';
  }

  let hintPenalty = 0;

  function hintPlace() {
    if (hintsUsed >= LEVELS[level].hints) return;
    const open = pieces.filter((p) => !p.placed);
    if (!open.length) return;
    hintsUsed++;
    hintPenalty += LEVELS[level].hintCost.place;
    const p = pick(open);
    animate(p, p.c * cw, p.r * ch, 420, () => { placeTile(p); });
    tone('hint');
    toast('Tile #' + (p.r * COLS + p.c + 1) + ' slotted in for you.', 'warn');
    updateHud();
  }

  function hintPeek() {
    if (hintsUsed >= LEVELS[level].hints) return;
    hintsUsed++;
    hintPenalty += LEVELS[level].hintCost.peek;
    ghostBoostUntil = Date.now() + 4000;
    tone('hint');
    toast('The map blinks for four seconds.', 'warn');
    updateHud();
  }

  function hintMark() {
    if (hintsUsed >= LEVELS[level].hints) return;
    const open = pieces.filter((p) => !p.placed);
    if (!open.length) return;
    hintsUsed++;
    hintPenalty += LEVELS[level].hintCost.mark;
    markPiece = pick(open);
    markUntil = Date.now() + 3200;
    tone('hint');
    toast('A home slot is pulsing.', 'warn');
    updateHud();
  }

  function win() {
    solved = true;
    running = false;
    needsRender = true;
    $('.modal__panel').classList.add('is-solved');
    $('#stageBadge').textContent = 'MAP RESTORED';
    $('#stageBadge').classList.add('is-done');
    $('#winTime').textContent = fmtTime(timeLeft);
    $('#winMoves').textContent = moves;
    $('#winHints').textContent = hintsUsed;
    $('#winScore').textContent = currentScore();
    const st = stars();
    $('#winStars').textContent = '★ '.repeat(st) + '☆ '.repeat(3 - st);
    setTimeout(() => {
      $('#winOverlay').hidden = false;

      $('#stageBadge').style.opacity = '0';
    }, 320);

    confettiUntil = Date.now() + 1600;
    const colors = ['#22e6ff', '#ff2fb3', '#ffb340', '#38ffa3', '#ffffff'];
    for (let i = 0; i < 140; i++) {
      confetti.push({
        x: rand(0, boardW), y: rand(-boardH * 0.6, 0),
        vx: rand(-1.6, 1.6), vy: rand(1.5, 5.5),
        w: rand(4, 9), h: rand(4, 12), rot: rand(0, 6.28), vr: rand(-0.25, 0.25),
        life: 1, color: pick(colors)
      });
    }
    tone('win');
  }

  function tone(kind) {
    if (!soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime;
      const seq = {
        place: [[660, 0, 0.09], [990, 0.07, 0.13]],
        drop:  [[170, 0, 0.10]],
        hint:  [[880, 0, 0.07], [1320, 0.06, 0.10]],
        win:   [[523, 0, 0.13], [659, 0.11, 0.13], [784, 0.22, 0.13], [1046, 0.33, 0.30]]
      }[kind] || [];
      for (const [f, t, d] of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === 'drop' ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.16, now + t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
        o.connect(g); g.connect(actx.destination);
        o.start(now + t); o.stop(now + t + d + 0.02);
      }
    } catch (_) {}
  }

  let toastEl = null, toastTimer = null;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast is-on' + (kind === 'warn' ? ' is-warn' : kind === 'bad' ? ' is-bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = 'toast' + (kind === 'warn' ? ' is-warn' : kind === 'bad' ? ' is-bad' : ''); }, 2200);
  }

  const modal = $('#gameModal');
  const launcher = $('#launcher');

  function closeModal() {
    if (pausedAt) return;
    pausedAt = Date.now();
    modal.hidden = true;
    launcher.hidden = false;
  }

  function openModal() {
    if (pausedAt) { startedAt += Date.now() - pausedAt; pausedAt = 0; }
    modal.hidden = false;
    launcher.hidden = true;
    needsRender = true;
    if (ready) buildGeometry(true);
  }

  function newGame(reseed) {
    solved = false;
    running = false;
    timedOut = false;
    moves = 0; hintsUsed = 0; hintPenalty = 0; placedCount = 0;
    anims = []; confetti = [];
    markPiece = null; markUntil = 0;
    $('#winOverlay').hidden = true;
    $('.modal__panel').classList.remove('is-solved');
    $('#stageBadge').textContent = 'ASSEMBLE THE MAP';
    $('#stageBadge').classList.remove('is-done');
    $('#stageBadge').style.opacity = '';
    buildGeometry(false);
    startedAt = Date.now();
    timeLeft = LEVELS[level].limit;
    running = true;
    $('#hudTime').classList.remove('is-warn');
    updateHud();
    if (reseed) toast('Tiles reshuffled. Fresh run.', 'warn');
  }

  $('#difficulty').addEventListener('change', (e) => {
    level = e.target.value;
    newGame(true);
    toast('Mode: ' + LEVELS[level].name, 'warn');
  });

  $('#btnShuffle').addEventListener('click', () => newGame(true));

  $('#btnGhost').addEventListener('click', () => {
    ghostOn = !ghostOn;
    $('#btnGhost').textContent = '◐ Ghost map: ' + (ghostOn ? 'ON' : 'OFF');
    needsRender = true;
  });

  $('#btnSound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('#btnSound').textContent = '♪ Sound: ' + (soundOn ? 'ON' : 'OFF');
    if (soundOn) tone('hint');
  });

  $('#btnHintPlace').addEventListener('click', hintPlace);
  $('#btnHintPeek').addEventListener('click', hintPeek);
  $('#btnHintMark').addEventListener('click', hintMark);

  $('#btnWinRestart').addEventListener('click', () => newGame(true));
  $('#btnWinClose').addEventListener('click', closeModal);
  $('#btnClose').addEventListener('click', closeModal);
  $('#btnLaunch').addEventListener('click', openModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  window.NQTM = {
    get pieces() { return pieces; },
    get state() {
      const elapsed = (pausedAt || Date.now()) - startedAt;
      return {
        level, moves, hintsUsed, placedCount, timeLeft, solved, ready, boardW, boardH, cw, ch, knobU,
        remaining: Math.max(0, timeLeft - elapsed / 1000)
      };
    },
    pickAt: (x, y) => { const p = hitTest(x, y); return p ? pieces.indexOf(p) : -1; },
    order: () => order.slice(),
    placeAll: () => { pieces.forEach((p) => { p.placed = true; p.x = p.c * cw; p.y = p.r * ch; }); placedCount = TILES; updateHud(); if (!solved) win(); },
    rebuild: (preserve) => buildGeometry(!!preserve)
  };

  function boot() {
    img = new Image();
    img.onload = () => {
      ready = true;
      buildGeometry(false);
      startedAt = Date.now();
      timeLeft = LEVELS[level].limit;
      running = true;
      updateHud();
      requestAnimationFrame(frame);
    };
    img.onerror = () => {
      const note = document.createElement('div');
      note.style.cssText = 'position:absolute;inset:0;z-index:9;display:grid;place-items:center;padding:24px;' +
        'text-align:center;font-family:var(--font-mono);font-size:.8rem;color:#ff4d6d;background:rgba(8,6,18,.92)';
      note.innerHTML = 'MAP IMAGE NOT FOUND<br><small style="color:#6a739e">expected: ' + IMG_SRC + '</small>';
      stage.appendChild(note);
    };
    img.src = IMG_SRC;

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (ready) { buildGeometry(true); needsRender = true; } }, 160);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
