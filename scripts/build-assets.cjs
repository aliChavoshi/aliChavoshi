/* ==========================================================================
   GITHUB ACTIVITY: contribution heatmap, streaks, repos, stars, languages.
   Needs a token (GITHUB_TOKEN in Actions, or `gh auth token` locally);
   without one the last generated files are kept as they are.
   ========================================================================== */
async function fetchGitHub(login, token) {
   const query = `query($login:String!){user(login:$login){
      repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:100){totalCount nodes{stargazerCount
         languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}}
      contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount date weekday}}}}}}`;
   const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-graphics" },
      body: JSON.stringify({ query, variables: { login } }),
   });
   const json = await res.json();
   if (!res.ok || json.errors) throw new Error("GitHub API: " + JSON.stringify(json.errors || res.status));
   const u = json.data.user;
   const days = u.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
   const stars = u.repositories.nodes.reduce((n, r) => n + r.stargazerCount, 0);
   const bytes = {};
   u.repositories.nodes.forEach((r) => r.languages.edges.forEach((e) => (bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size)));
   const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
   const sorted = Object.entries(bytes).sort((a, b) => b[1] - a[1]);
   const langs = sorted.slice(0, 5).map(([name, b]) => [name, b / total]);
   const rest = sorted.slice(5).reduce((n, [, b]) => n + b, 0) / total;
   if (rest > 0.005) langs.push(["Other", rest]);
   // streaks (today may still be empty, so the current streak may end yesterday)
   let longest = 0, run = 0;
   days.forEach((d) => {
      run = d.contributionCount ? run + 1 : 0;
      longest = Math.max(longest, run);
   });
   let current = 0;
   for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].contributionCount) current++;
      else if (i === days.length - 1) continue;
      else break;
   }
   return {
      weeks: u.contributionsCollection.contributionCalendar.weeks,
      totalContributions: u.contributionsCollection.contributionCalendar.totalContributions,
      repos: u.repositories.totalCount, stars, langs, current, longest,
      updated: new Date().toISOString().slice(0, 10),
   };
}

function activity(t, d) {
   const W = 1200, H = 336;
   const max = Math.max(1, ...d.weeks.flatMap((w) => w.contributionDays.map((x) => x.contributionCount)));
   const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
   const alpha = [0, 0.28, 0.5, 0.75, 1];
   const CELL = 12, GAPC = 3, HX = 360, HY = 58;
   const num = (n) => n.toLocaleString("en-US");
   let body = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="20" fill="${t.surface}" stroke="${t.line}"/>`;
   body += `<text x="32" y="78" class="mono" font-size="44" font-weight="600" letter-spacing="-2" fill="${t.ink}">${num(d.totalContributions)}</text>` +
      `<text x="32" y="104" font-size="14" fill="${t.ink3}">contributions in the last year</text>`;
   [["Public repos", num(d.repos)], ["Stars earned", num(d.stars)], ["Current streak", d.current + (d.current === 1 ? " day" : " days")], ["Longest streak", d.longest + (d.longest === 1 ? " day" : " days")]].forEach(([label, value], i) => {
      const x = 32 + (i % 2) * 140, y = 150 + Math.floor(i / 2) * 50;
      body += `<text x="${x}" y="${y}" class="mono" font-size="20" font-weight="600" fill="${t.ink}">${esc(value)}</text>` +
         `<text x="${x}" y="${y + 20}" font-size="12.5" fill="${t.ink3}">${label}</text>`;
   });
   const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
   let lastMonth = -1;
   let lastLabelX = -99;
   d.weeks.forEach((w, wi) => {
      const x = HX + wi * (CELL + GAPC);
      const first = w.contributionDays[0];
      const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
      if (m !== lastMonth) {
         // a month that starts in the last days of a week gets no room; skip crowded labels
         if (x - lastLabelX >= 36 && wi < d.weeks.length - 2) {
            body += `<text x="${x}" y="${HY - 12}" font-size="11" fill="${t.ink3}">${months[m]}</text>`;
            lastLabelX = x;
         }
         lastMonth = m;
      }
      body += `<g class="col" style="animation-delay:${(wi * 0.012).toFixed(3)}s">`;
      w.contributionDays.forEach((day) => {
         const lv = level(day.contributionCount);
         const y = HY + day.weekday * (CELL + GAPC);
         body += lv
            ? `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${t.accent}" fill-opacity="${alpha[lv]}"/>`
            : `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${t.surface2}" stroke="${t.line}"/>`;
      });
      body += "</g>";
   });
   ["Mon", "Wed", "Fri"].forEach((wd, i) => (body += `<text x="${HX - 10}" y="${HY + (1 + i * 2) * (CELL + GAPC) + 10}" text-anchor="end" font-size="10.5" fill="${t.ink3}">${wd}</text>`));
   const lx = W - 32 - 5 * (CELL + GAPC) - 70, ly = HY + 7 * (CELL + GAPC);
   body += `<text x="${lx}" y="${ly + 18}" font-size="11" fill="${t.ink3}">Less</text>`;
   alpha.forEach((a, i) => {
      const x = lx + 34 + i * (CELL + GAPC);
      body += a
         ? `<rect x="${x}" y="${ly + 7}" width="${CELL}" height="${CELL}" rx="3" fill="${t.accent}" fill-opacity="${a}"/>`
         : `<rect x="${x}" y="${ly + 7}" width="${CELL}" height="${CELL}" rx="3" fill="${t.surface2}" stroke="${t.line}"/>`;
   });
   body += `<text x="${lx + 34 + 5 * (CELL + GAPC) + 4}" y="${ly + 18}" font-size="11" fill="${t.ink3}">More</text>`;
   const LY = 272, LX = 32, LW = W - 64;
   body += `<text x="${LX}" y="${LY - 12}" font-size="13" font-weight="600" fill="${t.ink2}">Top languages in public repositories</text>`;
   let cx = LX;
   const shade = (i) => Math.max(0.22, 1 - i * 0.17);
   body += `<clipPath id="bar"><rect x="${LX}" y="${LY}" width="${LW}" height="10" rx="5"/></clipPath><g clip-path="url(#bar)"><g class="bar">`;
   d.langs.forEach(([, share], i) => {
      const w = share * LW;
      body += `<rect x="${f(cx)}" y="${LY}" width="${f(Math.max(0, w - 2))}" height="10" fill="${t.accent}" fill-opacity="${shade(i)}"/>`;
      cx += w;
   });
   body += "</g></g>";
   let tx = LX;
   d.langs.forEach(([name, share], i) => {
      const label = `${name} ${(share * 100).toFixed(1)}%`;
      body += `<rect x="${tx}" y="${LY + 26}" width="10" height="10" rx="2.5" fill="${t.accent}" fill-opacity="${shade(i)}"/>` +
         `<text x="${tx + 16}" y="${LY + 35}" font-size="12.5" fill="${t.ink2}">${esc(label)}</text>`;
      tx += 16 + label.length * 7 + 22;
   });
   body += `<text x="${W - 32}" y="${LY + 35}" text-anchor="end" class="mono" font-size="11" fill="${t.ink3}">updated ${d.updated}</text>`;
   return svg(W, H, body);
}

