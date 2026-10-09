import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { NOISE, SKY, OCEAN_VERT, OCEAN_FRAG, SKY_VERT, SKY_FRAG, GRADE_FRAG } from './shaders.js';
import { buildShip } from './ship.js';
import { softDot } from './textures.js';

// ------------------------------------------------------------ renderer
const QS = new URLSearchParams(location.search); const fixedT = QS.get('t'); const yawOff = parseFloat(QS.get('yaw') || '0');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.3, 14000);

// ------------------------------------------------------------ sun + sky
const sunDir = new THREE.Vector3(-0.82, 0.075, -0.56).normalize();
const sunColor = new THREE.Color(1.0, 0.62, 0.36);
const U = {
  uTime: { value: 0 }, uSunDir: { value: sunDir }, uSunColor: { value: new THREE.Vector3(1.0, 0.66, 0.42) },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uSunDir: U.uSunDir },
  vertexShader: SKY_VERT, fragmentShader: NOISE + SKY + SKY_FRAG,
  side: THREE.BackSide, depthWrite: false, depthTest: true,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

// environment map from the sky (for PBR reflections)
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSunDir: U.uSunDir }, vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: NOISE + SKY + `varying vec3 vDir; void main(){ vec3 c = skyColor(normalize(vDir), 3); gl_FragColor = vec4(min(c, vec3(4.)), 1.); }`, side: THREE.BackSide,
  }));
  envScene.add(envSky);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
}
scene.fog = new THREE.Fog(new THREE.Color(0.56, 0.30, 0.33), 500, 6500);

const sun = new THREE.DirectionalLight(sunColor, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(new THREE.Color(0.55, 0.45, 0.75), new THREE.Color(0.10, 0.10, 0.12), 0.9);
scene.add(hemi);
sun.layers.enable(1); hemi.layers.enable(1);

// ------------------------------------------------------------ waves (shared CPU / GPU)
const WAVES = [
  { L: 68, ang: 0.35, s: 0.10 }, { L: 37, ang: -0.55, s: 0.12 }, { L: 21, ang: 1.05, s: 0.10 },
  { L: 12.5, ang: -0.15, s: 0.075 }, { L: 7.3, ang: -1.1, s: 0.05 }, { L: 4.1, ang: 0.85, s: 0.035 },
].map(w => ({ ...w, k: 2 * Math.PI / w.L, dx: Math.cos(w.ang), dz: Math.sin(w.ang) }));
const uW = WAVES.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.s));
function waveDisp(x, z, t, out) {
  let dx = 0, dy = 0, dz = 0;
  for (const w of WAVES) { const a = w.s / w.k, c = Math.sqrt(9.81 / w.k); const f = w.k * (w.dx * x + w.dz * z - c * t); const cf = Math.cos(f); dx += w.dx * a * cf; dz += w.dz * a * cf; dy += a * Math.sin(f); }
  out[0] = dx; out[1] = dy; out[2] = dz; return out;
}
const _d = [0, 0, 0];
function heightAt(x, z, t) { let px = x, pz = z; for (let i = 0; i < 3; i++) { waveDisp(px, pz, t, _d); px = x - _d[0]; pz = z - _d[2]; } return waveDisp(px, pz, t, _d)[1]; }

