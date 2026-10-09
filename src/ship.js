import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

// ---------------------------------------------------------------- hull math
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const LEN = 30, Z0 = 14;
export const zOf = s => Z0 - s * LEN;
export const sOf = z => (Z0 - z) / LEN;
export const beam = s => s < 0.45 ? 4.1 * (0.78 + 0.22 * Math.sin(s / 0.45 * Math.PI / 2))
  : 4.1 * Math.pow(Math.max(0, Math.cos((s - 0.45) / 0.55 * Math.PI / 2)), 0.75);
const depthOf = s => 3.1 - 0.9 * sstep(0.8, 1.0, s) - 0.5 * sstep(0.12, 0, s);
export const topOf = s => 3.6 + 1.2 * sstep(0.27, 0.1, s) + 1.4 * sstep(0.8, 0.97, s);
function vnOf(s, y) { const D = depthOf(s); return (y + D) / (D + 3.0); }
export function sectionX(s, y) {
  const vn = Math.max(0, vnOf(s, y));
  const f = vn < 0.62 ? Math.pow(Math.sin(vn / 0.62 * Math.PI / 2), 0.55) : 1 - 0.1 * Math.pow((vn - 0.62) / 0.6, 2);
  return beam(s) * f;
}
function rakeZ(s, y) {
  const vn = Math.max(0, vnOf(s, y));
  return -3.2 * Math.pow(s, 8) * Math.pow(vn, 1.6) + 1.4 * Math.pow(1 - s, 10) * Math.pow(vn, 1.3);
}
export function hullPt(s, y) { return new THREE.Vector3(sectionX(s, y), y, zOf(s) + rakeZ(s, y)); }

// ---------------------------------------------------------------- geometry helpers
const _o = new THREE.Object3D();
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _o.position.set(...p); _o.rotation.set(...r); _o.scale.set(...s); _o.updateMatrix();
  return geo.applyMatrix4(_o.matrix);
}
const up = new THREE.Vector3(0, 1, 0);
function cylBetween(a, b, r1, r2, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, d.normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g;
}
function lathe(profile, seg = 12) { return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), seg); }