/* ==========================================================================
   Builds the animated SVGs used by the profile README (assets/*.svg).
   Every graphic is generated twice, for GitHub's dark and light themes;
   README.md picks the right one with <picture> + prefers-color-scheme.

   Usage:  node scripts/build-assets.cjs

   Animation uses SMIL + CSS inside the SVG files, which GitHub renders in
   <img> tags. Only the hero embeds a font (Geist, SIL OFL, scripts/fonts);
   everything else uses the visitor's system UI font, like GitHub itself.
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets");
fs.mkdirSync(OUT, { recursive: true });

const THEMES = {
   dark: {
      bg: "#0d1117", surface: "#0f1714", surface2: "#141e1a", line: "#1f2b27", lineStrong: "#2e3e38",
      ink: "#e6edf3", ink2: "#aab6b1", ink3: "#80908a", accent: "#4fd1a5", accentSoft: "rgba(79,209,165,.12)",
      accentLine: "rgba(79,209,165,.42)", onAccent: "#04241b", danger: "#f97066", dangerSoft: "rgba(249,112,102,.14)",
      grid: "rgba(200,235,222,.055)", plane: "rgba(20,30,26,.78)", planeEdge: "rgba(200,235,222,.22)",
      wire: "rgba(200,235,222,.26)", node: "#16201c", btn: "#161b22", btnLine: "#30363d",
   },
   light: {
      bg: "#ffffff", surface: "#f6f8f7", surface2: "#ffffff", line: "#dfe5e2", lineStrong: "#c6d1cc",
      ink: "#1f2328", ink2: "#3e4a46", ink3: "#59636e", accent: "#0f6e5b", accentSoft: "rgba(15,110,91,.09)",
      accentLine: "rgba(15,110,91,.4)", onAccent: "#ffffff", danger: "#b42318", dangerSoft: "rgba(180,35,24,.08)",
      grid: "rgba(16,42,34,.06)", plane: "rgba(255,255,255,.85)", planeEdge: "rgba(16,42,34,.28)",
      wire: "rgba(16,42,34,.3)", node: "#ffffff", btn: "#f6f8fa", btnLine: "#d0d7de",
   },
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const f = (n) => (Math.round(n * 10) / 10).toString();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const font64 = (file) => fs.readFileSync(path.join(__dirname, "fonts", file)).toString("base64");

const ICON = {
   github: "M12 2a10 10 0 0 0-3.16 19.5c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.9.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.1.39-2 1.03-2.7-.1-.25-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.41.1 2.66.64.7 1.03 1.6 1.03 2.7 0 3.85-2.34 4.7-4.57 4.94.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.48A10 10 0 0 0 12 2z",
   linkedin: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.05c.53-1 1.83-2 3.77-2 4.03 0 4.78 2.6 4.78 6V21h-4v-5.6c0-1.35-.03-3.08-1.9-3.08-1.9 0-2.2 1.45-2.2 2.98V21h-4V9z",
   mail: "M3 5.5C3 4.7 3.7 4 4.5 4h15c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5v-13zm2 .5v.4l7 5 7-5V6H5zm14 2.4-6.4 4.6a1 1 0 0 1-1.2 0L5 8.4V18h14V8.4z",
   send: "M2 21l21-9L2 3v7l15 2-15 2v7z",
   cap: "M12 3 1 8l11 5 9-4.1V17h2V8L12 3zM5 12.2v3.6c0 1.7 3.1 4.2 7 4.2s7-2.5 7-4.2v-3.6l-7 3.2-7-3.2z",
   external: "M8 6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 1 1-2 0V8.4l-9.3 9.3a1 1 0 0 1-1.4-1.4L15.6 7H9a1 1 0 0 1-1-1Z",
   star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
   factory: "M3 20V9l5 3V9l5 3V6h3l2 14H3Z",
   barcode: "M4 5h2v14H4zM8 5h1v14H8zM11 5h2v14h-2zM15 5h1v14h-1zM18 5h2v14h-2z",
   shield: "M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Zm-1.2 13.6-3.4-3.4 1.4-1.4 2 2 4.6-4.6 1.4 1.4-6 6Z",
   tablet: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 3v13h12V5H6Zm2 9h2v2H8v-2Zm3-3h2v5h-2v-5Zm3-3h2v8h-2V8Z",
   truck: "M2 6h12v9h1.2a3 3 0 0 1 5.6 0H22v-4l-3-4h-4V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1Zm16 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM6 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-4-2h1.2a3 3 0 0 1 5.6 0H13v-2H2v2Z",
   commerce: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5v1.6h6V8H9Zm0 4v1.6h6V12H9Z",
   box: "M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.2 6.6 3.3L12 10.8 5.4 7.5 12 4.2ZM5 9.1l6 3v7.3l-6-3V9.1Zm8 10.3v-7.3l6-3v7.3l-6 3Z",
   bag: "M7 7V6a5 5 0 0 1 10 0v1h3l-1 14H5L4 7h3Zm2 0h6V6a3 3 0 0 0-6 0v1Z",
   people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6H2Zm15.2 0c0-1.9-.7-3.6-1.9-4.9.6-.1 1.1-.1 1.7-.1 2.8 0 5 1.8 5 4v1h-4.8Z",
   bin: "M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Zm4-4h6l1 2H8l1-2Z",
   pin: "M12 2a7 7 0 0 0-7 7c0 5.2 6.1 12.1 6.4 12.4a.8.8 0 0 0 1.2 0C13 21.1 19 14.2 19 9a7 7 0 0 0-7-7zm0 9.8A2.8 2.8 0 1 1 12 6.2a2.8 2.8 0 0 1 0 5.6z",
};

// glyph centred at (x, y), `size` px
const glyph = (name, x, y, size, fill) =>
   `<path transform="translate(${f(x - size / 2)} ${f(y - size / 2)}) scale(${f(size / 24)})" d="${ICON[name]}" fill="${fill}"/>`;

const svg = (w, h, body, extraStyle = "") =>
   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
   `<style>text{font-family:${SANS}}.mono{font-family:${MONO}}${extraStyle}` +
   `@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>${body}</svg>`;

const write = (name, content) => {
   fs.writeFileSync(path.join(OUT, name), content);
   console.log(name.padEnd(28), (Buffer.byteLength(content) / 1024).toFixed(1) + " KB");
};

const gridPattern = (t, id, size = 32) =>
   `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M${size} 0H0V${size}" fill="none" stroke="${t.grid}"/></pattern>`;

/* ==========================================================================
   HERO: name, headline, typed roles, and the three-layer architecture model
   ========================================================================== */
