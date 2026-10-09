import * as THREE from 'three';

let seed = 1337;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + (b - a) * rnd();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function grain(ctx, w, h, n, horizontal, light, dark) {
  for (let i = 0; i < n; i++) {
    const x = R(0, w), y = R(0, h), len = R(20, 160);
    ctx.strokeStyle = rnd() < 0.5 ? light : dark;
    ctx.lineWidth = R(0.5, 1.6);
    ctx.globalAlpha = R(0.05, 0.22);
    ctx.beginPath();
    if (horizontal) { ctx.moveTo(x, y); ctx.bezierCurveTo(x + len * .3, y + R(-2, 2), x + len * .6, y + R(-2, 2), x + len, y + R(-1.5, 1.5)); }
    else { ctx.moveTo(x, y); ctx.bezierCurveTo(x + R(-2, 2), y + len * .3, x + R(-2, 2), y + len * .6, x + R(-1.5, 1.5), y + len); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function blotches(ctx, w, h, n, color, amin, amax, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    const x = R(0, w), y = R(0, h), r = R(rmin, rmax);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', R(amin, amax).toFixed(3))); g.addColorStop(1, color.replace('A', '0'));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

// ---------------- Hull (u = s along length, v = (y+4)/11) ----------------
export function hullTextures(gunportS, windowS) {
  const W = 2048, H = 512;
  const [c, ctx] = canvas(W, H);
  const [e, ectx] = canvas(256, 64);
  const yPx = y => (1 - (y + 4) / 11) * H;
  ctx.fillStyle = rgb(52, 34, 23); ctx.fillRect(0, 0, W, H);
  // planks
  for (let y = -4; y < 7; y += 0.27) {
    const top = yPx(y + 0.27), bot = yPx(y);
    let x = -R(0, 300);
    while (x < W) {
      const len = R(170, 340);
      const k = R(0.78, 1.18);
      ctx.fillStyle = rgb(60 * k, 39 * k, 26 * k);
      ctx.fillRect(x, top, len, bot - top);
      ctx.fillStyle = rgb(18, 11, 7, 0.85); ctx.fillRect(x, top, 1.5, bot - top);
      // nails
      ctx.fillStyle = rgb(20, 16, 14, 0.7);
      ctx.fillRect(x + 4, top + 3, 1.6, 1.6); ctx.fillRect(x + 4, bot - 4, 1.6, 1.6);
      x += len;
    }
    ctx.fillStyle = rgb(14, 9, 6, 0.9); ctx.fillRect(0, top, W, 1.4);
  }
  grain(ctx, W, H, 9000, true, 'rgb(120,86,58)', 'rgb(20,12,8)');
  // below the waterline: dark red-brown anti-fouling with a black boot-top
  ctx.fillStyle = rgb(72, 30, 22, 0.78); ctx.fillRect(0, yPx(0.15), W, H - yPx(0.15));
  ctx.fillStyle = rgb(12, 10, 9, 0.92); ctx.fillRect(0, yPx(0.55), W, yPx(0.1) - yPx(0.55));
  // painted gunport strake (deep red) and an ochre band
  ctx.fillStyle = rgb(118, 28, 20, 0.82); ctx.fillRect(0, yPx(3.05), W, yPx(2.2) - yPx(3.05));
  ctx.fillStyle = rgb(170, 112, 40, 0.85); ctx.fillRect(0, yPx(3.42), W, yPx(3.22) - yPx(3.42));
  ctx.fillStyle = rgb(170, 112, 40, 0.8); ctx.fillRect(0, yPx(4.6), W * 0.27, yPx(4.45) - yPx(4.6));
  // re-cut plank seams across paint
  for (let y = -4; y < 7; y += 0.27) { ctx.fillStyle = rgb(14, 9, 6, 0.55); ctx.fillRect(0, yPx(y), W, 1.2); }
  // gunports
  for (const s of gunportS) {
    const x = s * W, w = 44, top = yPx(2.95), bot = yPx(2.3);
    ctx.fillStyle = rgb(150, 100, 38); ctx.fillRect(x - w / 2 - 4, top - 4, w + 8, bot - top + 8);
    ctx.fillStyle = rgb(8, 5, 4); ctx.fillRect(x - w / 2, top, w, bot - top);
    ctx.fillStyle = rgb(90, 18, 14); ctx.fillRect(x - w / 2 + 2, top + 2, w - 4, 4);
    // rust streaks below
    for (let k = 0; k < 6; k++) {
      const sx = x + R(-w / 2, w / 2); const g = ctx.createLinearGradient(sx, bot, sx, bot + R(20, 70));
      g.addColorStop(0, 'rgba(40,20,10,0.55)'); g.addColorStop(1, 'rgba(40,20,10,0)');
      ctx.fillStyle = g; ctx.fillRect(sx, bot, R(1, 3), 70);
    }
  }
  // quarter windows (also emissive)
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, 256, 64);
  for (const s of windowS) {
    const x = s * W, w = 34, top = yPx(3.95), bot = yPx(3.55);
    ctx.fillStyle = rgb(175, 120, 45); ctx.fillRect(x - w / 2 - 4, top - 4, w + 8, bot - top + 8);
    ctx.fillStyle = rgb(255, 170, 70); ctx.fillRect(x - w / 2, top, w, bot - top);
    ctx.fillStyle = rgb(60, 30, 15); ctx.fillRect(x - 1, top, 2, bot - top); ctx.fillRect(x - w / 2, (top + bot) / 2 - 1, w, 2);
  }
  // weathering
  blotches(ctx, W, H, 260, 'rgba(10,6,4,A)', 0.05, 0.22, 10, 60);
  blotches(ctx, W, H, 90, 'rgba(140,110,80,A)', 0.03, 0.09, 10, 50);
  const map = tex(c);
  // emissive mask: same layout, only windows lit
  const [em, emx] = canvas(W / 4, H / 4);
  emx.fillStyle = '#000'; emx.fillRect(0, 0, W / 4, H / 4);
  for (const s of windowS) {
    const x = s * W / 4, w = 34 / 4, top = yPx(3.95) / 4, bot = yPx(3.55) / 4;
    emx.fillStyle = rgb(255, 150, 60); emx.fillRect(x - w / 2, top, w, bot - top);
  }
  return { map, emissive: tex(em) };
}

// ---------------- Transom (u = (x+4.5)/9, v = (y+4)/11) ----------------
export function transomTextures() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H); const [e, ex] = canvas(W, H);
  const xPx = x => (x + 4.5) / 9 * W, yPx = y => (1 - (y + 4) / 11) * H;
  ctx.fillStyle = rgb(48, 30, 20); ctx.fillRect(0, 0, W, H);
  for (let y = -4; y < 7; y += 0.25) { const k = R(0.8, 1.15); ctx.fillStyle = rgb(56 * k, 36 * k, 24 * k); ctx.fillRect(0, yPx(y + 0.25), W, yPx(y) - yPx(y + 0.25)); ctx.fillStyle = 'rgba(10,6,4,.8)'; ctx.fillRect(0, yPx(y), W, 1); }
  grain(ctx, W, H, 2500, true, 'rgb(120,86,58)', 'rgb(20,12,8)');
  ctx.fillStyle = rgb(72, 30, 22, 0.8); ctx.fillRect(0, yPx(0.15), W, H);
  ctx.fillStyle = rgb(12, 10, 9); ctx.fillRect(0, yPx(0.55), W, yPx(0.1) - yPx(0.55));
  ctx.fillStyle = rgb(118, 28, 20, 0.85); ctx.fillRect(0, yPx(2.6), W, yPx(1.9) - yPx(2.6));
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  // gold frame bands
  const gold = (y0, y1) => { const g = ctx.createLinearGradient(0, yPx(y1), 0, yPx(y0)); g.addColorStop(0, '#f2c46a'); g.addColorStop(.5, '#a8701e'); g.addColorStop(1, '#5a3a10'); ctx.fillStyle = g; ctx.fillRect(0, yPx(y1), W, yPx(y0) - yPx(y1)); };
  gold(2.72, 2.88); gold(4.08, 4.25); gold(4.95, 5.08);
  // stern gallery windows
  const n = 6, x0 = -2.9, x1 = 2.9, ww = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = xPx(x0 + i * ww + 0.1), b = xPx(x0 + (i + 1) * ww - 0.1), t = yPx(3.95), bt = yPx(3.0);
    ctx.fillStyle = '#c99436'; ctx.fillRect(a - 3, t - 3, b - a + 6, bt - t + 6);
    const g = ctx.createLinearGradient(0, t, 0, bt); g.addColorStop(0, '#ffcf82'); g.addColorStop(1, '#ff8c2e');
    ctx.fillStyle = g; ctx.fillRect(a, t, b - a, bt - t);
    ex.fillStyle = g; ex.fillRect(a, t, b - a, bt - t);
    ctx.fillStyle = '#3a200c'; ex.fillStyle = '#000';
    for (let m = 1; m < 3; m++) { const xx = a + (b - a) * m / 3; ctx.fillRect(xx - 1.5, t, 3, bt - t); ex.fillRect(xx - 1.5, t, 3, bt - t); }
    for (let m = 1; m < 3; m++) { const yy = t + (bt - t) * m / 3; ctx.fillRect(a, yy - 1.5, b - a, 3); ex.fillRect(a, yy - 1.5, b - a, 3); }
    // pilaster between windows
    ctx.fillStyle = '#b07a26'; ctx.fillRect(b + 1, t - 6, xPx(x0 + (i + 1) * ww + 0.1) - b - 2, bt - t + 12);
  }
  // upper carved panel: deep blue with gold scrollwork and a crest
  ctx.fillStyle = rgb(18, 28, 60); ctx.fillRect(0, yPx(4.95), W, yPx(4.25) - yPx(4.95));
  ctx.strokeStyle = '#e0aa4a'; ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const cx = xPx(-4.2 + i * 0.62), cy = (yPx(4.95) + yPx(4.25)) / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 8, Math.PI * 0.2, Math.PI * 1.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 10, cy, 5, Math.PI * 1.2, Math.PI * 2.6); ctx.stroke();
  }
  const cx = xPx(0), cy = yPx(4.62);
  ctx.fillStyle = '#d9a040'; ctx.beginPath(); ctx.moveTo(cx - 26, cy - 20); ctx.lineTo(cx + 26, cy - 20); ctx.lineTo(cx + 22, cy + 6); ctx.quadraticCurveTo(cx, cy + 28, cx - 22, cy + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(120, 22, 18); ctx.beginPath(); ctx.moveTo(cx - 18, cy - 14); ctx.lineTo(cx + 18, cy - 14); ctx.lineTo(cx + 15, cy + 4); ctx.quadraticCurveTo(cx, cy + 20, cx - 15, cy + 4); ctx.closePath(); ctx.fill();
  blotches(ctx, W, H, 60, 'rgba(10,6,4,A)', 0.05, 0.2, 8, 40);
  return { map: tex(c), emissive: tex(e) };
}

