// Christeena & Samuel — envelope intro, ribbon physics, music, countdown, reveals.
(() => {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (sel, el = document) => el.querySelector(sel);

  const intro = $("#intro");
  const card = $("#card");
  const main = $("#main");
  const audio = $(".audio");
  const musicBtn = $(".music");
  const replayBtn = $("[data-replay]");

  // ---------------- easing helpers ----------------
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inQuad: (t) => t * t,
    outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  };
  // Damped spring from 0 to 1 (underdamped: a small overshoot, then it settles).
  const spring = (t, w, z) => {
    if (t <= 0) return 0;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  };

  // ---------------- music ----------------
  function setMusicButton(playing) {
    musicBtn.setAttribute("aria-pressed", String(playing));
    musicBtn.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  }
  function startMusic() {
    if (!audio) return;
    const p = audio.play();
    if (p && p.then) {
      p.then(() => { musicBtn.hidden = false; setMusicButton(true); }).catch(() => {});
    }
  }
  musicBtn.addEventListener("click", () => {
    if (audio.paused) { audio.play().then(() => setMusicButton(true)).catch(() => {}); }
    else { audio.pause(); setMusicButton(false); }
  });
  audio.addEventListener("error", () => { musicBtn.hidden = true; });

  // ---------------- ribbon (verlet rope) ----------------
  class Ribbon {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.chains = [];
      this.active = false;
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.dpr = dpr;
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Two lengths of ribbon: from each envelope edge to the knot under the seal.
    setup(env, y, sealX, sealR) {
      this.resize();
      this.width = Math.max(9, env.width * 0.034);
      const N = 26;
      const make = (x0, x1, dir) => {
        const pts = [];
        for (let i = 0; i < N; i++) {
          const x = lerp(x0, x1, i / (N - 1));
          pts.push({ x, y, px: x, py: y, pin: true });
        }
        return { pts, rest: Math.abs(x1 - x0) / (N - 1), dir, wrap: true };
      };
      // index 0 = outer edge, last = knot under the seal
      this.chains = [
        make(env.left - 2, sealX - sealR * 0.55, -1),
        make(env.right + 2, sealX + sealR * 0.55, 1),
      ];
      this.time = 0;
      this.done = false;
      this.draw();
    }
    kick(p, vx, vy, dt) { p.px = p.x - vx * dt; p.py = p.y - vy * dt; }
    // The knot slips free first, then the ends slide off the envelope edges.
    releaseKnot() {
      const dt = 1 / 120;
      for (const c of this.chains) {
        const n = c.pts.length;
        for (let i = 0; i < n; i++) {
          const p = c.pts[i];
          if (i < 2) continue; // outer ends stay hooked round the edge for a moment
          p.pin = false;
          const k = Math.pow(i / (n - 1), 2);
          this.kick(p, c.dir * -40 * k, -260 * k, dt);
        }
      }
      this.active = true;
    }
    releaseEnds() {
      const dt = 1 / 120;
      for (const c of this.chains) {
        for (let i = 0; i < 2; i++) {
          const p = c.pts[i];
          p.pin = false;
          this.kick(p, c.dir * 140, -30, dt);
        }
        c.wrap = false;
      }
    }
    step(frameDt) {
      if (!this.active || this.done) return;
      const dt = 1 / 120;
      let steps = Math.min(8, Math.max(1, Math.round(frameDt / dt)));
      const G = 2100;
      while (steps--) {
        this.time += dt;
        for (const c of this.chains) {
          const pts = c.pts;
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (p.pin) continue;
            const vx = (p.x - p.px) * 0.988;
            const vy = (p.y - p.py) * 0.988;
            p.px = p.x; p.py = p.y;
            // a little air: lateral flutter that varies along the ribbon
            const flutter = Math.sin(this.time * 5.2 + i * 0.45 + c.dir) * 260;
            p.x += vx + flutter * dt * dt;
            p.y += vy + G * dt * dt;
          }
          for (let k = 0; k < 14; k++) {
            this.solve(pts, 1, c.rest, 1);
            this.solve(pts, 2, c.rest * 2 * 0.97, 0.12); // a touch of stiffness, like satin
          }
        }
      }
      this.done = this.chains.every((c) => c.pts.every((p) => p.y > this.h + 60));
    }
    solve(pts, gap, rest, stiff) {
      for (let i = 0; i + gap < pts.length; i++) {
        const a = pts[i], b = pts[i + gap];
        if (a.pin && b.pin) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = ((d - rest) / d) * stiff;
        const wa = a.pin ? 0 : b.pin ? 1 : 0.5;
        const wb = b.pin ? 0 : a.pin ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
    }
    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      if (this.done) return;
      for (const c of this.chains) this.drawChain(c);
    }
    drawChain(c) {
      const ctx = this.ctx, pts = c.pts, n = pts.length, hw = this.width / 2;
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len; ty /= len;
        L.push([pts[i].x - ty * hw, pts[i].y + tx * hw]);
        R.push([pts[i].x + ty * hw, pts[i].y - tx * hw]);
      }
      // satin: brightness follows the angle of each piece against a soft top-left light
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        let s = 0.5 + 0.5 * Math.cos(2 * (ang + 0.5));
        s = 0.25 + 0.75 * s;
        if (c.wrap && i < 2) s *= 0.72; // ends turning round the envelope edge
        const r = Math.round(lerp(214, 255, s)), g = Math.round(lerp(198, 251, s)), bl = Math.round(lerp(166, 240, s));
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(L[i][0], L[i][1]); ctx.lineTo(L[i + 1][0], L[i + 1][1]);
        ctx.lineTo(R[i + 1][0], R[i + 1][1]); ctx.lineTo(R[i][0], R[i][1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // gold edges
      ctx.strokeStyle = "rgba(176, 134, 62, .9)";
      ctx.lineWidth = 1;
      for (const edge of [L, R]) {
        ctx.beginPath();
        edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      // faint shadow on the envelope while it is still lying flat on it
      if (c.wrap) {
        ctx.strokeStyle = "rgba(90, 60, 20, .12)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        R.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + 1.5) : ctx.moveTo(x, y + 1.5)));
        ctx.stroke();
      }
    }
  }

  // ---------------- envelope intro ----------------
  const els = intro && {
    back: $(".env-back", intro),
    front: $(".env-front", intro),
    flap: $(".env-flap", intro),
    seal: $(".seal", intro),
    clip: $(".card-clip", intro),
    skip: $(".intro__skip", intro),
    canvas: $(".ribbon", intro),
  };
  const ribbon = intro && new Ribbon(els.canvas);
  let state = "closed"; // closed | opening | done
  let geo = null;
  let ghost = null;
  let raf = 0;

  function measure() {
    const env = els.back.getBoundingClientRect();
    const seal = els.seal.getBoundingClientRect();
    return {
      env: { left: env.left, right: env.right, top: env.top, bottom: env.bottom, width: env.width, height: env.height },
      sealX: seal.left + seal.width / 2,
      sealY: seal.top + seal.height / 2,
      sealR: seal.width / 2,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }

  function setEnvelope(dy, angle) {
    const t = `translate3d(0, ${dy}px, 0)`;
    els.back.style.transform = t;
    els.front.style.transform = t;
    els.flap.style.transform = `${t} perspective(1100px) rotateX(${angle}deg)`;
    els.flap.style.zIndex = Math.abs(angle) > 90 ? 2 : 6;
  }

  function clipCard(dy) {
    const { env, vw } = geo;
    const top = env.top + dy, bottom = env.bottom + dy;
    els.clip.style.clipPath = `polygon(0 0, ${vw}px 0, ${vw}px ${top}px, ${env.right}px ${top}px, ${env.right}px ${bottom}px, ${env.left}px ${bottom}px, ${env.left}px ${top}px, 0 ${top}px)`;
  }

  function buildGhost() {
    els.clip.textContent = "";
    ghost = card.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    ghost.querySelectorAll("a, button").forEach((n) => n.setAttribute("tabindex", "-1"));
    ghost.classList.add("card-ghost");
    const r = card.getBoundingClientRect();
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    els.clip.appendChild(ghost);
    return r;
  }

  function resetIntro() {
    cancelAnimationFrame(raf);
    state = "closed";
    root.classList.add("is-intro");
    intro.classList.remove("is-gone", "is-opening", "is-fading");
    intro.style.removeProperty("--vig");
    main.inert = true;
    els.seal.style.transform = "";
    els.seal.querySelector("img").style.filter = "";
    els.clip.textContent = "";
    els.clip.style.clipPath = "";
    setEnvelope(0, 0);
    geo = measure();
    ribbon.active = false;
    ribbon.setup(geo.env, geo.sealY, geo.sealX, geo.sealR);
  }

  function finish() {
    cancelAnimationFrame(raf);
    state = "done";
    root.classList.remove("is-intro");
    intro.classList.add("is-gone");
    main.inert = false;
    replayBtn.hidden = false;
    main.focus({ preventScroll: true });
    observeReveals();
  }

  function fadeOut() {
    state = "opening";
    intro.classList.add("is-opening", "is-fading");
    root.classList.remove("is-intro");
    setTimeout(finish, 520);
  }

  function open() {
    if (state !== "closed") return;
    startMusic();
    if (reduceMotion.matches) return fadeOut();

    state = "opening";
    intro.classList.add("is-opening");
    window.scrollTo(0, 0);
    geo = measure();

    // where the card must end up: exactly over the real card on the page
    const final = buildGhost();
    const { env } = geo;
    const s0 = (env.width * 0.86) / final.width;
    const x0 = env.left + (env.width - final.width * s0) / 2;
    const y0 = env.top + env.height * 0.07;
    const rise = Math.min(final.height * s0 * 0.42, y0 - 18);
    const dropTo = geo.vh - env.top + 40;

    const T = {
      press: [0, 0.2], lift: [0.2, 0.85], knot: 0.5, ends: 0.9,
      flap: 1.05, rise: [2.7, 4.7], drop: [4.3, 6.7], card: [4.6, 7.0], end: 7.2,
    };

    const sealImg = els.seal.querySelector("img");
    let t0 = performance.now(), last = t0, knot = false, ends = false;

    const frame = (now) => {
      const t = (now - t0) / 1000;
      const dt = (now - last) / 1000;
      last = now;

      // 1. press the seal, then lift it off the paper
      const press = seg(t, ...T.press), lift = seg(t, ...T.lift);
      const scale = t < T.press[1] ? 1 - 0.05 * ease.outCubic(press) : lerp(0.95, 1.16, ease.outBack(lift));
      const rise3d = 30 * ease.outCubic(lift);
      els.seal.style.transform = `translate(-50%, calc(-54% - ${10 * ease.outCubic(lift)}px)) translateZ(${1 + rise3d}px) scale(${scale})`;
      sealImg.style.filter = `drop-shadow(0 ${3 + 9 * lift}px ${3 + 9 * lift}px rgba(70,45,10,${0.35 - 0.1 * lift})) drop-shadow(0 ${8 + 18 * lift}px ${14 + 16 * lift}px rgba(70,45,10,.18))`;

      // 2. the ribbon slips free and falls away
      if (!knot && t >= T.knot) { knot = true; ribbon.releaseKnot(); }
      if (!ends && t >= T.ends) { ends = true; ribbon.releaseEnds(); }
      ribbon.step(dt);
      ribbon.draw();

      // 3. the flap swings open on a damped spring; 4. the envelope sinks away
      const angle = -180 * spring(t - T.flap, 3.7, 0.58);
      const drop = dropTo * ease.inQuad(seg(t, ...T.drop));
      setEnvelope(drop, angle);
      clipCard(drop);
      intro.style.setProperty("--vig", String(1 - seg(t, T.drop[0], T.card[1])));

      // 5. the card is drawn up out of the envelope, then settles into place
      const r = ease.inOutSine(seg(t, ...T.rise));
      const k = ease.inOutCubic(seg(t, ...T.card));
      const s = lerp(s0, 1, k);
      const x = lerp(x0, final.left, k);
      const y = lerp(y0 - rise * r, final.top, k);
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;

      if (t >= T.end) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  if (intro) {
    main.inert = true;
    resetIntro();
    els.seal.addEventListener("click", open);
    els.skip.addEventListener("click", () => { if (state === "closed") fadeOut(); });
    window.addEventListener("resize", () => {
      if (state !== "closed") return;
      geo = measure();
      ribbon.setup(geo.env, geo.sealY, geo.sealX, geo.sealR);
    });
    replayBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "instant" });
      resetIntro();
      els.seal.focus();
    });
    // Coming back via the back/forward cache: show the envelope again.
    window.addEventListener("pageshow", (e) => { if (e.persisted) resetIntro(); });
  }

  // ---------------- countdown ----------------
  const cd = $(".countdown");
  if (cd) {
    const targets = JSON.parse(cd.dataset.targets).map((x) => ({ ...x, at: new Date(x.at).getTime() }));
    const label = $("[data-countdown-label]", cd);
    const cells = Object.fromEntries([...cd.querySelectorAll("[data-unit]")].map((n) => [n.dataset.unit, n]));
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const now = Date.now();
      const next = targets.find((x) => x.at > now);
      if (!next) {
        label.textContent = cd.dataset.after;
        cd.classList.add("is-done");
        return;
      }
      if (label.textContent !== next.label) label.textContent = next.label;
      let s = Math.floor((next.at - now) / 1000);
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      cells.days.textContent = d;
      cells.hours.textContent = pad(h);
      cells.minutes.textContent = pad(m);
      cells.seconds.textContent = pad(s);
      setTimeout(tick, 1000 - (now % 1000));
    };
    tick();
  }

  // ---------------- reveal on scroll ----------------
  let observing = false;
  function observeReveals() {
    if (observing) return;
    observing = true;
    const items = document.querySelectorAll(".page .reveal");
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach((n) => io.observe(n));
  }
  if (!intro) observeReveals();
})();
