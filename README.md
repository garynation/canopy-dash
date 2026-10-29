# Canopy Dash: Dual-Ladder Monkey Climb

An endless dual-ladder browser arcade game with procedural canvas sprites, Web Audio sound effects, dynamic altitude biomes, and a thread-safe server-synced Hall of Fame leaderboard.

## Quick Start

Run the bundled Python 3 HTTP and leaderboard server:

```bash
chmod +x ./server.py
./server.py --port 8092
```

Then open `http://localhost:8092` in your browser.

### Server CLI Options & Environment Variables

- `--port <PORT>`: Port to listen on (defaults to `8092` or `$PORT`).
- `--host <HOST>`: Host interface to bind (defaults to `0.0.0.0`).
- `CANOPY_DASH_DATA_DIR`: Optional directory path for persistent leaderboard storage (defaults to `./data`).

## Controls

| Input | Action |
| :--- | :--- |
| `←` / `→` or `A` / `D` | Switch between Left and Right bamboo ladders |
| `Space` | Quick-dash to the opposite ladder |
| `↑` / `W` | Fast-Climb Boost (`1.65x` climb speed) |
| `↓` / `S` | Brake / Hesitate (`0.45x` climb speed) |
| On-Screen Arcade Deck | Touch / mouse buttons (`◀ LEFT LADDER`, `▲ BOOST`, `▶ RIGHT LADDER`) |

## Obstacles, Biomes & Power-Ups

### Canopy Hazards
- **Retracting Spikes (`⚙️`)**: Watch the amber warning glint; climb past while retracted or leap to the opposite ladder.
- **Fuse Dynamite (`🧨`)**: Avoid contact and clear the blast radius before the burning fuse reaches zero.
- **Hungry Tree Snakes (`🐍`)**: Coiled tree vipers hiss and lunge across rungs.
- **Falling Coconuts (`🥥`)**: Watch the top-of-lane warning indicator and switch ladders before impact.
- **Rotting Rungs (`🪵`)**: Cracked, mossy bamboo rungs snap underfoot after brief contact.

### Collectibles & Power-Ups
- **Bananas (`🍌`)**: Build your banana combo multiplier and bonus score.
- **Vine Shield (`🛡️`)**: Absorbs one hazard hit without ending your climb.
- **Chili Turbo (`🌶️`)**: Triggers a temporary high-speed invincible upward dash.

### Altitude Zones
1. **Jungle Floor** (`0m–250m`)
2. **Canopy Mist** (`250m–600m`)
3. **Temple Ruins** (`600m–1100m`)
4. **Volcano Peak** (`1100m+`)

## Leaderboard REST API (`/api/leaderboard`)

Scores are persisted atomically to `data/leaderboard.json` (up to 50 stored records, top 10 returned in leaderboard queries).

- **`GET /api/leaderboard`**
  Returns the top 10 scores sorted by `score`, `altitude`, and `bananas`:
  ```json
  {
    "ok": true,
    "scores": [
      {
        "id": "climb-1730200000000-0",
        "rank": 1,
        "name": "Gary Nation",
        "playerName": "Gary Nation",
        "score": 4250,
        "altitude": 380,
        "bananas": 24,
        "deathCause": "Caught in a TNT Blast!",
        "date": "2026-10-29",
        "updatedAt": "2026-10-29T12:00:00Z"
      }
    ],
    "highScore": 4250,
    "totalEntries": 1,
    "updatedAt": "2026-10-29T12:00:00Z"
  }
  ```
- **`POST /api/leaderboard`**
  Submits or updates a climb record (`name`, `score`, `altitude`, `bananas`, `deathCause`, optional `id`/`runKey`). Updating an existing `id` retains the highest score, altitude, and banana count for that run.
- **`POST /api/leaderboard/clear`** / **`POST /api/leaderboard/reset`** / **`DELETE /api/leaderboard`**
  Resets `data/leaderboard.json` to an empty list (`[]`).
- **`GET /api/health`**
  Returns service health status (`{"ok": true, "service": "canopy-dash", ...}`).

## Project Structure

- `index.html` — Game layout, HUD telemetry bar, overlays, Hall of Fame panel, and arcade touch deck
- `styles.css` — Responsive styling and animations
- `game.js` — Core game loop, physics, procedural obstacle spawning, and leaderboard synchronization
- `sprites.js` — High-DPI canvas sprite rendering for the monkey, biomes, hazards, and collectibles
- `audio.js` — Procedural Web Audio API sound effects and music engine
- `server.py` — Threaded HTTP server and `/api/leaderboard` REST API
- `data/leaderboard.json` — Persistent JSON storage for Hall of Fame scores
