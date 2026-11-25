// Builds the invitation into dist/ from content.json. No dependencies: `node build.mjs`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = new URL(".", import.meta.url).pathname;
const DIST = ROOT + "dist/";
const c = JSON.parse(readFileSync(ROOT + "content.json", "utf8"));
const TZ = c.site.timezone;

// ---------- helpers ----------
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const eventById = Object.fromEntries(c.events.map((e) => [e.id, e]));
const getEvent = (id) => {
  const e = eventById[id];
  if (!e) throw new Error(`content.json: unknown event "${id}"`);
  return e;
};

const startDate = (e) => new Date(`${e.start}:00${c.site.utcOffset}`);
const fmt = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
const weekday = (d) => fmt(d, { weekday: "long" });
const dayNum = (d) => fmt(d, { day: "numeric" });
const month = (d) => fmt(d, { month: "long" });
const year = (d) => fmt(d, { year: "numeric" });
const longDate = (d) => `${weekday(d)}, ${dayNum(d)} ${month(d)} ${year(d)}`;
const time = (d) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
const timeLabel = (e) => `${time(startDate(e))}${e.timeSuffix ? " " + e.timeSuffix : ""}`;

const hash = (file) => createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 8);

// ---------- icons (inline SVG, decorative) ----------
const ICONS = {
  rings: `<circle cx="19" cy="26" r="9"/><circle cx="29" cy="26" r="9"/><path d="M16 13l3-4 3 4"/>`,
  heart: `<path d="M24 37s-12-7.4-12-15.2A6.6 6.6 0 0 1 24 18a6.6 6.6 0 0 1 12 3.8C36 29.6 24 37 24 37z"/><path d="M24 22v9M20.5 25.5h7"/>`,
  church: `<path d="M24 6v8M21 9h6M14 40V24l10-9 10 9v16M10 40h28"/><path d="M21 40v-7a3 3 0 0 1 6 0v7"/>`,
  flower: `<circle cx="24" cy="20" r="3.5"/><path d="M24 16.5c-4.5-3-8.5 1.5-4.4 5M27.5 20c3-4.5-1.5-8.5-5-4.4M24 23.5c4.5 3 8.5-1.5 4.4-5M20.5 20c-3 4.5 1.5 8.5 5 4.4"/><path d="M24 23.5V41M24 33c-3-4-8-4-10-2 2 3 7 4 10 2zM24 30c3-4 8-4 10-2-2 3-7 4-10 2z"/>`,
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.heart}</g></svg>`;

const heartCross = `<svg class="heart-cross" viewBox="0 0 40 36" aria-hidden="true" focusable="false"><path d="M20 33S3 23 3 12.2A8.6 8.6 0 0 1 20 8.4a8.6 8.6 0 0 1 17 3.8C37 23 20 33 20 33z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M20 12.5v12M16 16.5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const floral = (pos) => `<span class="floral floral--${pos}" aria-hidden="true"></span>`;
const divider = `<span class="divider" aria-hidden="true"></span>`;