function isoScene(t, box) {
   const yaw = -0.42, elev = 0.5, K = 0.95;
   const cY = Math.cos(yaw), sY = Math.sin(yaw), cE = Math.cos(elev), sE = Math.sin(elev);
   const S = Math.min(box.w / 4.3, box.h / 3.95);
   const OX = box.x + box.w / 2, OY = box.y + box.h / 2 - 0.27 * S;
   const P = (x, y, z) => ({ x, y, z });
   const pr = (p) => {
      const xr = p.x * cY - p.y * sY, yr = p.x * sY + p.y * cY;
      return [OX + xr * S, OY + (yr * sE - p.z * cE * K) * S];
   };
   const pts = (list) => list.map((p) => pr(p).map(f).join(" ")).join(" L");
   const Zc = 1.5, Zs = 0, Zd = -1.5, TR = 0.2, BUS = -0.88;
   const N = {
      spa: P(0, 0.72, Zc), gateway: P(0, 0.72, Zs), identity: P(-1.12, 0.72, Zs), elk: P(1.12, 0.72, Zs),
      catalog: P(-1.12, -0.3, Zs), basket: P(-0.37, -0.3, Zs), discount: P(0.37, -0.3, Zs), ordering: P(1.12, -0.3, Zs),
      mongodb: P(-1.12, -0.3, Zd), redis: P(-0.37, -0.3, Zd), postgres: P(0.37, -0.3, Zd), sqlserver: P(1.12, -0.3, Zd),
   };
   const LABEL = {
      spa: "Angular", gateway: "Ocelot gateway", identity: "Identity Server", elk: "Elasticsearch", catalog: "Catalog",
      basket: "Basket", discount: "Discount", ordering: "Ordering", mongodb: "MongoDB", redis: "Redis", postgres: "PostgreSQL", sqlserver: "SQL Server",
   };
   const planes = [
      { z: Zd, cx: 0, cy: 0, w: 1.55, d: 1.0, label: "DATA · MESSAGING" },
      { z: Zs, cx: 0, cy: 0, w: 1.55, d: 1.0, label: "SERVICES · KUBERNETES" },
      { z: Zc, cx: 0, cy: 0.45, w: 0.82, d: 0.46, label: "CLIENT" },
   ];
   let out = "";

   const plane = (pl, i) => {
      const x0 = pl.cx - pl.w, x1 = pl.cx + pl.w, y0 = pl.cy - pl.d, y1 = pl.cy + pl.d;
      const c = [P(x0, y0, pl.z), P(x1, y0, pl.z), P(x1, y1, pl.z), P(x0, y1, pl.z)];
      const poly = "M" + pts(c) + "Z";
      let grid = "";
      for (let x = x0 + 0.2; x < x1 - 1e-6; x += 0.2) grid += "M" + pts([P(x, y0, pl.z), P(x, y1, pl.z)]);
      for (let y = y0 + 0.2; y < y1 - 1e-6; y += 0.2) grid += "M" + pts([P(x0, y, pl.z), P(x1, y, pl.z)]);
      const fl = pr(c[3]);
      return `<g class="plane" style="animation-delay:${i * 0.18}s">` +
         `<path d="${poly}" fill="${t.plane}"/><path d="${grid}" stroke="${t.grid}" fill="none"/>` +
         `<path d="${poly}" fill="none" stroke="${t.planeEdge}"/>` +
         `<text x="${f(fl[0] + 6)}" y="${f(fl[1] + 18)}" class="mono" font-size="10" letter-spacing="1" fill="${t.ink3}">${esc(pl.label)}</text></g>`;
   };

   const cube = (n, key) => {
      const s = 0.085, h = key === "gateway" ? 0.1 : 0.07;
      const B = [P(n.x - s, n.y - s, n.z), P(n.x + s, n.y - s, n.z), P(n.x + s, n.y + s, n.z), P(n.x - s, n.y + s, n.z)];
      const T = B.map((p) => P(p.x, p.y, p.z + h));
      const face = (i, j) => `<path d="M${pts([B[i], B[j], T[j], T[i]])}Z"/>`;
      const hot = key === "gateway";
      return `<g fill="${t.node}" stroke="${hot ? t.accent : t.wire}">${face(3, 2)}${face(0, 3)}<path d="M${pts(T)}Z"${hot ? ` fill="${t.accentSoft}"` : ""}/></g>`;
   };

   const cylinder = (n) => {
      const r = 0.1, h = 0.1;
      const c0 = pr(n), c1 = pr(P(n.x, n.y, n.z + h));
      const rx = r * S, ry = r * S * sE;
      return `<g fill="${t.node}" stroke="${t.wire}"><path d="M${f(c1[0] - rx)} ${f(c1[1])}L${f(c0[0] - rx)} ${f(c0[1])}A${f(rx)} ${f(ry)} 0 0 0 ${f(c0[0] + rx)} ${f(c0[1])}L${f(c1[0] + rx)} ${f(c1[1])}Z"/>` +
         `<ellipse cx="${f(c1[0])}" cy="${f(c1[1])}" rx="${f(rx)}" ry="${f(ry)}"/></g>`;
   };

   const label = (key) => {
      const n = N[key];
      const c = pr(P(n.x, n.y, n.z + 0.1));
      const db = n.z === Zd;
      const x = db ? c[0] : c[0] + 0.13 * S;
      const y = db ? c[1] + 0.2 * S * sE + 12 : c[1] + 3;
      const hot = key === "gateway";
      return `<text x="${f(x)}" y="${f(y)}" class="mono" font-size="11" ${db ? 'text-anchor="middle" ' : ""}fill="${hot ? t.accent : t.ink2}" stroke="${t.bg}" stroke-width="3" paint-order="stroke">${esc(LABEL[key])}</text>`;
   };

   const wire = (list, attrs) => `<path d="M${pts(list)}" fill="none" ${attrs}/>`;

   // data layer
   out += plane(planes[0], 0);
   out += `<g class="nodes" style="animation-delay:.5s">` + ["mongodb", "redis", "postgres", "sqlserver"].map((k) => cylinder(N[k]) + label(k)).join("") + "</g>";
   out += `<g class="wires" stroke="${t.wire}" stroke-dasharray="3 4">` + ["catalog", "basket", "discount", "ordering"].map((k) => wire([N[k], P(N[k].x, N[k].y, Zd)], "")).join("") + "</g>";
   // services layer
   out += plane(planes[1], 1);
   out += `<g class="wires" stroke="${t.wire}">` +
      wire([N.gateway, N.identity], "") + wire([N.gateway, P(0, TR, 0)], "") + wire([P(-1.12, TR, 0), P(1.12, TR, 0)], "") +
      wire([P(-1.12, TR, 0), N.catalog], "") + wire([P(-0.37, TR, 0), N.basket], "") + wire([P(1.12, TR, 0), N.ordering], "") +
      wire([P(1.12, TR, 0), N.elk], 'opacity=".5"') + wire([N.basket, N.discount], 'stroke-dasharray="4 4"') +
      wire([N.basket, P(-0.37, BUS, 0)], 'stroke-dasharray="2 4"') + wire([N.ordering, P(1.12, BUS, 0)], 'stroke-dasharray="2 4"') +
      `</g>` + wire([P(-1.36, BUS, 0), P(1.36, BUS, 0)], `stroke="${t.accent}" stroke-width="2.5" stroke-dasharray="8 6" opacity=".6" class="bus"`);
   const bl = pr(P(-1.36, BUS, 0));
   out += `<text x="${f(bl[0] - 8)}" y="${f(bl[1] + 4)}" text-anchor="end" class="mono" font-size="10.5" font-weight="600" fill="${t.accent}">RabbitMQ</text>`;
   out += `<g class="nodes" style="animation-delay:.7s">` + ["identity", "elk", "catalog", "basket", "discount", "ordering", "gateway"].map((k) => cube(N[k], k) + label(k)).join("") + "</g>";
   out += wire([N.gateway, N.spa], `stroke="${t.wire}" stroke-dasharray="3 4"`);
   // client layer
   out += plane(planes[2], 2);
   out += `<g class="nodes" style="animation-delay:.9s">${cube(N.spa, "spa")}${label("spa")}</g>`;

   // live traffic along the real routes of the project
   const route = (list, back) => {
      const all = back ? list.concat(list.slice(0, -1).reverse()) : list;
      return "M" + pts(all);
   };
   const len = (d) => {
      const nums = d.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
      let l = 0;
      for (let i = 2; i < nums.length; i += 2) l += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]);
      return l;
   };
   const packet = (d, begin, kind) => {
      const dur = (len(d) / 95).toFixed(2);
      const shape = kind === "event"
         ? `<rect x="-4.5" y="-4.5" width="9" height="9" transform="rotate(45)" fill="${t.accent}"/>`
         : `<circle r="3.4" fill="${t.accent}"/>`;
      return `<g opacity="0"><circle r="9" fill="${t.accent}" opacity=".22"/>${shape}` +
         `<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}"/>` +
         `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.04;.94;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></g>`;
   };
   out += packet(route([N.spa, N.gateway, P(0, TR, 0), P(-1.12, TR, 0), N.catalog, N.mongodb], true), 1.4);
   out += packet(route([N.spa, N.gateway, N.identity], true), 3.2);
   out += packet(route([N.spa, N.gateway, P(0, TR, 0), P(-0.37, TR, 0), N.basket, N.redis], true), 5);
   out += packet(route([N.basket, N.discount, N.postgres], true), 6.4);
   out += packet(route([N.basket, P(-0.37, BUS, 0), P(1.12, BUS, 0), N.ordering, N.sqlserver]), 2.2, "event");
   return out;
}