// ------------------------------------------------------------ ocean
const reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
const oceanU = {
  ...U, uW: { value: uW }, uCenter: { value: new THREE.Vector2() },
  uShipPos: { value: new THREE.Vector2() }, uShipFwd: { value: new THREE.Vector2(0, -1) }, uShipSpeed: { value: 7 },
  uRefl: { value: reflRT.texture }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 1 },
};
function oceanGeometry(N = 384) {
  const pos = new Float32Array((N + 1) * (N + 1) * 3); const idx = [];
  const warp = u => Math.sign(u) * (200 * Math.abs(u) + 3800 * Math.pow(Math.abs(u), 6));
  let p = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { pos[p++] = warp(i / N * 2 - 1); pos[p++] = 0; pos[p++] = warp(j / N * 2 - 1); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
const ocean = new THREE.Mesh(oceanGeometry(), new THREE.ShaderMaterial({ uniforms: oceanU, vertexShader: OCEAN_VERT, fragmentShader: NOISE + SKY + OCEAN_FRAG }));
ocean.frustumCulled = false;
scene.add(ocean);
const OCEAN_SNAP = 200 * 2 / 384;

// ------------------------------------------------------------ ship
const sunView = { value: new THREE.Vector3() };
const { ship, updateSails, updateFlags, lanterns } = buildShip(sunView);
scene.add(ship);
ship.rotation.order = 'YXZ';
ship.traverse(o => { o.layers.enable(1); });
const lanternLight = new THREE.PointLight(new THREE.Color(1.0, 0.6, 0.3), 26, 18, 2);
lanternLight.position.copy(lanterns[2]).add(new THREE.Vector3(0, -0.2, -1.2));
ship.add(lanternLight); lanternLight.layers.enable(1);

// ------------------------------------------------------------ distant islands
function makeIsland(seed, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 24); const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let n = 0, a = 1, f = 1.3;
    for (let o = 0; o < 5; o++) { n += a * Math.sin(v.x * f * 3.1 + seed + o) * Math.sin(v.z * f * 2.7 - seed * 1.3) * Math.cos(v.y * f * 2.3 + o * 1.7); a *= 0.5; f *= 2.1; }
    const r = 1 + n * 0.25;
    v.multiplyScalar(r); if (v.y < 0) v.y *= 0.2;
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(0.10, 0.075, 0.08), roughness: 1, flatShading: false }));
  return m;
}
const islands = [makeIsland(1.3, 520, 210, 340), makeIsland(4.1, 380, 140, 300), makeIsland(7.7, 700, 120, 420)];
const islandSpots = [[-2600, -2200], [-1700, -3600], [2400, -3900]];
islands.forEach((m, i) => { m.position.set(islandSpots[i][0], -25, islandSpots[i][1]); scene.add(m); });

