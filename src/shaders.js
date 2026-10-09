// Shared GLSL: noise + stylised sunset sky
export const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
vec3 noised(vec2 x){ vec2 i = floor(x), f = fract(x); vec2 u = f*f*(3.-2.*f); vec2 du = 6.*f*(1.-f);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y, du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx)); }
float fbm(vec2 p, int oct){ float s = 0., a = .5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){ if(i>=oct) break; s += a*vnoise(p); p = m*p + 7.13; a *= .5; } return s; }
`;

export const SKY = /* glsl */`
uniform vec3 uSunDir;
uniform float uTime;
vec3 skyBase(vec3 d){
  float y = d.y;
  vec3 sunH = normalize(vec3(uSunDir.x, 0., uSunDir.z));
  vec3 dh = normalize(vec3(d.x, 0., d.z) + vec3(1e-5));
  float az = dot(dh, sunH)*.5+.5;
  float sd = max(dot(d, uSunDir), 0.);
  vec3 zenith  = vec3(0.020, 0.035, 0.13);
  vec3 upper   = mix(vec3(0.10, 0.08, 0.26), vec3(0.36, 0.15, 0.24), az*az);
  vec3 horizon = mix(vec3(0.36, 0.20, 0.34), vec3(1.45, 0.60, 0.20), pow(az, 2.0));
  float hy = max(y, 0.);
  vec3 col = mix(horizon, upper, smoothstep(0.0, 0.20, hy));
  col = mix(col, zenith, smoothstep(0.16, 0.75, hy));
  // warm band hugging the horizon
  col += vec3(0.60, 0.22, 0.05) * exp(-hy*30.) * (0.15 + 0.85*az*az);
  col += vec3(1.0, 0.45, 0.16) * pow(sd, 6.) * 0.32;
  col += vec3(1.0, 0.60, 0.28) * pow(sd, 60.) * 0.55 + vec3(1.0,0.7,0.4)*pow(sd,600.)*0.8;
  return col;
}
vec3 skyColor(vec3 d, int oct){
  d = normalize(d);
  float y = d.y;
  vec3 col = skyBase(vec3(d.x, max(y, 0.0), d.z));
  float sd = max(dot(d, uSunDir), 0.);
  // sun disc (behind clouds)
  float disc = smoothstep(0.99955, 0.99975, dot(d, uSunDir));
  col += vec3(7.5, 4.2, 1.9) * disc;
  if (y > 0.0 && oct > 0) {
    vec2 uv = d.xz / (y + 0.09) * 0.75 + vec2(uTime*0.006, uTime*0.0025);
    float n = fbm(uv*1.15, oct);
    float streak = fbm(uv*vec2(0.35, 2.4) + 4.7, oct);
    float cov = smoothstep(0.44, 0.74, n) + smoothstep(0.50, 0.80, streak)*0.65;
    cov = clamp(cov, 0., 1.) * smoothstep(0.0, 0.06, y) * (1. - smoothstep(0.55, 0.95, y)*0.6);
    float lit = pow(sd, 2.5);
    float edge = 1. - smoothstep(0.55, 0.85, n);
    vec3 cdark = mix(vec3(0.20, 0.10, 0.20), vec3(0.42, 0.18, 0.20), lit);
    vec3 cbright = mix(vec3(1.05, 0.42, 0.30), vec3(2.2, 1.15, 0.50), lit);
    vec3 ccol = mix(cdark, cbright, clamp(0.18 + 0.55*lit + 0.45*edge*(0.3+0.7*lit), 0., 1.));
    ccol = mix(ccol, col, smoothstep(0.25, 0.0, y)*0.35);
    col = mix(col, ccol, cov*0.92);
  }
  return col;
}
`;

export const OCEAN_VERT = /* glsl */`
uniform float uTime;
uniform vec2 uCenter;
uniform vec4 uW[6];
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
uniform vec2 uShipPos;
uniform vec2 uShipFwd;
float beamGLv(float s){
  s = clamp(s, 0., 1.);
  if (s < 0.45) return 4.1*(0.78 + 0.22*sin(s/0.45*1.5707963));
  return 4.1*pow(max(cos((s-0.45)/0.55*1.5707963), 0.), 0.75);
}
void main(){
  vec2 p = position.xz + uCenter;
  float dist = length(p - cameraPosition.xz);
  vec3 d = vec3(0.);
  for (int i=0;i<6;i++){
    vec4 w = uW[i];
    float k = w.z; float L = 6.2831853/k;
    float fade = 1. - smoothstep(L*8., L*22., dist);
    float s = w.w*fade; float a = s/k; float c = sqrt(9.81/k);
    float f = k*(dot(w.xy, p) - c*uTime);
    d.x += w.x*a*cos(f); d.z += w.y*a*cos(f); d.y += a*sin(f);
  }
  // keep the sea out of the hull: sink it well below the keel inside the footprint
  vec2 rel = p - uShipPos;
  float along = dot(rel, uShipFwd);
  float alat = abs(dot(rel, vec2(-uShipFwd.y, uShipFwd.x)));
  if (along > -14.5 && along < 16.0) {
    float hw = beamGLv((14. + along)/30.)*0.98;
    float inside = smoothstep(-0.35, -1.3, alat - hw);
    d.y = mix(d.y, -7.0, inside);
  }
  vec3 wp = vec3(p.x + d.x, d.y, p.y + d.z);
  vWorld = wp; vXZ = p; vH = d.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}
