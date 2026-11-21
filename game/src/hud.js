// HUD: health, wanted stars, cash, mission objective, speed, ammo, and the
// minimap. Overlays (title, pause, busted, story complete) are DOM in
// index.html; this module fills and shows them.
import { drawMinimapBase, WORLD_W, WORLD_H } from './city.js';

let mmBase = null;

export function updateHUD(state) {
  const el = state.hudEls;
  if (!el) return;
  const pl = state.player;
  // Health bar.
  const hp = Math.max(0, Math.round(pl.car ? pl.car.health : pl.health));
  el.healthFill.style.width = hp + '%';
  el.healthFill.style.background = hp > 50 ? '#7fb069' : hp > 25 ? '#e8a13a' : '#d23b3b';
  el.healthText.textContent = hp;
  // Wanted stars.
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
  el.stars.textContent = stars;
  el.stars.classList.toggle('hot', state.wanted >= 3);
  // Cash / score.
  el.cash.textContent = '$' + pl.cash;
  el.score.textContent = 'Missions ' + state.missionsDone + '/4';
  // Objective.
  el.objective.textContent = state.objectiveText || '';
  el.objective.classList.toggle('urgent', !!(state.mission && state.mission.def.steps[state.mission.step].time));
  // Speed + ammo.
  if (pl.car) {
    el.speed.textContent = Math.round(Math.abs(pl.car.speed) * 0.22) + ' mph';
    el.speed.style.display = '';
  } else el.speed.style.display = 'none';
  el.ammo.textContent = 'Ammo ' + pl.ammo;
  el.ammo.style.display = pl.car ? 'none' : '';
  // Mission banner.
  if (state.banner && state.time - state.banner.t < state.banner.dur) {
    el.banner.style.display = '';
    el.bannerTitle.textContent = state.banner.title;
    el.bannerSub.textContent = state.banner.sub;
  } else el.banner.style.display = 'none';
  // Wanted flash vignette.
  el.vignette.style.opacity = state.wanted >= 3 ? (0.25 + Math.sin(state.time * 6) * 0.12) : 0;
  drawMinimap(state);
}

export function drawMinimap(state) {
  const mm = state.hudEls.minimap;
  if (!mm) return;
  const ctx = mm.getContext('2d');
  if (!mmBase) mmBase = drawMinimapBase(state.city);
  const s = mm.width / WORLD_W;
  ctx.drawImage(mmBase, 0, 0);
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x * s, y * s, r || 3, 0, Math.PI * 2); ctx.fill();
  };
  // Spray shop (orange), mission marker (pulsing gold).
  const lm = state.city.landmarks;
  dot(lm.spray.x, lm.spray.y, '#e8a13a', 3.5);
  const mk = state.missionMarker;
  if (mk) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.5;
    ctx.strokeStyle = '#ffd23b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mk.x * s, mk.y * s, pulse + 3, 0, Math.PI * 2); ctx.stroke();
    dot(mk.x, mk.y, '#ffd23b', 3.5);
  }
  // Police (flashing blue/red).
  const on = Math.floor(state.time * 4) % 2 === 0;
  for (const p of state.police) dot(p.x, p.y, on ? '#ff2d2d' : '#2d5bff', 3);
  // Player arrow.
  const pl = state.player;
  ctx.save();
  ctx.translate(pl.x * s, pl.y * s);
  ctx.rotate(pl.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  // Viewport rectangle, centred on the player (the third-person camera
  // sits behind them, so the visible area is around the player).
  const vw = state.view.w * s, vh = state.view.h * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect((state.player.x - state.view.w / 2) * s, (state.player.y - state.view.h / 2) * s, vw, vh);
}

export function showOverlay(state, name) {
  const el = state.hudEls;
  if (!el) return;
  for (const key of ['title', 'pause', 'busted', 'story']) {
    if (el[key]) el[key].style.display = key === name ? '' : 'none';
  }
  if (name === 'busted' && el.bustedStats) {
    el.bustedStats.textContent = 'Cash lost: $150 · Wanted cleared · You wake up at the Safehouse.';
  }
  if (name === 'story' && el.storyStats) {
    el.storyStats.textContent = 'All 4 missions done · Cash $' + state.player.cash +
      ' · Best escape: ' + (state.bestEscape || 0) + ' stars';
  }
  if (name === 'title' && el.continueBtn) {
    el.continueBtn.style.display = state.save ? '' : 'none';
  }
}

export function hideOverlays(state) { showOverlay(state, null); }
