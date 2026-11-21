// Vice City Nights — game state, input, the main loop and rendering.
// Orchestrates city, vehicles, traffic, police, missions, combat, HUD, audio.
import { createCity, drawCityLayer, mulberry32, WORLD_W, WORLD_H, BEACH_TOP, resolveCircleVsBuildings, isWater, onRoad } from './city.js';
import { createCar, updateCarDrive, drawCar, CAR_TYPES } from './vehicles.js';
import { spawnTraffic, spawnPedestrians, updateTraffic, updatePedestrians, drawPedestrian, nearestCar } from './traffic.js';
import { addWanted, crimePulse, updateWanted, updatePolice } from './police.js';
import { MISSIONS, startMission, updateMissions, missionObjectiveText, missionMarker, saveProgress, loadSave } from './missions.js';
import { punch, shoot, spawnAmmoPickups, updatePickups, drawPickups } from './combat.js';
import { updateHUD, showOverlay, hideOverlays } from './hud.js';
import { createAudio } from './audio.js';

export function createGame(canvas) {
  const city = createCity(1337);
  const state = {
    city, rng: mulberry32(4242),
    canvas, ctx: canvas.getContext('2d'),
    time: 0, mode: 'title', // title | play | pause | busted | story
    player: {
      x: 660, y: 1140, angle: -Math.PI / 2, speed: 0, onFoot: true, car: null,
      health: 100, carHealth: 100, ammo: 24, cash: 0,
      punchCd: 0, shootCd: 0, punchAnim: 0, muzzle: 0, hurtT: 0, regenT: 0,
    },
    cars: [], peds: [], police: [], pickups: [], particles: [], skids: [],
    wanted: 0, lastCrimeT: -99, decayT: 0, crimePulse: null, sprayCooldown: 0,
    mission: null, missionsDone: 0, failedMission: undefined, nextMissionT: 2,
    storyDone: false, bestEscape: 0, banner: null, events: [],
    objectiveText: '', missionMarker: null,
    cam: { x: 660, y: 1140 }, view: { w: 1280, h: 800 },
    keys: new Set(), interactPressed: false, dusk: false,
    audio: createAudio(), hudEls: null, cityLayer: null,
    save: loadSave(), lastPoliceSpawn: 0, lastOfficerSpawn: 0, hudFlash: 0,
  };
  state.cityLayer = drawCityLayer(city);
  // Starting cars: a few parked near the garage, some traffic, pedestrians.
  const starter = createCar('sedan', 660, 1290, 0, 'parked');
  state.cars.push(starter);
  const taxi = createCar('taxi', 780, 1140, Math.PI / 2, 'parked');
  state.cars.push(taxi);
  spawnTraffic(state, 10, 8);
  spawnPedestrians(state, 26);
  spawnAmmoPickups(state, 6);
  // Apply a saved game if one exists.
  if (state.save) {
    state.player.cash = state.save.cash || 0;
    state.missionsDone = state.save.missionsDone || 0;
    state.bestEscape = state.save.bestEscape || 0;
    state.audio.setMuted(!!state.save.muted);
  }
  return state;
}

function enterCar(state) {
  const pl = state.player;
  const car = nearestCar(state, pl.x, pl.y, 52);
  if (!car || car.driver === 'wrecked') return false;
  // Witnesses: police or pedestrians close by see the theft.
  const witnessed = state.police.some((p) => Math.hypot(p.x - pl.x, p.y - pl.y) < 420)
    || state.peds.some((p) => !p.officer && p.down <= 0 && Math.hypot(p.x - pl.x, p.y - pl.y) < 260);
  if (car.driver === 'ai') {
    // Yank the driver out — they flee on foot.
    const d = { x: car.x + 30, y: car.y + 30, angle: 0, speed: 120, color: '#e86a6a', flee: 3, down: 0, vertical: false, dir: 1, turnT: 0 };
    state.peds.push(d);
  }
  car.driver = 'player';
  car.health = Math.max(car.health, 40);
  pl.car = car; pl.onFoot = false; pl.carHealth = car.health;
  pl.x = car.x; pl.y = car.y; pl.angle = car.angle;
  state.audio.door();
  if (witnessed) { addWanted(state, 1, 'car theft'); crimePulse(state, pl.x, pl.y); }
  return true;
}