// ---------- ICS ----------
const icsEscape = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDate = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function fold(line) {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + space
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (Buffer.byteLength(cur + ch) > limit) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
function ics(e) {
  const start = startDate(e);
  const end = new Date(start.getTime() + e.durationHours * 3600e3);
  const title = e.calendarTitle || `${e.name === "Reception" ? (e.id.startsWith("betrothal") ? "Betrothal Reception" : "Wedding Reception") : e.name} – ${c.site.title}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Christeena and Samuel//Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}-${e.start.slice(0, 10)}@christeena-samuel`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `LOCATION:${icsEscape(`${e.venue}, ${e.address}`)}`,
    `DESCRIPTION:${icsEscape(`Directions: ${e.maps}\nInvitation: ${c.site.url}`)}`,
    `URL:${c.site.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(title)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---------- page parts ----------
const person = (p) => `
      <div class="person">
        <h2 class="person__name script">${esc(p.name)}</h2>
        <p class="person__parents"><span class="person__rel">${esc(p.relation)}</span> ${esc(p.parents)}</p>
        <p class="person__house caps">${esc(p.house)}, ${esc(p.place)}</p>
      </div>`;

function card() {
  const k = c.card;
  const e = getEvent(k.highlightEvent);
  const d = startDate(e);
  return `
  <article class="card paper" id="card" aria-labelledby="card-title">
    <span class="card__frame" aria-hidden="true"></span>
    ${floral("tl")}${floral("br")}
    <div class="card__inner">
      <p class="verse"><span class="verse__text">“${esc(k.verse)}”</span><span class="verse__ref caps">${esc(k.verseRef)}</span></p>
      <h1 class="card__intro caps" id="card-title">${esc(k.intro)}</h1>
      ${person(k.bride)}
      <div class="amp">${heartCross}</div>
      ${person(k.groom)}
      ${divider}
      <div class="highlight">
        <p class="highlight__label caps">${esc(e.name)}</p>
        <p class="highlight__date">
          <span class="highlight__weekday caps">${esc(weekday(d))}</span>
          <span class="highlight__row"><span class="highlight__month caps">${esc(month(d))}</span><span class="highlight__day">${esc(dayNum(d))}</span><span class="highlight__year caps">${esc(year(d))}</span></span>
          <span class="highlight__time caps">${esc(timeLabel(e))}</span>
        </p>
        <p class="highlight__venue">${esc(e.venue)}<br><span>${esc(e.address)}</span></p>
      </div>
      ${k.footnote ? `<p class="card__footnote">${esc(k.footnote)}</p>` : ""}
    </div>
    <a class="scroll-cue" href="#details" aria-label="Scroll to the details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
  </article>`;
}

function eventCard(e) {
  const d = startDate(e);
  return `
        <li class="event reveal">
          <span class="event__icon">${icon(e.icon)}</span>
          <h3 class="event__name script">${esc(e.name)}</h3>
          <p class="event__when caps"><time datetime="${esc(d.toISOString())}">${esc(longDate(d))}</time><br>${esc(timeLabel(e))}</p>
          <p class="event__venue">${esc(e.venue)}<br><span>${esc(e.address)}</span></p>
          <div class="event__actions">
            <a class="btn" href="${esc(e.maps)}" target="_blank" rel="noopener">Get directions<span class="sr-only"> to ${esc(e.venue)} (opens Google Maps)</span></a>
            <a class="btn btn--ghost" href="ics/${esc(e.id)}.ics">Add to calendar<span class="sr-only">: ${esc(e.name)}, ${esc(longDate(d))}</span></a>
          </div>
        </li>`;
}

const sectionRenderers = {
  countdown(s, i) {
    const targets = s.targets.map((t) => ({ at: startDate(getEvent(t.event)).toISOString(), label: t.label }));
    return `
    <section class="section countdown reveal" aria-labelledby="s${i}" data-targets='${esc(JSON.stringify(targets))}' data-after="${esc(s.after)}">
      <h2 class="section__title script" id="s${i}">${esc(s.title)}</h2>
      <p class="countdown__label caps" data-countdown-label>${esc(targets[0].label)}</p>
      <div class="countdown__grid" role="timer" aria-live="off">
        ${["days", "hours", "minutes", "seconds"].map((u) => `<div class="countdown__cell"><span class="countdown__num" data-unit="${u}">–</span><span class="countdown__unit caps">${u}</span></div>`).join("")}
      </div>
    </section>`;
  },
  events(s, i) {
    return `
    <section class="section reveal" aria-labelledby="s${i}">
      ${divider}
      <h2 class="section__title script" id="s${i}">${esc(s.title)}</h2>
      <ul class="events" role="list">${s.events.map((id) => eventCard(getEvent(id))).join("")}
      </ul>
    </section>`;
  },
  text(s, i) {
    return `
    <section class="section section--small reveal" aria-labelledby="s${i}" id="${esc(s.id || "")}">
      ${divider}
      <h2 class="section__title script" id="s${i}">${esc(s.title)}</h2>
      <p class="section__text">${esc(s.text)}</p>
    </section>`;
  },
  link(s, i) {
    const action = s.url
      ? `<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`
      : `<p class="soon caps">${esc(s.comingSoon)}</p>`;
    return `
    <section class="section section--small reveal" aria-labelledby="s${i}" id="${esc(s.id || "")}">
      ${divider}
      <h2 class="section__title script" id="s${i}">${esc(s.title)}</h2>
      ${s.text ? `<p class="section__text">${esc(s.text)}</p>` : ""}
      ${action}
    </section>`;
  },
  names(s, i) {
    return `
    <section class="section section--small reveal" aria-labelledby="s${i}">
      ${divider}
      <h2 class="section__title script" id="s${i}">${esc(s.title)}</h2>
      <div class="names">${s.groups
        .map(
          (g) => `
        <div class="names__group">
          <h3 class="names__label caps">${esc(g.label)}</h3>
          <ul role="list">${g.names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        </div>`
        )
        .join("")}
      </div>
    </section>`;
  },
};

function footer() {
  const f = c.footer;
  const d = startDate(getEvent(c.card.highlightEvent));
  return `
  <footer class="footer reveal">
    <div class="emblem" aria-hidden="true">
      <svg class="emblem__names" viewBox="0 0 300 300">
        <defs><path id="arc-top" d="M36 150a114 114 0 0 1 228 0"/><path id="arc-bottom" d="M22 150a128 128 0 0 0 256 0"/></defs>
        <text><textPath href="#arc-top" startOffset="50%" text-anchor="middle">${esc(f.brideShort)}</textPath></text>
        <text><textPath href="#arc-bottom" startOffset="50%" text-anchor="middle">${esc(f.groomShort)}</textPath></text>
      </svg>
      <span class="emblem__rings"></span>
    </div>
    <p class="footer__names script">${esc(c.site.title)}</p>
    <p class="footer__line caps">${esc(f.line)}</p>
    <p class="footer__date caps">${esc(dayNum(d))} · ${esc(month(d))} · ${esc(year(d))}</p>
    <button class="btn btn--ghost replay" type="button" data-replay hidden>${esc(f.replay)}</button>
  </footer>`;
}

function envelope() {
  const v = c.envelope;
  return `
  <div class="intro" id="intro" aria-label="Invitation envelope">
    <canvas class="ribbon" aria-hidden="true"></canvas>
    <div class="env env-back" aria-hidden="true"></div>
    <div class="card-clip" aria-hidden="true"></div>
    <div class="env env-front" aria-hidden="true">
      <svg class="env-front__svg" viewBox="0 0 100 70" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#F6EFE2"/><stop offset="1" stop-color="#EFE5D3"/></linearGradient>
          <linearGradient id="gr" x1="1" x2="0"><stop offset="0" stop-color="#F6EFE2"/><stop offset="1" stop-color="#EFE5D3"/></linearGradient>
          <linearGradient id="gb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FBF7EF"/><stop offset="1" stop-color="#F3EBDD"/></linearGradient>
        </defs>
        <path d="M0 0 L52 39 L0 70Z" fill="url(#gl)"/>
        <path d="M100 0 L48 39 L100 70Z" fill="url(#gr)"/>
        <path d="M0 70 L50 33 L100 70Z" fill="url(#gb)"/>
        <path d="M0 70 L50 33 L100 70" fill="none" stroke="rgba(122,90,43,.22)" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <path d="M0 0 L50 37.5 M100 0 L50 37.5" fill="none" stroke="rgba(122,90,43,.12)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      </svg>
    </div>
    <div class="env env-flap" aria-hidden="false">
      <div class="flap-face flap-face--out">${floral("flap-l")}${floral("flap-r")}</div>
      <div class="flap-face flap-face--in"></div>
      <button class="seal" type="button" aria-label="Open the invitation">
        <img src="assets/seal.webp" alt="" width="480" height="482" draggable="false">
      </button>
    </div>
    <div class="intro__title">
      <p class="intro__line caps">${esc(v.line)}</p>
      <p class="intro__names script">${esc(v.names)}</p>
    </div>
    <p class="intro__hint caps" aria-hidden="true">${esc(v.hint)}</p>
    <button class="intro__skip" type="button">Skip</button>
  </div>`;
}

function page(v) {
  const s = c.site;
  const og = new URL(s.ogImage, s.url).href;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.description)}">
${s.noindex ? `<meta name="robots" content="noindex, nofollow">\n` : ""}<meta name="theme-color" content="#FBF7EF">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(s.url)}">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.description)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A sealed ivory envelope with a gold wax seal">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/favicon.png" sizes="64x64" type="image/png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preload" href="assets/fonts/pinyon-script.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/cormorant-garamond.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/seal.webp" as="image">
<link rel="stylesheet" href="style.css?v=${v.css}">
<script>document.documentElement.classList.add("js");if(location.hash==="#og")document.documentElement.classList.add("og")</script>
<script src="main.js?v=${v.js}" defer></script>
</head>
<body>
${envelope()}
<button class="music" type="button" aria-label="Pause music" aria-pressed="true" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path class="music__note" d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="music__off" d="M4 4l16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
</button>
<audio class="audio" src="${esc(c.music.src)}" loop preload="none"></audio>
<main class="page" id="main" tabindex="-1">
${card()}
  <div class="details" id="details">
${c.sections.map((sec, i) => sectionRenderers[sec.type](sec, i)).join("\n")}
  </div>
${footer()}
</main>
</body>
</html>
`;
}

// ---------- write ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST + "ics", { recursive: true });
cpSync(ROOT + "assets", DIST + "assets", { recursive: true });
cpSync(ROOT + "src/style.css", DIST + "style.css");
cpSync(ROOT + "src/main.js", DIST + "main.js");
if (existsSync(ROOT + "src/robots.txt")) cpSync(ROOT + "src/robots.txt", DIST + "robots.txt");
writeFileSync(DIST + ".nojekyll", "");
for (const e of c.events) writeFileSync(DIST + `ics/${e.id}.ics`, ics(e));
writeFileSync(DIST + "index.html", page({ css: hash(ROOT + "src/style.css"), js: hash(ROOT + "src/main.js") }));
console.log(`Built dist/ — ${c.events.length} calendar files, ${c.sections.length} sections.`);