function hero(t) {
   const W = 1200, H = 420;
   const phrases = [
      "9+ years building enterprise & industrial systems",
      "ASP.NET Core · C# · Angular · Microservices",
      "Clean Architecture | CQRS | Design Patterns",
      "2,213+ developers taught as an online instructor",
   ];
   const X = 64, Y = 318, CH = 10.9, CYCLE = 16;
   let typed = "";
   phrases.forEach((p, i) => {
      const w = Math.ceil(p.length * CH) + 4;
      const a = (4 * i) / CYCLE, b = (4 * i + 1.3) / CYCLE, c = (4 * i + 3.3) / CYCLE, d = (4 * i + 3.7) / CYCLE;
      const kt = `0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};${d.toFixed(4)};1`;
      typed += `<clipPath id="tc${i}"><rect x="${X}" y="${Y - 22}" height="32" width="0">` +
         `<animate attributeName="width" values="0;0;${w};${w};0;0" keyTimes="${kt}" dur="${CYCLE}s" repeatCount="indefinite"/></rect></clipPath>` +
         `<text x="${X}" y="${Y}" class="type" clip-path="url(#tc${i})">${esc(p)}</text>` +
         `<rect y="${Y - 17}" width="2" height="22" fill="${t.accent}" opacity="0"><animate attributeName="x" values="${X};${X};${X + w};${X + w};${X};${X}" keyTimes="${kt}" dur="${CYCLE}s" repeatCount="indefinite"/>` +
         `<animate attributeName="opacity" values="0;1;1;1;0;0" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};${d.toFixed(4)};1" dur="${CYCLE}s" repeatCount="indefinite" calcMode="discrete"/></rect>`;
   });

   const style =
      `@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${font64("geist.woff2")}) format('woff2');font-weight:100 900}` +
      `@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${font64("geist-mono.woff2")}) format('woff2');font-weight:100 900}` +
      `.display{font-family:'Geist',${SANS};font-weight:600;letter-spacing:-.04em}` +
      `.type{font-family:'Geist Mono',${MONO};font-size:18px;fill:${t.accent}}` +
      `.rise{animation:rise .9s cubic-bezier(.16,1,.3,1) both}` +
      `.plane{animation:plane 1.1s cubic-bezier(.16,1,.3,1) both}` +
      `.nodes{animation:fade .8s ease-out both}.wires{animation:fade 1s ease-out .6s both}` +
      `.bus{animation:bus 1.2s linear infinite}` +
      `@keyframes rise{from{opacity:0;transform:translateY(14px)}}` +
      `@keyframes plane{from{opacity:0;transform:translateY(22px)}}` +
      `@keyframes fade{from{opacity:0}}@keyframes bus{to{stroke-dashoffset:-14}}`;

   const body =
      `<defs>${gridPattern(t, "g", 40)}` +
      `<radialGradient id="glow" cx="72%" cy="48%" r="45%"><stop offset="0" stop-color="${t.accent}" stop-opacity="${t === THEMES.dark ? 0.16 : 0.1}"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="fadeMask" cx="72%" cy="45%" r="60%"><stop offset=".3" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>` +
      `<mask id="m"><rect width="${W}" height="${H}" fill="url(#fadeMask)"/></mask>` +
      `<clipPath id="frame"><rect width="${W}" height="${H}" rx="24"/></clipPath>${typed.match(/<clipPath[\s\S]*?<\/clipPath>/g).join("")}</defs>` +
      `<g clip-path="url(#frame)"><rect width="${W}" height="${H}" fill="${t.surface}"/>` +
      `<rect width="${W}" height="${H}" fill="url(#g)" mask="url(#m)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>` +
      isoScene(t, { x: 650, y: 22, w: 520, h: 380 }) + `</g>` +
      `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="23.5" fill="none" stroke="${t.line}"/>` +
      `<g class="rise"><text x="${X}" y="96" class="display" font-size="22" letter-spacing="-.02em" fill="${t.ink}">Ali Chavoshi</text>` +
      `<rect x="${X + 150}" y="88" width="22" height="2" fill="${t.accent}"/>` +
      `<text x="${X + 186}" y="96" font-size="17" fill="${t.ink3}">Software Architect &amp; ASP.NET Core Instructor</text></g>` +
      `<g class="rise" style="animation-delay:.12s"><text x="${X}" y="178" class="display" font-size="52" fill="${t.ink}">Turning complex systems</text>` +
      `<text x="${X}" y="238" class="display" font-size="52" fill="${t.ink}">into reliable software</text></g>` +
      `<g class="rise" style="animation-delay:.3s">${typed.replace(/<clipPath[\s\S]*?<\/clipPath>/g, "")}</g>` +
      `<g class="rise" style="animation-delay:.45s"><text x="${X}" y="370" class="type" style="font-size:14px;fill:${t.ink3}">alichavoshi.github.io/MyResume</text></g>`;
   return svg(W, H, body, style);
}

/* ==========================================================================
   STATS strip
   ========================================================================== */