// ---------------- Bulkhead (cabin front under the quarterdeck) ----------------
export function bulkheadTextures() {
  const W = 512, H = 256; const [c, ctx] = canvas(W, H); const [e, ex] = canvas(W, H);
  ctx.fillStyle = rgb(70, 44, 28); ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 22) { const k = R(.8, 1.2); ctx.fillStyle = rgb(78 * k, 50 * k, 32 * k); ctx.fillRect(x, 0, 22, H); ctx.fillStyle = 'rgba(15,8,5,.8)'; ctx.fillRect(x, 0, 1.5, H); }
  grain(ctx, W, H, 1500, false, 'rgb(130,92,60)', 'rgb(25,14,8)');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  const door = (x) => {
    ctx.fillStyle = '#a8742a'; ctx.fillRect(x - 40, 60, 80, 196);
    ctx.fillStyle = rgb(48, 26, 16); ctx.fillRect(x - 34, 66, 68, 190);
    ctx.fillStyle = rgb(36, 20, 12); ctx.fillRect(x - 28, 76, 56, 70); ctx.fillRect(x - 28, 160, 56, 86);
    ctx.fillStyle = '#e7b45a'; ctx.beginPath(); ctx.arc(x + 22, 165, 4, 0, 7); ctx.fill();
  };
  const win = (x) => {
    ctx.fillStyle = '#b07a26'; ctx.fillRect(x - 30, 70, 60, 60);
    const g = ctx.createLinearGradient(0, 74, 0, 126); g.addColorStop(0, '#ffd08a'); g.addColorStop(1, '#ff8a30');
    ctx.fillStyle = g; ctx.fillRect(x - 26, 74, 52, 52); ex.fillStyle = g; ex.fillRect(x - 26, 74, 52, 52);
    ctx.fillStyle = '#3a200c'; ex.fillStyle = '#000'; ctx.fillRect(x - 1.5, 74, 3, 52); ctx.fillRect(x - 26, 98, 52, 3); ex.fillRect(x - 1.5, 74, 3, 52); ex.fillRect(x - 26, 98, 52, 3);
  };
  door(160); door(352); win(70); win(256); win(442);
  ctx.fillStyle = '#c08a34'; ctx.fillRect(0, 0, W, 8); ctx.fillRect(0, 34, W, 4);
  blotches(ctx, W, H, 40, 'rgba(10,6,4,A)', 0.05, 0.2, 8, 40);
  return { map: tex(c), emissive: tex(e) };
}

