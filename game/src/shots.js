// Deterministic showcase states for the screenshots (?shot=1..4). Each one
// sets real game state — no fake renders — then the shot is taken.
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';
import { showOverlay, updateHUD } from './hud.js';

// Put the player in a car of `type` at (x, y), facing `angle`, moving.
function putPlayerInCar(state, type, x, y, angle, speed) {
  const car = createCar(type, x, y, angle, 'player');
  car.speed = speed;
  state.cars.push(car);
  const pl = state.player;
  pl.car = car; pl.onFoot = false; pl.carHealth = car.health;
  pl.x = x; pl.y = y; pl.angle = angle; pl.speed = speed;
  state.cam.x = x; state.cam.y = y;
  return car;
}

function clearPolice(state) {
  for (const c of state.police.filter((p) => p.type === 'police')) {
    const i = state.cars.indexOf(c);
    if (i >= 0) state.cars.splice(i, 1);
  }
  for (const o of state.police.filter((p) => p.officer)) {
    const i = state.peds.indexOf(o);
    if (i >= 0) state.peds.splice(i, 1);
  }
  state.police.length = 0;
  state.wanted = 0;
}

export function applyShot(state, n) {
  const pl = state.player;
  clearPolice(state);
  state.dusk = false;
  state.banner = null;
  if (n === 1) {
    // Driving a sports car through downtown, traffic around, wanted 0.
    putPlayerInCar(state, 'sports', 1680, 660, 0, 260);
    state.missionsDone = 1;
    startMission(state, 1);
    state.mission.step = 0;
    state.banner = null;
    state.player.cash = 200;
  } else if (n === 2) {
    // On foot near the Crew Garage marker, pedestrians about, mission 1.
    pl.car = null; pl.onFoot = true;
    pl.x = 690; pl.y = 1150; pl.angle = Math.PI / 2;
    state.cam.x = 720; state.cam.y = 1200;
    state.missionsDone = 0;
    startMission(state, 0);
    state.banner = null;
    pl.cash = 0;
  } else if (n === 3) {
    // Police chase at 3 stars: player in a sedan, three interceptors behind.
    const car = putPlayerInCar(state, 'sedan', 1680, 1200, 0, 300);
    state.wanted = 3;
    state.lastCrimeT = state.time;
    for (let i = 0; i < 3; i++) {
      // Spread across the lanes, staggered behind the player.
      const pc = createCar('police', 1680 + (i - 1) * 95, 1350 + i * 55, 0, 'police');
      pc.speed = 280;
      state.cars.push(pc);
      state.police.push(pc);
    }
    state.missionsDone = 3;
    startMission(state, 3);
    state.mission.step = 2;
    state.mission.heatSet = true;
    state.banner = null;
    pl.cash = 550;
  } else if (n === 4) {
    // Mission complete at dusk: the story-complete screen over the city.
    putPlayerInCar(state, 'sports', 2640, 1620, Math.PI / 2, 0);
    state.dusk = true;
    state.missionsDone = 4;
    state.storyDone = true;
    pl.cash = 1850;
    state.bestEscape = 3;
    state.mode = 'story';
    // The HUD does not tick while the story screen is up, so paint it once
    // here (minimap, cash, missions) and show the overlay.
    state.objectiveText = 'All 4 missions done — Port Meridian is yours, Vic.';
    updateHUD(state);
    showOverlay(state, 'story');
  }
  // Keep the objective text and mission marker in sync for the HUD/minimap.
  // (Shot 4 sets its own objective text above and has no active mission.)
  if (state.mission) {
    state.objectiveText = (state.mission.idx + 1) + '/4 ' + state.mission.def.title + ': ' + state.mission.def.steps[state.mission.step].text;
    const s = state.mission.def.steps[state.mission.step];
    state.missionMarker = s.target ? { x: state.city.landmarks[s.target].x, y: state.city.landmarks[s.target].y, label: state.city.landmarks[s.target].label } : null;
  }
}
