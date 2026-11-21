// Combat on foot: a punch (Space / click) and a pistol (F / right-click),
// plus ammo pickups scattered around the city.
import { crimePulse, addWanted } from './police.js';

export function spawnAmmoPickups(state, n) {
  const rng = state.rng;
  for (let i = 0; i < n; i++) {
    const x = 200 + rng() * 3000, y = 200 + rng() * 1900;
    state.pickups.push({ x, y, kind: 'ammo', bob: rng() * Math.PI * 2 });
  }
}

export function punch(state) {
  const pl = state.player;
  if (pl.car || pl.punchCd > 0 || state.mode !== 'play') return;
  pl.punchCd = 0.35;
  pl.punchAnim = 0.25;
  state.audio.punch();
  // Hit anything in a short arc in front of the player.
  const fx = Math.sin(pl.angle), fy = -Math.cos(pl.angle);
  let hitSomething = false;
  for (const p of state.peds) {
    if (p.down > 0) continue;
    const dx = p.x - pl.x, dy = p.y - pl.y;
    const d = Math.hypot(dx, dy);
    if (d < 52 && (dx * fx + dy * fy) / (d || 1) > 0.3) {
      p.down = 3; // knocked flat
      p.x += (dx / (d || 1)) * 26; p.y += (dy / (d || 1)) * 26;
      hitSomething = true;
      state.particles.push({ x: p.x, y: p.y - 10, vx: 0, vy: -30, life: 0.5, max: 0.5, color: '#ffe9a8', size: 5, star: true });
      if (p.officer) { addWanted(state, 1, 'assaulted an officer'); crimePulse(state, pl.x, pl.y); }
      else crimePulse(state, pl.x, pl.y);
    }
  }
  if (hitSomething) state.audio.thud();
}

export function shoot(state) {
  const pl = state.player;
  if (pl.car || pl.ammo <= 0 || pl.shootCd > 0 || state.mode !== 'play') return;
  pl.ammo--;
  pl.shootCd = 0.4;
  pl.muzzle = 0.12;
  state.audio.gunshot();
  crimePulse(state, pl.x, pl.y);
  addWanted(state, 1, 'fired a weapon');
  // Hitscan: nearest ped / officer inside a cone in front, within 420px.
  const fx = Math.sin(pl.angle), fy = -Math.cos(pl.angle);
  let best = null, bd = 420;
  for (const p of state.peds) {
    if (p.down > 0) continue;
    const dx = p.x - pl.x, dy = p.y - pl.y;
    const d = Math.hypot(dx, dy);
    if (d < bd && (dx * fx + dy * fy) / (d || 1) > 0.86) { bd = d; best = p; }
  }
  if (best) {
    best.down = 5;
    best.x += fx * 20; best.y += fy * 20;
    state.particles.push({ x: best.x, y: best.y - 8, vx: 0, vy: -40, life: 0.6, max: 0.6, color: '#ff5a4a', size: 6, star: true });
  }
  // Muzzle flash particle at the barrel.
  state.particles.push({
    x: pl.x + fx * 26, y: pl.y + fy * 26, vx: fx * 60, vy: fy * 60,
    life: 0.12, max: 0.12, color: '#ffe9a8', size: 9, star: true,
  });
}

export function updatePickups(state, dt) {
  const pl = state.player;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.bob += dt * 3;
    if (!pl.car && Math.hypot(pl.x - pk.x, pl.y - pk.y) < 30) {
      pl.ammo += 12;
      state.audio.blip();
      state.events.push({ type: 'ammo', t: state.time });
      state.pickups.splice(i, 1);
    }
  }
}

export function drawPickups(ctx, state, time) {
  for (const pk of state.pickups) {
    const bob = Math.sin(pk.bob) * 3;
    ctx.save(); ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = 'rgba(40,20,10,0.3)';
    ctx.beginPath(); ctx.ellipse(3, 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f9e44'; ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-11, -11, 22, 22);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('AMMO', 0, 4);
    ctx.restore();
  }
}
