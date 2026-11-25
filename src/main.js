// Christeena & Samuel — envelope intro, music, countdown, reveals.
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

  // ---------------- envelope intro ----------------
  // The phone screen is the camera: the envelope fills it. Tapping the seal lifts the flap
  // up out of frame and the letter shows where the flap was; then the envelope is pulled
  // down, uncovering the letter line by line until the page takes over.
  const els = intro && {
    back: $(".env-back", intro),
    front: $(".env-front", intro),
    flap: $(".env-flap", intro),
    seal: $(".seal", intro),
    clip: $(".card-clip", intro),
  };
  let state = "closed"; // closed | opening | done
  let ghost = null;
  let raf = 0;

  function setEnvelope(dy, angle) {
    const t = `translate3d(0, ${dy}px, 0)`;
    els.back.style.transform = t;
    els.front.style.transform = t;
    els.flap.style.transform = `${t} perspective(1400px) rotateX(${angle}deg)`;
    els.flap.style.zIndex = Math.abs(angle) > 90 ? 2 : 6;
  }

  // A copy of the real card, placed exactly where the card sits on the page.
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
    ghost.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    els.clip.appendChild(ghost);
  }

  function resetIntro() {
    cancelAnimationFrame(raf);
    state = "closed";
    root.classList.add("is-intro");
    intro.classList.remove("is-gone", "is-opening", "is-fading");
    main.inert = true;
    els.seal.style.transform = "";
    els.seal.querySelector("img").style.filter = "";
    els.clip.textContent = "";
    setEnvelope(0, 0);
  }

  function finish() {
    cancelAnimationFrame(raf);
    state = "done";
    root.classList.remove("is-intro");
    intro.classList.add("is-gone");
    main.inert = false;
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
    buildGhost();
    const H = els.back.getBoundingClientRect().height;

    const T = {
      press: [0, 0.2], lift: [0.2, 0.8],
      flap: 0.75,          // flap swings up and out of frame
      pull: [2.1, 6.4],    // envelope is drawn down, uncovering the card
      end: 6.5,
    };
    const sealImg = els.seal.querySelector("img");
    const t0 = performance.now();

    const frame = (now) => {
      const t = (now - t0) / 1000;

      // 1. press the seal, then lift it off the paper
      const press = seg(t, ...T.press), lift = seg(t, ...T.lift);
      const scale = t < T.press[1] ? 1 - 0.05 * ease.outCubic(press) : lerp(0.95, 1.14, ease.outBack(lift));
      els.seal.style.transform = `translate(-50%, calc(-54% - ${10 * ease.outCubic(lift)}px)) translateZ(${1 + 30 * ease.outCubic(lift)}px) scale(${scale})`;
      sealImg.style.filter = `drop-shadow(0 ${3 + 9 * lift}px ${3 + 9 * lift}px rgba(70,45,10,${0.35 - 0.1 * lift})) drop-shadow(0 ${8 + 18 * lift}px ${14 + 16 * lift}px rgba(70,45,10,.18))`;

      // 2. the flap lifts towards the camera and out of the top of the frame
      const angle = -180 * spring(t - T.flap, 3.4, 0.72);

      // 3. the envelope is pulled down slowly; the card stays where it is
      const pull = ease.inOutCubic(seg(t, ...T.pull));
      const dy = (H + 40) * pull;
      setEnvelope(dy, angle);

      if (t >= T.end) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  if (intro) {
    main.inert = true;
    resetIntro();
    els.seal.addEventListener("click", open);
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