function stats(t) {
   const W = 1200, H = 136;
   const cells = [
      ["9+", "Years of experience"],
      ["2,213+", "Students taught"],
      ["177h", "Hours of course content"],
      ["15+", "Enterprise projects"],
      ["4.4", "Average course rating", "star"],
      ["Best Instructor", "Daneshjooyar, 2021", "award"],
   ];
   const cw = W / cells.length;
   let body = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="20" fill="${t.surface}" stroke="${t.line}"/>`;
   cells.forEach(([value, label, kind], i) => {
      const x = i * cw + 28;
      if (i) body += `<path d="M${f(i * cw)} 24V${H - 24}" stroke="${t.line}"/>`;
      body += `<g class="cell" style="animation-delay:${(i * 0.08).toFixed(2)}s">`;
      if (kind === "award") {
         body += glyph("star", x + 9, 44, 18, t.accent) +
            `<text x="${x}" y="84" font-size="21" font-weight="700" fill="${t.accent}">${esc(value)}</text>`;
      } else {
         body += `<text x="${x}" y="72" class="mono" font-size="40" font-weight="600" letter-spacing="-2" fill="${t.ink}">${esc(value)}</text>`;
         if (kind === "star") body += glyph("star", x + 80, 58, 22, t.accent);
      }
      body += `<rect x="${x}" y="${kind === "award" ? 94 : 86}" width="26" height="2" fill="${t.accent}" class="bar" style="animation-delay:${(0.4 + i * 0.08).toFixed(2)}s"/>`;
      body += `<text x="${x}" y="${kind === "award" ? 116 : 110}" font-size="14" fill="${t.ink3}">${esc(label)}</text></g>`;
   });
   const style = `.cell{animation:up .8s cubic-bezier(.16,1,.3,1) both}.bar{transform-box:fill-box;transform-origin:left;animation:grow .9s cubic-bezier(.16,1,.3,1) both}` +
      `@keyframes up{from{opacity:0;transform:translateY(12px)}}@keyframes grow{from{transform:scaleX(0)}}`;
   return svg(W, H, body, style);
}

/* ==========================================================================
   TECH STACK: layers, with Architecture as a cross-cutting column
   ========================================================================== */
function stack(t) {
   const W = 1200, H = 452;
   const layers = [
      ["Frontend", ["Angular", "TypeScript", "RxJS", "Angular Material", "Ionic", "Bootstrap"]],
      ["Backend", ["C#", "ASP.NET Core", "Web API", "ASP.NET Core MVC", "Entity Framework Core"]],
      ["Messaging &|distributed systems", ["RabbitMQ", "gRPC", "Identity Server", "Ocelot", "Nginx"]],
      ["Data", ["SQL Server", "PostgreSQL", "MongoDB", "Redis"]],
      ["DevOps", ["Docker", "Kubernetes", "GitHub Actions", "Azure", "Git"]],
   ];
   const RH = 72, GAP = 12, Y0 = 22, X0 = 72, XW = 820;
   let body = "";
   // rail
   body += `<path d="M36 ${Y0 + 20}V${Y0 + 5 * RH + 4 * GAP - 20}" stroke="${t.lineStrong}"/>` +
      `<defs><linearGradient id="comet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity="0"/><stop offset=".5" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient></defs>` +
      `<rect x="35" y="${Y0}" width="2" height="90" fill="url(#comet)"><animateTransform attributeName="transform" type="translate" values="0 -40;0 ${5 * RH + 4 * GAP - 50}" dur="3.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".65 0 .35 1"/></rect>`;
   layers.forEach(([name, chips], i) => {
      const y = Y0 + i * (RH + GAP);
      body += `<g class="row" style="animation-delay:${(i * 0.08).toFixed(2)}s">`;
      body += `<rect x="31" y="${y + RH / 2 - 5}" width="10" height="10" rx="3" fill="${t.surface}" stroke="${t.accentLine}"/>`;
      body += `<rect x="${X0}" y="${y}" width="${XW}" height="${RH}" rx="16" fill="${t.surface}" stroke="${t.line}"/>`;
      const lines = name.split("|");
      lines.forEach((ln, j) => {
         const ty = y + RH / 2 + 6 - (lines.length - 1) * 10 + j * 20;
         body += `<text x="${X0 + 24}" y="${ty}" font-size="16" font-weight="600" fill="${t.ink}">${esc(ln)}</text>`;
      });
      let cx = X0 + 200;
      chips.forEach((c) => {
         const w = Math.round(c.length * 7.4 + 26);
         body += `<rect x="${cx}" y="${y + RH / 2 - 16}" width="${w}" height="32" rx="16" fill="${t.surface2}" stroke="${t.line}"/>` +
            `<text x="${cx + w / 2}" y="${y + RH / 2 + 4.5}" text-anchor="middle" class="mono" font-size="12.5" fill="${t.ink2}">${esc(c)}</text>`;
         cx += w + 8;
      });
      body += "</g>";
   });
   // cross-cutting architecture column
   const CX = 912, CW = 264, CHt = 5 * RH + 4 * GAP;
   body += `<g class="row" style="animation-delay:.45s"><rect x="${CX}" y="${Y0}" width="${CW}" height="${CHt}" rx="16" fill="${t.accentSoft}" stroke="${t.accentLine}" stroke-dasharray="6 5" class="dash"/>` +
      `<text x="${CX + 24}" y="${Y0 + 40}" font-size="16" font-weight="600" fill="${t.ink}">Architecture</text>` +
      `<text x="${CX + 24}" y="${Y0 + 62}" font-size="13" fill="${t.ink3}">Applied across every layer</text>`;
   ["Clean Architecture", "CQRS", "Microservices", "Design Patterns", "SOLID"].forEach((c, i) => {
      const y = Y0 + 86 + i * 58;
      body += `<rect x="${CX + 20}" y="${y}" width="${CW - 40}" height="44" rx="12" fill="${t.surface}" stroke="${t.line}"/>` +
         `<text x="${CX + 38}" y="${y + 27}" class="mono" font-size="13.5" fill="${t.ink}">${esc(c)}</text>`;
   });
   body += "</g>";
   // no fade-in here: browsers pause animations in off-screen images, so content must never start hidden
   const style = `.dash{animation:dash 1.6s linear infinite}@keyframes dash{to{stroke-dashoffset:-22}}`;
   return svg(W, H, body, style);
}

/* ==========================================================================
   FEATURED WORK cards (560 x 330)
   ========================================================================== */
