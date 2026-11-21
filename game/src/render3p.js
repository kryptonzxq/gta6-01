// Vice City Nights — third-person renderer.
// Renders the same world (city, cars, peds, police, markers) from a camera
// behind and above the player, looking along the player's heading, in
// perspective — the way GTA does. Vanilla canvas 2D only, no library:
//   * the ground is a Mode 7 plane: the pre-rendered city layer is sampled
//     row by row through an affine map, so roads and parks recede into
//     the distance under a sky with a setting sun;
//   * buildings, cars, pedestrians, pickups and markers are vertical
//     billboards, projected through the camera and painted far-to-near
//     (painter's algorithm), so nearer things occlude farther ones.
// The game logic, HUD, minimap and sounds are untouched — only the view
// changes. The top-down city layer is replaced by a flat ground layer
// (no building roofs, no trees — those are billboards now).
import { CAR_TYPES } from './vehicles.js';

// Camera tuning, in world units. The camera sits behind the player and
// pulls back a little with speed; it is low enough to feel street-level
// and high enough that the player's car is framed at the bottom centre.
const CAM_FOOT = { dist: 105, h: 56 };
const CAM_CAR = { dist: 150, h: 74 };
// World height of one building level, and of a standing person / car body.
const BUILDING_H = 55;
const PERSON_H = 26;
const CAR_BODY_H = 20;
const CAR_ROOF_H = 13;
// Nothing is drawn past this ground distance.
const MAX_GROUND_Z = 4000;
const MAX_BILLBOARD_Z = 2500;

function angLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function roundRect3p(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- Camera ---------------------------------------------------------------

export function createCamera3p(state) {
  const pl = state.player;
  return {
    x: pl.x, y: pl.y + CAM_FOOT.dist, h: CAM_FOOT.h,
    heading: pl.angle, dist: CAM_FOOT.dist,
  };
}

// Smooth chase camera: heading eases toward the player's heading, the
// camera eases to a point behind the player, height grows with speed.
export function updateCamera3p(state, dt) {
  const pl = state.player;
  const c = state.cam3;
  const speed = Math.abs(pl.speed || 0);
  const want = pl.car ? CAM_CAR : CAM_FOOT;
  const dist = want.dist + Math.min(50, speed * 0.09);
  const h = want.h + Math.min(14, speed * 0.03);
  c.heading = angLerp(c.heading, pl.angle, Math.min(1, dt * 4.5));
  const fx = Math.sin(c.heading), fy = -Math.cos(c.heading);
  const tx = pl.x - fx * dist, ty = pl.y - fy * dist;
  const k = Math.min(1, dt * 6);
  c.x += (tx - c.x) * k;
  c.y += (ty - c.y) * k;
  c.h += (h - c.h) * Math.min(1, dt * 4);
  c.dist = dist;
  // Keep the legacy top-down cam in sync (minimap + aiming helpers).
  state.cam.x = c.x; state.cam.y = c.y;
}

// Put the camera exactly where it belongs right now (no easing) — used by
// the ?shot= showcase states so the first frame is already framed.
export function snapCamera3p(state) {
  const pl = state.player;
  const c = state.cam3;
  const speed = Math.abs(pl.speed || 0);
  const want = pl.car ? CAM_CAR : CAM_FOOT;
  const dist = want.dist + Math.min(50, speed * 0.09);
  const h = want.h + Math.min(14, speed * 0.03);
  c.heading = pl.angle;
  const fx = Math.sin(c.heading), fy = -Math.cos(c.heading);
  c.x = pl.x - fx * dist;
  c.y = pl.y - fy * dist;
  c.h = h; c.dist = dist;
  state.cam.x = c.x; state.cam.y = c.y;
}

// --- Projection -----------------------------------------------------------
// view3 is computed once per frame in renderGame3p: focal length f, the
// horizon row, the screen centre, the pitch (tanTheta) and the camera basis
// (forward F and right R in world coordinates).
function computeView(state) {
  const vw = state.view.w, vh = state.view.h;
  const f = Math.max(520, vw * 0.72);
  const horizonY = Math.round(vh * 0.36);
  const cy = vh / 2;
  const tanTheta = (cy - horizonY) / f;
  const c = state.cam3;
  return {
    vw, vh, f, horizonY, cy, tanTheta,
    fx: Math.sin(c.heading), fy: -Math.cos(c.heading),
    rx: Math.cos(c.heading), ry: Math.sin(c.heading),
  };
}

// Project a world point (wx, wy) at height hw above the ground to screen.
// Returns { sx, sy, scale, Z } or null when behind / too close to the camera.
export function project3p(state, wx, wy, hw) {
  const c = state.cam3, v = state.view3;
  if (!v) return null;
  const dx = wx - c.x, dy = wy - c.y;
  const Z = dx * v.fx + dy * v.fy;
  if (Z < 8) return null;
  const L = dx * v.rx + dy * v.ry;
  const sx = v.vw / 2 + (L / Z) * v.f;
  const tanPhi = (c.h - hw) / Z;
  const t = (tanPhi - v.tanTheta) / (1 + tanPhi * v.tanTheta);
  const sy = v.cy + v.f * t;
  return { sx, sy, scale: v.f / Z, Z };
}

// --- Sky ------------------------------------------------------------------

function drawSky(state) {
  const ctx = state.ctx, v = state.view3;
  const dusk = state.dusk;
  const g = ctx.createLinearGradient(0, 0, 0, v.horizonY + 2);
  if (dusk) {
    g.addColorStop(0, '#160d2e'); g.addColorStop(0.55, '#47204e'); g.addColorStop(1, '#c65a2e');
  } else {
    g.addColorStop(0, '#2c3a6e'); g.addColorStop(0.55, '#7a5a8a'); g.addColorStop(1, '#ff9a3c');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.vw, v.horizonY + 2);
  // The sun sits in the west (world -x). Show the glow only when the
  // camera looks toward it; otherwise the warm horizon is enough.
  const wz = -v.fx, wl = -v.rx;
  if (wz > 0.05) {
    const sx = v.vw / 2 + (wl / wz) * v.f;
    if (sx > -220 && sx < v.vw + 220) {
      const sunY = v.horizonY - (dusk ? 6 : 18);
      const rg = ctx.createRadialGradient(sx, sunY, 4, sx, sunY, 200);
      rg.addColorStop(0, dusk ? 'rgba(255,120,60,0.95)' : 'rgba(255,220,150,0.95)');
      rg.addColorStop(0.25, 'rgba(255,150,70,0.55)');
      rg.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(sx - 210, sunY - 210, 420, 420);
      ctx.fillStyle = dusk ? '#ff7a3c' : '#ffe9a8';
      ctx.beginPath(); ctx.arc(sx, sunY, dusk ? 26 : 30, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// --- Ground (Mode 7) ------------------------------------------------------
// For each screen row below the horizon, the ground line at that row is a
// segment in the world; an affine map paints the city layer's strip onto
// the row. Rows near the horizon are far away and compressed, rows at the
// bottom are close and sharp.
function drawGround(state) {
  const ctx = state.ctx, v = state.view3, c = state.cam3;
  const layer = state.cityLayer;
  ctx.fillStyle = '#5a6b46';
  ctx.fillRect(0, v.horizonY, v.vw, v.vh - v.horizonY);
  const halfW = v.vw / 2;
  const zFor = (y) => {
    const u = (y - v.cy) / v.f;
    const tanPhi = (u + v.tanTheta) / (1 - u * v.tanTheta);
    if (tanPhi <= 0.0001) return Infinity;
    return c.h / tanPhi;
  };
  const step = 2;
  for (let y = v.horizonY + 2; y < v.vh; y += step) {
    const t = Math.min(step, v.vh - y);
    const Zf = zFor(y), Zn = zFor(y + t);
    if (!isFinite(Zf) || Zf > MAX_GROUND_Z) continue;
    const hwf = Zf * halfW / v.f, hwn = Zn * halfW / v.f;
    const cfx = c.x + v.fx * Zf, cfy = c.y + v.fy * Zf;
    const cnx = c.x + v.fx * Zn, cny = c.y + v.fy * Zn;
    // A = far-left, B = far-right, C = near-left.
    const Ax = cfx - v.rx * hwf, Ay = cfy - v.ry * hwf;
    const Bx = cfx + v.rx * hwf, By = cfy + v.ry * hwf;
    const Cx = cnx - v.rx * hwn, Cy = cny - v.ry * hwn;
    const ux = Bx - Ax, uy = By - Ay;
    const vx = Cx - Ax, vy = Cy - Ay;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-6) continue;
    const a00 = (v.vw * vy) / det, a01 = (-v.vw * vx) / det;
    const a10 = (-t * uy) / det, a11 = (t * ux) / det;
    const e = -(a00 * Ax + a01 * Ay);
    const f0 = y - (a10 * Ax + a11 * Ay);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, v.vw, t); ctx.clip();
    ctx.setTransform(a00, a10, a01, a11, e, f0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

// --- Billboards -----------------------------------------------------------

function drawBuildingBox(ctx, state, b, p, top) {
  const v = state.view3;
  const widthW = b.w * Math.abs(v.rx) + b.h * Math.abs(v.ry);
  const depthW = b.w * Math.abs(v.fx) + b.h * Math.abs(v.fy);
  const sw = widthW * p.scale;
  if (sw < 2) return;
  const worldH = b.height * BUILDING_H;
  const syBase = p.sy, syTop = top.sy;
  const faceH = syBase - syTop;
  if (faceH < 2) return;
  const x0 = p.sx - sw / 2;
  // Front face: wall gradient, darker at the base.
  const g = ctx.createLinearGradient(0, syTop, 0, syBase);
  g.addColorStop(0, shade(b.roof, 0.78));
  g.addColorStop(1, shade(b.roof, 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(x0, syTop, sw, faceH);
  // Windows: a deterministic grid, some lit warm.
  const cols = Math.max(1, Math.floor(sw / 26));
  const rows = Math.max(1, Math.floor(faceH / 34));
  const cw = sw / cols, ch = faceH / rows;
  const seed = Math.floor(b.x + b.y);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = ((i * 7 + j * 13 + seed) % 5) === 0;
      ctx.fillStyle = lit ? 'rgba(255,214,130,0.85)' : 'rgba(20,26,40,0.55)';
      ctx.fillRect(x0 + i * cw + cw * 0.25, syTop + j * ch + ch * 0.28, cw * 0.5, ch * 0.44);
    }
  }
  // Roof: a quad from the front top edge back along the view direction.
  const farTop = project3p(state, b.x + b.w / 2 + v.fx * depthW, b.y + b.h / 2 + v.fy * depthW, worldH);
  if (farTop && farTop.Z > 8) {
    const swFar = widthW * farTop.scale;
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(x0, syTop); ctx.lineTo(x0 + sw, syTop);
    ctx.lineTo(farTop.sx + swFar / 2, farTop.sy); ctx.lineTo(farTop.sx - swFar / 2, farTop.sy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1; ctx.stroke();
  }
  // Base shadow on the ground.
  ctx.fillStyle = 'rgba(20,10,5,0.25)';
  ctx.beginPath(); ctx.ellipse(p.sx, syBase, sw * 0.55, Math.max(3, sw * 0.07), 0, 0, Math.PI * 2); ctx.fill();
}

function drawCar3p(ctx, state, car, time) {
  const p = project3p(state, car.x, car.y, 0);
  if (!p) return;
  const v = state.view3;
  const carFx = Math.sin(car.angle), carFy = -Math.cos(car.angle);
  const cosRel = carFx * v.fx + carFy * v.fy; // +1 = facing away, -1 = toward camera
  const sinRel = Math.abs(carFx * v.rx + carFy * v.ry);
  const widthW = car.l * sinRel + car.w * Math.abs(cosRel);
  const sw = Math.max(4, widthW * p.scale);
  const bodyH = CAR_BODY_H * p.scale;
  const roofH = CAR_ROOF_H * p.scale;
  const syBase = p.sy, sx = p.sx;
  const x0 = sx - sw / 2;
  // Ground shadow.
  ctx.fillStyle = 'rgba(20,10,5,0.35)';
  ctx.beginPath(); ctx.ellipse(sx, syBase, sw * 0.55, Math.max(2, sw * 0.06), 0, 0, Math.PI * 2); ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect3p(ctx, x0, syBase - bodyH, sw, bodyH, Math.max(2, bodyH * 0.18));
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(1, p.scale * 0.06); ctx.stroke();
  // Cabin / roof with a dark windshield.
  const cw = sw * 0.62;
  ctx.fillStyle = shade(car.color, 0.8);
  roundRect3p(ctx, sx - cw / 2, syBase - bodyH - roofH, cw, roofH, Math.max(2, roofH * 0.3));
  ctx.fill();
  ctx.fillStyle = 'rgba(18,28,44,0.9)';
  ctx.fillRect(sx - cw / 2 + 2, syBase - bodyH - roofH + 2, cw - 4, Math.max(2, roofH * 0.45));
  // Wheels.
  ctx.fillStyle = '#1a1a1e';
  const wr = Math.max(2, bodyH * 0.16);
  ctx.beginPath(); ctx.arc(x0 + sw * 0.14, syBase - wr * 0.4, wr, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x0 + sw * 0.86, syBase - wr * 0.4, wr, 0, Math.PI * 2); ctx.fill();
  // Rear = taillights, front = headlights.
  const lightW = Math.max(2, sw * 0.12), lightH = Math.max(2, bodyH * 0.18);
  if (cosRel > 0.25) {
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(x0 + 2, syBase - bodyH * 0.42, lightW, lightH);
    ctx.fillRect(x0 + sw - lightW - 2, syBase - bodyH * 0.42, lightW, lightH);
  } else if (cosRel < -0.25) {
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(x0 + 2, syBase - bodyH * 0.42, lightW, lightH);
    ctx.fillRect(x0 + sw - lightW - 2, syBase - bodyH * 0.42, lightW, lightH);
  }
  if (car.type === 'police') {
    const on = Math.floor(time * 4) % 2 === 0;
    const barH = Math.max(2, roofH * 0.3);
    const barY = syBase - bodyH - roofH - barH;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d5bff';
    ctx.fillRect(sx - sw * 0.14, barY, sw * 0.14, barH);
    ctx.fillStyle = on ? '#2d5bff' : '#ff2d2d';
    ctx.fillRect(sx, barY, sw * 0.14, barH);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x0, syBase - bodyH * 0.62, sw, Math.max(2, bodyH * 0.16));
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#222';
    const n = 5;
    for (let i = 0; i < n; i++) ctx.fillRect(x0 + (i * sw) / n, syBase - bodyH * 0.55, sw / n / 2, Math.max(2, bodyH * 0.2));
  }
  if (car.type === 'sports') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0 - 2, syBase - bodyH * 0.9, sw + 4, Math.max(2, bodyH * 0.08));
  }
  if (car.type === 'truck') {
    ctx.fillStyle = '#6b5f45';
    ctx.fillRect(x0 + 2, syBase - bodyH - roofH * 0.4, sw - 4, Math.max(2, roofH * 0.5));
  }
}

function drawPerson3p(ctx, state, x, y, color, angle, down, time, isPlayer) {
  const p = project3p(state, x, y, 0);
  if (!p) return;
  const scale = p.scale;
  const h = PERSON_H * scale;
  const w = 13 * scale;
  const sx = p.sx, syBase = p.sy;
  ctx.fillStyle = 'rgba(20,10,5,0.35)';
  ctx.beginPath(); ctx.ellipse(sx, syBase, w * 0.7, Math.max(2, w * 0.12), 0, 0, Math.PI * 2); ctx.fill();
  if (down > 0) {
    // Knocked flat: a low shape on the ground.
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(sx, syBase - h * 0.06, w * 0.9, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(sx + w * 0.7, syBase - h * 0.06, w * 0.2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const bob = (isPlayer ? state.player.speed : 40) > 0 ? Math.sin(time * 12 + x) * 0.06 * h : 0;
  // Legs.
  ctx.fillStyle = isPlayer ? '#2b3a55' : '#33302e';
  ctx.fillRect(sx - w * 0.32, syBase - h * 0.32 + bob, w * 0.26, h * 0.32);
  ctx.fillRect(sx + w * 0.06, syBase - h * 0.32 - bob, w * 0.26, h * 0.32);
  // Body (from behind).
  ctx.fillStyle = color;
  roundRect3p(ctx, sx - w * 0.5, syBase - h * 0.78, w, h * 0.48, w * 0.2); ctx.fill();
  // Head + hair.
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(sx, syBase - h * 0.86, w * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isPlayer ? '#2b2b2b' : '#222';
  ctx.beginPath(); ctx.arc(sx, syBase - h * 0.9, w * 0.26, Math.PI, 0); ctx.fill();
  if (isPlayer) {
    const pl = state.player;
    if (pl.punchAnim > 0) {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(sx, syBase - h * 0.7, w * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    if (pl.muzzle > 0) {
      ctx.fillStyle = '#ffe9a8';
      ctx.save(); ctx.translate(sx, syBase - h * 0.7); ctx.rotate(time * 3);
      const s = w * 0.5;
      ctx.fillRect(-s, -s * 0.2, s * 2, s * 0.4);
      ctx.fillRect(-s * 0.2, -s, s * 0.4, s * 2);
      ctx.restore();
    }
  }
}

function drawTree3p(ctx, state, t) {
  const p = project3p(state, t.x, t.y, 0);
  if (!p || p.Z > 1500) return;
  const scale = p.scale;
  const r = t.r * scale;
  if (r < 1.5) return;
  const syBase = p.sy, sx = p.sx;
  // Trunk + canopy.
  ctx.fillStyle = '#5a4028';
  ctx.fillRect(sx - Math.max(1, r * 0.12), syBase - r * 0.9, Math.max(2, r * 0.24), r * 0.9);
  ctx.fillStyle = t.c;
  ctx.beginPath(); ctx.arc(sx, syBase - r * 1.1, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(sx - r * 0.3, syBase - r * 1.4, r * 0.4, 0, Math.PI * 2); ctx.fill();
}

function drawPickup3p(ctx, state, pk) {
  const bob = Math.sin(pk.bob) * 6;
  const p = project3p(state, pk.x, pk.y, 0);
  if (!p || p.Z > 1200) return;
  const s = Math.max(3, 22 * p.scale);
  const sy = p.sy - bob * p.scale * 0.1;
  ctx.fillStyle = '#2f9e44';
  ctx.fillRect(p.sx - s / 2, sy - s, s, s);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, p.scale * 0.08);
  ctx.strokeRect(p.sx - s / 2, sy - s, s, s);
  if (p.scale > 1.2) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, Math.min(16, s * 0.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('AMMO', p.sx, sy - s * 0.35);
  }
}

// --- Mission marker -------------------------------------------------------

function drawMarker3p(ctx, state) {
  const mk = state.missionMarker;
  if (!mk) return;
  const p = project3p(state, mk.x, mk.y, 0);
  const top = project3p(state, mk.x, mk.y, 220);
  if (p && top && p.Z < MAX_BILLBOARD_Z) {
    // Vertical gold beam.
    const bw = Math.max(3, 26 * p.scale);
    const grad = ctx.createLinearGradient(0, top.sy, 0, p.sy);
    grad.addColorStop(0, 'rgba(255,210,59,0)');
    grad.addColorStop(1, 'rgba(255,210,59,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(p.sx - bw / 2, top.sy, bw, p.sy - top.sy);
    // Pulsing ground ring.
    const pulse = 1 + Math.sin(state.time * 5) * 0.15;
    ctx.strokeStyle = '#ffd23b'; ctx.lineWidth = Math.max(2, 3 * p.scale * 0.1);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, 46 * p.scale * pulse, 14 * p.scale * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Floating diamond.
    const dy = Math.sin(state.time * 3) * 8 * p.scale * 0.1;
    const ds = Math.max(4, 18 * p.scale);
    ctx.save(); ctx.translate(p.sx, top.sy - ds - dy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23b'; ctx.fillRect(-ds / 2, -ds / 2, ds, ds);
    ctx.restore();
  }
  drawMarkerArrow(state);
}

// A gold arrow at the screen edge when the marker is not in view (GTA-style).
function drawMarkerArrow(state) {
  const mk = state.missionMarker;
  if (!mk) return;
  const ctx = state.ctx, v = state.view3, c = state.cam3;
  const dx = mk.x - c.x, dy = mk.y - c.y;
  const Z = dx * v.fx + dy * v.fy;
  const L = dx * v.rx + dy * v.ry;
  let sx = 0, onScreen = false;
  if (Z > 8) {
    sx = v.vw / 2 + (L / Z) * v.f;
    const p = project3p(state, mk.x, mk.y, 0);
    if (p && sx > 30 && sx < v.vw - 30 && p.sy > 30 && p.sy < v.vh - 30) onScreen = true;
  }
  if (onScreen) return;
  let ax, ay, ang;
  if (Z > 8 && sx < 30) { ax = 46; ay = 120; ang = -Math.PI / 2; }
  else if (Z > 8 && sx > v.vw - 30) { ax = v.vw - 46; ay = 120; ang = Math.PI / 2; }
  else if (Z > 8) { ax = Math.max(50, Math.min(v.vw - 50, sx)); ay = 64; ang = 0; }
  else { ax = v.vw / 2 + Math.max(-1, Math.min(1, L / 200)) * 120; ay = v.vh - 96; ang = Math.PI; }
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffd23b';
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(12, 10); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// --- Skids and particles (projected onto the ground) ----------------------

function drawSkids3p(ctx, state) {
  for (const s of state.skids) {
    const a = project3p(state, s.x1, s.y1, 0);
    const b = project3p(state, s.x2, s.y2, 0);
    if (!a || !b) continue;
    ctx.strokeStyle = `rgba(20,20,25,${Math.min(1, s.life / 4) * 0.6})`;
    ctx.lineWidth = Math.max(1, 4 * Math.min(a.scale, b.scale));
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
}

function drawParticles3p(ctx, state) {
  for (const p of state.particles) {
    const pr = project3p(state, p.x, p.y, 12);
    if (!pr) continue;
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    const r = Math.max(1.5, p.size * pr.scale * 0.4);
    if (p.star) {
      ctx.save(); ctx.translate(pr.sx, pr.sy); ctx.rotate(state.time * 3);
      ctx.fillRect(-r * 2, -r * 0.4, r * 4, r * 0.8);
      ctx.fillRect(-r * 0.4, -r * 2, r * 0.8, r * 4);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// --- Main render ----------------------------------------------------------

export function renderGame3p(state) {
  const ctx = state.ctx;
  const v = computeView(state);
  state.view3 = v;
  const vw = v.vw, vh = v.vh;

  drawSky(state);
  drawGround(state);
  drawSkids3p(ctx, state);

  // Collect every billboard, then paint far-to-near.
  const list = [];
  const push = (Z, fn) => { if (Z > 8 && Z < MAX_BILLBOARD_Z) list.push({ Z, fn }); };

  for (const b of state.city.buildings) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const p = project3p(state, cx, cy, 0);
    if (!p || p.Z > MAX_BILLBOARD_Z) continue;
    if (p.sx < -700 || p.sx > vw + 700) continue;
    const top = project3p(state, cx, cy, b.height * BUILDING_H);
    if (!top) continue;
    push(p.Z, (c2) => drawBuildingBox(c2, state, b, p, top));
  }
  for (const t of state.city.trees) {
    const p = project3p(state, t.x, t.y, 0);
    if (!p || p.Z > 1500) continue;
    if (p.sx < -200 || p.sx > vw + 200) continue;
    push(p.Z, (c2) => drawTree3p(c2, state, t));
  }
  for (const car of state.cars) {
    const p = project3p(state, car.x, car.y, 0);
    if (!p || p.Z > MAX_BILLBOARD_Z) continue;
    if (p.sx < -300 || p.sx > vw + 300) continue;
    push(p.Z, (c2) => drawCar3p(c2, state, car, state.time));
  }
  for (const pd of state.peds) {
    const p = project3p(state, pd.x, pd.y, 0);
    if (!p || p.Z > 1200) continue;
    if (p.sx < -200 || p.sx > vw + 200) continue;
    push(p.Z, (c2) => drawPerson3p(c2, state, pd.x, pd.y, pd.color, pd.angle, pd.down, state.time, false));
  }
  for (const pk of state.pickups) {
    const p = project3p(state, pk.x, pk.y, 0);
    if (!p || p.Z > 1200) continue;
    if (p.sx < -200 || p.sx > vw + 200) continue;
    push(p.Z, (c2) => drawPickup3p(c2, state, pk));
  }
  // The player on foot (the player's car is already in state.cars).
  if (state.player.onFoot) {
    const pl = state.player;
    const p = project3p(state, pl.x, pl.y, 0);
    if (p) push(p.Z, (c2) => drawPerson3p(c2, state, pl.x, pl.y, '#ff7a2f', pl.angle, 0, state.time, true));
  }

  list.sort((a, b) => b.Z - a.Z);
  for (const it of list) it.fn(ctx);

  drawMarker3p(ctx, state);
  drawParticles3p(ctx, state);

  // Warm sunset wash + vignette (stronger at dusk).
  const warm = state.dusk ? 0.30 : 0.10;
  const grad = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  grad.addColorStop(0, 'rgba(255,170,80,0)');
  grad.addColorStop(1, `rgba(255,120,40,${warm})`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);
  const vig = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(20,10,0,0.35)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, vw, vh);
}