// ---------------------------------------------------------------- the ship
export function buildShip(sunViewUniform) {
  const ship = new THREE.Group();
  const B = {}; // material buckets
  const flagSpots = [];
  const add = (k, g) => { (B[k] ||= []).push(g); };

  const gunportS = [0.33, 0.405, 0.48, 0.555, 0.63, 0.705];
  const windowS = [0.07, 0.15];
  const hullT = TX.hullTextures(gunportS, windowS);
  const transT = TX.transomTextures();
  const bulkT = TX.bulkheadTextures();
  const deckMap = TX.deckTexture(); deckMap.repeat.set(1, 1);
  const sparMap = TX.sparTexture();
  const sailMap = TX.sailTexture();

  const M = {
    hull: new THREE.MeshStandardMaterial({ map: hullT.map, bumpMap: hullT.map, bumpScale: 1.2, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide, emissiveMap: hullT.emissive, emissive: new THREE.Color(1.0, 0.55, 0.22), emissiveIntensity: 2.2 }),
    transom: new THREE.MeshStandardMaterial({ map: transT.map, bumpMap: transT.map, bumpScale: 1.0, roughness: 0.7, emissiveMap: transT.emissive, emissive: new THREE.Color(1.0, 0.6, 0.25), emissiveIntensity: 2.6, side: THREE.DoubleSide }),
    bulk: new THREE.MeshStandardMaterial({ map: bulkT.map, roughness: 0.75, emissiveMap: bulkT.emissive, emissive: new THREE.Color(1.0, 0.6, 0.25), emissiveIntensity: 2.2, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ map: deckMap, bumpMap: deckMap, bumpScale: 0.8, roughness: 0.88, side: THREE.DoubleSide }),
    spar: new THREE.MeshStandardMaterial({ map: sparMap, roughness: 0.7, color: 0xd8c0a0 }),
    darkwood: new THREE.MeshStandardMaterial({ map: sparMap, roughness: 0.75, color: 0x5a3a28 }),
    redwood: new THREE.MeshStandardMaterial({ map: sparMap, roughness: 0.7, color: 0xa04a30 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.42, metalness: 0.85 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc8933a, roughness: 0.32, metalness: 1.0 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 }),
    grating: new THREE.MeshStandardMaterial({ map: TX.gratingTexture(), roughness: 0.85 }),
    glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.1, 0.75) }),
    sail: new THREE.MeshStandardMaterial({ map: sailMap, roughness: 0.92, side: THREE.DoubleSide }),
    flag: new THREE.MeshStandardMaterial({ map: TX.flagTexture(), roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }),
    pennant: new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: 0.9, side: THREE.DoubleSide }),
  };
  M.grating.map.repeat.set(2, 2);
  // translucent sails: sunlight bleeding through the canvas
  M.sail.onBeforeCompile = (sh) => {
    sh.uniforms.uSunView = sunViewUniform;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunView;')
      .replace('#include <opaque_fragment>', `
      {
        vec3 vdir = normalize(vViewPosition);
        float back = pow(max(dot(-vdir, uSunView), 0.0), 2.2);
        float trans = max(-dot(normal, uSunView), 0.0);
        outgoingLight += diffuseColor.rgb * vec3(1.0, 0.52, 0.24) * (back*1.6 + trans*0.35);
      }
      #include <opaque_fragment>`);
  };

  // ------------------------------------------------ hull shell
  {
    const S = 110, V = 30; const pos = [], uv = [], idx = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= S; i++) {
        const t = i / S; const s = t < 0.5 ? t : t; // uniform
        const D = depthOf(s), H = topOf(s);
        for (let j = 0; j <= V; j++) {
          const v = j / V; const y = -D + v * (H + D);
          const p = hullPt(s, y);
          pos.push(p.x * side, p.y, p.z); uv.push(s, (y + 4) / 11);
        }
      }
      for (let i = 0; i < S; i++) for (let j = 0; j < V; j++) {
        const a = base + i * (V + 1) + j, b = a + V + 1;
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    add('hull', g);
  }
  // ------------------------------------------------ transom (stern face)
  {
    const s = 0, D = depthOf(0), H = topOf(0), V = 30; const pts = [];
    for (let j = 0; j <= V; j++) { const y = -D + j / V * (H + D); pts.push(hullPt(s, y)); }
    const outline = [];
    for (let j = 0; j <= V; j++) outline.push(new THREE.Vector2(pts[j].x, pts[j].y));
    for (let j = V; j >= 0; j--) outline.push(new THREE.Vector2(-pts[j].x, pts[j].y));
    const shape = new THREE.Shape(outline);
    const g = new THREE.ShapeGeometry(shape, 1);
    const p = g.attributes.position, uvA = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, zOf(0) + rakeZ(0, y) + 0.02);
      uvA.setXY(i, (x + 4.5) / 9, (y + 4) / 11);
    }
    g.computeVertexNormals();
    add('transom', g);
  }
  // ------------------------------------------------ decks
  function deckStrip(s0, s1, y, n = 40, inset = 0.14) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * i / n; const p = hullPt(s, y);
      const x = Math.max(0.02, p.x - inset);
      pos.push(-x, y, p.z, x, y, p.z); uv.push(-x / 4, p.z / 4, x / 4, p.z / 4);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {             // make sure the planking faces the sky
      for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      g.setIndex(idx); g.computeVertexNormals();
    }
    return g;
  }
  const MAIN_Y = 2.0, QD_Y = 4.4, FC_Y = 3.4, QD_S = 0.25, FC_S = 0.84;
  add('deck', deckStrip(0.0, 0.995, MAIN_Y, 80));
  add('deck', deckStrip(0.0, QD_S, QD_Y, 20));
  add('deck', deckStrip(FC_S, 0.975, FC_Y, 16));
  // deck edge planking (waterway) thickness
  for (const [s0, s1, y] of [[0, QD_S, QD_Y], [FC_S, 0.975, FC_Y]]) {
    const hw = hullPt(s0 === 0 ? s1 : s0, y).x - 0.14;
    const z = zOf(s0 === 0 ? s1 : s0);
    add('darkwood', xf(new THREE.BoxGeometry(hw * 2, 0.22, 0.3), [0, y - 0.1, z]));
  }
  // ------------------------------------------------ bulkheads
  {
    const z = zOf(QD_S) - 0.02; const hw = hullPt(QD_S, 3.2).x - 0.14;
    const g = new THREE.PlaneGeometry(hw * 2, QD_Y - MAIN_Y); xf(g, [0, (QD_Y + MAIN_Y) / 2, z], [0, Math.PI, 0]);
    g.rotateY(0); add('bulk', g);
    const z2 = zOf(FC_S) + 0.02; const hw2 = hullPt(FC_S, 2.7).x - 0.14;
    const g2 = new THREE.PlaneGeometry(hw2 * 2, FC_Y - MAIN_Y); xf(g2, [0, (FC_Y + MAIN_Y) / 2, z2]);
    // scale uvs so only a door section shows
    const uvA = g2.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setX(i, 0.18 + uvA.getX(i) * 0.3);
    add('bulk', g2);
  }
  // ------------------------------------------------ wales, cap rails, head rails
  function hullCurve(y, s0, s1, off, n = 60, side = 1) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n; const p = hullPt(s, y); pts.push(new THREE.Vector3((p.x + off) * side, y, p.z)); }
    return new THREE.CatmullRomCurve3(pts);
  }
  for (const side of [1, -1]) {
    add('darkwood', new THREE.TubeGeometry(hullCurve(2.05, 0.01, 0.975, 0.05, 80, side), 160, 0.13, 6));
    add('darkwood', new THREE.TubeGeometry(hullCurve(0.95, 0.02, 0.96, 0.04, 80, side), 160, 0.1, 6));
    add('gold', new THREE.TubeGeometry(hullCurve(3.3, 0.02, 0.9, 0.03, 70, side), 140, 0.05, 5));
    // cap rail following the sheer
    const pts = [];
    for (let i = 0; i <= 90; i++) { const s = 0.0 + 0.985 * i / 90; const y = topOf(s); const p = hullPt(s, y); pts.push(new THREE.Vector3(side * (p.x - 0.02), y + 0.06, p.z)); }
    add('darkwood', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.12, 6));
    // head rails sweeping down to the stem
    const hr = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; const s = 0.94 + 0.06 * t; const y = 4.2 - 1.8 * t * t; const p = hullPt(Math.min(s, 0.995), y); hr.push(new THREE.Vector3(side * (p.x + 0.15 * (1 - t)), y, p.z - 0.6 * t)); }
    add('gold', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hr), 24, 0.07, 6));
  }
  // transom top rail
  {
    const y = topOf(0); const p = hullPt(0, y);
    add('darkwood', xf(new THREE.CylinderGeometry(0.12, 0.12, p.x * 2, 8), [0, y + 0.06, p.z], [0, 0, Math.PI / 2]));
    // carved gold fringe below gallery
    const p2 = hullPt(0, 2.8);
    add('gold', xf(new THREE.CylinderGeometry(0.08, 0.08, p2.x * 2 + 0.2, 8), [0, 2.85, p2.z + 0.05], [0, 0, Math.PI / 2]));
  }
  // ------------------------------------------------ balustrades
  const baluster = lathe([[0, 0], [0.07, 0], [0.07, 0.06], [0.04, 0.1], [0.045, 0.2], [0.075, 0.33], [0.04, 0.48], [0.035, 0.56], [0.06, 0.62], [0.06, 0.66], [0, 0.66]], 8);
  const balus = [];
  function balRow(a, b, step, h = 1) {
    const d = b.clone().sub(a); const n = Math.max(1, Math.round(d.length() / step));
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); balus.push(xf(baluster.clone(), [p.x, p.y, p.z], [0, 0, 0], [1, h, 1])); }
    const ra = a.clone(), rb = b.clone(); ra.y += 0.66 * h + 0.04; rb.y += 0.66 * h + 0.04;
    add('darkwood', cylBetween(ra, rb, 0.07, 0.07, 6));
  }
  {
    // quarterdeck forward rail (gaps for the ladders)
    const z = zOf(QD_S) + 0.15; const hw = hullPt(QD_S, QD_Y).x - 0.14;
    balRow(new THREE.Vector3(-hw + 1.25, QD_Y, z), new THREE.Vector3(hw - 1.25, QD_Y, z), 0.3, 1.25);
    for (const sd of [1, -1]) {
      add('darkwood', cylBetween(new THREE.Vector3(sd * (hw - 1.25), QD_Y, z), new THREE.Vector3(sd * (hw - 1.25), QD_Y + 1.15, z), 0.1, 0.1, 6));
    }
    // quarterdeck side balustrade on top of the bulwark
    for (const sd of [1, -1]) {
      let prev = null;
      for (let i = 0; i <= 8; i++) {
        const s = 0.015 + (QD_S - 0.035) * i / 8; const y = topOf(s) + 0.12; const p = hullPt(s, topOf(s));
        const cur = new THREE.Vector3(sd * (p.x - 0.04), y, p.z);
        if (prev) balRow(prev, cur, 0.3, 0.95);
        prev = cur;
      }
    }
    // stern rail
    const yS = topOf(0) + 0.12; const pS = hullPt(0.01, topOf(0));
    balRow(new THREE.Vector3(-pS.x + 0.15, yS, pS.z - 0.05), new THREE.Vector3(pS.x - 0.15, yS, pS.z - 0.05), 0.3, 0.95);
    // forecastle aft rail
    const zf = zOf(FC_S) - 0.12; const hwf = hullPt(FC_S, FC_Y).x - 0.14;
    balRow(new THREE.Vector3(-hwf + 0.3, FC_Y, zf), new THREE.Vector3(-0.8, FC_Y, zf), 0.3, 1.15);
    balRow(new THREE.Vector3(0.8, FC_Y, zf), new THREE.Vector3(hwf - 0.3, FC_Y, zf), 0.3, 1.15);
  }
  B.redwood = (B.redwood || []).concat(balus);
  // ------------------------------------------------ ladders
  function ladder(x, zTop, yTop, zBot, yBot) {
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = i / n; add('darkwood', xf(new THREE.BoxGeometry(0.9, 0.06, 0.32), [x, yBot + (yTop - yBot) * t, zBot + (zTop - zBot) * t]));
    }
    for (const o of [-0.48, 0.48]) add('darkwood', cylBetween(new THREE.Vector3(x + o, yBot, zBot), new THREE.Vector3(x + o, yTop, zTop), 0.06, 0.06, 6));
    for (const o of [-0.48, 0.48]) add('rope', cylBetween(new THREE.Vector3(x + o, yBot + 0.9, zBot), new THREE.Vector3(x + o, yTop + 0.9, zTop), 0.025, 0.025, 5));
  }
  {
    const z = zOf(QD_S); const hw = hullPt(QD_S, QD_Y).x - 0.14;
    for (const sd of [1, -1]) ladder(sd * (hw - 0.7), z + 0.1, QD_Y, z - 2.0, MAIN_Y);
    const zf = zOf(FC_S);
    ladder(0, zf - 0.1, FC_Y, zf + 1.5, MAIN_Y);
  }
  // ------------------------------------------------ cannons
  const cannons = [];
  {
    const barrel = lathe([[0, -0.15], [0.12, -0.14], [0.16, -0.05], [0.2, 0], [0.21, 0.05], [0.2, 0.12], [0.19, 0.6], [0.2, 0.62], [0.2, 0.68], [0.17, 0.7], [0.16, 1.3], [0.17, 1.32], [0.17, 1.36], [0.145, 1.38], [0.135, 1.9], [0.16, 1.95], [0.16, 2.02], [0.12, 2.05], [0.09, 2.05], [0.09, 1.7]], 14);
    barrel.rotateZ(-Math.PI / 2); // along +x
    const knob = new THREE.SphereGeometry(0.07, 8, 6); knob.translate(-0.2, 0, 0);
    const barrelG = mergeGeometries([barrel, knob]);
    const cheek = new THREE.BoxGeometry(1.1, 0.42, 0.08);
    const wheel = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12); wheel.rotateX(Math.PI / 2);
    const axle = new THREE.BoxGeometry(0.12, 0.1, 0.62);
    const carriage = mergeGeometries([
      xf(cheek.clone(), [0, 0.32, 0.26]), xf(cheek.clone(), [0, 0.32, -0.26]),
      xf(new THREE.BoxGeometry(1.0, 0.08, 0.5), [0, 0.18, 0]),
      xf(axle.clone(), [0.4, 0.15, 0]), xf(axle.clone(), [-0.4, 0.15, 0]),
      xf(wheel.clone(), [0.4, 0.16, 0.34]), xf(wheel.clone(), [0.4, 0.16, -0.34]),
      xf(wheel.clone(), [-0.4, 0.16, 0.34]), xf(wheel.clone(), [-0.4, 0.16, -0.34]),
    ]);
    for (const s of gunportS) for (const sd of [1, -1]) {
      const yAx = 2.62; const hx = hullPt(s, yAx).x; const z = hullPt(s, yAx).z;
      const bx = (hx - 1.45) * sd;
      const g = barrelG.clone(); if (sd < 0) g.rotateY(Math.PI); g.translate(bx, yAx, z); add('iron', g);
      const c = carriage.clone(); if (sd < 0) c.rotateY(Math.PI); c.translate(sd * (hx - 1.05), MAIN_Y, z); add('redwood', c);
      // breeching rope
      add('rope', cylBetween(new THREE.Vector3(sd * (hx - 0.15), 2.55, z - 0.5), new THREE.Vector3(sd * (hx - 1.55), 2.6, z), 0.025, 0.025, 4));
      add('rope', cylBetween(new THREE.Vector3(sd * (hx - 0.15), 2.55, z + 0.5), new THREE.Vector3(sd * (hx - 1.55), 2.6, z), 0.025, 0.025, 4));
      // open gunport lid hinged above the port
      const lid = new THREE.BoxGeometry(0.06, 0.6, 0.7); const p = hullPt(s, 3.05);
      xf(lid, [sd * (p.x + 0.28), 3.25, p.z], [0, 0, sd * -1.15]); add('redwood', lid);
    }
    // two stern chasers on the quarterdeck
    for (const sd of [1, -1]) {
      const g = barrelG.clone(); g.scale(0.8, 0.8, 0.8); g.rotateY(-Math.PI / 2); g.translate(sd * 1.6, QD_Y + 0.55, zOf(0.04) - 1.6); add('iron', g);
      const c = carriage.clone(); c.scale(0.8, 0.8, 0.8); c.rotateY(-Math.PI / 2); c.translate(sd * 1.6, QD_Y, zOf(0.04) - 1.2); add('redwood', c);
    }
  }
  // ------------------------------------------------ masts, tops, yards
  const MASTS = {
    fore: { z: zOf(0.79), base: MAIN_Y, top: 14.0, tm: 23.5, tip: 31.5, scale: 0.9 },
    main: { z: zOf(0.5), base: MAIN_Y, top: 15.5, tm: 26.0, tip: 35.0, scale: 1.0 },
    miz: { z: zOf(0.17), base: QD_Y, top: 13.6, tm: 21.0, tip: 27.0, scale: 0.72 },
  };
  const brace = 0.26;
  const yardsInfo = {}; // world-ish (ship local) yard endpoints for rigging
  const braceGroups = {};
  for (const [name, m] of Object.entries(MASTS)) {
    const z = m.z, k = m.scale;
    add('spar', cylBetween(new THREE.Vector3(0, m.base - 1, z), new THREE.Vector3(0, m.top + 1.2, z), 0.46 * k + 0.05, 0.36 * k + 0.04, 14));
    // mast hoops / bands
    for (let y = m.base + 1.5; y < m.top; y += 1.6) add('iron', xf(new THREE.CylinderGeometry(0.46 * k + 0.07, 0.46 * k + 0.07, 0.07, 14), [0, y, z]));
    add('spar', cylBetween(new THREE.Vector3(0, m.top - 1.6, z + 0.55 * k), new THREE.Vector3(0, m.tm + 0.9, z + 0.55 * k), 0.3 * k + 0.03, 0.22 * k + 0.03, 12));
    add('spar', cylBetween(new THREE.Vector3(0, m.tm - 1.2, z + 0.85 * k), new THREE.Vector3(0, m.tip, z + 0.85 * k), 0.17 * k + 0.02, 0.09 * k + 0.02, 10));
    add('darkwood', xf(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 10), [0, m.tip + 0.1, z + 0.85 * k]));
    add('gold', xf(new THREE.SphereGeometry(0.12, 10, 8), [0, m.tip + 0.3, z + 0.85 * k]));
    // fighting top (platform with rim)
    const topW = 3.6 * k + 0.4, topD = 2.6 * k + 0.4;
    add('darkwood', xf(new THREE.BoxGeometry(topW, 0.16, topD), [0, m.top, z + 0.3]));
    add('darkwood', xf(new THREE.BoxGeometry(topW + 0.1, 0.32, 0.12), [0, m.top + 0.14, z + 0.3 - topD / 2]));
    for (const sd of [1, -1]) add('darkwood', xf(new THREE.BoxGeometry(0.12, 0.32, topD), [sd * topW / 2, m.top + 0.14, z + 0.3]));
    add('darkwood', xf(new THREE.BoxGeometry(0.9 * k, 0.4, 1.5 * k), [0, m.top + 1.2, z + 0.28 * k]));    // cap
    // crosstrees at topmast head
    add('darkwood', xf(new THREE.BoxGeometry(2.2 * k, 0.12, 0.14), [0, m.tm, z + 0.55 * k]));
    add('darkwood', xf(new THREE.BoxGeometry(0.14, 0.12, 1.6 * k), [0.4, m.tm, z + 0.6 * k]));
    add('darkwood', xf(new THREE.BoxGeometry(0.14, 0.12, 1.6 * k), [-0.4, m.tm, z + 0.6 * k]));
    add('darkwood', xf(new THREE.BoxGeometry(0.55 * k, 0.3, 1.0 * k), [0, m.tm + 0.9, z + 0.7 * k]));
    // belaying pin rail at mast foot
    add('darkwood', xf(new THREE.BoxGeometry(2.2, 0.12, 0.18), [0, m.base + 0.9, z - 0.7]));
    for (const sd of [-1, 1]) add('darkwood', xf(new THREE.BoxGeometry(0.14, 0.9, 0.14), [sd * 1.0, m.base + 0.45, z - 0.7]));
    for (let i = 0; i < 7; i++) add('darkwood', xf(new THREE.CylinderGeometry(0.03, 0.035, 0.42, 5), [-0.9 + i * 0.3, m.base + 0.98, z - 0.7]));
    // coils of rope at the foot
    for (const sd of [-1, 1]) add('rope', xf(new THREE.TorusGeometry(0.32, 0.07, 6, 18), [sd * 0.75, m.base + 0.05, z + 0.6], [Math.PI / 2, 0, 0], [1, 1, 0.8]));
  }
  // ------------------------------------------------ hull channels, deadeyes, shrouds
  const ropeLines = [];
  const L = (a, b) => { ropeLines.push(a.x, a.y, a.z, b.x, b.y, b.z); };
  const ratlines = (shrouds, step) => {
    for (let k = 0; k < shrouds.length - 1; k++) {
      const [a0, a1] = shrouds[k], [b0, b1] = shrouds[k + 1];
      const y0 = Math.max(a0.y, b0.y) + 0.4, y1 = Math.min(a1.y, b1.y) - 0.6;
      for (let y = y0; y < y1; y += step) {
        const ta = (y - a0.y) / (a1.y - a0.y), tb = (y - b0.y) / (b1.y - b0.y);
        L(a0.clone().lerp(a1, ta), b0.clone().lerp(b1, tb));
      }
    }
  };
  for (const [name, m] of Object.entries(MASTS)) {
    const k = m.scale;
    for (const sd of [1, -1]) {
      const shrouds = [];
      const zs = [];
      for (let i = 0; i < 5; i++) zs.push(m.z - 0.9 * k + i * 0.85 * k);
      // channel board
      const sMid = sOf(m.z + 0.9), yC = topOf(sMid) - 0.55; const pc = hullPt(sMid, yC);
      add('darkwood', xf(new THREE.BoxGeometry(0.55, 0.12, 4.6 * k), [sd * (pc.x + 0.25), yC, m.z + 0.9 * k]));
      for (const z of zs) {
        const s = sOf(z); const yb = topOf(sMid) - 0.25; const ph = hullPt(s, yC);
        const bot = new THREE.Vector3(sd * (ph.x + 0.45), yb, z);
        const top = new THREE.Vector3(sd * 0.5 * k, m.top - 0.25, m.z + 0.2);
        shrouds.push([bot, top]);
        add('rope', cylBetween(bot, top, 0.04, 0.04, 5));
        // deadeye + chainplate
        add('darkwood', xf(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 10), [bot.x, bot.y - 0.2, z], [0, 0, Math.PI / 2]));
        add('iron', cylBetween(new THREE.Vector3(bot.x, yb - 0.3, z), new THREE.Vector3(sd * (hullPt(s, 2.2).x + 0.08), 2.2, z), 0.025, 0.025, 4));
      }
      ratlines(shrouds, 0.42);
      // topmast shrouds (from rim of the top)
      const tsh = [];
      for (let i = 0; i < 3; i++) {
        const a = new THREE.Vector3(sd * (1.7 * k + 0.1), m.top + 0.15, m.z + 0.3 - 0.5 + i * 0.7 * k);
        const b = new THREE.Vector3(sd * 0.32 * k, m.tm - 0.2, m.z + 0.55 * k);
        tsh.push([a, b]); add('rope', cylBetween(a, b, 0.03, 0.03, 4));
        // futtock shroud
        L(a, new THREE.Vector3(sd * 0.45 * k, m.top - 2.2, m.z + 0.1));
      }
      ratlines(tsh, 0.42);
      // topgallant shrouds
      L(new THREE.Vector3(sd * 1.1 * k, m.tm, m.z + 0.6 * k), new THREE.Vector3(sd * 0.12, m.tip - 2.5, m.z + 0.85 * k));
      // backstays
      for (const zz of [3.5, 4.6]) {
        const zb = m.z + zz * k; const s = sOf(zb); const ph = hullPt(Math.max(0.01, s), topOf(Math.max(0.01, s)) - 0.3);
        add('rope', cylBetween(new THREE.Vector3(sd * (ph.x + 0.3), topOf(Math.max(0.01, s)) - 0.3, zb), new THREE.Vector3(sd * 0.25, zz < 4 ? m.tm - 0.3 : m.tip - 2.0, m.z + 0.7 * k), 0.035, 0.035, 4));
      }
    }
  }
  // ------------------------------------------------ bowsprit + stays
  const bsA = hullPt(0.95, 4.6); bsA.x = 0;
  const bsDir = new THREE.Vector3(0, Math.sin(0.36), -Math.cos(0.36));
  const bsAt = t => bsA.clone().addScaledVector(bsDir, t);
  add('spar', cylBetween(bsAt(-3), bsAt(11), 0.42, 0.28, 12));
  add('spar', cylBetween(bsAt(8.5), bsAt(18.5), 0.2, 0.11, 10));
  add('darkwood', xf(new THREE.BoxGeometry(0.6, 0.6, 0.5), [0, bsAt(11).y, bsAt(11).z], [-0.36, 0, 0]));
  for (let t = 1; t < 10; t += 1.6) add('iron', cylBetween(bsAt(t), bsAt(t + 0.08), 0.45, 0.45, 12));
  // gammoning / bobstays
  add('rope', cylBetween(bsAt(9), hullPt(0.985, 0.6).setX(0), 0.05, 0.05, 5));
  add('rope', cylBetween(bsAt(5), hullPt(0.97, 1.6).setX(0), 0.05, 0.05, 5));
  // dolphin striker
  const ds = bsAt(11).add(new THREE.Vector3(0, -2.2, 0.4));
  add('spar', cylBetween(bsAt(11), ds, 0.08, 0.07, 6));
  L(ds, bsAt(18.3)); L(ds, hullPt(0.99, 2.0).setX(0));
  const F = MASTS.fore, Mm = MASTS.main, Z = MASTS.miz;
  const stay = (a, b, r = 0.05) => add('rope', cylBetween(a, b, r, r, 5));
  const foreTop = new THREE.Vector3(0, F.top - 0.2, F.z - 0.3), foreTm = new THREE.Vector3(0, F.tm + 0.6, F.z + 0.3), foreTip = new THREE.Vector3(0, F.tip - 1.2, F.z + 0.6);
  stay(foreTop, bsAt(6), 0.07);
  const jibStay1 = [foreTm, bsAt(13.5)], jibStay2 = [foreTip, bsAt(18.4)];
  stay(...jibStay1, 0.05); stay(...jibStay2, 0.04);
  stay(new THREE.Vector3(0, Mm.top - 0.2, Mm.z - 0.4), new THREE.Vector3(0, F.base + 1.4, F.z + 0.6), 0.07);
  stay(new THREE.Vector3(0, Mm.tm + 0.5, Mm.z + 0.3), new THREE.Vector3(0, F.top + 0.4, F.z + 0.2), 0.05);
  stay(new THREE.Vector3(0, Mm.tip - 1.5, Mm.z + 0.7), new THREE.Vector3(0, F.tm + 0.5, F.z + 0.5), 0.035);
  stay(new THREE.Vector3(0, Z.top - 0.2, Z.z - 0.3), new THREE.Vector3(0, Mm.base + 6.5, Mm.z + 0.4), 0.05);
  stay(new THREE.Vector3(0, Z.tm + 0.4, Z.z + 0.3), new THREE.Vector3(0, Mm.top + 0.5, Mm.z + 0.3), 0.04);

  // ------------------------------------------------ yards and square sails
  const sails = [];
  function makeSailGeo(nu, nv) {
    const g = new THREE.PlaneGeometry(1, 1, nu, nv);
    return g;
  }
  function addSail(parent, corners, depth, dir, opts = {}) {
    const nu = 16, nv = 14; const g = makeSailGeo(nu, nv);
    const mesh = new THREE.Mesh(g, M.sail); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    sails.push({ mesh, nu, nv, c: corners, depth, dir, roach: opts.roach ?? 0.6, ph: Math.random() * 6.28, tri: !!opts.tri });
    return mesh;
  }
  function squareRig(m, specs) {
    const g = new THREE.Group(); g.position.set(0, 0, m.z); g.rotation.y = brace; ship.add(g); braceGroups[m.z] = g;
    const yg = [];
    for (const sp of specs) {
      // yard
      const yard = cylBetween(new THREE.Vector3(-sp.half, sp.y, -0.55), new THREE.Vector3(0, sp.y, -0.55), 0.09, sp.r, 10);
      const yard2 = cylBetween(new THREE.Vector3(sp.half, sp.y, -0.55), new THREE.Vector3(0, sp.y, -0.55), 0.09, sp.r, 10);
      yg.push(yard, yard2);
      // footrope sag
      const n = 10; let prev = null;
      for (let i = 0; i <= n; i++) { const t = i / n; const x = -sp.half * 0.95 + sp.half * 1.9 * t; const p = new THREE.Vector3(x, sp.y - 0.75 - 0.35 * Math.sin(Math.PI * t), -0.7); if (prev) yardLines.push(prev, p); prev = p; }
      // lifts
      for (const sd of [1, -1]) yardLines.push(new THREE.Vector3(sd * sp.half * 0.97, sp.y, -0.55), new THREE.Vector3(0, sp.y + 2.4, 0.2));
      if (sp.sail) {
        const [tw, bw, by] = sp.sail;
        addSail(g, { tl: new THREE.Vector3(-tw, sp.y - 0.12, -0.75), tr: new THREE.Vector3(tw, sp.y - 0.12, -0.75), bl: new THREE.Vector3(-bw, by, -0.75), br: new THREE.Vector3(bw, by, -0.75) }, sp.depth, new THREE.Vector3(0, 0, -1));
        yardInfo.push({ g, bl: new THREE.Vector3(-bw, by, -0.8), br: new THREE.Vector3(bw, by, -0.8), y: sp.y, half: sp.half });
      } else yardInfo.push({ g, y: sp.y, half: sp.half });
    }
    const merged = mergeGeometries(yg); const ym = new THREE.Mesh(merged, M.spar); ym.castShadow = true; g.add(ym);
    return g;
  }
  const yardLines = []; const yardInfo = [];
  const lineGroupsByMast = [];
  const mastSpecs = {
    main: [
      { y: 14.1, half: 9.4, r: 0.24, sail: [8.6, 9.3, 6.0], depth: 2.3 },
      { y: 24.2, half: 7.4, r: 0.19, sail: [6.8, 8.6, 15.4], depth: 2.0 },
      { y: 31.6, half: 5.0, r: 0.14, sail: [4.6, 6.4, 24.9], depth: 1.4 },
    ],
    fore: [
      { y: 12.7, half: 8.5, r: 0.22, sail: [7.8, 8.4, 5.4], depth: 2.1 },
      { y: 21.9, half: 6.7, r: 0.18, sail: [6.1, 7.7, 13.9], depth: 1.8 },
      { y: 28.6, half: 4.6, r: 0.13, sail: [4.2, 5.8, 22.6], depth: 1.25 },
    ],
    miz: [
      { y: 12.7, half: 6.0, r: 0.16 },
      { y: 19.8, half: 4.8, r: 0.13, sail: [4.4, 5.6, 13.4], depth: 1.2 },
    ],
  };
  for (const [name, m] of Object.entries(MASTS)) {
    const before = yardLines.length;
    const g = squareRig(m, mastSpecs[name]);
    const pts = yardLines.splice(before);
    if (pts.length) {
      const arr = []; pts.forEach(p => arr.push(p.x, p.y, p.z));
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.add(new THREE.LineSegments(lg, lineMat));
    }
  }
  // braces and sheets (ship space): from yard ends, through brace rotation
  for (const yi of yardInfo) {
    yi.g.updateMatrix();
    for (const sd of [1, -1]) {
      const end = new THREE.Vector3(sd * yi.half * 0.97, yi.y, -0.55).applyMatrix4(yi.g.matrix);
      const zt = end.z + 7; const st = sOf(zt);
      const tgt = st > 0.02 ? new THREE.Vector3(sd * (hullPt(st, topOf(st)).x - 0.1), topOf(st) + 0.1, zt) : new THREE.Vector3(sd * 2.5, topOf(0) + 0.3, zOf(0) + 1.0);
      L(end, tgt);
      if (yi.bl) {
        const c = (sd < 0 ? yi.bl : yi.br).clone().applyMatrix4(yi.g.matrix);
        if (c.y < 8) { const zs = c.z + 3.5; const ss = sOf(zs); L(c, new THREE.Vector3(sd * (hullPt(ss, topOf(ss)).x - 0.1), topOf(ss) + 0.1, zs)); }
      }
    }
  }
  // ------------------------------------------------ spanker on the mizzen
  {
    const g = new THREE.Group(); g.position.set(0, 0, Z.z); g.rotation.y = -0.3; ship.add(g);
    const gaffA = new THREE.Vector3(0, 12.0, 0.45), gaffB = new THREE.Vector3(0, 15.4, 8.2);
    const boomA = new THREE.Vector3(0, 5.9, 0.45), boomB = new THREE.Vector3(0, 6.5, 10.4);
    const sp = mergeGeometries([cylBetween(gaffA, gaffB, 0.15, 0.1, 8), cylBetween(boomA, boomB, 0.17, 0.12, 8)]);
    const m = new THREE.Mesh(sp, M.spar); m.castShadow = true; g.add(m);
    addSail(g, { tl: new THREE.Vector3(0, 11.8, 0.7), tr: gaffB.clone().add(new THREE.Vector3(0, -0.2, -0.1)), bl: new THREE.Vector3(0, 6.15, 0.7), br: boomB.clone().add(new THREE.Vector3(0, 0.2, -0.2)) }, 1.1, new THREE.Vector3(1, 0, 0), { roach: 0.15 });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([gaffB.x, gaffB.y, gaffB.z, 0, Z.tm, 0.4, boomB.x, boomB.y, boomB.z, 0, Z.top - 1, 0.3], 3));
    g.add(new THREE.LineSegments(lg, lineMat));
    // ensign streaming from the gaff end
    flagSpots.push({ parent: g, at: gaffB.clone().add(new THREE.Vector3(0, -0.2, 0.1)), w: 3.0, h: 2.0, mat: M.flag });
  }
  // ------------------------------------------------ jibs
  {
    const g = new THREE.Group(); ship.add(g);
    const mk = (st, tA, tH, clew, depth) => {
      const a = st[1].clone().lerp(st[0], tA), h = st[1].clone().lerp(st[0], tH);
      addSail(g, { tl: h, tr: h.clone().add(new THREE.Vector3(0, -0.05, 0.05)), bl: a, br: clew }, depth, new THREE.Vector3(-1, 0, 0), { tri: true, roach: 0.0 });
      L(clew, new THREE.Vector3(-1.6, FC_Y + 0.9, zOf(0.86)));
    };
    mk(jibStay1, 0.06, 0.82, new THREE.Vector3(-0.5, 6.8, F.z - 3.2), 0.9);
    mk(jibStay2, 0.05, 0.78, new THREE.Vector3(-0.6, 9.4, bsAt(8).z + 0.5), 0.9);
  }
  // main flag and pennants
  flagSpots.push({ parent: ship, at: new THREE.Vector3(0, Mm.tip + 0.2, Mm.z + 0.95), w: 3.6, h: 2.3, mat: M.flag });
  flagSpots.push({ parent: ship, at: new THREE.Vector3(0, F.tip + 0.2, F.z + 0.75), w: 6.0, h: 0.6, mat: M.pennant, pennant: true });
  flagSpots.push({ parent: ship, at: new THREE.Vector3(0, Z.tip + 0.2, Z.z + 0.7), w: 5.0, h: 0.5, mat: M.pennant, pennant: true });

  // ------------------------------------------------ deck furniture
  {
    // ship's wheel on the quarterdeck
    const zW = zOf(0.115), yW = QD_Y;
    const wheel = new THREE.Group();
    const parts = [xf(new THREE.TorusGeometry(0.62, 0.05, 8, 28), [0, 0, 0]), xf(new THREE.TorusGeometry(0.16, 0.07, 8, 16), [0, 0, 0])];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      parts.push(xf(new THREE.CylinderGeometry(0.03, 0.035, 0.98, 6), [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0], [0, 0, a - Math.PI / 2]));
      parts.push(xf(lathe([[0, 0], [0.04, 0], [0.03, 0.1], [0.045, 0.18], [0, 0.24]], 6), [Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0], [0, 0, a - Math.PI / 2]));
    }
    const wg = mergeGeometries(parts); xf(wg, [0, yW + 1.35, zW]); add('redwood', wg);
    add('gold', xf(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), [0, yW + 1.35, zW + 0.2], [Math.PI / 2, 0, 0]));
    add('darkwood', xf(new THREE.BoxGeometry(0.4, 1.4, 0.35), [0, yW + 0.7, zW + 0.45]));
    add('darkwood', xf(new THREE.BoxGeometry(1.3, 0.5, 0.6), [0, yW + 0.25, zW + 0.45]));
    // binnacle
    add('darkwood', xf(new THREE.BoxGeometry(0.6, 1.0, 0.5), [0, yW + 0.5, zW - 1.6]));
    add('gold', xf(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, yW + 1.0, zW - 1.6]));
    // capstan
    const cap = lathe([[0, 0], [0.55, 0], [0.55, 0.12], [0.38, 0.2], [0.32, 0.7], [0.48, 0.82], [0.5, 1.0], [0, 1.0]], 16);
    xf(cap, [0, MAIN_Y, zOf(0.31) - 0.4]); add('redwood', cap);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add('spar', xf(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), [Math.cos(a) * 1.0, MAIN_Y + 0.92, zOf(0.31) - 0.4 + Math.sin(a) * 1.0], [0, -a, Math.PI / 2])); }
    // hatches with gratings
    for (const [s, w, d] of [[0.41, 2.2, 2.0], [0.6, 2.4, 2.6], [0.69, 1.6, 1.4]]) {
      const z = zOf(s);
      add('darkwood', xf(new THREE.BoxGeometry(w + 0.3, 0.32, d + 0.3), [0, MAIN_Y + 0.16, z]));
      const gr = new THREE.PlaneGeometry(w, d); gr.rotateX(-Math.PI / 2); gr.translate(0, MAIN_Y + 0.33, z);
      const uvA = gr.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * w, uvA.getY(i) * d);
      add('grating', gr);
    }
    // ship's boat on chocks over the main hatch
    {
      const boat = new THREE.LatheGeometry([[0, -0.0], [0.55, 0.05], [0.8, 0.35], [0.85, 0.6], [0.0, 0.6]].map(p => new THREE.Vector2(p[0], p[1])), 14, 0, Math.PI);
      boat.rotateZ(Math.PI); boat.scale(1, 1, 1); boat.rotateX(0); boat.scale(1, 0.9, 1);
      const bb = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); bb.scale(0.95, 0.6, 2.8);
      xf(bb, [1.9, MAIN_Y + 1.15, zOf(0.6)], [0, 0, 0]); add('redwood', bb);
      add('darkwood', xf(new THREE.TorusGeometry(1, 0.05, 6, 30), [1.9, MAIN_Y + 1.15, zOf(0.6)], [Math.PI / 2, 0, 0], [0.95, 2.8, 1]));
      add('darkwood', xf(new THREE.BoxGeometry(2.2, 0.55, 0.25), [1.9, MAIN_Y + 0.3, zOf(0.6) + 1.4]));
      add('darkwood', xf(new THREE.BoxGeometry(2.2, 0.55, 0.25), [1.9, MAIN_Y + 0.3, zOf(0.6) - 1.4]));
    }
    // barrels
    const barrel = lathe([[0, 0], [0.3, 0], [0.33, 0.04], [0.38, 0.35], [0.33, 0.66], [0.3, 0.7], [0, 0.7]], 14);
    const hoop = new THREE.TorusGeometry(0.355, 0.018, 4, 18); hoop.rotateX(Math.PI / 2);
    const barrelSpots = [[2.2, 0.27, 0], [2.85, 0.265, 0], [2.5, 0.275, 1], [-2.4, 0.73, 0], [-2.9, 0.735, 0], [-2.65, 0.745, 0.5], [2.2, 0.76, 0], [-2.3, 0.4, 0], [1.7, 0.9, 0]];
    for (const [x, s, st] of barrelSpots) {
      const z = zOf(s) + (st % 1 ? 0.6 : 0); const y = MAIN_Y + (st >= 1 ? 0.7 : 0);
      add('redwood', xf(barrel.clone(), [x, y, z], [0, Math.random() * 6, 0]));
      for (const hy of [0.12, 0.58]) add('iron', xf(hoop.clone(), [x, y + hy, z], [0, 0, 0], [0.98, 1, 0.98]));
    }
    // crates
    const crate = (x, y, z, sz, r) => { add('darkwood', xf(new THREE.BoxGeometry(sz, sz, sz), [x, y + sz / 2, z], [0, r, 0])); add('spar', xf(new THREE.BoxGeometry(sz + 0.04, 0.08, sz + 0.04), [x, y + sz * 0.15, z], [0, r, 0])); add('spar', xf(new THREE.BoxGeometry(sz + 0.04, 0.08, sz + 0.04), [x, y + sz * 0.85, z], [0, r, 0])); };
    crate(-2.0, MAIN_Y, zOf(0.45), 0.8, 0.2); crate(-2.15, MAIN_Y + 0.8, zOf(0.45) + 0.1, 0.62, 0.6); crate(-1.4, MAIN_Y, zOf(0.47), 0.7, -0.3);
    crate(1.6, FC_Y, zOf(0.9), 0.7, 0.4); crate(-1.2, QD_Y, zOf(0.05), 0.75, 0.1);
    // rope coils on deck
    for (const [x, s] of [[-1.0, 0.36], [1.2, 0.74], [-0.5, 0.88], [1.6, 0.21]]) {
      const y = s > 0.84 ? FC_Y : s < 0.25 ? QD_Y : MAIN_Y;
      for (let i = 0; i < 4; i++) add('rope', xf(new THREE.TorusGeometry(0.4 - i * 0.07, 0.055, 6, 20), [x, y + 0.05 + i * 0.07, zOf(s)], [Math.PI / 2, 0, 0]));
    }
    // ship's bell on the forecastle
    add('darkwood', xf(new THREE.BoxGeometry(1.2, 0.12, 0.15), [0, FC_Y + 1.8, zOf(0.845)]));
    for (const sd of [-1, 1]) add('darkwood', xf(new THREE.BoxGeometry(0.12, 1.8, 0.15), [sd * 0.55, FC_Y + 0.9, zOf(0.845)]));
    add('gold', xf(lathe([[0, 0.4], [0.08, 0.38], [0.12, 0.25], [0.16, 0.06], [0.2, 0], [0.18, 0.0], [0.13, 0.05], [0, 0.05]], 14), [0, FC_Y + 1.25, zOf(0.845)]));
    // catheads + anchors
    for (const sd of [1, -1]) {
      const s = 0.905; const p = hullPt(s, topOf(s));
      add('darkwood', xf(new THREE.BoxGeometry(1.4, 0.3, 0.3), [sd * (p.x + 0.4), topOf(s) - 0.2, p.z], [0, sd * 0.4, 0]));
      const ax = sd * (hullPt(0.88, 2.0).x + 0.35), az = zOf(0.88), ay = 1.4;
      const anchor = [
        xf(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 8), [0, 0, 0]),
        xf(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), [0, 1.35, 0], [Math.PI / 2, 0, 0]),
        xf(new THREE.TorusGeometry(0.85, 0.07, 6, 16, Math.PI), [0, -1.5 + 0.85, 0], [0, Math.PI / 2, Math.PI]),
        xf(new THREE.TorusGeometry(0.16, 0.035, 6, 12), [0, 1.65, 0], [0, Math.PI / 2, 0]),
        xf(new THREE.ConeGeometry(0.22, 0.45, 4), [0, -0.5, 0.82], [0.4, 0, 0], [1, 1, 0.3]),
        xf(new THREE.ConeGeometry(0.22, 0.45, 4), [0, -0.5, -0.82], [-0.4, 0, 0], [1, 1, 0.3]),
      ];
      const ag = mergeGeometries(anchor); xf(ag, [ax, ay, az], [0.1, 0, sd * 0.12]); add('iron', ag);
      L(new THREE.Vector3(ax, ay + 1.7, az), new THREE.Vector3(sd * (p.x + 0.9), topOf(s) - 0.3, p.z - 0.3));
    }
  }
  // ------------------------------------------------ lanterns
  const lanterns = [];
  {
    const body = lathe([[0, 0], [0.24, 0], [0.26, 0.06], [0.2, 0.1], [0.2, 0.12], [0.3, 0.14], [0.3, 0.18], [0.0, 0.18]], 10);
    const roof = lathe([[0.32, 0], [0.3, 0.06], [0.16, 0.26], [0.06, 0.42], [0.08, 0.5], [0, 0.56]], 10);
    const glass = new THREE.CylinderGeometry(0.24, 0.2, 0.62, 8);
    const mk = (x, y, z, s) => {
      add('gold', xf(body.clone(), [x, y, z], [0, 0, 0], [s, s, s]));
      add('gold', xf(roof.clone(), [x, y + 0.82 * s, z], [0, 0, 0], [s, s, s]));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add('gold', xf(new THREE.CylinderGeometry(0.018, 0.018, 0.64, 4), [x + Math.cos(a) * 0.25 * s, y + 0.5 * s, z + Math.sin(a) * 0.25 * s], [0, 0, 0], [s, s, s])); }
      add('glass', xf(glass.clone(), [x, y + 0.5 * s, z], [0, 0, 0], [s, s, s]));
      lanterns.push(new THREE.Vector3(x, y + 0.5 * s, z));
    };
    const pS = hullPt(0, topOf(0));
    const ys = topOf(0) + 0.75;
    for (const sd of [-1, 1]) {
      const x = sd * (pS.x - 0.4), z = pS.z + 0.5;
      add('iron', cylBetween(new THREE.Vector3(x, topOf(0), pS.z - 0.2), new THREE.Vector3(x, ys - 0.15, z), 0.04, 0.04, 5));
      mk(x, ys - 0.15, z, 1.25);
    }
    add('iron', cylBetween(new THREE.Vector3(0, topOf(0), pS.z - 0.2), new THREE.Vector3(0, ys + 0.6, pS.z + 0.6), 0.05, 0.05, 5));
    mk(0, ys + 0.6, pS.z + 0.6, 1.55);
    // lantern in the main top
    mk(0, Mm.top + 0.1, Mm.z - 0.9, 1.0);
    // bow lantern on the forecastle
    mk(0.0, FC_Y + 1.95, zOf(0.845) + 0.0, 0.7);
  }

  // ------------------------------------------------ assemble merged meshes
  const meshes = {};
  for (const [k, list] of Object.entries(B)) {
    const geos = list.map(g => { if (!g.index) { g = g.toNonIndexed ? g : g; } return g; });
    // ensure attribute compatibility
    for (const g of geos) { if (!g.attributes.uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); } if (!g.attributes.normal) g.computeVertexNormals(); }
    const indexed = geos.filter(g => g.index), non = geos.filter(g => !g.index);
    const parts = [];
    if (indexed.length) parts.push(mergeGeometries(indexed.map(g => { const c = new THREE.BufferGeometry(); c.setIndex(g.index); for (const a of ['position', 'normal', 'uv']) c.setAttribute(a, g.attributes[a]); return c; })));
    if (non.length) parts.push(mergeGeometries(non.map(g => { const c = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'uv']) c.setAttribute(a, g.attributes[a]); return c; })));
    for (const geo of parts) {
      const mesh = new THREE.Mesh(geo, M[k]);
      mesh.castShadow = k !== 'glass'; mesh.receiveShadow = true;
      ship.add(mesh); meshes[k] = mesh;
    }
  }
  // standing rigging lines
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ropeLines, 3));
  ship.add(new THREE.LineSegments(lg, lineMat));

  // ------------------------------------------------ flags (animated)
  const flags = [];
  for (const f of flagSpots) {
    const nu = f.pennant ? 24 : 18, nv = f.pennant ? 2 : 10;
    const g = new THREE.PlaneGeometry(1, 1, nu, nv);
    const mesh = new THREE.Mesh(g, f.mat); mesh.castShadow = true;
    f.parent.add(mesh);
    flags.push({ mesh, nu, nv, at: f.at, w: f.w, h: f.h, pennant: !!f.pennant, ph: Math.random() * 6 });
  }

  // ------------------------------------------------ animation
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
  function updateSails(t, gust) {
    for (const s of sails) {
      const pos = s.mesh.geometry.attributes.position; const { nu, nv, c } = s;
      const dep = s.depth * (1 + 0.07 * Math.sin(t * 1.35 + s.ph) + 0.035 * Math.sin(t * 3.3 + s.ph * 2) + gust * 0.08);
      let i = 0;
      for (let j = 0; j <= nv; j++) {
        const v = 1 - j / nv; const w = 1 - v; // w = 0 at head
        for (let k = 0; k <= nu; k++, i++) {
          const u = k / nu;
          tmpA.copy(c.tl).lerp(c.tr, u); tmpB.copy(c.bl).lerp(c.br, u);
          tmpC.copy(tmpA).lerp(tmpB, w);
          let prof;
          if (s.tri) { prof = Math.sin(Math.PI * Math.min(1, w)) * Math.sin(Math.PI * u) * 1.2 + 0.0; prof = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(w * 0.9 + 0.05, 1)); }
          else prof = Math.pow(Math.sin(Math.PI * u), 0.85) * (Math.sin(Math.PI * 0.62 * w) / 0.93);
          const ripple = 0.05 * Math.sin(u * 9 + t * 4.2 + s.ph + v * 5) * Math.sin(Math.PI * u) * w + 0.03 * Math.sin(v * 13 - t * 6.5 + s.ph) * Math.sin(Math.PI * u) * w;
          const b = dep * prof + ripple * (s.depth);
          tmpC.addScaledVector(s.dir, b);
          tmpC.y += s.roach * Math.sin(Math.PI * u) * Math.pow(w, 4);
          pos.setXYZ(i, tmpC.x, tmpC.y, tmpC.z);
        }
      }
      pos.needsUpdate = true; s.mesh.geometry.computeVertexNormals();
      // uv: keep plane uv (0..1)
    }
  }
  function updateFlags(t) {
    for (const f of flags) {
      const pos = f.mesh.geometry.attributes.position; let i = 0;
      for (let j = 0; j <= f.nv; j++) {
        const v = 1 - j / f.nv;
        for (let k = 0; k <= f.nu; k++, i++) {
          const u = k / f.nu;
          const amp = u * (f.pennant ? 0.55 : 0.45);
          const x = Math.sin(u * 7 - t * 9 + f.ph) * amp + Math.sin(u * 13 - t * 14 + v * 2) * amp * 0.25;
          const y = (f.pennant ? (v - 0.5) * f.h * (1 - u * 0.9) : (v - 0.5) * f.h) - u * u * 0.4;
          const z = u * f.w * 0.97;
          pos.setXYZ(i, f.at.x + x, f.at.y + y - (f.pennant ? 0 : f.h * 0.5), f.at.z + z);
        }
      }
      pos.needsUpdate = true; f.mesh.geometry.computeVertexNormals();
    }
  }
  return { ship, updateSails, updateFlags, lanterns, materials: M };
}

const lineMat = new THREE.LineBasicMaterial({ color: 0x2a1e14, transparent: true, opacity: 0.85 });