function card(t, { title, meta, status, desc, tags, art }) {
   const W = 560, H = 330;
   let body = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="20" fill="${t.surface}" stroke="${t.line}"/>` +
      `<text x="28" y="46" font-size="19" font-weight="650" fill="${t.ink}">${esc(title)}</text>` +
      `<text x="28" y="70" class="mono" font-size="12.5" fill="${t.ink3}">${esc(meta)}</text>`;
   const live = status === "In progress";
   const sw = Math.round(status.length * 6.9 + 34);
   body += `<rect x="${W - 28 - sw}" y="28" width="${sw}" height="26" rx="13" fill="none" stroke="${live ? t.accentLine : t.line}"/>` +
      `<circle cx="${W - 28 - sw + 14}" cy="41" r="3.5" fill="${live ? t.accent : t.ink3}">${live ? `<animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/>` : ""}</circle>` +
      `<text x="${W - 28 - sw + 24}" y="45.5" font-size="12" font-weight="500" fill="${live ? t.accent : t.ink2}">${esc(status)}</text>`;
   body += art;
   desc.forEach((d, i) => (body += `<text x="28" y="${250 + i * 21}" font-size="14" fill="${t.ink2}">${esc(d)}</text>`));
   let tx = 28;
   tags.forEach((g) => {
      const w = Math.round(g.length * 7.3 + 22);
      body += `<rect x="${tx}" y="${H - 44}" width="${w}" height="24" rx="12" fill="${t.surface2}" stroke="${t.line}"/>` +
         `<text x="${tx + w / 2}" y="${H - 27.5}" text-anchor="middle" class="mono" font-size="12" fill="${t.ink2}">${esc(g)}</text>`;
      tx += w + 8;
   });
   return svg(W, H, body);
}

function artTraceability(t) {
   const xs = [78, 179, 280, 381, 482], Y = 140;
   const names = ["Production", "Barcode", "QC", "Warehouse", "Shipment"];
   const icons = ["factory", "barcode", "shield", "tablet", "truck"];
   let a = `<path d="M78 ${Y}H482" stroke="${t.lineStrong}" stroke-dasharray="5 5"/>`;
   // three items a third of a cycle apart; dwell at each station
   const kp = "0;0;.25;.25;.5;.5;.75;.75;1;1", kt = "0;.08;.18;.28;.38;.48;.58;.68;.78;1";
   [0, -2.667, -5.333].forEach((b) => {
      a += `<rect x="-5" y="-5" width="10" height="10" rx="2.5" fill="${t.accent}" opacity="0">` +
         `<animateMotion path="M78 ${Y}H482" dur="8s" begin="${b}s" repeatCount="indefinite" keyPoints="${kp}" keyTimes="${kt}" calcMode="linear"/>` +
         `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.04;.82;.9;1" dur="8s" begin="${b}s" repeatCount="indefinite"/></rect>`;
   });
   // one duplicate barcode every other cycle, rejected at validation
   a += `<rect x="-5" y="-5" width="10" height="10" rx="2.5" fill="${t.accent}" opacity="0">` +
      `<animateMotion path="M78 ${Y}H179V${Y + 30}" dur="16s" begin="1.33s" repeatCount="indefinite" keyPoints="0;0;.77;.77;1;1" keyTimes="0;.04;.1;.14;.2;1" calcMode="linear"/>` +
      `<animate attributeName="fill" values="${t.accent};${t.danger}" keyTimes="0;.105" dur="16s" begin="1.33s" repeatCount="indefinite" calcMode="discrete"/>` +
      `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.15;.2;1" dur="16s" begin="1.33s" repeatCount="indefinite"/></rect>`;
   a += `<text x="179" y="100" text-anchor="middle" class="mono" font-size="11" fill="${t.danger}" opacity="0">duplicate blocked` +
      `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.1;.11;.2;.22;1" dur="16s" begin="1.33s" repeatCount="indefinite"/></text>`;
   // stations light up while an item is inside (period = 8s / 3 items)
   const busy = [0, 1.44, 0.373, 1.973, 1.573];
   xs.forEach((x, i) => {
      a += `<rect x="${x - 20}" y="${Y - 20}" width="40" height="40" rx="11" fill="${t.surface2}" stroke="${t.lineStrong}">` +
         `<animate attributeName="stroke" values="${t.accent};${t.lineStrong}" keyTimes="0;.3" dur="2.667s" begin="${busy[i]}s" repeatCount="indefinite" calcMode="discrete"/></rect>` +
         glyph(icons[i], x, Y, 18, t.ink2) +
         `<text x="${x}" y="${Y + 40}" text-anchor="middle" font-size="12" fill="${t.ink3}">${names[i]}</text>`;
   });
   return a;
}

// press strikes once a second while the line runs, and rests during the Andon stop
const PRESS = (() => {
   const v = [], k = [];
   for (let s = 0; s <= 10; s += 0.5) {
      const running = s < 5 || s >= 8;
      v.push(running && s % 1 === 0.5 && s < 10 ? "0 12" : "0 0");
      k.push((s / 10).toFixed(3));
   }
   return { values: v.join(";"), times: k.join(";") };
})();

function artAndon(t) {
   const xs = [91, 217, 343, 469], Y = 150;
   // 10s shift: runs 0-5s, Andon stop 5-8s, runs 8-10s. Belt moves 42px/s.
   let a = `<defs><clipPath id="belt"><rect x="91" y="${Y - 8}" width="378" height="16"/></clipPath></defs>` +
      `<path d="M91 ${Y}H469" stroke="${t.lineStrong}"/><g clip-path="url(#belt)"><g>`;
   for (let x = 91 - 294 - 42; x < 469; x += 42) a += `<rect x="${x}" y="${Y - 5}" width="10" height="10" rx="2" fill="${t.accent}"/>`;
   a += `<animateTransform attributeName="transform" type="translate" values="0 0;210 0;210 0;294 0" keyTimes="0;.5;.8;1" dur="10s" repeatCount="indefinite"/></g></g>`;
   const labels = ["Mold life", "Training video", "Andon", "Waste"];
   xs.forEach((x, i) => {
      const andon = i === 2;
      a += `<circle cx="${x}" cy="${Y - 38}" r="5" fill="${t.accent}">` +
         (andon
            ? `<animate attributeName="fill" values="${t.accent};${t.danger};${t.accent}" keyTimes="0;.5;.8" dur="10s" repeatCount="indefinite" calcMode="discrete"/>` +
            `<animate attributeName="opacity" values="1;.35;1;.35;1;.35;1" keyTimes="0;.55;.6;.65;.7;.75;.8" dur="10s" repeatCount="indefinite" calcMode="discrete"/>`
            : `<animate attributeName="fill" values="${t.accent};${t.ink3};${t.accent}" keyTimes="0;.5;.8" dur="10s" repeatCount="indefinite" calcMode="discrete"/>`) +
         `</circle>`;
      a += `<rect x="${x - 28}" y="${Y - 20}" width="56" height="40" rx="11" fill="${t.surface2}" stroke="${t.lineStrong}">` +
         (andon ? `<animate attributeName="stroke" values="${t.lineStrong};${t.danger};${t.lineStrong}" keyTimes="0;.5;.8" dur="10s" repeatCount="indefinite" calcMode="discrete"/>` : "") + `</rect>`;
      if (i === 0) {
         a += `<rect x="${x - 12}" y="${Y - 14}" width="24" height="8" rx="2" fill="${t.ink3}"><animateTransform attributeName="transform" type="translate" values="${PRESS.values}" keyTimes="${PRESS.times}" dur="10s" repeatCount="indefinite"/></rect>` +
            `<rect x="${x - 15}" y="${Y + 8}" width="30" height="5" rx="2" fill="${t.lineStrong}"/>`;
      } else if (i === 1) {
         a += `<path d="M${x - 4} ${Y - 7}l10 7-10 7z" fill="${t.accent}"/><rect x="0" y="${Y + 12}" width="40" height="3" rx="1.5" fill="${t.accent}" transform="translate(${x - 20} 0)"><animateTransform attributeName="transform" type="scale" values="0 1;1 1" dur="6s" repeatCount="indefinite" additive="sum"/></rect>`;
      } else if (i === 2) {
         a += `<g transform="translate(${x} ${Y})"><circle r="8" fill="none" stroke="${t.ink2}" stroke-width="4" stroke-dasharray="3.2 2.3">` +
            `<animateTransform attributeName="transform" type="rotate" values="0;180;180;252" keyTimes="0;.5;.8;1" dur="10s" repeatCount="indefinite"/></circle><circle r="3" fill="${t.ink2}"/></g>`;
      } else {
         a += glyph("bin", x, Y, 20, t.ink2);
      }
      a += `<text x="${x}" y="${Y + 40}" text-anchor="middle" font-size="12" fill="${t.ink3}">${labels[i]}</text>`;
   });
   // SMS alert while the line is stopped
   a += `<g opacity="0"><rect x="382" y="86" width="150" height="26" rx="9" fill="${t.dangerSoft}" stroke="${t.danger}" stroke-opacity=".5"/>` +
      `<text x="394" y="103.5" class="mono" font-size="11" fill="${t.danger}">SMS · station 3 stop</text>` +
      `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.54;.56;.84;.86;1" dur="10s" repeatCount="indefinite"/></g>`;
   return a;
}