// ------------------------------------------------------------ spray particles
const SPRAY = 2400;
const spray = {
  pos: new Float32Array(SPRAY * 3), vel: new Float32Array(SPRAY * 3), life: new Float32Array(SPRAY), max: new Float32Array(SPRAY), size: new Float32Array(SPRAY), head: 0,
};
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray.pos, 3).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aLife', new THREE.BufferAttribute(spray.life, 1).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(spray.size, 1));
const sprayMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 400 }, uMap: { value: softDot() }, uColor: { value: new THREE.Color(1.2, 0.95, 0.8) } },
  vertexShader: `attribute float aLife; attribute float aSize; uniform float uScale; varying float vA;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = aSize*uScale*(0.6+0.8*(1.-aLife))/max(-mv.z,0.5); gl_Position = projectionMatrix*mv; vA = aLife; }`,
  fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
    void main(){ float a = texture2D(uMap, gl_PointCoord).r * vA * smoothstep(1.0, 0.85, vA) * 0.55; if (a < 0.004) discard; gl_FragColor = vec4(uColor*a, a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const sprayPts = new THREE.Points(sprayGeo, sprayMat); sprayPts.frustumCulled = false; scene.add(sprayPts);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function emitSpray(n, shipVel) {
  for (let k = 0; k < n; k++) {
    const i = spray.head; spray.head = (spray.head + 1) % SPRAY;
    const sd = Math.random() < 0.5 ? -1 : 1;
    const along = 9 + Math.random() * 6.5; // local -z forward
    const s = (14 + along) / 30;
    const hw = s < 0.45 ? 4.1 : 4.1 * Math.pow(Math.max(0, Math.cos((s - 0.45) / 0.55 * Math.PI / 2)), 0.75);
    _v.set(sd * (hw + 0.3), 0.2 + Math.random() * 0.6, -along).applyMatrix4(ship.matrixWorld);
    spray.pos[i * 3] = _v.x; spray.pos[i * 3 + 1] = _v.y; spray.pos[i * 3 + 2] = _v.z;
    _v2.set(sd * (2 + Math.random() * 4.5), 2.5 + Math.random() * 4.5 * (along - 8) / 7, -(1 + Math.random() * 2)).applyQuaternion(ship.quaternion);
    spray.vel[i * 3] = _v2.x + shipVel.x * 0.75; spray.vel[i * 3 + 1] = _v2.y; spray.vel[i * 3 + 2] = _v2.z + shipVel.z * 0.75;
    spray.max[i] = 0.9 + Math.random() * 1.1; spray.life[i] = 1.0; spray.size[i] = 0.12 + Math.random() * 0.3;
  }
  sprayGeo.attributes.aSize.needsUpdate = true;
}
function updateSpray(dt) {
  for (let i = 0; i < SPRAY; i++) {
    if (spray.life[i] <= 0) continue;
    spray.life[i] -= dt / spray.max[i];
    spray.vel[i * 3 + 1] -= 9.8 * dt;
    const drag = Math.exp(-dt * 0.9);
    spray.vel[i * 3] *= drag; spray.vel[i * 3 + 2] *= drag;
    spray.pos[i * 3] += spray.vel[i * 3] * dt; spray.pos[i * 3 + 1] += spray.vel[i * 3 + 1] * dt; spray.pos[i * 3 + 2] += spray.vel[i * 3 + 2] * dt;
    if (spray.pos[i * 3 + 1] < -0.6) spray.life[i] = 0;
    if (spray.life[i] < 0) spray.life[i] = 0;
  }
  sprayGeo.attributes.position.needsUpdate = true; sprayGeo.attributes.aLife.needsUpdate = true;
}

// ------------------------------------------------------------ gulls
const gulls = [];
{
  const bodyG = new THREE.CapsuleGeometry(0.11, 0.42, 4, 8); bodyG.rotateX(Math.PI / 2);
  const wingG = new THREE.BufferGeometry();
  wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0.55, 0.02, -0.05, 0, 0, 0.18, 0.55, 0.02, -0.05, 1.05, 0.0, 0.12, 0, 0, 0.18], 3));
  wingG.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, .9, .9, .92, 1, 1, 1, .9, .9, .92, .15, .15, .17, 1, 1, 1], 3));
  wingG.computeVertexNormals();
  const wMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  const bMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyG, bMat));
    const wl = new THREE.Group(), wr = new THREE.Group();
    const ml = new THREE.Mesh(wingG, wMat), mr = new THREE.Mesh(wingG, wMat); mr.scale.x = -1;
    wl.add(ml); wr.add(mr); g.add(wl, wr);
    g.scale.setScalar(1.6);
    scene.add(g);
    gulls.push({ g, wl, wr, r: 22 + Math.random() * 26, h: 22 + Math.random() * 18, sp: (0.18 + Math.random() * 0.14) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28, fl: 6 + Math.random() * 3 });
  }
}
function updateGulls(t, shipPos) {
  for (const b of gulls) {
    const a = b.ph + t * b.sp;
    const x = shipPos.x + Math.cos(a) * b.r, z = shipPos.z + Math.sin(a) * b.r * 0.8 - 8, y = b.h + Math.sin(t * 0.5 + b.ph) * 2.5;
    const nx = shipPos.x + Math.cos(a + 0.05 * Math.sign(b.sp)) * b.r, nz = shipPos.z + Math.sin(a + 0.05 * Math.sign(b.sp)) * b.r * 0.8 - 8 - 7 * 0.05 / Math.abs(b.sp);
    b.g.position.set(x, y, z);
    b.g.lookAt(nx, y, nz);
    b.g.rotation.z += -Math.sign(b.sp) * 0.35;
    const glide = Math.sin(t * 0.37 + b.ph) > 0.3;
    const flap = glide ? 0.12 + Math.sin(t * 2 + b.ph) * 0.05 : Math.sin(t * b.fl + b.ph) * 0.6;
    b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
  }
}

