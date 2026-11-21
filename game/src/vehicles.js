// Cars: types, arcade physics, collision and procedural drawing.
import { resolveCircleVsBuildings, onRoad, isWater, isSand, WORLD_W, WORLD_H, BEACH_TOP } from './city.js';

export const CAR_TYPES = {
  sedan: { name: 'Meridian Sedan', max: 330, accel: 250, turn: 2.7, w: 26, l: 48, colors: ['#3f8f8a', '#7a6ba8', '#b8b0a0', '#4a6b8a'] },
  taxi: { name: 'City Taxi', max: 330, accel: 250, turn: 2.7, w: 26, l: 48, colors: ['#f2c230'] },
  sports: { name: 'Comet GT', max: 460, accel: 360, turn: 3.1, w: 26, l: 50, colors: ['#d23b3b', '#e8a13a', '#2f6fd0'] },
  truck: { name: 'Hauler', max: 260, accel: 175, turn: 2.1, w: 30, l: 62, colors: ['#8a7a5a', '#5a7a5a'] },
  police: { name: 'Interceptor', max: 400, accel: 320, turn: 3.0, w: 26, l: 50, colors: ['#e8eef5'] },
};

export function createCar(type, x, y, angle, driver) {
  const t = CAR_TYPES[type];
  const colors = t.colors;
  return {
    type, x, y, angle, speed: 0,
    color: colors[Math.floor(Math.random() * colors.length)],
    driver: driver || 'parked', // 'player' | 'ai' | 'parked' | 'police'
    health: 100, w: t.w, l: t.l,
    ai: null, stuck: 0, reverseT: 0, siren: 0,
  };
}

// Arcade car physics. input: {up, down, left, right, brake}. Returns hit info.
export function updateCarDrive(car, input, dt, city) {
  const t = CAR_TYPES[car.type];
  const offroad = !onRoad(city, car.x, car.y);
  if (input.up) car.speed += t.accel * dt;
  if (input.down) car.speed -= (car.speed > 10 ? t.accel * 1.4 : t.accel * 0.6) * dt;
  // Drag: heavier off-road, handbrake strongest.
  let drag = offroad ? 1.5 : 0.55;
  if (input.brake) drag = 3.2;
  car.speed *= Math.exp(-drag * dt);
  if (car.speed > t.max) car.speed = t.max;
  if (car.speed < -120) car.speed = -120;
  if (Math.abs(car.speed) < 4 && !input.up && !input.down) car.speed = 0;
  // Steering scales with speed; reversing flips it.
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const spdF = Math.min(1, Math.abs(car.speed) / 120);
  car.angle += steer * t.turn * spdF * dt * (car.speed < 0 ? -1 : 1) * (input.brake ? 1.5 : 1);
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const ny = car.y - Math.cos(car.angle) * car.speed * dt;
  car.x = nx; car.y = ny;
  // World bounds + water keep cars on land.
  car.x = Math.max(30, Math.min(WORLD_W - 30, car.x));
  car.y = Math.max(30, Math.min(BEACH_TOP + 130, car.y));
  if (isWater(city, car.x, car.y)) { car.y = BEACH_TOP + 130; car.speed *= 0.3; }
  // Buildings: circle at the car centre.
  const r = Math.min(car.w, car.l) * 0.45;
  const before = { x: car.x, y: car.y };
  const fixed = resolveCircleVsBuildings(city, car.x, car.y, r);
  let hit = false;
  if (fixed.x !== before.x || fixed.y !== before.y) {
    hit = Math.abs(car.speed) > 140;
    car.x = fixed.x; car.y = fixed.y;
    car.speed *= 0.45;
  }
  car.offroad = offroad; car.sand = isSand(city, car.x, car.y);
  return { hit, offroad };
}

export function carHitSpeed(car) { return Math.abs(car.speed); }

// Simple circle-vs-circle push-apart for two cars. Returns impact speed.
export function collideCars(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ra = Math.min(a.w, a.l) * 0.45, rb = Math.min(b.w, b.l) * 0.45;
  const d = Math.hypot(dx, dy), min = ra + rb;
  if (d >= min || d < 0.01) return 0;
  const push = (min - d) / 2, ux = dx / d, uy = dy / d;
  a.x -= ux * push; a.y -= uy * push;
  b.x += ux * push; b.y += uy * push;
  const impact = Math.abs(a.speed - b.speed);
  a.speed *= 0.7; b.speed *= 0.7;
  return impact;
}

export function drawCar(ctx, car, time) {
  const t = CAR_TYPES[car.type];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Sunset shadow.
  ctx.fillStyle = 'rgba(40,20,10,0.30)';
  ctx.fillRect(-car.w / 2 + 6, -car.l / 2 + 8, car.w, car.l);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.w / 2, -car.l / 2, car.w, car.l, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  if (car.type === 'taxi') {
    ctx.fillStyle = '#222';
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 5 - 2, -4, 4, 8);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(-car.w / 2 + 2, -car.l / 2 + 4, car.w - 4, 5);
  }
  if (car.type === 'truck') {
    ctx.fillStyle = '#6b5f45'; ctx.fillRect(-car.w / 2 + 2, -car.l / 2 + 4, car.w - 4, 22);
    ctx.fillStyle = '#d8d2c2'; ctx.fillRect(-car.w / 2 + 3, car.l / 2 - 18, car.w - 6, 12);
  }
  // Windshield + roof + rear window.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  ctx.fillRect(-car.w / 2 + 3, -car.l / 2 + 10, car.w - 6, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-car.w / 2 + 3, -car.l / 2 + 21, car.w - 6, car.l / 2 - 6);
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  ctx.fillRect(-car.w / 2 + 3, car.l / 2 - 12, car.w - 6, 8);
  if (car.type === 'sports') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-car.w / 2 - 2, car.l / 2 - 4, car.w + 4, 4); // spoiler
  }
  if (car.type === 'police') {
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(-car.w / 2 + 2, -2, car.w - 4, 8);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('PM PD', 0, 2);
    // Flashing light bar.
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d5bff';
    ctx.fillRect(-8, -car.l / 2 + 2, 7, 5);
    ctx.fillStyle = on ? '#2d5bff' : '#ff2d2d';
    ctx.fillRect(1, -car.l / 2 + 2, 7, 5);
  }
  // Headlights / taillights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(-car.w / 2 + 3, -car.l / 2 - 1, 5, 3);
  ctx.fillRect(car.w / 2 - 8, -car.l / 2 - 1, 5, 3);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-car.w / 2 + 3, car.l / 2 - 2, 5, 3);
  ctx.fillRect(car.w / 2 - 8, car.l / 2 - 2, 5, 3);
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