function artErp(t) {
   const cx = 176, cy = 152, R = 54;
   const nodes = [["commerce", -90, "Commerce"], ["box", -18, "Warehouse"], ["factory", 54, "Production"], ["bag", 126, "Store"], ["people", 198, "CRM"]];
   const pt = (deg, r) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
   const ring = `M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx} ${cy + R}A${R} ${R} 0 1 1 ${cx} ${cy - R}`;
   let a = `<path d="${ring}" fill="none" stroke="${t.lineStrong}" stroke-dasharray="3 5"/>`;
   nodes.forEach(([, deg]) => {
      const [x0, y0] = pt(deg, 22), [x1, y1] = pt(deg, R - 13);
      a += `<path d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}" stroke="${t.lineStrong}"/>`;
   });
   a += `<circle cx="${cx}" cy="${cy}" r="22" fill="${t.accentSoft}" stroke="${t.accent}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${t.accent}"><animate attributeName="r" values="22;32" dur="1s" begin=".95s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="1s" begin=".95s" repeatCount="indefinite"/></circle>` +
      `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="${t.ink}">ERP</text>`;
   const busy = [0, 2, 4, 1, 3];
   nodes.forEach(([icon, deg, label], i) => {
      const [x, y] = pt(deg, R);
      a += `<circle cx="${f(x)}" cy="${f(y)}" r="13" fill="${t.surface2}" stroke="${t.lineStrong}">` +
         `<animate attributeName="stroke" values="${t.accent};${t.lineStrong}" keyTimes="0;.2" dur="5s" begin="${busy[i]}s" repeatCount="indefinite" calcMode="discrete"/></circle>` +
         glyph(icon, x, y, 13, t.ink2);
      const [lx, ly] = pt(deg, R + 22);
      const anchor = Math.cos((deg * Math.PI) / 180) > 0.2 ? "start" : Math.cos((deg * Math.PI) / 180) < -0.2 ? "end" : "middle";
      const dy = deg === -90 ? -2 : 4;
      a += `<text x="${f(deg === -90 ? x + 20 : lx)}" y="${f(deg === -90 ? y + 4 : ly + dy)}" text-anchor="${deg === -90 ? "start" : anchor}" font-size="11.5" fill="${t.ink3}">${label}</text>`;
      // data captured by the module travels to the core
      const [sx, sy] = pt(deg, R - 13), [ex, ey] = pt(deg, 22);
      a += `<circle r="2.6" fill="${t.accent}" opacity="0"><animateMotion path="M${f(sx)} ${f(sy)}L${f(ex)} ${f(ey)}" dur="5s" begin="${busy[i] + 0.2}s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.14;1" calcMode="linear"/>` +
         `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.13;.16;1" dur="5s" begin="${busy[i] + 0.2}s" repeatCount="indefinite"/></circle>`;
   });
   // two batches travel the supply chain; raw material becomes goods in production
   const kp = "0;0;.2;.2;.4;.4;.6;.6;.8;.8;.8", kt = "0;.1;.2;.3;.4;.5;.6;.7;.8;.9;1";
   [0, -5].forEach((b) => {
      a += `<g opacity="0"><rect x="-5" y="-5" width="10" height="10" rx="2" fill="${t.ink2}"><animate attributeName="opacity" values="1;0" keyTimes="0;.45" dur="10s" begin="${b}s" repeatCount="indefinite" calcMode="discrete"/></rect>` +
         `<circle r="5.5" fill="${t.accent}" stroke="${t.surface}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;1" keyTimes="0;.45" dur="10s" begin="${b}s" repeatCount="indefinite" calcMode="discrete"/></circle>` +
         `<animateMotion path="${ring}" dur="10s" begin="${b}s" repeatCount="indefinite" keyPoints="${kp}" keyTimes="${kt}" calcMode="linear"/>` +
         `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.03;.88;.92;1" dur="10s" begin="${b}s" repeatCount="indefinite"/></g>`;
   });
   // delivered apps stay in sync with the core
   ["Shop panel", "Admin panel", "Company website"].forEach((app, i) => {
      const y = 104 + i * 36;
      a += `<rect x="340" y="${y}" width="192" height="28" rx="9" fill="${t.surface2}" stroke="${t.line}"/>` +
         `<circle cx="356" cy="${y + 14}" r="4" fill="${t.accent}"><animate attributeName="r" values="4;6;4" dur="2s" begin="${1 + i * 0.3}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.5;1" dur="2s" begin="${1 + i * 0.3}s" repeatCount="indefinite"/></circle>` +
         `<text x="370" y="${y + 18.5}" font-size="13" font-weight="500" fill="${t.ink}">${app}</text>`;
   });
   a += `<path d="M${cx + 22} ${cy}H330" stroke="${t.accentLine}" stroke-dasharray="3 4"/>`;
   return a;
}

function artRemote(t) {
   const A = [96, 168], B = [464, 150];
   const arc = `M${A[0]} ${A[1]}Q280 70 ${B[0]} ${B[1]}`;
   let a = `<path d="${arc}" fill="none" stroke="${t.lineStrong}" stroke-dasharray="4 5"/>`;
   [[A, "Kashan, Iran"], [B, "Insanustu, Turkey"]].forEach(([p, label]) => {
      a += `<circle cx="${p[0]}" cy="${p[1]}" r="20" fill="${t.surface2}" stroke="${t.lineStrong}"/>` + glyph("pin", p[0], p[1], 18, t.accent) +
         `<text x="${p[0]}" y="${p[1] + 38}" text-anchor="middle" font-size="12" fill="${t.ink3}">${label}</text>`;
   });
   a += `<rect x="226" y="128" width="108" height="48" rx="12" fill="${t.accentSoft}" stroke="${t.accent}"/>` +
      `<text x="280" y="149" text-anchor="middle" font-size="13" font-weight="600" fill="${t.ink}">Angular</text>` +
      `<text x="280" y="166" text-anchor="middle" class="mono" font-size="10.5" fill="${t.ink3}">production apps</text>`;
   [[0, false], [1.8, true]].forEach(([b, back]) => {
      a += `<circle r="4" fill="${t.accent}" opacity="0"><animateMotion path="${arc}" dur="3.6s" begin="${b}s" repeatCount="indefinite" ${back ? 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ""}/>` +
         `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.9;1" dur="3.6s" begin="${b}s" repeatCount="indefinite"/></circle>`;
   });
   return a;
}