function exitCar(state) {
  const pl = state.player;
  const car = pl.car;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  const side = 34;
  pl.x = car.x + Math.cos(car.angle) * side;
  pl.y = car.y + Math.sin(car.angle) * side;
  const fixed = resolveCircleVsBuildings(state.city, pl.x, pl.y, 14);
  pl.x = fixed.x; pl.y = fixed.y;
  pl.car = null; pl.onFoot = true; pl.carHealth = 100;
  state.audio.door();
}

function updatePlayer(state, dt) {
  const pl = state.player;
  const k = state.keys;
  const up = k.has('KeyW') || k.has('ArrowUp');
  const down = k.has('KeyS') || k.has('ArrowDown');
  const left = k.has('KeyA') || k.has('ArrowLeft');
  const right = k.has('KeyD') || k.has('ArrowRight');
  const run = k.has('ShiftLeft') || k.has('ShiftRight');
  if (pl.punchCd > 0) pl.punchCd -= dt;
  if (pl.shootCd > 0) pl.shootCd -= dt;
  if (pl.punchAnim > 0) pl.punchAnim -= dt;
  if (pl.muzzle > 0) pl.muzzle -= dt;
  if (pl.car) {
    const car = pl.car;
    const input = { up, down, left, right, brake: k.has('Space') };
    const res = updateCarDrive(car, input, dt, state.city);
    pl.x = car.x; pl.y = car.y; pl.angle = car.angle; pl.speed = car.speed;
    if (res.hit && Math.abs(car.speed) > 100) {
      car.health -= 6;
      pl.carHealth = car.health;
      state.audio.thud();
      if (car.health <= 0) state.events.push({ type: 'wrecked', t: state.time });
    }
    // Skid marks on handbrake turns; dust off-road.
    if ((input.brake && Math.abs(car.speed) > 120) || (Math.abs(car.speed) > 200 && (left || right))) {
      const bx = car.x - Math.sin(car.angle) * car.l / 2, by = car.y + Math.cos(car.angle) * car.l / 2;
      state.skids.push({ x1: bx, y1: by, x2: bx - Math.sin(car.angle) * car.speed * dt, y2: by + Math.cos(car.angle) * car.speed * dt, life: 4 });
      if (state.skids.length > 220) state.skids.shift();
    }
    if (res.offroad && Math.abs(car.speed) > 110 && state.rng() < dt * 20) {
      state.particles.push({ x: car.x - Math.sin(car.angle) * 20, y: car.y + Math.cos(car.angle) * 20, vx: (state.rng() - 0.5) * 30, vy: -20 - state.rng() * 20, life: 0.7, max: 0.7, color: '#c9b183', size: 5, star: false });
    }
    state.audio.engine(true, Math.min(1, Math.abs(car.speed) / CAR_TYPES[car.type].max));
  } else {
    state.audio.engine(false, 0);
    let mx = (right ? 1 : 0) - (left ? 1 : 0);
    let my = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      const spd = run ? 250 : 180;
      pl.x += mx * spd * dt; pl.y += my * spd * dt;
      pl.angle = Math.atan2(mx, -my);
      pl.speed = spd;
    } else pl.speed = 0;
    pl.x = Math.max(30, Math.min(WORLD_W - 30, pl.x));
    pl.y = Math.max(30, Math.min(BEACH_TOP + 130, pl.y));
    if (isWater(state.city, pl.x, pl.y)) pl.y = BEACH_TOP + 130;
    const fixed = resolveCircleVsBuildings(state.city, pl.x, pl.y, 14);
    pl.x = fixed.x; pl.y = fixed.y;
    // Cars can hit the player on foot.
    for (const c of state.cars) {
      if (c.driver === 'player') continue;
      const d = Math.hypot(c.x - pl.x, c.y - pl.y);
      if (d < 34 && Math.abs(c.speed) > 60) {
        pl.health -= 12;
        pl.hurtT = state.time; pl.regenT = 0;
        pl.x += (pl.x - c.x) / (d || 1) * 30;
        pl.y += (pl.y - c.y) / (d || 1) * 30;
        state.audio.thud();
        crimePulse(state, pl.x, pl.y);
        if (pl.health <= 0) state.events.push({ type: 'busted', t: state.time });
      }
    }
    // Slow health regen when calm.
    if (state.time - pl.hurtT > 5 && pl.health < 100) {
      pl.regenT += dt;
      if (pl.regenT > 1) { pl.health = Math.min(100, pl.health + 4); pl.regenT = 0; }
    }
  }
  if (state.interactPressed) state.interactPressed = false;
}