// ---------------- Deck planks (repeat) ----------------
export function deckTexture() {
  const W = 512, H = 512; const [c, ctx] = canvas(W, H);
  ctx.fillStyle = rgb(128, 98, 70); ctx.fillRect(0, 0, W, H);
  const ph = 32;
  for (let y = 0; y < H; y += ph) {
    let x = -R(0, 200);
    while (x < W) {
      const len = R(220, 420), k = R(0.82, 1.12);
      ctx.fillStyle = rgb(132 * k, 102 * k, 74 * k); ctx.fillRect(x, y, len, ph);
      ctx.fillStyle = 'rgba(30,20,12,.9)'; ctx.fillRect(x, y, 2, ph);
      ctx.fillStyle = 'rgba(30,24,20,.8)'; ctx.fillRect(x + 6, y + 6, 2.5, 2.5); ctx.fillRect(x + 6, y + ph - 9, 2.5, 2.5);
      x += len;
    }
  }
  grain(ctx, W, H, 4000, true, 'rgb(190,160,120)', 'rgb(50,34,22)');
  for (let y = 0; y < H; y += ph) { ctx.fillStyle = 'rgba(22,15,9,.95)'; ctx.fillRect(0, y, W, 2.2); }
  blotches(ctx, W, H, 70, 'rgba(30,20,12,A)', 0.04, 0.16, 15, 60);
  blotches(ctx, W, H, 30, 'rgba(210,190,160,A)', 0.03, 0.08, 15, 60);
  return tex(c, { repeat: true });
}

