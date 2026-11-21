// Deterministic showcase states for the screenshots (?shot=1..4). Each one
// sets real game state — no fake renders — then the shot is taken. The view
// is third-person, so every shot frames the player from behind with the
// road and the city ahead; the camera is snapped to the player at the end.
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';
import { showOverlay, updateHUD } from './hud.js';
import { snapCamera3p } from './render3p.js';

// Put the player in a car of `type` at (x, y), facing `angle`, moving.
function putPlayerInCar(state, type, x, y, angle, speed) {
  const car = createCar(type, x, y, angle, 'player');
  car.speed = speed;
  state.cars.push(car);
  const pl = state.player;
  pl.car = car; pl.onFoot = false; pl.carHealth = car.health;
  pl.x = x; pl.y = y; pl.angle = angle; pl.speed = speed;
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
    // Driving a sports car east through downtown on the y=720 road, traffic
    // around, wanted 0. The camera sits behind the car, buildings lining
    // both sides of the road ahead, the package marker straight ahead.
    putPlayerInCar(state, 'sports', 1200, 720, Math.PI / 2, 260);
    state.missionsDone = 1;
    startMission(state, 1);
    state.mission.step = 0;
    state.banner = null;
    state.player.cash = 200;
  } else if (n === 2) {
    // On foot, facing east down the road toward the Crew Garage marker.
    // The camera is behind Vic, the garage circle and the marker ahead.
    pl.car = null; pl.onFoot = true;
    pl.x = 640; pl.y = 1200; pl.angle = Math.PI / 2;
    state.missionsDone = 0;
    startMission(state, 0);
    state.banner = null;
    pl.cash = 0;
  } else if (n === 3) {
    // Police chase at 3 stars: Vic in a sedan heading north, interceptors
    // flanking and a roadblock ahead. The interceptors are parked in place
    // for the shot (not in state.police, so the chase AI does not drive
    // them into a pile-up on the camera): the player coasts ~260 units
    // north in the 1.2 s before the screenshot, so they are placed for
    // where Vic will be — flankers just ahead of him, roadblock further up.
    putPlayerInCar(state, 'sedan', 1680, 1200, 0, 300);
    state.wanted = 3;
    state.lastCrimeT = state.time;
    const flankL = createCar('police', 1640, 750, 0, 'parked');
    const flankR = createCar('police', 1720, 750, 0, 'parked');
    const block = createCar('police', 1680, 500, Math.PI, 'parked');
    for (const pc of [flankL, flankR, block]) state.cars.push(pc);
    // (The live police still spawn from the edge for the minimap/wanted;
    // they are too far to reach the frame in time.)
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
  // Frame the camera behind the player right now (no easing on the first
  // frame), so the screenshot shows the intended third-person view.
  snapCamera3p(state);
  // Keep the objective text and mission marker in sync for the HUD/minimap.
  // (Shot 4 sets its own objective text above and has no active mission.)
  if (state.mission) {
    state.objectiveText = (state.mission.idx + 1) + '/4 ' + state.mission.def.title + ': ' + state.mission.def.steps[state.mission.step].text;
    const s = state.mission.def.steps[state.mission.step];
    state.missionMarker = s.target ? { x: state.city.landmarks[s.target].x, y: state.city.landmarks[s.target].y, label: state.city.landmarks[s.target].label } : null;
  }
}
