# Vice City Nights — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kryptonzxq/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kryptonzxq/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the
[make.fun bounty "Make GTA 6"](https://make.fun/bounty/gta6-01).
You are **Vic**, a courier-driver for a small crew in the city of
**Port Meridian**. Explore a seeded city on foot and by car in a
**third-person view** — the camera sits behind you and the streets,
traffic and skyline stretch ahead in perspective — steal cars,
outrun the police, and run four story missions — from your first stolen
wheels to the Meridian Bank job.

## The game

- **A city to explore** — a deterministic seeded grid of roads, blocks,
  buildings, parks and a beachfront, drawn procedurally on canvas and
  rendered in third-person perspective (Mode 7 ground, buildings, cars
  and people as billboards); the chase camera follows behind you, with a
  warm sunset wash and long shadows
- **On foot and by car** — walk and run, or press E to take any car:
  sedans, taxis, sports cars, trucks and police interceptors, each with
  its own speed and handling
- **Traffic and pedestrians** — AI cars follow the lanes and turn at
  intersections; pedestrians walk the sidewalks and flee when a crime
  happens nearby
- **Wanted level and police** — 0–5 stars. Steal a car in view, hit a
  pedestrian, or fire a shot and the Port Meridian PD comes after you:
  patrol cars ram and block, officers chase you on foot. Lay low to cool
  off, or pay the Spray Shop $100 to clear the heat
- **Missions and story** — four jobs in order: First Wheels, Package Run,
  Hot Pursuit, and The Big Score, each with an intro, an objective on the
  HUD, a marker on the minimap, and a payout
- **Combat** — punch (Space / click) and a pistol (F / right-click) with
  limited ammo and pickups around the city
- **HUD with minimap** — health, wanted stars, cash, mission objective,
  speed, ammo, and a live minimap with the player, police, spray shop and
  mission marker
- **Start and save** — title screen, pause menu, Busted screen, and
  progress saved to localStorage (cash, missions, best escape)
- **Sound** — everything synthesised live with the Web Audio API: engine
  hum, two-tone siren, gunshots, jingles and wanted stings. No audio files.

## Play it

```sh
node serve.ts        # game/ on http://localhost:8080
```

Or open `game/index.html` from any static server. The `?shot=` scenes are
deterministic showcase states used for the screenshots (see `shots.json`).

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json` with the vendored make.fun
library (`vendor/makefun-game.ts`).

## Files

- `game/index.html` — page, HUD, overlays
- `game/style.css` — warm sunset chrome
- `game/src/city.js` — seeded city generation, collision, static layers
- `game/src/vehicles.js` — car types, arcade physics, drawing
- `game/src/traffic.js` — AI cars, pedestrians, car bumps
- `game/src/police.js` — wanted level, police chase, spray shop
- `game/src/missions.js` — the four story missions, objectives, saving
- `game/src/combat.js` — punch, pistol, ammo pickups
- `game/src/hud.js` — HUD updates, minimap, overlays
- `game/src/audio.js` — Web Audio sound effects
- `game/src/game.js` — state, input, loop, rendering, respawn
- `game/src/shots.js` — deterministic `?shot=` showcase states
- `game/src/main.js` — boot and wiring

## License

MIT, see LICENSE. All art, city, characters, vehicles, names, story and
sounds are original, drawn and written for this entry.