/* ==========================================================================
   Ecommerce-Microservice architecture with live requests
   ========================================================================== */
function ecommerce(t) {
   const W = 760, H = 420;
   const node = (x, y, label, sub, kind) => {
      const rx = kind === "db" ? 20 : 10;
      const w = kind === "broker" ? 66 : 116, h = kind === "broker" ? 28 : 40;
      return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${kind === "broker" ? 8 : rx}" fill="${kind === "db" || kind === "broker" ? t.surface : t.surface2}" stroke="${kind === "client" || kind === "gw" ? t.accent : t.lineStrong}"${kind === "broker" ? ' stroke-dasharray="3 3"' : ""}/>` +
         `<text x="${x}" y="${sub ? y - 2 : y + 4.5}" text-anchor="middle" class="mono" font-size="${kind === "broker" ? 10.5 : 12.5}" font-weight="500" fill="${t.ink}">${label}</text>` +
         (sub ? `<text x="${x}" y="${y + 12}" text-anchor="middle" class="mono" font-size="10" fill="${t.ink3}">${sub}</text>` : "");
   };
   const e = (d, extra = "") => `<path d="${d}" fill="none" stroke="${t.lineStrong}" stroke-width="1.5" ${extra}/>`;
   let body = `<defs>${gridPattern(t, "g", 20)}</defs><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="${t.surface}" stroke="${t.line}"/>` +
      `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18" fill="url(#g)"/>` +
      `<rect x="160" y="18" width="584" height="382" rx="18" fill="${t.accentSoft}" fill-opacity=".5" stroke="${t.accentLine}" stroke-dasharray="5 6"/>` +
      `<text x="178" y="388" class="mono" font-size="11" fill="${t.ink3}">Kubernetes cluster</text>` +
      e("M128 200H167") + e("M225 180V90") + e("M283 200H320V60H412") + e("M283 200H320V150H412") + e("M283 200H320V340H412") +
      e("M528 60H602") + e("M528 150H602") + e("M528 245H602") + e("M528 340H602") +
      e("M470 170V225", 'stroke-dasharray="5 4"') + e("M528 162H565V276", 'stroke-dasharray="2 4"') + e("M565 304V328H528", 'stroke-dasharray="2 4"') +
      `<text x="478" y="202" class="mono" font-size="11" fill="${t.ink3}">gRPC</text><text x="572" y="192" class="mono" font-size="11" fill="${t.ink3}">AMQP</text>` +
      node(70, 200, "Angular", "client", "client") + node(225, 200, "Ocelot", "API gateway", "gw") + node(225, 70, "Identity Server") +
      node(470, 60, "Catalog.API") + node(470, 150, "Basket.API") + node(470, 245, "Discount.API") + node(470, 340, "Ordering.API") +
      node(565, 290, "RabbitMQ", null, "broker") +
      node(660, 60, "MongoDB", null, "db") + node(660, 150, "Redis", null, "db") + node(660, 245, "PostgreSQL", null, "db") + node(660, 340, "SQL Server", null, "db");
   const packet = (d, dur, begin, kind) => {
      const shape = kind === "event" ? `<rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="${t.accent}"/>` : `<circle r="5" fill="${t.accent}" stroke="${t.surface}" stroke-width="2"/>`;
      return `<g opacity="0"><circle r="11" fill="${t.accent}" opacity=".2"/>${shape}<animateMotion path="${d}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
         `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.05;.93;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></g>`;
   };
   body += packet("M70 200H225H320V60H470H660H470H320V200H70", 6.4, 0.3);
   body += packet("M70 200H225V70V200H70", 3.6, 2.2);
   body += packet("M470 150V245H660H470V150", 4.2, 3.4);
   body += packet("M470 162H565V328H470V340H660", 4.6, 1.1, "event");
   return svg(W, H, body);
}

/* ==========================================================================
   Link buttons
   ========================================================================== */
function button(t, label, icon, primary) {
   const h = 40, w = Math.round(label.length * 8.1 + 70);
   const fill = primary ? t.accent : t.btn, stroke = primary ? t.accent : t.btnLine, ink = primary ? t.onAccent : t.ink;
   return svg(w, h,
      `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${h / 2}" fill="${fill}" stroke="${stroke}"/>` +
      glyph(icon, 26, h / 2, 17, primary ? ink : t.accent) +
      `<text x="44" y="${h / 2 + 5}" font-size="14.5" font-weight="600" fill="${ink}">${esc(label)}</text>`);
}

/* ==========================================================================
   Build
   ========================================================================== */
const CARDS = {
   traceability: (t) => ({
      title: "Traceability & Quality Control", meta: "Since 2018 · production to shipment", status: "In progress",
      desc: ["Tracks every product from the line to shipment, blocks duplicate", "barcodes, logs QC tests and runs a tablet warehouse dashboard."],
      tags: ["Traceability", "Barcode validation", "QC monitoring"], art: artTraceability(t),
   }),
   andon: (t) => ({
      title: "Line Monitoring & Andon", meta: "Iskra Auto Electric Iran · since 2018", status: "In progress",
      desc: ["Output, downtime and waste in real time, Andon stops with SMS", "alerts, FMEA, mold-life tracking and operator performance."],
      tags: ["Andon", "FMEA", "Production analytics"], art: artAndon(t),
   }),
   erp: (t) => ({
      title: "Custom ERP, Mehrad Kavir Steel", meta: "Freelance · mehradkavir.com", status: "In progress",
      desc: ["Production planning, warehousing, commerce, store and CRM in", "one platform, with a shop panel, admin panel and website."],
      tags: ["ERP", "Supply chain", "Full-stack"], art: artErp(t),
   }),
   remote: (t) => ({
      title: "Insanustu, Turkey", meta: "2022-2023 · remote freelance", status: "Completed",
      desc: ["A year improving code quality, frontend architecture and user", "experience across Insanustu's production Angular applications."],
      tags: ["Angular", "Remote", "Frontend architecture"], art: artRemote(t),
   }),
};

const BUTTONS = {
   portfolio: ["Portfolio & resume", "external", true],
   linkedin: ["LinkedIn", "linkedin"],
   email: ["Email", "mail"],
   telegram: ["Telegram", "send"],
   daneshjooyar: ["Daneshjooyar courses", "cap"],
};

(async () => {
for (const [name, t] of Object.entries(THEMES)) {
   write(`hero-${name}.svg`, hero(t));
   write(`stats-${name}.svg`, stats(t));
   write(`stack-${name}.svg`, stack(t));
   write(`ecommerce-${name}.svg`, ecommerce(t));
   for (const [key, make] of Object.entries(CARDS)) write(`work-${key}-${name}.svg`, card(t, make(t)));
   for (const [key, [label, icon, primary]] of Object.entries(BUTTONS)) write(`btn-${key}-${name}.svg`, button(t, label, icon, primary));
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) {
   const data = await fetchGitHub(process.env.GH_LOGIN || "aliChavoshi", token);
   for (const [name, t] of Object.entries(THEMES)) write(`activity-${name}.svg`, activity(t, data));
} else {
   console.log("No GITHUB_TOKEN: kept the existing activity graphics.");
}
})().catch((err) => {
   console.error(err.message);
   process.exit(1);
});
