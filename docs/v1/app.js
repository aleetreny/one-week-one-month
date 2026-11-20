/* One week of work, one month of waiting.
   A single canvas of 6,666 points (one per research task) that rearranges itself as you scroll.
   Grammar: cool white = hands-on work, amber = waiting. */
(async function () {
  "use strict";
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = await fetch("../data.json").then(r => r.json());
  const T = D.t, N = T.length;

  // ---------- per-task attributes ----------
  const hours = new Float32Array(N), days = new Float32Array(N), ai = new Float32Array(N),
        dec = new Uint8Array(N), qn = new Uint8Array(N), dom = new Uint8Array(N), band = new Uint8Array(N),
        ratio = new Float32Array(N);
  const R = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(N));   // per-particle random constants
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const t = T[i];
    hours[i] = t[0]; days[i] = t[1]; ai[i] = t[2]; dec[i] = t[3]; qn[i] = t[4]; dom[i] = t[5]; band[i] = t[6];
    ratio[i] = days[i] / (hours[i] / 24);
    for (const r of R) r[i] = rnd();
  }
  const [r1, r2, r3, r4, r5, r6] = R;
  const waitC = i => clamp(Math.log10(Math.max(ratio[i], 1)) / Math.log10(25), 0, 1);

  // rank within domain / decile
  const rankDom = new Int32Array(N), rankDec = new Int32Array(N), nDom = [0, 0, 0, 0, 0, 0], nDec = new Array(10).fill(0);
  for (let i = 0; i < N; i++) { rankDom[i] = nDom[dom[i]]++; rankDec[i] = nDec[dec[i]]++; }

  // calendar slots: left = best fifth (3 lit days), right = worst fifth (33 lit days); 6x6 points per day
  const PER = 36, LEFT_DAYS = 3, RIGHT_DAYS = 33;
  const slot = new Int32Array(N).fill(-1);
  {
    const best = [], worst = [], rest = [];
    for (let i = 0; i < N; i++) (band[i] && qn[i] === 4 ? best : band[i] && qn[i] === 0 ? worst : rest).push(i);
    const left = best.concat(rest.splice(0, LEFT_DAYS * PER - best.length));
    const right = worst.concat(rest.splice(0, RIGHT_DAYS * PER - worst.length));
    left.forEach((i, k) => slot[i] = k);
    right.forEach((i, k) => slot[i] = LEFT_DAYS * PER + k);
  }

  // verbs (median days of waiting, number of tasks) from the paper's verb table
  const VERBS = [["fit", .17, 91], ["calculate", .2, 70], ["process", .35, 47], ["measure", .45, 115], ["analyze", 1.87, 223],
    ["collect", 8.7, 167], ["design", 14.51, 519], ["conduct", 27.39, 183], ["obtain", 33.09, 109], ["coordinate", 78.47, 104], ["negotiate", 79.33, 45]];
  const verbOf = new Int16Array(N).fill(-1);
  { let k = 0; VERBS.forEach((v, j) => { for (let m = 0; m < v[2]; m++) verbOf[k++] = j; }); }
  const VERB_END = VERBS.reduce((s, v) => s + v[2], 0);

  // ---------- canvas ----------
  const cv = document.getElementById("stage"), ctx = cv.getContext("2d");
  let W, H, DPR, mob, B, FX, FY, FR;
  function geom() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = Math.max(innerWidth, 320); H = Math.max(innerHeight, 400);
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    mob = W < 820;
    B = mob ? { x0: 34, x1: W - 22, y0: H * 0.11, y1: H * 0.47 }
            : { x0: W * 0.45, x1: W * 0.92, y0: H * 0.17, y1: H * 0.83 };
    B.w = B.x1 - B.x0; B.h = B.y1 - B.y0;
    FX = mob ? W / 2 : W * 0.68; FY = mob ? H * 0.3 : H * 0.5;
    FR = mob ? Math.min(W * 0.4, H * 0.2) : Math.min(W * 0.22, H * 0.34);
  }

  const mk = () => ({ x: new Float32Array(N), y: new Float32Array(N), c: new Float32Array(N), a: new Float32Array(N), s: new Float32Array(N) });
  const LA = mk(), LB = mk(), T1 = mk(), T2 = mk();

  // ---------- helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const TAU = Math.PI * 2;
  function put(L, i, x, y, c, a, s) { L.x[i] = x; L.y[i] = y; L.c[i] = c; L.a[i] = a; L.s[i] = s; }
  function dust(L, i) { put(L, i, r1[i] * W, r2[i] * H, 0, .05 + .07 * r3[i], 1); }
  let tDir = 1;
  function mixInto(out, A, Bl, k, spread = .45, wild = 1) {
    const cx = W / 2, cy = H / 2, amp = Math.min(W, H) * .22 * wild;
    for (let i = 0; i < N; i++) {
      const ki = ease(clamp((k - r4[i] * spread) / (1 - spread), 0, 1)), m = Math.sin(Math.PI * ki);
      const mx = A.x[i] + (Bl.x[i] - A.x[i]) * ki - cx, my = A.y[i] + (Bl.y[i] - A.y[i]) * ki - cy;
      // vortex around the centre of the screen, blown outwards, plus a turbulent kick
      const sp = m * wild * tDir * (.7 + r5[i] * 1.6), cs = Math.cos(sp), sn = Math.sin(sp), bl = 1 + m * wild * (.15 + r6[i] * .55);
      const th = r6[i] * TAU + now * .9 + mx * .004, kick = m * amp * (r5[i] - .3);
      out.x[i] = cx + (mx * cs - my * sn) * bl + Math.cos(th) * kick;
      out.y[i] = cy + (mx * sn + my * cs) * bl + Math.sin(th) * kick;
      out.c[i] = lerp(A.c[i], Bl.c[i], ki); out.a[i] = Math.min(1, lerp(A.a[i], Bl.a[i], ki) + m * wild * .35);
      out.s[i] = lerp(A.s[i], Bl.s[i], ki) * (1 + m * wild * 1.1);
    }
  }

  // clock phases advance with time
  let phA = 0.6, phB = 2.2, now = 0;

  // ---------- layouts ----------
  function clock(L, cx, cy, Rr, aA, aB, handWait = 1) {
    for (let i = 0; i < N; i++) {
      const f = i / N; let ang, rr, c = 0, a, s = 1.25, px = 0;
      if (f < .5) { ang = r1[i] * TAU; rr = Rr * (1 + (r2[i] - .5) * .045); a = .22 + .45 * r3[i]; }
      else if (f < .62) { const tk = i % 60, maj = tk % 5 === 0; ang = tk / 60 * TAU; rr = Rr * (.935 - r2[i] * (maj ? .1 : .04)); px = (r3[i] - .5) * (maj ? 2.4 : 1.2); a = maj ? .95 : .55; s = 1.3; }
      else if (f < .72) { ang = aA; rr = r1[i] * Rr * .8; px = (r2[i] - .5) * 2.2 * (1 - r1[i] * .6); a = .95; s = 1.5; }
      else if (f < .8) { ang = aB; rr = r1[i] * Rr * .56; px = (r2[i] - .5) * 3.6 * (1 - r1[i] * .5); a = .95; s = 1.8; c = handWait; }
      else { ang = r1[i] * TAU; rr = Rr * (1.08 + r2[i] * r2[i] * 1.6); a = .03 + .09 * (1 - r2[i]); s = 1; }
      const sx = Math.sin(ang), cy_ = Math.cos(ang);
      put(L, i, cx + sx * rr + cy_ * px, cy - cy_ * rr + sx * px, c, a, s);
    }
  }
  function heroLayout(L) { const Rr = mob ? Math.min(W * .44, H * .3) : Math.min(W, H) * .4; clock(L, W / 2, H / 2, Rr, phA, phB); for (let i = 0; i < N; i++) L.a[i] *= .55; }
  function speedLayout(L) { clock(L, FX, FY, FR * 1.05, phA, phB); }

  // waffle of tasks by domain
  const DOM_SHORT = ["Formal", "Physical", "Life", "Health", "Social", "Humanities"];
  let gridGeo = null;
  function gridCalc() {
    const gapU = 3; gridGeo = null; let sp = Math.sqrt(B.w * B.h / N);
    for (let it = 0; it < 80; it++) {
      const rows = Math.floor(B.h / sp), cols = nDom.reduce((s, n) => s + Math.ceil(n / rows), 0);
      if (cols * sp + 5 * gapU * sp <= B.w) { gridGeo = { sp, rows, gap: gapU * sp }; break; }
      sp *= .97;
    }
    if (!gridGeo) gridGeo = { sp, rows: Math.max(1, Math.floor(B.h / sp)), gap: 3 * sp };
    const g = gridGeo; let x = 0; g.off = []; g.w = [];
    nDom.forEach(n => { const c = Math.ceil(n / g.rows); g.off.push(x); g.w.push(c * g.sp); x += c * g.sp + g.gap; });
    g.total = x - g.gap; g.x0 = B.x0 + (B.w - g.total) / 2; g.y1 = B.y0 + (B.h + g.rows * g.sp) / 2;
  }
  function gridLayout(L) {
    const g = gridGeo;
    for (let i = 0; i < N; i++) {
      const d = dom[i], k = rankDom[i], col = Math.floor(k / g.rows), row = k % g.rows;
      put(L, i, g.x0 + g.off[d] + col * g.sp + g.sp / 2, g.y1 - row * g.sp - g.sp / 2, 0, .5 + .45 * r3[i], Math.max(1, g.sp * .55));
    }
  }

  // scatter: hours of work vs calendar days (log-log)
  const SX = [-0.2, 3.15], SY = [-1.6, 2.75];
  const sx = v => B.x0 + (v - SX[0]) / (SX[1] - SX[0]) * B.w, sy = v => B.y1 - (v - SY[0]) / (SY[1] - SY[0]) * B.h;
  function scatterLayout(L, hl = 0) {
    const ps = mob ? 1.15 : 1.5;
    for (let i = 0; i < N; i++) {
      const x = sx(Math.log10(hours[i])) + (r5[i] - .5) * 2, y = sy(Math.log10(days[i])) + (r6[i] - .5) * 2;
      let a = .72, s = ps;
      if (hl) { if (band[i]) { a = lerp(a, 1, hl); s = lerp(ps, ps * 1.6, hl); } else a = lerp(a, .07, hl); }
      put(L, i, x, y, waitC(i), a, s);
    }
  }

  // calendars
  let calGeo = null;
  function calCalc() {
    const gap = B.w * (mob ? .08 : .1), gw = (B.w - gap) / 2, cell = Math.min(gw / 7, (B.h * (mob ? .62 : .58)) / 5);
    const gh = cell * 5, y0 = B.y0 + (B.h - gh) / 2 + (mob ? 6 : 10);
    const gwr = cell * 7, xL = B.x0 + (B.w - (2 * gwr + gap)) / 2;
    calGeo = { cell, y0, xs: [xL, xL + gwr + gap], gwr };
  }
  function calLayout(L) {
    const g = calGeo, inset = g.cell * .16, sp = (g.cell - 2 * inset) / 6;
    for (let i = 0; i < N; i++) {
      const sl = slot[i];
      if (sl < 0) { dust(L, i); continue; }
      const right = sl >= LEFT_DAYS * PER, k = right ? sl - LEFT_DAYS * PER : sl, day = Math.floor(k / PER), m = k % PER;
      const gx = g.xs[right ? 1 : 0] + (day % 7) * g.cell, gy = g.y0 + Math.floor(day / 7) * g.cell;
      const c = day < 2 ? 0 : 1;
      put(L, i, gx + inset + (m % 6 + .5) * sp, gy + inset + (Math.floor(m / 6) + .5) * sp, c, c ? .95 : .9, Math.max(1.1, sp * .62));
    }
  }
  function weekLayout(L, p) {
    const hl = easeOut(clamp(p / .2, 0, 1));
    scatterLayout(T1, hl);
    const k = clamp((p - .26) / .26, 0, 1);
    if (k <= 0) { copyL(L, T1); return; }
    calLayout(T2); mixInto(L, T1, T2, k, .55, .55);
  }
  function copyL(D_, S) { D_.x.set(S.x); D_.y.set(S.y); D_.c.set(S.c); D_.a.set(S.a); D_.s.set(S.s); }

  // cloud: AI rating (best left) vs calendar days per day of work
  const CY = [-0.45, 2.1];
  const cyy = v => B.y1 - (clamp(v, CY[0], CY[1]) - CY[0]) / (CY[1] - CY[0]) * B.h;
  function cloudLayout(L) {
    const ps = mob ? 1.1 : 1.4;
    for (let i = 0; i < N; i++)
      put(L, i, B.x0 + (1 - ai[i]) * B.w, cyy(Math.log10(ratio[i])) + (r6[i] - .5) * 1.5, waitC(i), .62, ps);
  }

  // ten bars: calendar days per day of work, median by tenth of AI rating
  const DEC = D.deciles, DMAX = 8.2;
  function barGeo(d) {
    const col = 9 - d, cw = B.w / 10, bw = cw * .64, x = B.x0 + col * cw + (cw - bw) / 2, h = DEC[d] / DMAX * B.h;
    return { x, w: bw, h, top: B.y1 - h };
  }
  function barsLayout(L) {
    for (let i = 0; i < N; i++) {
      const d = dec[i], g = barGeo(d), n = nDec[d], cols = Math.max(2, Math.round(Math.sqrt(n * g.w / g.h))), rows = Math.ceil(n / cols);
      const k = rankDec[i], col = k % cols, row = Math.floor(k / cols), fy = (row + .5) / rows;
      put(L, i, g.x + (col + .5) * g.w / cols, B.y1 - fy * g.h, fy * DEC[d] < 1 ? 0 : 1, .88, mob ? 1.15 : 1.5);
    }
  }

  // verbs on a log axis of waiting
  const VX = [Math.log10(1 / 24), 2.05];
  const vx = d => B.x0 + (Math.log10(d) - VX[0]) / (VX[1] - VX[0]) * B.w;
  const VY = () => B.y0 + B.h * .5;
  function verbLayout(L) {
    const y0 = VY();
    for (let i = 0; i < N; i++) {
      const j = verbOf[i];
      if (j >= 0) {
        const v = VERBS[j], rad = 3 + Math.sqrt(v[2]) * (mob ? .55 : .85);
        const g = Math.sqrt(-2 * Math.log(r1[i] + 1e-6)) * .5, th = r2[i] * TAU;
        const x = vx(v[1]) + Math.cos(th) * g * rad, f = (x - B.x0) / B.w;
        put(L, i, x, y0 + Math.sin(th) * g * rad, clamp(f * 1.25 - .15, 0, 1), .9, mob ? 1.2 : 1.5);
      } else if (i < VERB_END + 900) {
        const f = r1[i]; put(L, i, B.x0 + f * B.w, y0 + (r2[i] - .5) * 1.6, clamp(f * 1.25 - .15, 0, 1), .5, 1.1);
      } else dust(L, i);
    }
  }

  // hourglass; sand runs with scroll
  let sandF = 0;
  function glassLayout(L, p) {
    const f = clamp((p - .12) / .72, 0, 1); sandF = f;
    const Hh = mob ? H * .38 : H * .7, hh = Hh / 2, hw = Hh * .3, nw = 3, cx = FX, cy = FY;
    const halfw = d => nw + (hw - nw) * d / hh;
    const S = 2700, G = 1100, D0 = hh * .8, Dm = hh - 4;
    for (let i = 0; i < N; i++) {
      if (i < S) {
        const u = i / S, xb = (r2[i] - .5) * 2 * .9;
        const dTop = D0 * Math.sqrt(1 - u), topX = cx + xb * halfw(dTop), topY = cy - dTop - 2;
        const e = Math.sqrt(Math.max(Dm * Dm - D0 * D0 * u, 0)), botX = cx + xb * halfw(e), botY = cy + e;
        const g = clamp((f - u) / .045, 0, 1);
        let x, y;
        if (g <= 0) { x = topX; y = topY; }
        else if (g >= 1) { x = botX; y = botY; }
        else if (g < .3) { const t = g / .3; x = lerp(topX, cx, t); y = lerp(topY, cy, t * t); }
        else { const t = (g - .3) / .7; x = lerp(cx + (r3[i] - .5) * 2, botX, t * t); y = lerp(cy, botY, t * t); }
        put(L, i, x, y, 1, .92, mob ? 1.15 : 1.45);
      } else if (i < S + G) {
        const u = r1[i] * 6; let x0, y0, x1, y1, t = u % 1; const seg = Math.floor(u);
        const top = cy - hh, bot = cy + hh;
        if (seg === 0) { x0 = cx - hw; y0 = top; x1 = cx - nw; y1 = cy; }
        else if (seg === 1) { x0 = cx + hw; y0 = top; x1 = cx + nw; y1 = cy; }
        else if (seg === 2) { x0 = cx - nw; y0 = cy; x1 = cx - hw; y1 = bot; }
        else if (seg === 3) { x0 = cx + nw; y0 = cy; x1 = cx + hw; y1 = bot; }
        else { const yy = seg === 4 ? top - 6 : bot + 6; x0 = cx - hw * 1.18; x1 = cx + hw * 1.18; y0 = y1 = yy; }
        const out = seg < 4 ? (seg % 2 ? 1 : -1) * 4 : 0;
        put(L, i, lerp(x0, x1, t) + out + (r2[i] - .5) * 1.5, lerp(y0, y1, t) + (r3[i] - .5) * 1.5, 0, .25 + .35 * r4[i], 1.1);
      } else dust(L, i);
    }
  }

  // closing: a small fast clock of work, a big slow clock of waiting
  function closeLayout(L) {
    const r0 = FR * (mob ? .42 : .36), R1 = FR * (mob ? .82 : .78);
    const c0x = mob ? W * .26 : FX - FR * .82, c1x = mob ? W * .64 : FX + FR * .5, y = FY - (mob ? 0 : FR * .08);
    const aA = phA * 3.5;
    for (let i = 0; i < N; i++) {
      const f = i / N; let cx, cy = y, ang, rr, c, a, s = 1.3, px = 0;
      if (f < .2) { cx = c0x; ang = r1[i] * TAU; rr = r0 * (1 + (r2[i] - .5) * .06); c = 0; a = .3 + .5 * r3[i]; }
      else if (f < .25) { cx = c0x; ang = aA; rr = r1[i] * r0 * .82; px = (r2[i] - .5) * 2; c = 0; a = .95; s = 1.5; }
      else if (f < .64) { cx = c1x; ang = r1[i] * TAU; rr = R1 * (1 + (r2[i] - .5) * .04); c = 1; a = .25 + .5 * r3[i]; }
      else if (f < .7) { cx = c1x; const tk = i % 60, maj = tk % 5 === 0; ang = tk / 60 * TAU; rr = R1 * (.93 - r2[i] * (maj ? .09 : .035)); c = 1; a = maj ? .9 : .5; }
      else if (f < .76) { cx = c1x; ang = phB; rr = r1[i] * R1 * .7; px = (r2[i] - .5) * 3.4; c = 1; a = .95; s = 1.7; }
      else { dust(L, i); continue; }
      const sn = Math.sin(ang), cs = Math.cos(ang);
      put(L, i, cx + sn * rr + cs * px, cy - cs * rr + sn * px, c, a, s);
    }
  }

  const SCENES = [
    { lay: (L) => heroLayout(L) },
    { lay: (L) => speedLayout(L), ov: ovSpeed },
    { lay: (L) => gridLayout(L), ov: ovGrid },
    { lay: (L) => scatterLayout(L), ov: ovScatter },
    { lay: (L, p) => weekLayout(L, p), ov: ovWeek },
    { lay: (L) => cloudLayout(L), ov: ovCloud },
    { lay: (L) => barsLayout(L), ov: ovBars },
    { lay: (L) => verbLayout(L), ov: ovVerbs },
    { lay: (L, p) => glassLayout(L, p), ov: ovGlass },
    { lay: (L) => closeLayout(L), ov: ovClose },
  ];

  // ---------- overlays (axes, labels) ----------
  const MUTED = "160,166,178", TXT = "236,234,229", AMB = "242,166,59", WRK = "226,232,244";
  const sans = (px, w = 400) => `${w} ${px}px "Bricolage Grotesque", sans-serif`;
  const serif = (px, it = false) => `${it ? 700 : 500} ${px}px "Bricolage Grotesque", sans-serif`;
  function txt(s, x, y, font, rgb, a, align = "left", base = "alphabetic") { ctx.font = font; ctx.fillStyle = `rgba(${rgb},${a})`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y); }
  function line(x0, y0, x1, y1, rgb, a, w = 1, dash) { ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); }
  const fs = mob ? 10.5 : 12;

  function ovSpeed(a) {
    const s = mob ? 34 : 64;
    txt("2×", FX + FR * 1.05 * .58, FY - FR * 1.05 * .62, serif(s, true), WRK, a * .9, "left");
    txt("faster work, they say", FX + FR * 1.05 * .58, FY - FR * 1.05 * .62 + fs + 8, sans(fs), MUTED, a * .8, "left", "top");
  }
  function ovGrid(a) {
    const g = gridGeo;
    nDom.forEach((n, d) => {
      const x = g.x0 + g.off[d];
      txt(DOM_SHORT[d], x, g.y1 + 18, sans(fs, 500), TXT, a * .85, "left", "top");
      if (!mob || g.w[d] > 38) txt(n.toLocaleString("en-US"), x, g.y1 + 18 + fs + 5, sans(fs), MUTED, a * .8, "left", "top");
    });
  }
  function axesScatter(a) {
    line(B.x0, B.y1 + 8, B.x1, B.y1 + 8, MUTED, a * .35);
    line(B.x0 - 8, B.y0, B.x0 - 8, B.y1, MUTED, a * .35);
    [[0, "1 h"], [1, "10 h"], [2, "100 h"], [3, "1,000 h"]].forEach(([v, s]) => txt(s, sx(v), B.y1 + 14, sans(fs), MUTED, a, "center", "top"));
    [[Math.log10(1 / 24), "1 hour"], [0, "1 day"], [Math.log10(7), "1 week"], [Math.log10(30), "1 month"], [Math.log10(365), "1 year"]]
      .forEach(([v, s]) => { txt(s, B.x0 - 14, sy(v), sans(fs), MUTED, a, "right", "middle"); line(B.x0 - 8, sy(v), B.x1, sy(v), MUTED, a * .07); });
    txt("hours of hands-on work →", B.x1, B.y1 + 16 + fs + 8, sans(fs, 500), TXT, a * .8, "right", "top");
    txt("↑ days on the calendar", B.x0 - 8, B.y0 - 16, sans(fs, 500), TXT, a * .8, "left", "bottom");
    // the "no waiting" line: days = hours / 24
    const x0 = SX[0], x1 = SX[1], off = Math.log10(24);
    line(sx(x0), sy(x0 - off), sx(x1), sy(x1 - off), WRK, a * .55, 1, [4, 5]);
    const lx = sx(2.35); txt("no waiting", lx + 6, sy(2.35 - off) + 4, serif(mob ? 15 : 19, true), WRK, a * .9, "left", "top");
  }
  function ovScatter(a) {
    axesScatter(a);
    const x = sx(1.5), yTop = sy(2.2);
    if (!mob) txt("waiting", x, yTop, serif(22, true), AMB, a * .9, "center", "bottom");
  }
  function ovWeek(a, p) {
    const hl = clamp(p / .2, 0, 1), k = clamp((p - .26) / .26, 0, 1);
    const aSc = a * (1 - k);
    if (aSc > .01) {
      axesScatter(aSc);
      const xa = sx(Math.log10(42)), xb = sx(Math.log10(56));
      ctx.fillStyle = `rgba(${WRK},${aSc * hl * .06})`; ctx.fillRect(xa - 3, B.y0, xb - xa + 6, B.h);
      txt("≈ one week of work", (xa + xb) / 2, B.y0 - 6, serif(mob ? 15 : 19, true), WRK, aSc * hl, "center", "bottom");
    }
    const ac = a * clamp((p - .4) / .14, 0, 1);
    if (ac < .01) return;
    const g = calGeo, DOW = ["M", "T", "W", "T", "F", "S", "S"];
    const nov = d => d < 29 ? [`${d + 2}`] : [`${d - 28}`];
    [0, 1].forEach(side => {
      const x0 = g.xs[side];
      for (let d = 0; d < 35; d++) {
        const cx = x0 + (d % 7) * g.cell, cy = g.y0 + Math.floor(d / 7) * g.cell;
        ctx.strokeStyle = `rgba(${MUTED},${ac * .16})`; ctx.lineWidth = 1; ctx.strokeRect(cx + .5, cy + .5, g.cell - 1, g.cell - 1);
        const lit = d < (side ? RIGHT_DAYS : LEFT_DAYS);
        if (!lit && g.cell > 22) txt(nov(d)[0], cx + 4, cy + 4, sans(Math.min(10, g.cell * .3)), MUTED, ac * .45, "left", "top");
      }
      if (g.cell > 18) DOW.forEach((s, j) => txt(s, x0 + (j + .5) * g.cell, g.y0 - 8, sans(fs - 1), MUTED, ac * .6, "center", "bottom"));
      const head = side ? "AI rated among the worst" : "AI rated among the best";
      txt(head, x0, g.y0 - (g.cell > 18 ? 26 + fs : 10), sans(fs, 600), TXT, ac * .9, "left", "bottom");
      const ny = g.y0 + 5 * g.cell + 14;
      const big = mob ? 30 : 46;
      txt(side ? "33 days" : "3 days", x0, ny, serif(big), side ? AMB : WRK, ac, "left", "top");
      txt(side ? "Mon 2 Nov → Fri 4 Dec" : "Mon 2 Nov → Wed 4 Nov", x0, ny + big + 4, sans(fs), MUTED, ac * .85, "left", "top");
    });
  }
  function ovCloud(a) {
    line(B.x0, B.y1 + 8, B.x1, B.y1 + 8, MUTED, a * .35);
    txt("AI does it best", B.x0, B.y1 + 16, sans(fs, 500), TXT, a * .8, "left", "top");
    txt("AI does it worst", B.x1, B.y1 + 16, sans(fs, 500), TXT, a * .8, "right", "top");
    [[0, "1 day"], [Math.log10(3), "3"], [1, "10"], [Math.log10(30), "30"], [2, "100"]].forEach(([v, s]) => {
      txt(s, B.x0 - 12, cyy(v), sans(fs), MUTED, a, "right", "middle"); line(B.x0 - 6, cyy(v), B.x1, cyy(v), MUTED, a * (v === 0 ? .35 : .07), 1, v === 0 ? [4, 5] : null);
    });
    txt("↑ calendar days per day of work", B.x0 - 6, B.y0 - 16, sans(fs, 500), TXT, a * .8, "left", "bottom");
    // decile medians
    ctx.strokeStyle = `rgba(${AMB},${a * .9})`; ctx.lineWidth = 2; ctx.beginPath();
    DEC.forEach((v, d) => { const x = B.x0 + (1 - (d + .5) / 10) * B.w, y = cyy(Math.log10(v)); d ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    DEC.forEach((v, d) => { const x = B.x0 + (1 - (d + .5) / 10) * B.w, y = cyy(Math.log10(v)); ctx.fillStyle = `rgba(${AMB},${a})`; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill(); });
    txt("median", B.x0 + .95 * B.w - 12, cyy(Math.log10(DEC[0])) - 4, serif(mob ? 15 : 18, true), AMB, a * .9, "right", "bottom");
  }
  function ovBars(a) {
    line(B.x0, B.y1 + 6, B.x1, B.y1 + 6, MUTED, a * .35);
    const y1 = B.y1 - 1 / DMAX * B.h;
    line(B.x0, y1, B.x1, y1, WRK, a * .5, 1, [4, 5]);
    txt(mob ? "1 day" : "one day of work", B.x0 - 10, y1, serif(mob ? 13 : 18, true), WRK, a * .85, "right", "middle");
    DEC.forEach((v, d) => {
      const g = barGeo(d), lab = v.toFixed(1), ext = d === 0 || d === 9;
      txt(lab, g.x + g.w / 2, g.top - 8, ext ? serif(mob ? 22 : 34) : sans(fs), d === 0 ? AMB : ext ? WRK : MUTED, a * (ext ? 1 : .8), "center", "bottom");
    });
    txt("Best tenth for AI", B.x0, B.y1 + 14, sans(fs, 500), TXT, a * .8, "left", "top");
    txt("Worst tenth", B.x1, B.y1 + 14, sans(fs, 500), TXT, a * .8, "right", "top");
    if (!mob) txt("calendar days per day of hands-on work, median", B.x0, B.y0 - 30, sans(fs, 500), TXT, a * .8, "left", "bottom");
  }
  function ovVerbs(a) {
    const y0 = VY();
    [[1 / 24, "1 hour"], [1, "1 day"], [7, "1 week"], [30, "1 month"], [91, "3 months"]].forEach(([d, s]) => {
      const x = vx(d); line(x, y0 - 6, x, y0 + 6, MUTED, a * .6); txt(s, x, B.y1 + 4, sans(fs), MUTED, a * .9, "center", "top");
      line(x, y0 + 10, x, B.y1, MUTED, a * .08);
    });
    txt("typical waiting, by the task's first verb →", B.x1, B.y1 + 10 + fs + 10, sans(fs, 500), TXT, a * .8, "right", "top");
    const tiers = mob ? [-.42, .3, -.27, .44] : [-.36, .26, -.2, .4];
    VERBS.forEach((v, j) => {
      const x = vx(v[1]), f = clamp(((x - B.x0) / B.w) * 1.25 - .15, 0, 1), dy = tiers[j % 4] * B.h * .5 * 1.6;
      const rgb = f > .5 ? AMB : WRK, size = (mob ? 14 : 19) + f * (mob ? 6 : 12);
      line(x, y0 + Math.sign(dy) * 14, x, y0 + dy - Math.sign(dy) * (size * .2), rgb, a * .25);
      txt(v[0], x, y0 + dy, serif(size, true), rgb, a, "center", dy < 0 ? "bottom" : "top");
    });
  }
  function ovGlass(a) {
    const Hh = mob ? H * .38 : H * .7, hw = Hh * .3, x = mob ? FX + hw + 26 : FX + hw + 48;
    const n = Math.max(1, Math.round(sandF * 50));
    txt(`day ${n}`, x, FY - 6, serif(mob ? 30 : 52, true), AMB, a * clamp(sandF * 6, 0, 1), "left", "bottom");
    txt(mob ? "of 50" : "of 50 working days", x, FY + 4, sans(fs), MUTED, a * clamp(sandF * 6, 0, 1), "left", "top");
  }
  function ovClose(a) {
    const r0 = FR * (mob ? .42 : .36), R1 = FR * (mob ? .82 : .78), FYc = FY - (mob ? 0 : FR * .08);
    const c0x = mob ? W * .26 : FX - FR * .82, c1x = mob ? W * .64 : FX + FR * .5;
    txt("work", c0x, FYc + r0 + 22, serif(mob ? 18 : 24, true), WRK, a, "center", "top");
    txt("AI speeds this up", c0x, FYc + r0 + 22 + (mob ? 22 : 30), sans(fs), MUTED, a * .85, "center", "top");
    txt("waiting", c1x, FYc + R1 + 22, serif(mob ? 18 : 24, true), AMB, a, "center", "top");
    txt("this sets the pace", c1x, FYc + R1 + 22 + (mob ? 22 : 30), sans(fs), MUTED, a * .85, "center", "top");
  }

  // ---------- rendering ----------
  const NC = 18, NA = 6, NB = NC * NA;
  const COL = [];
  for (let k = 0; k < NC; k++) {
    const t = k / (NC - 1), w = [226, 232, 244], m = [236, 204, 160], b = [242, 166, 59];
    const c = t < .5 ? w.map((v, j) => Math.round(lerp(v, m[j], t * 2))) : m.map((v, j) => Math.round(lerp(v, b[j], (t - .5) * 2)));
    COL.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  const bucketCount = new Int32Array(NB), bucketStart = new Int32Array(NB), order = new Int32Array(N), bk = new Int32Array(N);
  const OUT = mk();

  function render(Lr, globalA, motion) {
    if (motion > .02 && !RM) { ctx.globalAlpha = 1; ctx.fillStyle = `rgba(10,12,16,${lerp(1, .14, motion)})`; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (!RM && motion > 0) { ctx.translate(W / 2, H / 2); ctx.rotate(.09 * motion * tDir); ctx.scale(1 + .14 * motion, 1 + .14 * motion); ctx.translate(-W / 2, -H / 2); }
    bucketCount.fill(0);
    for (let i = 0; i < N; i++) {
      const a = Lr.a[i] * globalA; if (a < .012) { bk[i] = -1; continue; }
      const b = Math.min(NC - 1, Math.round(Lr.c[i] * (NC - 1))) * NA + Math.min(NA - 1, Math.floor(a * NA));
      bk[i] = b; bucketCount[b]++;
    }
    let acc = 0; for (let b = 0; b < NB; b++) { bucketStart[b] = acc; acc += bucketCount[b]; }
    const fill = bucketStart.slice();
    for (let i = 0; i < N; i++) if (bk[i] >= 0) order[fill[bk[i]]++] = i;
    const jig = RM ? 0 : 1;
    // glow pass for waiting
    for (let b = 0; b < NB; b++) {
      const cIdx = Math.floor(b / NA); if (cIdx < NC * .55 || !bucketCount[b]) continue;
      ctx.globalAlpha = ((b % NA) + .5) / NA * .07; ctx.fillStyle = COL[cIdx]; ctx.beginPath();
      for (let k = bucketStart[b], e = k + bucketCount[b]; k < e; k++) { const i = order[k], s = Lr.s[i] * 3.4; ctx.rect(Lr.x[i] - s / 2, Lr.y[i] - s / 2, s, s); }
      ctx.fill();
    }
    for (let b = 0; b < NB; b++) {
      if (!bucketCount[b]) continue;
      ctx.globalAlpha = ((b % NA) + .5) / NA; ctx.fillStyle = COL[Math.floor(b / NA)]; ctx.beginPath();
      for (let k = bucketStart[b], e = k + bucketCount[b]; k < e; k++) {
        const i = order[k], s = Lr.s[i];
        const x = Lr.x[i] + jig * Math.sin(now * .7 + r1[i] * 40) * .45, y = Lr.y[i] + jig * Math.cos(now * .6 + r2[i] * 40) * .45;
        ctx.rect(x - s / 2, y - s / 2, s, s);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  // ---------- scroll state ----------
  const secs = [...document.querySelectorAll(".scene")];
  const notes = document.getElementById("notes");
  let tops = [], hs = [], notesTop = 0;
  function measure() {
    tops = secs.map(s => s.offsetTop); hs = secs.map(s => s.offsetHeight - innerHeight);
    notesTop = notes.offsetTop;
  }

  // split beats into words for scroll-linked reveals
  function splitWords(el) {
    const walk = node => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) {
          const parts = ch.textContent.split(/(\s+)/), frag = document.createDocumentFragment();
          parts.forEach(p => { if (!p) return; if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(p)); else { const s = document.createElement("span"); s.className = "w"; s.textContent = p; frag.appendChild(s); } });
          ch.replaceWith(frag);
        } else if (ch.nodeType === 1 && !ch.classList.contains("num")) walk(ch);
        else if (ch.nodeType === 1) ch.classList.add("w");
      });
    };
    walk(el);
  }
  const beats = secs.map(s => [...s.querySelectorAll(".beat")].map(el => { splitWords(el); return { el, at: +el.dataset.at, w: [...el.querySelectorAll(".w")], num: el.querySelector("[data-count]") }; }));

  // every word gets its own flight path
  beats.forEach(list => list.forEach(b => b.w.forEach(w => { w._dx = (rnd() - .5) * 5; w._dy = (rnd() - .2) * 3.2; w._r = (rnd() - .5) * 70; })));
  function updateText(si, p) {
    beats.forEach((list, s) => {
      if (Math.abs(s - si) > 1) return;
      const pp = s < si ? 1 : s > si ? -1 : p;
      const ex = s < si ? 1 : s > si ? 0 : clamp((p - .86) / .12, 0, 1), exE = ex * ex;
      list.forEach((b, j) => {
        const lp = clamp((pp - b.at) / .12, 0, 1), n = b.w.length;
        b.w.forEach((w, k) => {
          const t = easeOut(clamp(lp * 1.7 - k / Math.max(n, 1) * .7, 0, 1)), u = 1 - t;
          const dx = w._dx * u - w._dx * exE * 2.5, dy = w._dy * u - Math.abs(w._dy) * exE * 2 - exE * 1.5, r = w._r * u - w._r * exE * 1.5;
          w.style.opacity = t * (1 - exE);
          w.style.transform = RM ? "none" : `translate(${dx}em,${dy}em) rotate(${r}deg) scale(${.55 + .45 * t + exE * .4})`;
          const bl = u * 8 + exE * 10; w.style.filter = bl < .05 ? "none" : `blur(${bl}px)`;
        });
        const nxt = list[j + 1]; b.el.classList.toggle("past", !!nxt && pp > nxt.at + .04 && !b.el.classList.contains("note") && !b.el.classList.contains("keep"));
        if (b.num) b.num.textContent = Math.round(+b.num.dataset.count * easeOut(clamp((pp - b.at) / .22, 0, 1))).toLocaleString("en-US");
      });
    });
  }

  // hero title: split into letters that blow apart as you leave
  const heroChars = [];
  document.querySelectorAll(".title .l1, .title .l2").forEach(line => {
    const walk = node => [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        [...ch.textContent].forEach(c => { if (c === " ") { frag.appendChild(document.createTextNode(" ")); return; } const sp = document.createElement("span"); sp.className = "ch"; sp.textContent = c; sp._dx = (rnd() - .5) * 2; sp._dy = (rnd() - .5) * 2; sp._r = (rnd() - .5) * 540; sp._z = rnd(); heroChars.push(sp); frag.appendChild(sp); });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    });
    walk(line);
  });
  const heroBits = [...document.querySelectorAll(".hero .kicker, .hero .dek, .hero .cue")];
  let lastHero = -1;
  function updateHero(y) {
    const e = clamp(y / (innerHeight * .9), 0, 1); if (Math.abs(e - lastHero) < .001) return; lastHero = e;
    const ee = e * e;
    heroChars.forEach(c => {
      c.style.transform = RM ? "none" : `translate(${c._dx * ee * 70}vw, ${c._dy * ee * 60 - ee * 10}vh) rotate(${c._r * ee}deg) scale(${1 + (c._z - .3) * ee * 3})`;
      c.style.opacity = 1 - clamp(ee * 1.4 - c._z * .3, 0, 1);
    });
    heroBits.forEach(b => { b.style.opacity = 1 - clamp(e * 2.2, 0, 1); });
  }

  // copy column leans with scroll speed
  const inners = [...document.querySelectorAll(".copy .inner")];
  let skewV = 0;

  // HUD
  const chapter = document.getElementById("chapter"), bar = document.getElementById("bar"), rail = document.getElementById("rail");
  secs.forEach((s, i) => { const b = document.createElement("button"); b.innerHTML = "<i></i>"; b.title = s.dataset.name; b.setAttribute("aria-label", s.dataset.name); b.onclick = () => go(tops[i] + (i ? innerHeight * .2 : 0)); rail.appendChild(b); });
  const railBtns = [...rail.children];
  let lastChapter = -1;
  function hud(si, y) {
    if (si !== lastChapter) {
      lastChapter = si; chapter.innerHTML = `${String(si + 1).padStart(2, "0")} &nbsp;${secs[si].dataset.name}`;
      railBtns.forEach((b, i) => b.classList.toggle("on", i === si));
    }
    bar.style.transform = `scaleX(${clamp(y / (document.documentElement.scrollHeight - innerHeight), 0, 1)})`;
  }

  // ---------- smooth scroll ----------
  let lenis = null;
  if (!RM && window.Lenis) {
    lenis = new Lenis({ lerp: .085, wheelMultiplier: .9, smoothWheel: true });
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener("click", e => { const t = document.querySelector(a.getAttribute("href")); if (t) { e.preventDefault(); lenis.scrollTo(t, { duration: 2.2 }); } }));
  }
  function go(y) { lenis ? lenis.scrollTo(y, { duration: 2.4 }) : scrollTo({ top: y, behavior: RM ? "auto" : "smooth" }); }

  // ---------- main loop ----------
  function setup() { geom(); gridCalc(); calCalc(); measure(); }
  setup();
  addEventListener("resize", () => { setup(); });
  const t0 = performance.now(); let last = t0;
  const DUST = mk(); // intro starts from scattered dust
  for (let i = 0; i < N; i++) put(DUST, i, W / 2 + (r1[i] - .5) * W * 1.4, H / 2 + (r2[i] - .5) * H * 1.4, r3[i] > .8 ? 1 : 0, 0, 1);

  function frame(ts) {
    if (lenis) lenis.raf(ts);
    const dt = Math.min(.05, (ts - last) / 1000); last = ts; now = (ts - t0) / 1000;
    const y = lenis ? lenis.scroll : scrollY, vh = innerHeight;

    // active scene: switches half a screen before its top
    let si = 0; for (let i = 0; i < secs.length; i++) if (y >= tops[i] - vh * .5) si = i;
    const p = clamp((y - tops[si]) / Math.max(hs[si], 1), 0, 1);
    const k = si === 0 ? 1 : clamp((y - tops[si] + vh * .5) / (vh * .85), 0, 1);

    const speedW = si === 1 ? k : si === 2 ? 1 - k : 0;
    phA += dt * (RM ? 0 : .32 * (1 + speedW * 1.2));
    phB += dt * (RM ? 0 : .02);

    tDir = si % 2 ? 1 : -1;
    if (si > 0 && k < 1) { SCENES[si - 1].lay(LA, 1); SCENES[si].lay(LB, p); mixInto(OUT, LA, LB, k, .5, 1); }
    else SCENES[si].lay(OUT, p);

    // intro: gather from dust
    const ik = RM ? 1 : clamp((now - .2) / 2.6, 0, 1);
    if (ik < 1) { copyL(LA, OUT); mixInto(OUT, DUST, LA, ik, .6, .8); }

    const fade = clamp(1 - (y + vh - notesTop - vh * .35) / (vh * .6), .12, 1);
    let motion = si > 0 && k < 1 ? Math.sin(Math.PI * k) : 0;
    if (ik < 1) motion = Math.max(motion, Math.sin(Math.PI * ik) * .8);
    render(OUT, fade, motion);

    // overlays
    if (si > 0 && SCENES[si - 1].ov && k < 1) SCENES[si - 1].ov((1 - k) * (1 - k) * fade, 1);
    if (SCENES[si].ov) SCENES[si].ov(clamp((k - .55) / .45, 0, 1) * fade, p);

    updateText(si, p);
    updateHero(y);
    if (!RM) {
      const v = lenis ? lenis.velocity : 0; skewV = lerp(skewV, clamp(v * .12, -7, 7), .12);
      if (Math.abs(skewV) > .01) inners.forEach(el => el.style.transform = `skewY(${skewV * .5}deg) translateY(${-skewV * 2}px)`);
    }
    hud(si, y);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (document.fonts) document.fonts.ready.then(measure);
})();
