// Port Meridian — the deterministic seeded city: roads, blocks, buildings,
// parks, beach and waterfront. All layout comes from one seed, so every run
// (and every screenshot) shows the same city.
export const WORLD_W = 3360;
export const WORLD_H = 2640;
export const ROAD_W = 120;
export const ROADS_X = [240, 720, 1200, 1680, 2160, 2640, 3120];
export const ROADS_Y = [240, 720, 1200, 1680, 2160];
export const BEACH_TOP = 2280;
export const WATER_TOP = 2460;

// mulberry32: small deterministic RNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOFS = ['#c96f4a', '#4a9b8e', '#d9a05b', '#6b7a8d', '#5a7ea6', '#a85f6e', '#7d8f5a'];
const PARK_TREES = ['#4f8f4a', '#5da24f', '#3f7d46'];

export function createCity(seed) {
  const rng = mulberry32(seed);
  const city = { seed, buildings: [], parks: [], trees: [], landmarks: {} };
  // Block rectangles between the roads.
  const xs = [[300, 660], [780, 1140], [1260, 1620], [1740, 2100], [2220, 2580], [2700, 3060]];
  const ys = [[300, 660], [780, 1140], [1260, 1620], [1740, 2100]];
  for (let bi = 0; bi < xs.length; bi++) {
    for (let bj = 0; bj < ys.length; bj++) {
      const [x0, x1] = xs[bi], [y0, y1] = ys[bj];
      const downtown = bi >= 2 && bi <= 3 && bj <= 1;
      if (rng() < 0.22) {
        const park = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        city.parks.push(park);
        const n = 6 + Math.floor(rng() * 7);
        for (let t = 0; t < n; t++) {
          city.trees.push({
            x: x0 + 30 + rng() * (park.w - 60), y: y0 + 30 + rng() * (park.h - 60),
            r: 12 + rng() * 9, c: PARK_TREES[Math.floor(rng() * PARK_TREES.length)],
          });
        }
        continue;
      }
      const two = rng() < 0.3;
      const slots = two
        ? (rng() < 0.5
          ? [{ x: x0 + 26, y: y0 + 26, w: (x1 - x0) / 2 - 40, h: y1 - y0 - 52 },
             { x: x0 + (x1 - x0) / 2 + 14, y: y0 + 26, w: (x1 - x0) / 2 - 40, h: y1 - y0 - 52 }]
          : [{ x: x0 + 26, y: y0 + 26, w: x1 - x0 - 52, h: (y1 - y0) / 2 - 40 },
             { x: x0 + 26, y: y0 + (y1 - y0) / 2 + 14, w: x1 - x0 - 52, h: (y1 - y0) / 2 - 40 }])
        : [{ x: x0 + 26, y: y0 + 26, w: x1 - x0 - 52, h: y1 - y0 - 52 }];
      for (const s of slots) {
        city.buildings.push({
          x: s.x, y: s.y, w: s.w, h: s.h,
          roof: ROOFS[Math.floor(rng() * ROOFS.length)],
          height: downtown ? 3 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2),
          kind: 'bld',
        });
      }
    }
  }
  // Landmark pads sit on the road network (walkable / drivable points).
  city.landmarks = {
    garage: { x: 720, y: 1200, label: 'CREW GARAGE', color: '#e8a13a' },
    bank: { x: 1680, y: 720, label: 'MERIDIAN BANK', color: '#7fb069' },
    safehouse: { x: 2640, y: 1680, label: 'SAFEHOUSE', color: '#5a7ea6' },
    spray: { x: 1200, y: 2160, label: 'SPRAY SHOP', color: '#c96f4a' },
    pickup: { x: 3120, y: 720, label: 'PICKUP', color: '#a85f6e' },
    dropoff: { x: 240, y: 1680, label: 'DROP-OFF', color: '#a85f6e' },
  };
  return city;
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps. Returns corrected {x, y}.
export function resolveCircleVsBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; y = cy + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the smallest penetration.
        const pl = x - b.x + r, pr = b.x + b.w - x + r;
        const pt = y - b.y + r, pb = b.y + b.h - y + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x - r; else if (m === pr) x = b.x + b.w + r;
        else if (m === pt) y = b.y - r; else y = b.y + b.h + r;
      }
    }
  }
  return { x, y };
}

export function onRoad(city, x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function isWater(city, x, y) { return y >= WATER_TOP; }
export function isSand(city, x, y) { return y >= BEACH_TOP && y < WATER_TOP; }

// Nearest road centreline point to (x, y): used to snap spawns onto roads.
export function nearestRoadPoint(city, x, y) {
  let bx = ROADS_X[0], bd = Math.abs(x - bx);
  for (const rx of ROADS_X) if (Math.abs(x - rx) < bd) { bd = Math.abs(x - rx); bx = rx; }
  let by = ROADS_Y[0]; bd = Math.abs(y - by);
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < bd) { bd = Math.abs(y - ry); by = ry; }
  return Math.abs(x - bx) < Math.abs(y - by) ? { x: bx, y } : { x, y: by };
}