// ---------------- Spar wood (repeat) ----------------
export function sparTexture() {
  const W = 128, H = 512; const [c, ctx] = canvas(W, H);
  ctx.fillStyle = rgb(92, 62, 38); ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 1400, false, 'rgb(150,110,70)', 'rgb(40,24,14)');
  blotches(ctx, W, H, 30, 'rgba(20,12,6,A)', 0.05, 0.2, 6, 30);
  return tex(c, { repeat: true });
}

// ---------------- Sail canvas ----------------
export function sailTexture() {
  const W = 512, H = 512; const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(232, 220, 196)); g.addColorStop(1, rgb(205, 186, 152));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // cloth panels
  for (let x = 0; x < W; x += 36) {
    ctx.fillStyle = `rgba(${rnd() < .5 ? '255,250,235' : '160,140,110'},${R(0.03, 0.09)})`; ctx.fillRect(x, 0, 36, H);
    ctx.fillStyle = 'rgba(120,100,72,.55)'; ctx.fillRect(x, 0, 1.5, H);
    ctx.fillStyle = 'rgba(120,100,72,.2)'; ctx.fillRect(x + 4, 0, 1, H);
  }
  // reef bands + reef points
  for (const y of [70, 130]) {
    ctx.fillStyle = 'rgba(150,128,96,.6)'; ctx.fillRect(0, y, W, 6);
    ctx.fillStyle = 'rgba(70,55,38,.8)'; for (let x = 10; x < W; x += 18) ctx.fillRect(x, y + 6, 2, 12);
  }
  // patches
  for (let i = 0; i < 7; i++) {
    const x = R(30, W - 90), y = R(160, H - 80), w = R(26, 60), h = R(26, 60);
    ctx.fillStyle = rnd() < .5 ? 'rgba(196,176,140,.85)' : 'rgba(236,226,204,.8)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(110,90,62,.7)'; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); ctx.setLineDash([]);
  }
  blotches(ctx, W, H, 50, 'rgba(110,86,52,A)', 0.04, 0.14, 15, 70);
  blotches(ctx, W, H, 20, 'rgba(70,58,40,A)', 0.05, 0.12, 5, 20);
  // bolt rope edges
  const e = ctx.createLinearGradient(0, 0, 14, 0); e.addColorStop(0, 'rgba(90,70,45,.8)'); e.addColorStop(1, 'rgba(90,70,45,0)');
  ctx.fillStyle = e; ctx.fillRect(0, 0, 14, H);
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.fillRect(0, 0, 14, H); ctx.restore();
  ctx.fillStyle = 'rgba(90,70,45,.7)'; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 8, W, 8);
  return tex(c);
}