// ------------------------------------------------------------ post processing
const composerRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerRT);
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.42, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`, fragmentShader: GRADE_FRAG });
composer.addPass(grade);

// ------------------------------------------------------------ reflection camera
const reflCam = new THREE.PerspectiveCamera();
reflCam.layers.set(1);
const clipPlane = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05)];
const biasM = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderReflection() {
  reflCam.fov = camera.fov; reflCam.aspect = camera.aspect; reflCam.near = camera.near; reflCam.far = 2000; reflCam.updateProjectionMatrix();
  reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
  const tgt = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position); tgt.y = -tgt.y;
  reflCam.up.set(0, -1, 0); reflCam.lookAt(tgt); reflCam.updateMatrixWorld();
  oceanU.uReflMatrix.value.copy(biasM).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  const prevAuto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.clippingPlanes = clipPlane;
  renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 0); renderer.clear();
  sprayPts.visible = false;
  renderer.render(scene, reflCam);
  sprayPts.visible = true;
  renderer.setRenderTarget(null); renderer.clippingPlanes = [];
  renderer.shadowMap.autoUpdate = prevAuto;
}

// ------------------------------------------------------------ camera rig
const rig = { yaw: 0, pitch: 0.2, dist: 70, idle: 99, dragging: false, lx: 0, ly: 0, manual: false };
function autopilot(t) {
  return {
    yaw: -1.05 + yawOff + t * 0.042 + 0.35 * Math.sin(t * 0.019),
    pitch: 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.047 + 0.6)),
    dist: 66 + 20 * Math.sin(t * 0.031 + 1.2),
  };
}
Object.assign(rig, autopilot(0));
const el = renderer.domElement;
el.style.touchAction = 'none';
el.addEventListener('pointerdown', e => { rig.dragging = true; rig.lx = e.clientX; rig.ly = e.clientY; rig.idle = 0; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointermove', e => {
  if (!rig.dragging) return;
  const dx = e.clientX - rig.lx, dy = e.clientY - rig.ly; rig.lx = e.clientX; rig.ly = e.clientY;
  rig.yaw -= dx * 0.005; rig.pitch = Math.min(1.25, Math.max(0.02, rig.pitch + dy * 0.004)); rig.idle = 0;
});
const endDrag = () => { rig.dragging = false; };
el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
el.addEventListener('wheel', e => { e.preventDefault(); rig.dist = Math.min(180, Math.max(24, rig.dist * Math.exp(e.deltaY * 0.001))); rig.idle = 0; }, { passive: false });
const lookTarget = new THREE.Vector3();
const angWrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------ resize + adaptive quality
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h);
  composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
  const rw = Math.max(256, Math.floor(w * pixelRatio * 0.5)), rh = Math.max(256, Math.floor(h * pixelRatio * 0.5));
  reflRT.setSize(rw, rh);
  grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  sprayMat.uniforms.uScale.value = h * pixelRatio * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}
window.addEventListener('resize', resize); resize();
let fpsAcc = 0, fpsN = 0, fpsT = 0;
const maxPR = Math.min(window.devicePixelRatio || 1, 1.75);
function adapt(dt) {
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT < 2.5) return;
  const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsT = 0;
  if (fps < 42 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); resize(); }
  else if (fps > 58 && pixelRatio < maxPR) { pixelRatio = Math.min(maxPR, pixelRatio + 0.1); resize(); }
}

// ------------------------------------------------------------ main loop
const SPEED = 7.2;
const fwd = new THREE.Vector3(0, 0, -1);
const shipState = { y: 0, pitch: 0, roll: 0, vy: 0 };
const prevShip = new THREE.Vector3();
const clock = new THREE.Clock();
let t = 0, sprayAcc = 0, prevBowH = 0;
if (fixedT) t = parseFloat(fixedT);
const shipVel = new THREE.Vector3(0, 0, -SPEED);

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  U.uTime.value = t; grade.uniforms.uTime.value = t;

  // ---- ship motion: forward travel + buoyancy from wave samples
  const sx = 0, sz = -SPEED * t;
  const yaw = Math.sin(t * 0.13) * 0.012;
  const cy = Math.cos(yaw), syw = Math.sin(yaw);
  const sample = (lx, lz) => heightAt(sx + lx * cy + lz * syw, sz - lx * syw + lz * cy, t);
  const hb = sample(0, -13), hs = sample(0, 12), hp = sample(-3.8, 0), hst = sample(3.8, 0), hc = sample(0, 0);
  const tgtY = (hb + hs + hp + hst + hc * 2) / 6 - 0.1;
  const tgtPitch = Math.atan2(hb - hs, 25) * 0.85;
  const tgtRoll = Math.atan2(hp - hst, 7.6) * -0.65 + 0.045;
  const k = 1 - Math.exp(-dt * 2.4);
  shipState.y += (tgtY - shipState.y) * k;
  shipState.pitch += (tgtPitch - shipState.pitch) * (1 - Math.exp(-dt * 2.0));
  shipState.roll += (tgtRoll - shipState.roll) * (1 - Math.exp(-dt * 1.6));
  ship.position.set(sx, shipState.y, sz);
  ship.rotation.set(shipState.pitch, yaw, shipState.roll);
  ship.updateMatrixWorld();

  // ---- spray from the bow, stronger when it plunges
  const bowVel = (hb - prevBowH) / Math.max(dt, 1e-3); prevBowH = hb;
  sprayAcc += dt * (220 + Math.max(0, -bowVel) * 380);
  const n = Math.floor(sprayAcc); sprayAcc -= n; if (n > 0) emitSpray(Math.min(n, 120), shipVel);
  updateSpray(dt);

  updateSails(t, Math.max(0, Math.sin(t * 0.21)) * Math.sin(t * 0.9));
  updateFlags(t);
  updateGulls(t, ship.position);

  // islands recycle far behind
  for (const m of islands) if (m.position.z - sz > 3200) m.position.z -= 7600;

  // ---- camera
  rig.idle += dt;
  if (QS.get('pitch')) { rig.pitch = +QS.get('pitch'); rig.dist = +(QS.get('dist') || 40); rig.yaw = yawOff; rig.idle = 0; rig.dragging = true; }
  const ap = autopilot(t);
  if (rig.idle > 5 && !rig.dragging) {
    const b = 1 - Math.exp(-dt * 0.35 * Math.min(1, (rig.idle - 5) / 3));
    rig.yaw += angWrap(ap.yaw - rig.yaw) * b; rig.pitch += (ap.pitch - rig.pitch) * b; rig.dist += (ap.dist - rig.dist) * b;
  } else if (!rig.dragging) {
    rig.yaw += 0.02 * dt; // slow drift while waiting
  }
  const tgt = new THREE.Vector3(sx, 11 + shipState.y * 0.35, sz - 2);
  if (lookTarget.lengthSq() === 0) lookTarget.copy(tgt); else lookTarget.lerp(tgt, 1 - Math.exp(-dt * 3));
  lookTarget.z = tgt.z; // follow travel exactly
  const cp = Math.cos(rig.pitch);
  camera.position.set(
    lookTarget.x + Math.sin(rig.yaw) * cp * rig.dist,
    lookTarget.y + Math.sin(rig.pitch) * rig.dist - 4,
    lookTarget.z + Math.cos(rig.yaw) * cp * rig.dist,
  );
  // handheld float
  camera.position.x += Math.sin(t * 0.7) * 0.25; camera.position.y += Math.sin(t * 0.53 + 1) * 0.3;
  const wh = heightAt(camera.position.x, camera.position.z, t);
  if (camera.position.y < wh + 2.2) camera.position.y = wh + 2.2;
  camera.lookAt(lookTarget);
  camera.updateMatrixWorld();

  // ---- uniforms
  sky.position.copy(camera.position);
  oceanU.uCenter.value.set(Math.round(camera.position.x / OCEAN_SNAP) * OCEAN_SNAP, Math.round(camera.position.z / OCEAN_SNAP) * OCEAN_SNAP);
  oceanU.uShipPos.value.set(sx, sz);
  oceanU.uShipFwd.value.set(-syw, -cy);
  sunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
  sun.position.copy(ship.position).addScaledVector(sunDir, 120); sun.target.position.copy(ship.position).add(new THREE.Vector3(0, 10, 0));
  lanternLight.intensity = 24 + Math.sin(t * 11) * 2 + Math.sin(t * 23) * 1.5;

  renderReflection();
  composer.render(dt);
  adapt(dt);
  if (!window.__ready) { window.__ready = true; requestAnimationFrame(() => document.getElementById('fade').style.opacity = '0'); }
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