`;

export const OCEAN_FRAG = /* glsl */`
uniform vec4 uW[6];
uniform vec3 uSunColor;
uniform vec2 uShipPos;
uniform vec2 uShipFwd;
uniform float uShipSpeed;
uniform sampler2D uRefl;
uniform mat4 uReflMatrix;
uniform float uReflOn;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;

float beamGL(float s){
  s = clamp(s, 0., 1.);
  if (s < 0.45) return 4.1*(0.78 + 0.22*sin(s/0.45*1.5707963));
  return 4.1*pow(max(cos((s-0.45)/0.55*1.5707963), 0.), 0.75);
}
vec3 fbmd(vec2 p){ float a = .5, f = 1.; vec3 s = vec3(0.);
  for(int i=0;i<4;i++){ vec3 n = noised(p*f + float(i)*17.31); s.x += a*n.x; s.yz += a*f*n.yz; a *= .5; f *= 2.03; } return s; }
float ridged(vec2 p){ float s=0., a=.55; for(int i=0;i<3;i++){ s += a*(1.-abs(2.*vnoise(p)-1.)); p = p*2.1 + 3.7; a*=.5; } return s; }

void main(){
  vec2 p = vXZ;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // analytic Gerstner normal + jacobian
  float Sxx=0., Szz=0., Sxz=0., Cx=0., Cz=0.;
  float foot = length(fwidth(p));                         // world size of one pixel
  for (int i=0;i<6;i++){
    vec4 w = uW[i];
    float k = w.z; float L = 6.2831853/k;
    float s = w.w*(1. - smoothstep(L*45., L*160., dist))*(1. - smoothstep(L*0.12, L*0.35, foot));
    float c = sqrt(9.81/k);
    float f = k*(dot(w.xy, p) - c*uTime);
    float S = sin(f), C = cos(f);
    Sxx += w.x*w.x*s*S; Szz += w.y*w.y*s*S; Sxz += w.x*w.y*s*S;
    Cx += w.x*s*C; Cz += w.y*s*C;
  }
  vec3 Tx = vec3(1.-Sxx, Cx, -Sxz);
  vec3 Tz = vec3(-Sxz, Cz, 1.-Szz);
  vec3 N = normalize(cross(Tz, Tx));
  float J = (1.-Sxx)*(1.-Szz) - Sxz*Sxz;

  // ship-relative frame for wake + hull foam
  vec2 rel = p - uShipPos;
  vec2 right = vec2(-uShipFwd.y, uShipFwd.x);
  float along = dot(rel, uShipFwd);
  float lat = dot(rel, right);
  float alat = abs(lat);
  float sH = (14. + along)/30.;
  float hw = (along > -14.5 && along < 16.0) ? beamGL(sH)*0.98 : -1.;
  float dHull = alat - max(hw, 0.);
  float inHullZone = step(-14.5, along)*step(along, 16.0);
  // inside the hull footprint the sea is pushed below the keel; paint any glimpse of it as the dark hold
  if (inHullZone > 0.5 && dHull < -0.35) { gl_FragColor = vec4(vec3(0.018, 0.012, 0.009), 1.0); return; }
  float bowF = smoothstep(4., 15., along);

  float back = -14. - along;                 // distance behind the stern
  float fromBow = 15.5 - along;              // distance behind the bow
  float behind = smoothstep(-2., 4., back);
  // central turbulent wake
  float ww = 3.0 + max(back,0.)*0.075;
  float wakeCore = behind * smoothstep(ww, ww*0.2, alat) * exp(-max(back,0.)/110.);
  // kelvin arms from the bow
  float armLat = 2.2 + max(fromBow,0.)*0.36;
  float armW = 0.9 + fromBow*0.035;
  float arm = exp(-pow((alat-armLat)/armW, 2.)) * smoothstep(0., 6., fromBow) * exp(-max(fromBow,0.)/120.);
  float arm2 = exp(-pow((alat-armLat*0.82)/(armW*1.4), 2.)) * smoothstep(8., 20., fromBow) * exp(-max(fromBow,0.)/90.)*0.5;
  // hull hugging foam / bow wave
  float hullBand = inHullZone * smoothstep(0.6 + 2.6*bowF, 0.0, dHull) * step(-0.3, dHull);

  float wakeMask = clamp(wakeCore + arm + arm2 + hullBand*(0.55+0.6*bowF), 0., 1.5);

  // detail normals (stronger inside the wake)
  float dfade = (1. - smoothstep(60., 900., dist))*(1. - smoothstep(0.35, 1.2, foot));
  vec3 n1 = fbmd(p*0.16 + vec2(uTime*0.11, uTime*0.05));
  vec3 n2 = fbmd(p*0.47 - vec2(uTime*0.07, -uTime*0.13));
  vec2 g = n1.yz*0.16 + n2.yz*0.47*0.5;
  float detailAmp = (0.34 + wakeMask*0.6) * dfade;
  N = normalize(N + vec3(-g.x, 0., -g.y)*detailAmp);

  // ---------- shading ----------
  vec3 L = uSunDir;
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98*pow(1. - NdV, 5.);
  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.005);
  vec3 refl = skyColor(R, 2) * 0.85;
  // reflection of the ship (planar render, distorted by waves)
  if (uReflOn > 0.5) {
    vec4 rc = uReflMatrix * vec4(vWorld.x, 0.0, vWorld.z, 1.0);
    vec2 ruv = rc.xy / rc.w + N.xz*0.09*clamp(40./dist, 0.25, 1.0);
    vec4 rs = texture2D(uRefl, ruv);
    refl = mix(refl, rs.rgb*0.8, rs.a*0.85);
  }
  vec3 deep = vec3(0.002, 0.016, 0.034);
  vec3 shallow = vec3(0.02, 0.17, 0.15);
  float sunDiff = max(dot(N, L), 0.);
  float facing = pow(max(dot(-V, L), 0.), 3.);            // looking toward the sun
  float sss = clamp(vH*0.45 + 0.35, 0., 1.) * (0.25 + 1.6*facing) * (0.3 + 0.7*pow(1.-NdV, 2.));
  vec3 body = deep*(0.6 + 0.8*sunDiff) + shallow*sss*uSunColor*0.55;
  // darken under/near hull
  float ao = mix(0.55, 1., smoothstep(-0.5, 5., dHull + (1.-inHullZone)*20.));
  body *= ao;
  vec3 col = mix(body, refl, fres);
  // roughen the highlight with distance so far glints merge instead of strobing
  float rough = clamp(foot*0.6, 0., 1.);
  float RL = max(dot(R, L), 0.);
  float sharpP = mix(900., 160., rough);
  float spec = pow(RL, sharpP)*mix(16., 3., rough) + pow(RL, 90.)*0.28;
  col += uSunColor*min(spec, 6.0)*(0.55 + 0.45*dfade);

  // ---------- foam ----------
  float rn = ridged(p*0.55 + vec2(0., uTime*0.05));
  float rn2 = ridged(p*vec2(1.4, 1.4) + 11.3);
  float crest = smoothstep(0.80, 0.46, J) * smoothstep(-0.2, 0.9, vH);
  float foamA = crest * smoothstep(0.55, 1.15, rn*0.9 + crest*0.5) ;
  float wakeTex = smoothstep(0.75 - wakeMask*0.35, 1.05 - wakeMask*0.2, rn*0.62 + rn2*0.5);
  float foamB = clamp(wakeMask,0.,1.) * wakeTex;
  foamB += smoothstep(0.45, 0.9, hullBand) * 0.6 * smoothstep(0.6, 1.0, rn2*0.7+0.5);
  float foam = clamp(max(foamA*0.85, foamB), 0., 1.) * (1. - smoothstep(400., 1600., dist));
  vec3 foamCol = vec3(0.95, 0.92, 0.88) * (0.32 + 0.75*sunDiff*uSunColor) + refl*0.12;
  col = mix(col, foamCol, foam*0.92);
  // thin bubbly film around foam
  col += vec3(0.05, 0.10, 0.10) * clamp(wakeMask, 0., 1.) * 0.4;

  // ---------- atmospheric depth ----------
  vec3 hdir = normalize(vec3(-V.x, 0.0, -V.z));
  vec3 fogCol = skyBase(hdir);
  float fogA = 1. - exp(-dist/1500.);
  fogA = pow(fogA, 1.3);
  col = mix(col, fogCol, fogA);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }
`;
export const SKY_FRAG = /* glsl */`
varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); gl_FragColor = vec4(skyColor(d, 5), 1.); }
`;

export const GRADE_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 q = vUv - 0.5;
  // gentle lateral chromatic fringe toward the edges
  float ca = dot(q,q)*0.006;
  vec3 c;
  c.r = texture2D(tDiffuse, vUv - q*ca).r;
  c.g = texture2D(tDiffuse, vUv).g;
  c.b = texture2D(tDiffuse, vUv + q*ca).b;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c *= mix(vec3(0.90, 0.96, 1.10), vec3(1.06, 1.0, 0.93), smoothstep(0.05, 0.75, l));
  c = mix(vec3(l), c, 1.10);
  c = mix(c, c*c*(3.-2.*c), 0.22);
  float vig = 1. - dot(q*vec2(1.0, 1.25), q*vec2(1.0, 1.25))*1.05;
  c *= mix(0.55, 1.0, smoothstep(0.0, 1.0, vig));
  c += (h(vUv*uRes + fract(uTime*7.31)*91.7) - 0.5) * 0.022;
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}
`;
