// Traffic: AI cars that follow the road lanes, and pedestrians who walk the
// sidewalks and flee when a crime happens nearby.
import { createCar, updateCarDrive, collideCars, CAR_TYPES } from './vehicles.js';
import { ROADS_X, ROADS_Y, ROAD_W, resolveCircleVsBuildings, mulberry32 } from './city.js';

const PED_COLORS = ['#e86a6a', '#6a9ae8', '#e8c96a', '#8a6ae8', '#6ae8a0', '#e89a6a', '#c96a8a'];

// Spawn n AI cars on roads plus m parked cars in roadside spots.
export function spawnTraffic(state, nAi, nParked) {
  const rng = mulberry32(state.city.seed + 77);
  const types = ['sedan', 'sedan', 'taxi', 'sports', 'truck'];
  for (let i = 0; i < nAi; i++) {
    const vertical = rng() < 0.5;
    const lane = vertical
      ? { x: ROADS_X[Math.floor(rng() * ROADS_X.length)] + (rng() < 0.5 ? -30 : 30), y: 120 + rng() * 2000 }
      : { x: 120 + rng() * 3100, y: ROADS_Y[Math.floor(rng() * ROADS_Y.length)] + (rng() < 0.5 ? -30 : 30) };
    const angle = vertical ? (lane.x % 2 === 0 ? 0 : Math.PI) : (lane.y % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(types[Math.floor(rng() * types.length)], lane.x, lane.y, angle, 'ai');
    car.ai = { vertical, dir: rng() < 0.5 ? 1 : -1, cruise: 70 + rng() * 45, wait: 0 };
    state.cars.push(car);
  }
  for (let i = 0; i < nParked; i++) {
    const vertical = rng() < 0.5;
    const spot = vertical
      ? { x: ROADS_X[Math.floor(rng() * ROADS_X.length)] + (rng() < 0.5 ? -52 : 52), y: 200 + rng() * 1900 }
      : { x: 200 + rng() * 3000, y: ROADS_Y[Math.floor(rng() * ROADS_Y.length)] + (rng() < 0.5 ? -52 : 52) };
    const car = createCar(types[Math.floor(rng() * types.length)], spot.x, spot.y, vertical ? 0 : Math.PI / 2, 'parked');
    state.cars.push(car);
  }
}

export function spawnPedestrians(state, n) {
  const rng = mulberry32(state.city.seed + 913);
  for (let i = 0; i < n; i++) {
    const vertical = rng() < 0.5;
    const p = vertical
      ? { x: ROADS_X[Math.floor(rng() * ROADS_X.length)] + (rng() < 0.5 ? -(ROAD_W / 2 + 16) : ROAD_W / 2 + 16), y: 120 + rng() * 2100 }
      : { x: 120 + rng() * 3100, y: ROADS_Y[Math.floor(rng() * ROADS_Y.length)] + (rng() < 0.5 ? -(ROAD_W / 2 + 16) : ROAD_W / 2 + 16) };
    state.peds.push({
      x: p.x, y: p.y, angle: rng() * Math.PI * 2, speed: 26 + rng() * 22,
      color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
      flee: 0, down: 0, vertical, dir: rng() < 0.5 ? 1 : -1, turnT: 2 + rng() * 4,
    });
  }
}

// AI driver: follow a lane, turn at intersections sometimes, brake for cars.
export function updateTraffic(state, dt) {
  const rng = state.rng;
  for (const car of state.cars) {
    if (car.driver !== 'ai' || !car.ai) continue;
    const ai = car.ai;
    // Am I near an intersection? Maybe turn.
    const nearX = ROADS_X.find((rx) => Math.abs(car.x - rx) < 40);
    const nearY = ROADS_Y.find((ry) => Math.abs(car.y - ry) < 40);
    if (nearX !== undefined && nearY !== undefined && rng() < dt * 0.5) {
      // Turn onto the crossing road.
      const goVertical = rng() < 0.5;
      if (goVertical) {
        ai.vertical = true; ai.dir = rng() < 0.5 ? 1 : -1;
        car.x = nearX + (ai.dir > 0 ? 30 : -30);
      } else {
        ai.vertical = false; ai.dir = rng() < 0.5 ? 1 : -1;
        car.y = nearY + (ai.dir > 0 ? 30 : -30);
      }
    }
    // Desired heading from lane + direction.
    let want;
    if (ai.vertical) want = ai.dir > 0 ? Math.PI : 0; // angle 0 = north (-y), PI = south
    else want = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    // Steer toward the wanted heading (shortest turn).
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.abs(diff) > 0.05 ? Math.sign(diff) : 0;
    // Brake if a car is ahead in my lane.
    let blocked = false;
    for (const o of state.cars) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const ahead = dx * Math.sin(car.angle) - dy * Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
      if (ahead > 0 && ahead < 95 && side < 30) { blocked = true; break; }
    }
    const input = {
      up: !blocked && car.speed < ai.cruise,
      down: blocked,
      left: steer < 0, right: steer > 0, brake: blocked,
    };
    updateCarDrive(car, input, dt, state.city);
    // Keep AI cars inside the road network: if they drift off-road, steer back.
    if (car.x < 120 || car.x > 3240 || car.y < 120 || car.y > 2220) {
      ai.dir *= -1;
      car.angle += Math.PI;
    }
  }
  // Car-vs-car bumps.
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const a = state.cars[i], b = state.cars[j];
      if (Math.abs(a.x - b.x) > 80 || Math.abs(a.y - b.y) > 80) continue;
      const impact = collideCars(a, b);
      if (impact > 120 && (a.driver === 'player' || b.driver === 'player')) {
        const pc = a.driver === 'player' ? a : b;
        damagePlayerCar(state, Math.min(14, impact * 0.05));
      }
    }
  }
}