function processEvents(state) {
  for (const ev of state.events) {
    if (ev.type === 'busted') {
      state.mode = 'busted';
      state.audio.engine(false, 0); state.audio.siren(false);
      state.audio.sting(3);
      showOverlay(state, 'busted');
    } else if (ev.type === 'wrecked') {
      const pl = state.player;
      if (pl.car) {
        const car = pl.car;
        car.driver = 'wrecked'; car.speed = 0;
        pl.car = null; pl.onFoot = true; pl.carHealth = 100;
        pl.x = car.x + 40; pl.y = car.y + 40;
        state.banner = { title: 'WRECKED', sub: 'Your ride is totalled. Get out of there, Vic.', t: state.time, dur: 3 };
        state.audio.thud();
      }
    } else if (ev.type === 'mission') {
      if (ev.idx === 2) state.bestEscape = Math.max(state.bestEscape, 2);
    }
  }
  state.events.length = 0;
}

export function updateGame(state, dt) {
  state.time += dt;
  if (state.mode !== 'play') return;
  if (state.hudFlash > 0) state.hudFlash -= dt;
  updatePlayer(state, dt);
  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  updatePolice(state, dt);
  updateWanted(state, dt);
  updateMissions(state, dt);
  updatePickups(state, dt);
  // Particles.
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.skids.length - 1; i >= 0; i--) {
    state.skids[i].life -= dt;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }
  // Camera follows the player.
  const tx = state.player.x, ty = state.player.y;
  state.cam.x += (tx - state.cam.x) * Math.min(1, dt * 5);
  state.cam.y += (ty - state.cam.y) * Math.min(1, dt * 5);
  state.objectiveText = missionObjectiveText(state);
  state.missionMarker = missionMarker(state);
  processEvents(state);
  updateHUD(state);
}

export function renderGame(state) {
  const ctx = state.ctx;
  const vw = state.view.w, vh = state.view.h;
  const cx = state.cam.x - vw / 2, cy = state.cam.y - vh / 2;
  ctx.clearRect(0, 0, vw, vh);
  // Static city layer (only the visible window).
  ctx.drawImage(state.cityLayer, cx, cy, vw, vh, 0, 0, vw, vh);
  ctx.save();
  ctx.translate(-cx, -cy);
  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,25,0.5)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of state.skids) {
    ctx.globalAlpha = Math.min(1, s.life / 4) * 0.7;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawPickups(ctx, state, state.time);
  // Mission marker: pulsing ring + diamond.
  const mk = state.missionMarker;
  if (mk) {
    const pulse = 46 + Math.sin(state.time * 5) * 8;
    ctx.strokeStyle = '#ffd23b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd23b';
    ctx.save(); ctx.translate(mk.x, mk.y - 30 - Math.sin(state.time * 3) * 5); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18); ctx.restore();
  }
  // Cars (police drawn with the rest).
  for (const car of state.cars) drawCar(ctx, car, state.time);
  // Pedestrians, then the player on foot.
  for (const p of state.peds) drawPedestrian(ctx, p, state.time);
  if (state.player.onFoot) drawPlayer(ctx, state);
  // Particles.
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.star) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(state.time * 3);
      ctx.fillRect(-p.size, -2, p.size * 2, 4);
      ctx.fillRect(-2, -p.size, 4, p.size * 2);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 1, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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

