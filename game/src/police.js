// Wanted level and the police who respond to it: patrol cars that chase and
// ram, foot officers who run the player down, and the spray shop that clears
// the heat for a fee.
import { createCar, updateCarDrive, CAR_TYPES } from './vehicles.js';
import { ROADS_X, ROADS_Y, nearestRoadPoint, resolveCircleVsBuildings } from './city.js';

export function addWanted(state, n, reason) {
  const before = state.wanted;
  state.wanted = Math.min(5, state.wanted + n);
  state.lastCrimeT = state.time;
  state.decayT = 0;
  if (state.wanted > before) {
    state.events.push({ type: 'wanted', t: state.time, level: state.wanted, reason });
    state.audio.sting(state.wanted);
    if (state.wanted >= 3) state.hudFlash = 1.2;
  }
}

// A crime just happened at (x, y): pedestrians nearby flee.
export function crimePulse(state, x, y) {
  state.crimePulse = { x, y, t: state.time };
  state.lastCrimeT = state.time;
}

export function updateWanted(state, dt) {
  if (state.wanted <= 0) return;
  // Heat decays only when no crime lately and no police close by.
  const policeNear = state.police.some((p) => Math.hypot(p.x - state.player.x, p.y - state.player.y) < 380);
  if (state.time - state.lastCrimeT > 12 && !policeNear) {
    state.decayT += dt;
    const need = state.mission && state.mission.idx === 2 ? 12 : 18; // mission 3 decays faster
    if (state.decayT >= need) { state.decayT = 0; state.wanted--; }
  } else state.decayT = 0;
  // Spray shop: drive in, pay, walk out clean.
  const spray = state.city.landmarks.spray;
  if (state.player.car && Math.hypot(state.player.x - spray.x, state.player.y - spray.y) < 60) {
    if (state.wanted > 0 && state.player.cash >= 100 && !state.sprayCooldown) {
      state.player.cash -= 100;
      state.wanted = 0; state.decayT = 0;
      state.sprayCooldown = 5;
      state.events.push({ type: 'spray', t: state.time });
      state.audio.jingle();
      state.banner = { title: 'CLEAN', sub: 'Spray shop — $100. The heat is off.', t: state.time, dur: 2.5 };
    }
  }
  if (state.sprayCooldown) state.sprayCooldown -= dt;
}

function spawnPoliceCar(state) {
  // Spawn on a road at the world edge, roughly toward the player.
  const edge = Math.floor(state.rng() * 4);
  let x, y;
  if (edge === 0) { x = ROADS_X[Math.floor(state.rng() * ROADS_X.length)]; y = 240; }
  else if (edge === 1) { x = ROADS_X[Math.floor(state.rng() * ROADS_X.length)]; y = 2160; }
  else if (edge === 2) { x = 240; y = ROADS_Y[Math.floor(state.rng() * ROADS_Y.length)]; }
  else { x = 3120; y = ROADS_Y[Math.floor(state.rng() * ROADS_Y.length)]; }
  const car = createCar('police', x, y, 0, 'police');
  car.ai = { vertical: true, dir: 1, cruise: 300, wait: 0 };
  state.cars.push(car);
  state.police.push(car);
  return car;
}

function spawnOfficer(state) {
  const p = state.player;
  const a = state.rng() * Math.PI * 2;
  const off = {
    x: p.x + Math.cos(a) * 260, y: p.y + Math.sin(a) * 260,
    angle: 0, speed: 165, color: '#1d4ed8', flee: 0, down: 0,
    vertical: false, dir: 1, turnT: 0, officer: true, touchT: 0,
  };
  const fixed = nearestRoadPoint(state.city, off.x, off.y);
  off.x = fixed.x; off.y = fixed.y;
  state.peds.push(off);
  state.police.push(off);
  return off;
}

