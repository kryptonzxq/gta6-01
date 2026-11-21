// The story: Vic, a courier-driver for a small crew in Port Meridian.
// Four missions, in order, each a chain of small steps with a marker.
export const MISSIONS = [
  {
    id: 0, title: 'First Wheels', reward: 200,
    intro: 'Vic, you need wheels. Any wheels. Take a car — the crew is watching — and bring it to the garage.',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', target: 'garage', text: 'Drive the car to the Crew Garage' },
    ],
  },
  {
    id: 1, title: 'Package Run', reward: 350,
    intro: 'A package is waiting at the east docks. Pick it up and deliver it to the west side — fast. The client pays for speed.',
    steps: [
      { type: 'goto', target: 'pickup', text: 'Pick up the package at the east docks' },
      { type: 'deliver', target: 'dropoff', time: 90, text: 'Deliver the package to the west side — beat the clock!' },
    ],
  },
  {
    id: 2, title: 'Hot Pursuit', reward: 300,
    intro: 'You were spotted. Two stars and the whole precinct is on you. Lose them — outrun the law and stay clean.',
    steps: [
      { type: 'lose', text: 'Lose the 2-star wanted level (stay out of sight)' },
    ],
  },
  {
    id: 3, title: 'The Big Score', reward: 1000,
    intro: 'The Meridian Bank. One grab, then vanish. The crew is counting on you, Vic — and so is the safehouse.',
    steps: [
      { type: 'goto', target: 'bank', text: 'Drive to Meridian Bank' },
      { type: 'grab', target: 'bank', text: 'Grab the cash (press E at the bank)' },
      { type: 'escape', target: 'safehouse', text: 'Escape the 3-star heat — reach the Safehouse!' },
    ],
  },
];

export function startMission(state, idx) {
  const m = MISSIONS[idx];
  state.mission = { idx, step: 0, timer: 0, def: m, active: true };
  state.banner = { title: 'MISSION: ' + m.title, sub: m.intro, t: state.time, dur: 4 };
  state.audio.jingle();
  if (idx === 2) {
    // Hot Pursuit starts with heat already on.
    state.wanted = Math.max(state.wanted, 2);
    state.lastCrimeT = state.time;
  }
  if (idx === 3) state.wanted = Math.max(state.wanted, 0);
}

export function missionObjectiveText(state) {
  if (!state.mission) return 'Free roam — the crew will call with the next job.';
  const m = state.mission.def;
  const s = m.steps[state.mission.step];
  let text = (state.mission.idx + 1) + '/4 ' + m.title + ': ' + s.text;
  if (s.time) text += ' — ' + Math.ceil(state.mission.timer) + 's';
  return text;
}

export function missionMarker(state) {
  if (!state.mission) return null;
  const m = state.mission.def;
  const s = m.steps[state.mission.step];
  if (s.type === 'steal' || s.type === 'lose') return null;
  const lm = state.city.landmarks[s.target];
  return lm ? { x: lm.x, y: lm.y, label: lm.label } : null;
}

function advanceStep(state) {
  const m = state.mission;
  m.step++;
  m.timer = 0;
  if (m.step >= m.def.steps.length) completeMission(state);
}

function completeMission(state) {
  const m = state.mission;
  state.player.cash += m.def.reward;
  state.missionsDone = Math.max(state.missionsDone, m.idx + 1);
  state.banner = { title: 'MISSION COMPLETE', sub: m.def.title + ' — +$' + m.def.reward, t: state.time, dur: 3.5 };
  state.audio.jingle();
  state.events.push({ type: 'mission', t: state.time, idx: m.idx });
  saveProgress(state);
  if (m.idx + 1 >= MISSIONS.length) {
    state.storyDone = true;
    state.mode = 'story';
    state.audio.jingle();
    return;
  }
  state.mission = null;
  state.nextMissionT = state.time + 3;
}

export function failMission(state, reason) {
  const idx = state.mission ? state.mission.idx : 0;
  state.banner = { title: 'MISSION FAILED', sub: reason + ' — try again, Vic.', t: state.time, dur: 3 };
  state.audio.sting(2);
  state.mission = null;
  state.wanted = 0;
  state.nextMissionT = state.time + 3;
  state.failedMission = idx;
}

export function updateMissions(state, dt) {
  // Chain into the next mission a few seconds after one ends.
  if (!state.mission && !state.storyDone && state.mode === 'play') {
    const next = state.failedMission !== undefined ? state.failedMission : state.missionsDone;
    if (next < MISSIONS.length && state.time >= (state.nextMissionT || 0)) {
      state.failedMission = undefined;
      startMission(state, next);
    }
  }
  if (!state.mission) return;
  const m = state.mission;
  const s = m.def.steps[m.step];
  const pl = state.player;
  if (s.time) {
    m.timer += dt;
    if (m.timer >= s.time) { failMission(state, 'Out of time'); return; }
  }
  const lm = s.target ? state.city.landmarks[s.target] : null;
  const dist = lm ? Math.hypot(pl.x - lm.x, pl.y - lm.y) : 0;
  switch (s.type) {
    case 'steal':
      if (pl.car) advanceStep(state);
      break;
    case 'goto':
      if (dist < 70) advanceStep(state);
      break;
    case 'deliver':
      if (dist < 70) advanceStep(state);
      break;
    case 'grab':
      if (dist < 80 && state.interactPressed) advanceStep(state);
      break;
    case 'escape':
      if (state.wanted >= 3 && !m.heatSet) { m.heatSet = true; }
      if (dist < 70 && state.wanted > 0) {
        // Reaching the safehouse with heat still on: the crew hides you.
        state.wanted = 0;
        advanceStep(state);
      } else if (dist < 70 && state.wanted === 0) advanceStep(state);
      break;
    case 'lose':
      if (state.wanted <= 0) advanceStep(state);
      break;
  }
  // Mission 4: grabbing the cash sets the heat.
  if (m.def.id === 3 && m.step === 2 && !m.heatSet) {
    state.wanted = Math.max(state.wanted, 3);
    state.lastCrimeT = state.time;
    m.heatSet = true;
  }
}

export function saveProgress(state) {
  try {
    localStorage.setItem('viceCityNightsSaveV1', JSON.stringify({
      cash: state.player.cash,
      missionsDone: state.missionsDone,
      bestEscape: state.bestEscape || 0,
      muted: state.audio.muted,
    }));
  } catch { /* storage unavailable: play on without saving */ }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem('viceCityNightsSaveV1');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