// The whole static city, painted once to an offscreen canvas.
export function drawCityLayer(city) {
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = WORLD_H;
  const g = c.getContext('2d');
  // Grass base.
  g.fillStyle = '#7fae5a'; g.fillRect(0, 0, WORLD_W, WORLD_H);
  // Beach sand and water along the south edge.
  g.fillStyle = '#e8cf9a'; g.fillRect(0, BEACH_TOP, WORLD_W, WATER_TOP - BEACH_TOP);
  g.fillStyle = '#3f7fb8'; g.fillRect(0, WATER_TOP, WORLD_W, WORLD_H - WATER_TOP);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
  for (let x = 0; x < WORLD_W; x += 90) {
    g.beginPath();
    g.moveTo(x, WATER_TOP + 26 + Math.sin(x * 0.01) * 6);
    g.quadraticCurveTo(x + 45, WATER_TOP + 18 + Math.sin(x * 0.01) * 6, x + 90, WATER_TOP + 26 + Math.sin(x * 0.01) * 6);
    g.stroke();
  }
  // Sidewalk strips, then asphalt, for every road.
  for (const rx of ROADS_X) {
    g.fillStyle = '#b9a98c'; g.fillRect(rx - ROAD_W / 2 - 14, 0, ROAD_W + 28, BEACH_TOP);
    g.fillStyle = '#3d3a44'; g.fillRect(rx - ROAD_W / 2, 0, ROAD_W, BEACH_TOP);
  }
  for (const ry of ROADS_Y) {
    g.fillStyle = '#b9a98c'; g.fillRect(0, ry - ROAD_W / 2 - 14, WORLD_W, ROAD_W + 28);
    g.fillStyle = '#3d3a44'; g.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  }
  // Dashed centre lines.
  g.fillStyle = '#d8c95a';
  for (const rx of ROADS_X) for (let y = 20; y < BEACH_TOP; y += 56) g.fillRect(rx - 3, y, 6, 28);
  for (const ry of ROADS_Y) for (let x = 20; x < WORLD_W; x += 56) g.fillRect(x, ry - 3, 28, 6);
  // Block ground.
  const xs = [[300, 660], [780, 1140], [1260, 1620], [1740, 2100], [2220, 2580], [2700, 3060]];
  const ys = [[300, 660], [780, 1140], [1260, 1620], [1740, 2100]];
  for (let bi = 0; bi < xs.length; bi++) for (let bj = 0; bj < ys.length; bj++) {
    g.fillStyle = '#9a917e'; g.fillRect(xs[bi][0], ys[bj][0], xs[bi][1] - xs[bi][0], ys[bj][1] - ys[bj][0]);
  }
  // Parks.
  for (const p of city.parks) {
    g.fillStyle = '#6aa85e'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#c9b183';
    g.beginPath(); g.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 3, 10, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(p.x + p.w / 2, p.y + p.h / 2, 10, p.h / 3, 0, 0, Math.PI * 2); g.fill();
  }
  for (const t of city.trees) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = t.c;
    g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.4, 0, Math.PI * 2); g.fill();
  }
  // Buildings with a long sunset shadow and a roof.
  for (const b of city.buildings) {
    const sh = 6 + b.height * 5;
    g.fillStyle = 'rgba(40,20,10,0.30)';
    g.fillRect(b.x + sh, b.y + sh, b.w, b.h);
    g.fillStyle = b.roof; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(b.x, b.y, b.w, b.h);
    // Roof details: skylights / vents.
    g.fillStyle = 'rgba(255,255,255,0.28)';
    const cols = Math.max(1, Math.floor(b.w / 70)), rows = Math.max(1, Math.floor(b.h / 70));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillRect(b.x + 14 + i * 62, b.y + 14 + j * 62, 26, 18);
    }
    // (Tall downtown towers read by their long shadows, not by a label.)
  }
  // Landmark pads.
  g.textAlign = 'center';
  for (const key of Object.keys(city.landmarks)) {
    const lm = city.landmarks[key];
    g.fillStyle = lm.color;
    g.beginPath(); g.arc(lm.x, lm.y, 46, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 13px system-ui, sans-serif';
    g.fillText(lm.label, lm.x, lm.y + 62);
  }
  return c;
}

// Tiny static base for the minimap.
export function drawMinimapBase(city) {
  const s = 220 / WORLD_W;
  const c = document.createElement('canvas');
  c.width = 220; c.height = Math.round(WORLD_H * s);
  const g = c.getContext('2d');
  g.fillStyle = '#20242e'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#3f7fb8'; g.fillRect(0, WATER_TOP * s, c.width, c.height - WATER_TOP * s);
  g.strokeStyle = '#8a8a92'; g.lineWidth = 3;
  for (const rx of ROADS_X) { g.beginPath(); g.moveTo(rx * s, 0); g.lineTo(rx * s, BEACH_TOP * s); g.stroke(); }
  for (const ry of ROADS_Y) { g.beginPath(); g.moveTo(0, ry * s); g.lineTo(WORLD_W * s, ry * s); g.stroke(); }
  g.fillStyle = '#5a5a62';
  for (const b of city.buildings) g.fillRect(b.x * s, b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
  return c;
}