export function updatePolice(state, dt) {
  const want = state.wanted;
  const targetCars = want > 0 ? Math.min(4, want) : 0;
  const targetOfficers = want >= 2 ? Math.min(3, want - 1) : 0;
  const cars = state.police.filter((p) => p.type === 'police');
  const officers = state.police.filter((p) => p.officer);
  if (cars.length < targetCars && state.time - (state.lastPoliceSpawn || 0) > 1.5) {
    spawnPoliceCar(state); state.lastPoliceSpawn = state.time;
  }
  if (officers.length < targetOfficers && state.time - (state.lastOfficerSpawn || 0) > 2) {
    spawnOfficer(state); state.lastOfficerSpawn = state.time;
  }
  // Despawn police that are far away and no longer needed.
  for (let i = state.police.length - 1; i >= 0; i--) {
    const p = state.police[i];
    const d = Math.hypot(p.x - state.player.x, p.y - state.player.y);
    const needed = p.type === 'police' ? state.police.filter((q) => q.type === 'police').indexOf(p) < targetCars
      : state.police.filter((q) => q.officer).indexOf(p) < targetOfficers;
    if ((want === 0 || d > 1500) && !needed) {
      if (p.type === 'police') {
        const ci = state.cars.indexOf(p);
        if (ci >= 0) state.cars.splice(ci, 1);
      } else {
        const pi = state.peds.indexOf(p);
        if (pi >= 0) state.peds.splice(pi, 1);
      }
      state.police.splice(i, 1);
    }
  }
  // Chase: police cars steer at the player and ram.
  const pl = state.player;
  for (const car of state.police) {
    if (car.type !== 'police') continue;
    const tx = pl.x, ty = pl.y;
    const wantAngle = Math.atan2(tx - car.x, -(ty - car.y));
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const d = Math.hypot(tx - car.x, ty - car.y);
    const input = {
      up: d > 60,
      down: false,
      left: diff < -0.08, right: diff > 0.08,
      brake: d < 50,
    };
    // Stuck against a wall? Back out.
    if (Math.abs(car.speed) < 12 && d > 80) {
      car.stuck = (car.stuck || 0) + dt;
      if (car.stuck > 1.2) { car.reverseT = 0.8; car.stuck = 0; }
    } else car.stuck = 0;
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      input.up = false; input.down = true;
      input.left = diff > 0.08; input.right = diff < -0.08;
    }
    updateCarDrive(car, input, dt, state.city);
    car.siren = state.time;
    // Ram: if I touch the player's car, damage it.
    if (pl.car) {
      const cd = Math.hypot(car.x - pl.car.x, car.y - pl.car.y);
      if (cd < 44) {
        const impact = Math.abs(car.speed - pl.car.speed);
        if (impact > 60) {
          pl.car.health -= impact * 0.04;
          state.player.carHealth = pl.car.health;
          state.audio.thud();
          if (pl.car.health <= 0) state.events.push({ type: 'wrecked', t: state.time });
        }
        // Push the player's car a little.
        const ux = (pl.car.x - car.x) / (cd || 1), uy = (pl.car.y - car.y) / (cd || 1);
        pl.car.x += ux * 26 * dt * 10; pl.car.y += uy * 26 * dt * 10;
      }
    }
  }
  // Officers run at the player on foot.
  for (const o of state.police) {
    if (!o.officer) continue;
    if (o.down > 0) { o.down -= dt; continue; }
    const d = Math.hypot(pl.x - o.x, pl.y - o.y);
    o.angle = Math.atan2(pl.x - o.x, -(pl.y - o.y));
    const spd = o.speed;
    o.x += Math.sin(o.angle) * spd * dt;
    o.y -= Math.cos(o.angle) * spd * dt;
    // Keep officers out of buildings.
    const f2 = resolveCircleVsBuildings(state.city, o.x, o.y, 12);
    o.x = f2.x; o.y = f2.y;
    if (d < 30 && !pl.car && state.wanted >= 1) {
      o.touchT += dt;
      if (o.touchT > 1.2) state.events.push({ type: 'busted', t: state.time });
    } else o.touchT = 0;
  }
  // Siren sound while any police car is near.
  const near = cars.some((c) => Math.hypot(c.x - pl.x, c.y - pl.y) < 700);
  state.audio.siren(near && want > 0);
}

export function policeCount(state) { return state.police.length; }