function drawPlayer(ctx, state) {
  const pl = state.player;
  const bob = pl.speed > 0 ? Math.sin(state.time * 12) * 1.5 : 0;
  ctx.save();
  ctx.translate(pl.x, pl.y + bob * 0.3);
  ctx.fillStyle = 'rgba(40,20,10,0.30)';
  ctx.beginPath(); ctx.ellipse(3, 5, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
  // Body (orange jacket) + head.
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(0, -2, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(0, -4, 6, Math.PI, 0); ctx.fill();
  // Facing tick + punch / muzzle.
  ctx.rotate(pl.angle);
  ctx.fillStyle = '#ff7a2f';
  ctx.fillRect(-3.5, -17, 7, 8);
  if (pl.punchAnim > 0) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(0, -26, 8, 0, Math.PI * 2); ctx.fill();
  }
  if (pl.muzzle > 0) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(-6, -34); ctx.lineTo(6, -34); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// --- Input + flow ---------------------------------------------------------

export function bindInput(state) {
  const canvas = state.canvas;
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    state.keys.add(e.code);
    if (e.code === 'KeyM') {
      state.audio.setMuted(!state.audio.muted);
      saveProgress(state);
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.mode === 'play') { state.mode = 'pause'; showOverlay(state, 'pause'); }
      else if (state.mode === 'pause') { state.mode = 'play'; hideOverlays(state); }
    }
    if (e.code === 'Enter') {
      if (state.mode === 'title') startGame(state, false);
      else if (state.mode === 'busted') respawn(state);
      else if (state.mode === 'story') { state.mode = 'play'; hideOverlays(state); }
    }
    if (state.mode === 'play' && e.code === 'KeyE') {
      state.interactPressed = true;
      const pl = state.player;
      if (pl.car) exitCar(state);
      else if (!enterCar(state)) { /* grab is handled by missions via interactPressed */ }
    }
    if (state.mode === 'play' && e.code === 'Space' && state.player.onFoot) punch(state);
    if (state.mode === 'play' && e.code === 'KeyF') shoot(state);
  });
  window.addEventListener('keyup', (e) => state.keys.delete(e.code));
  window.addEventListener('blur', () => {
    state.keys.clear();
    if (state.mode === 'play') { state.mode = 'pause'; showOverlay(state, 'pause'); }
  });
  canvas.addEventListener('mousedown', (e) => {
    state.audio.init(); state.audio.resume();
    if (state.mode !== 'play' || !state.player.onFoot) return;
    const r = canvas.getBoundingClientRect();
    const wx = state.cam.x - state.view.w / 2 + (e.clientX - r.left);
    const wy = state.cam.y - state.view.h / 2 + (e.clientY - r.top);
    state.player.angle = Math.atan2(wx - state.player.x, -(wy - state.player.y));
    if (e.button === 0) punch(state);
    else if (e.button === 2) shoot(state);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => resize(state));
}

export function resize(state) {
  state.view.w = window.innerWidth;
  state.view.h = window.innerHeight;
  state.canvas.width = window.innerWidth;
  state.canvas.height = window.innerHeight;
}

export function startGame(state, cont) {
  state.audio.init(); state.audio.resume();
  if (cont && state.save) {
    state.player.cash = state.save.cash || 0;
    state.missionsDone = state.save.missionsDone || 0;
    state.bestEscape = state.save.bestEscape || 0;
  } else if (!cont) {
    state.player.cash = 0; state.missionsDone = 0; state.storyDone = false;
    state.wanted = 0; state.mission = null; state.failedMission = undefined;
    state.nextMissionT = state.time + 2;
  }
  state.mode = 'play';
  hideOverlays(state);
  // The first job starts at once — no dead air before the story begins.
  if (state.missionsDone >= MISSIONS.length) {
    state.storyDone = true;
  } else if (!state.mission) {
    startMission(state, state.missionsDone);
  }
}

export function respawn(state) {
  const pl = state.player;
  pl.cash = Math.max(0, pl.cash - 150);
  pl.health = 100; pl.carHealth = 100;
  const sh = state.city.landmarks.safehouse;
  pl.x = sh.x; pl.y = sh.y; pl.angle = 0;
  pl.car = null; pl.onFoot = true;
  state.wanted = 0; state.decayT = 0;
  state.cam.x = pl.x; state.cam.y = pl.y;
  state.mode = 'play';
  hideOverlays(state);
  saveProgress(state);
}