// ---------------- Black flag (skull and crossbones, drawn as shapes) ----------------
export function flagTexture() {
  const W = 256, H = 160; const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#0b0a0a'; ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 30, 'rgba(60,50,45,A)', 0.05, 0.15, 10, 40);
  const bone = '#e6dcc4';
  ctx.fillStyle = bone; ctx.strokeStyle = bone; ctx.lineCap = 'round';
  const cx = W * 0.42, cy = H * 0.5;
  for (const a of [0.6, -0.6]) {
    ctx.save(); ctx.translate(cx, cy + 22); ctx.rotate(a);
    ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-58, 0); ctx.lineTo(58, 0); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 62, -6, 7, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(s * 62, 6, 7, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(cx, cy - 8, 30, 32, 0, 0, 7); ctx.fill();
  ctx.fillRect(cx - 17, cy + 14, 34, 18);
  ctx.fillStyle = '#0b0a0a';
  ctx.beginPath(); ctx.ellipse(cx - 12, cy - 6, 8, 10, 0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 12, cy - 6, 8, 10, -0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx - 4, cy + 12); ctx.lineTo(cx + 4, cy + 12); ctx.closePath(); ctx.fill();
  for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * 6 - 1, cy + 22, 2, 10);
  // frayed fly edge
  ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < H; y += 6) ctx.fillRect(W - R(0, 14), y, 20, R(2, 5));
  ctx.globalCompositeOperation = 'source-over';
  return tex(c);
}

export function gratingTexture() {
  const W = 128; const [c, ctx] = canvas(W, W);
  ctx.fillStyle = '#120b06'; ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = '#8a643f';
  for (let i = 0; i < W; i += 16) { ctx.fillRect(i, 0, 6, W); ctx.fillRect(0, i, W, 6); }
  grain(ctx, W, W, 200, true, 'rgb(170,130,90)', 'rgb(40,24,14)');
  return tex(c, { repeat: true });
}

export function softDot() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return tex(c, { srgb: false });
}