export function damagePlayerCar(state, amount) {
  if (!state.player.car) return;
  state.player.car.health -= amount;
  state.player.carHealth = state.player.car.health;
  if (state.player.car.health <= 0) {
    state.player.car.health = 0;
    state.events.push({ type: 'wrecked', t: state.time });
  }
}

export function updatePedestrians(state, dt) {
  const rng = state.rng;
  for (const p of state.peds) {
    if (p.down > 0) { p.down -= dt; continue; }
    // Flee from the latest crime.
    const crime = state.crimePulse;
    if (crime && crime.t > state.time - 3) {
      const d = Math.hypot(p.x - crime.x, p.y - crime.y);
      if (d < 280) {
        p.flee = 2.5;
        p.angle = Math.atan2(-(crime.y - p.y), -(crime.x - p.x)) + Math.PI / 2;
      }
    }
    let spd = p.speed;
    if (p.flee > 0) { p.flee -= dt; spd = 130; }
    p.turnT -= dt;
    if (p.turnT <= 0) {
      p.turnT = 3 + rng() * 5;
      // At an intersection, maybe turn onto the crossing sidewalk.
      const nearX = ROADS_X.find((rx) => Math.abs(p.x - rx) < 46);
      const nearY = ROADS_Y.find((ry) => Math.abs(p.y - ry) < 46);
      if (nearX !== undefined && nearY !== undefined && rng() < 0.5) {
        p.vertical = !p.vertical;
        p.dir = rng() < 0.5 ? 1 : -1;
        if (p.vertical) p.x = nearX + (p.dir > 0 ? ROAD_W / 2 + 16 : -(ROAD_W / 2 + 16));
        else p.y = nearY + (p.dir > 0 ? ROAD_W / 2 + 16 : -(ROAD_W / 2 + 16));
      } else if (rng() < 0.25) p.dir *= -1;
    }
    const vx = p.vertical ? 0 : p.dir * spd;
    const vy = p.vertical ? p.dir * spd : 0;
    p.x += vx * dt; p.y += vy * dt;
    p.angle = Math.atan2(vx, -vy);
    // Stay on the sidewalks / in the world.
    p.x = Math.max(90, Math.min(3270, p.x));
    p.y = Math.max(90, Math.min(2250, p.y));
    const fixed = resolveCircleVsBuildings(state.city, p.x, p.y, 12);
    p.x = fixed.x; p.y = fixed.y;
  }
}

export function drawPedestrian(ctx, p, time) {
  if (p.down > 0) {
    // Lying down: a flat shape.
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.fillStyle = p.color; ctx.fillRect(-13, -6, 26, 12);
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(15, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(time * 10 + p.x) * 1.5;
  ctx.save(); ctx.translate(p.x, p.y + bob * 0.3);
  ctx.fillStyle = 'rgba(40,20,10,0.25)';
  ctx.beginPath(); ctx.ellipse(3, 4, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(0, -2, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(0, -4, 5, Math.PI, 0); ctx.fill();
  ctx.rotate(p.angle);
  ctx.fillStyle = p.color;
  ctx.fillRect(-3, -13, 6, 6); // nose / facing tick
  ctx.restore();
}

export function nearestCar(state, x, y, maxD) {
  let best = null, bd = maxD;
  for (const c of state.cars) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
