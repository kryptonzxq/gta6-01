// Vice City Nights — boot: build the state, wire input and HUD buttons,
// run the loop, apply ?shot= showcase states.
import { createGame, bindInput, resize, updateGame, renderGame, startGame, respawn } from './game.js';
import { showOverlay, hideOverlays } from './hud.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const state = createGame(canvas);
resize(state);
bindInput(state);

// Grab the HUD elements once.
state.hudEls = {
  healthFill: document.getElementById('health-fill'),
  healthText: document.getElementById('health-text'),
  stars: document.getElementById('stars'),
  cash: document.getElementById('cash'),
  score: document.getElementById('score'),
  objective: document.getElementById('objective'),
  speed: document.getElementById('speed'),
  ammo: document.getElementById('ammo'),
  banner: document.getElementById('banner'),
  bannerTitle: document.getElementById('banner-title'),
  bannerSub: document.getElementById('banner-sub'),
  vignette: document.getElementById('vignette'),
  minimap: document.getElementById('minimap'),
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  busted: document.getElementById('busted-screen'),
  story: document.getElementById('story-screen'),
  bustedStats: document.getElementById('busted-stats'),
  storyStats: document.getElementById('story-stats'),
  continueBtn: document.getElementById('btn-continue'),
};

function wireButton(id, fn) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', () => { state.audio.init(); state.audio.resume(); fn(); });
}
wireButton('btn-start', () => startGame(state, false));
wireButton('btn-continue', () => startGame(state, true));
wireButton('btn-resume', () => { state.mode = 'play'; hideOverlays(state); });
wireButton('btn-restart', () => { location.reload(); });
wireButton('btn-busted', () => respawn(state));
wireButton('btn-story', () => { state.mode = 'play'; hideOverlays(state); });
wireButton('btn-again', () => { location.reload(); });
wireButton('btn-mute', () => {
  state.audio.setMuted(!state.audio.muted);
  document.getElementById('btn-mute').textContent = state.audio.muted ? '🔇 Muted' : '🔊 Sound';
});

// Test hook: lets automated checks read live state (police count, wanted).
window.__vcn = { get police() { return state.police.length; }, get wanted() { return state.wanted; }, get mode() { return state.mode; }, state };

// Showcase mode: ?shot=1..4 renders a fixed game state for screenshots.
const params = new URLSearchParams(location.search);
const shot = Number(params.get('shot') || 0);
if (shot >= 1 && shot <= 4) {
  state.mode = 'play';
  hideOverlays(state);
  applyShot(state, shot);
  state.audio.setMuted(true);
} else {
  showOverlay(state, 'title');
}

// Main loop with a clamped delta so tab-switching cannot jump the world.
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateGame(state, dt);
  renderGame(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
