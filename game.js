/**
 * Canopy Dash: Dual-Ladder Monkey Climb
 * Core Game Engine, Procedural Hazard Generator, High Score Manager & Test Harness
 */
(function () {
  'use strict';

  // --- Constants & Configuration ---
  const CANVAS_WIDTH = 540;
  const CANVAS_HEIGHT = 840;
  const LANE_X = [185, 355]; // Lane 0 = Left Ladder (185), Lane 1 = Right Ladder (355)
  const MONKEY_SCREEN_Y = 620;
  const PIXELS_PER_METER = 25;

  const BASE_CLIMB_SPEED = 195; // px/sec
  const BOOST_MULTIPLIER = 1.65;
  const BRAKE_MULTIPLIER = 0.45;
  const CHILI_MULTIPLIER = 2.2;
  const JUMP_DURATION = 0.13; // seconds for smooth lane-switch leap

  const HIGHSCORE_STORAGE_KEY = 'canopy_dash_highscores_v1';
  const PLAYER_NAME_STORAGE_KEY = 'canopy_dash_player_name_v1';
  const LEADERBOARD_API_URL = '/api/leaderboard';

  function generateRunId() {
    return (
      'climb-' +
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  const BIOMES = [
    {
      index: 0,
      id: 'canopy',
      name: 'Lush Rainforest Canopy',
      shortName: 'Jungle Floor (0m–250m)',
      minAltitude: 0,
      hazardMix: 'Tier 1 · Balanced',
    },
    {
      index: 1,
      id: 'mist',
      name: 'Golden Cloud Mist',
      shortName: 'Canopy Mist (250m–600m)',
      minAltitude: 250,
      hazardMix: 'Tier 2 · Fuse TNT & Vipers',
    },
    {
      index: 2,
      id: 'temple',
      name: 'Ancient Temple Ruins',
      shortName: 'Temple Ruins (600m–1000m)',
      minAltitude: 600,
      hazardMix: 'Tier 3 · Rapid Spikes & TNT',
    },
    {
      index: 3,
      id: 'volcano',
      name: 'Obsidian Volcano Summit',
      shortName: 'Volcano Peak (1000m+)',
      minAltitude: 1000,
      hazardMix: 'Tier 4 · Extreme Canopy Chaos',
    },
  ];

  const DEATH_REASONS = {
    dead_snake: 'Eaten by a Giant Tree Viper!',
    dead_dynamite: 'Blown up by Dynamite!',
    dead_spikes: 'Impaled on Retracting Spikes!',
    dead_fall: 'Plummeted from the Canopy Ladder!',
  };

  // --- Internal Game State ---
  const state = {
    status: 'menu', // 'menu' | 'playing' | 'gameover'
    score: 0,
    scoreFloat: 0,
    altitude: 0,
    worldY: 0,
    bananas: 0,
    combo: 1,
    maxCombo: 1,
    time: 0,
    deathTimer: 0,
    deathCause: '',
    deathReasonText: '',
    scoreSavedForRun: false,

    // Controls state
    keys: {
      up: false,
      down: false,
      touchBoost: false,
    },

    // Monkey state
    monkey: {
      lane: 0,
      targetLane: 0,
      x: LANE_X[0],
      fromX: LANE_X[0],
      toX: LANE_X[0],
      screenY: MONKEY_SCREEN_Y,
      y: 0,
      climbPhase: 0,
      isJumping: false,
      jumpTimer: 0,
      jumpProgress: 0,
      dir: 1,
      shielded: false,
      shield: false,
      chiliTimer: 0,
      state: 'climbing', // 'climbing' | 'jumping' | 'dead_spikes' | 'dead_dynamite' | 'dead_snake' | 'dead_fall'
      stepSoundAccum: 0,
      vy: 0,
      vx: 0,
    },

    // World entities
    obstacles: [],
    collectibles: [],
    particles: [],
    floatingTexts: [],

    // Procedural generation tracking
    nextSpawnWorldY: 200,
    lastOccupiedLane: -1,
    spawnCounter: 0,

    // High scores (strictly 0 default entries, server-synced with localStorage fallback)
    highscores: [],
    currentRunId: generateRunId(),
    serverSynced: false,
    serverHighScore: 0,
  };

  // --- DOM Elements Cache ---
  const dom = {};

  function cacheDom() {
    dom.canvas = document.getElementById('game-canvas');
    dom.ctx = dom.canvas ? dom.canvas.getContext('2d') : null;

    dom.hudAltitude = document.getElementById('hud-altitude');
    dom.hudScore = document.getElementById('hud-score');
    dom.hudHighscore = document.getElementById('hud-highscore');
    dom.hudCombo = document.getElementById('hud-combo');
    dom.hudPowerup = document.getElementById('hud-powerup');
    dom.hudSpeed = document.getElementById('hud-speed');
    dom.hudSpeedBar = document.getElementById('hud-speed-bar');
    dom.hudLaneIndicator = document.getElementById('hud-lane-indicator');
    dom.hudBiomeName =
      document.getElementById('hud-biome-name') ||
      document.getElementById('hud-biome');
    dom.biomeSteps = document.querySelectorAll('.biome-step[data-biome]');
    dom.hudHazardMix = document.getElementById('hud-hazard-mix');

    dom.startOverlay = document.getElementById('start-overlay');
    dom.gameoverOverlay = document.getElementById('gameover-overlay');
    dom.deathReasonText = document.getElementById('death-reason-text');

    dom.finalScore = document.getElementById('final-score');
    dom.finalAltitude = document.getElementById('final-altitude');
    dom.finalBananas = document.getElementById('final-bananas');

    dom.scoreSaveForm = document.getElementById('score-save-form');
    dom.nameInput = document.getElementById('arcade-player-name-input');
    dom.btnSaveScore = document.getElementById('btn-save-score');
    dom.saveScoreFeedback = document.getElementById('save-score-feedback');
    dom.btnStartGame = document.getElementById('btn-start-game');
    dom.btnPlayAgain = document.getElementById('btn-play-again');
    dom.btnResetScores = document.getElementById('btn-reset-scores');
    dom.btnMute = document.getElementById('btn-mute');
    dom.highscoreList = document.getElementById('highscore-list');

    dom.btnTouchLeft = document.getElementById('btn-touch-left');
    dom.btnTouchBoost = document.getElementById('btn-touch-boost');
    dom.btnTouchRight = document.getElementById('btn-touch-right');
  }

  // --- Audio Wrapper ---
  function callAudio(method, ...args) {
    try {
      if (
        window.MonkeyAudio &&
        typeof window.MonkeyAudio[method] === 'function'
      ) {
        return window.MonkeyAudio[method](...args);
      }
    } catch (err) {
      // Ignore audio errors in headless mode
    }
    return undefined;
  }

  // --- Player Name Memory & Centralized Server Leaderboard Sync ---
  function loadRememberedPlayerName() {
    try {
      const saved = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
      if (saved && saved.trim()) {
        return saved.trim().slice(0, 32);
      }
    } catch (e) {
      // Ignore storage errors
    }
    return '';
  }

  function saveRememberedPlayerName(name) {
    const trimmed = String(name || '')
      .trim()
      .slice(0, 32);
    if (!trimmed) return;
    try {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmed);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function prefillPlayerNameInput() {
    if (!dom.nameInput) return;
    const remembered = loadRememberedPlayerName();
    if (remembered && !dom.nameInput.value.trim()) {
      dom.nameInput.value = remembered;
    }
  }

  function canUseServerApi() {
    if (typeof window.fetch !== 'function') return false;
    if (
      typeof window.location !== 'undefined' &&
      window.location.protocol === 'file:'
    ) {
      return false;
    }
    return true;
  }

  function normalizeScoresList(rawList) {
    if (!Array.isArray(rawList)) return [];
    const byId = new Map();
    rawList.forEach((entry, idx) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.score !== 'number' ||
        Number.isNaN(entry.score)
      ) {
        return;
      }
      const name =
        String(entry.name || entry.playerName || 'Jungle Climber')
          .trim()
          .slice(0, 32) || 'Jungle Climber';
      const id = String(
        entry.id ||
          entry.runKey ||
          `climb-local-${entry.timestamp || idx}-${name}`
      );
      const clean = {
        id,
        name,
        playerName: name,
        score: Math.max(0, Math.floor(entry.score)),
        altitude:
          typeof entry.altitude === 'number' && !Number.isNaN(entry.altitude)
            ? Math.max(0, Math.floor(entry.altitude))
            : 0,
        bananas:
          typeof entry.bananas === 'number' && !Number.isNaN(entry.bananas)
            ? Math.max(0, Math.floor(entry.bananas))
            : 0,
        deathCause: String(entry.deathCause || ''),
        date: entry.date || new Date().toISOString().slice(0, 10),
        updatedAt: entry.updatedAt || new Date().toISOString(),
        timestamp: entry.timestamp || Date.now(),
      };
      byId.set(id, clean);
    });

    return Array.from(byId.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.altitude !== a.altitude) return b.altitude - a.altitude;
        return b.bananas - a.bananas;
      })
      .slice(0, 10)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }

  // --- High Score Persistence (0 Default Seed Entries) ---
  function loadHighscores() {
    try {
      const raw = window.localStorage.getItem(HIGHSCORE_STORAGE_KEY);
      if (!raw) {
        state.highscores = [];
      } else {
        const parsed = JSON.parse(raw);
        state.highscores = normalizeScoresList(parsed);
      }
    } catch (e) {
      state.highscores = [];
    }
    renderHighscores();
  }

  function saveHighscoresToStorage() {
    try {
      window.localStorage.setItem(
        HIGHSCORE_STORAGE_KEY,
        JSON.stringify(state.highscores)
      );
    } catch (e) {
      // Ignore storage quota errors
    }
  }

  function getTopHighScore() {
    if (state.highscores.length === 0) return 0;
    const listTop = Math.max(0, Math.floor(state.highscores[0].score || 0));
    return Math.max(listTop, Math.floor(state.serverHighScore || 0));
  }

  function formatScorePadded(num) {
    const clean = Math.max(0, Math.floor(num || 0));
    return String(clean).padStart(6, '0');
  }

  function renderHighscores() {
    const topScore = Math.max(
      getTopHighScore(),
      state.status === 'playing' && state.highscores.length > 0
        ? state.score
        : 0
    );

    if (dom.hudHighscore) {
      dom.hudHighscore.textContent =
        state.highscores.length === 0
          ? 'HI 000000'
          : `HI ${formatScorePadded(topScore)}`;
    }

    if (!dom.highscoreList) return;
    dom.highscoreList.innerHTML = '';

    if (state.highscores.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty-leaderboard-state';
      emptyLi.textContent = 'No climbs recorded yet — be the first!';
      dom.highscoreList.appendChild(emptyLi);
      return;
    }

    state.highscores.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = `highscore-row highscore-item${idx === 0 ? ' rank-1' : ''}`;

      const leftDiv = document.createElement('div');
      leftDiv.className = 'hs-left';

      const rankSpan = document.createElement('span');
      rankSpan.className = 'hs-rank highscore-rank mono-num';
      rankSpan.textContent = `#${idx + 1}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'hs-name highscore-name';
      nameSpan.textContent = entry.name;

      leftDiv.appendChild(rankSpan);
      leftDiv.appendChild(nameSpan);

      const rightDiv = document.createElement('div');
      rightDiv.className = 'hs-right';

      if (typeof entry.altitude === 'number') {
        const altSpan = document.createElement('span');
        altSpan.className = 'hs-alt mono-num';
        altSpan.textContent = `${entry.altitude}m`;
        rightDiv.appendChild(altSpan);
      }

      const metaSpan = document.createElement('span');
      metaSpan.className = 'hs-score highscore-score mono-num';
      metaSpan.textContent = formatScorePadded(entry.score);
      rightDiv.appendChild(metaSpan);

      li.appendChild(leftDiv);
      li.appendChild(rightDiv);
      dom.highscoreList.appendChild(li);
    });
  }

  async function fetchLeaderboard() {
    if (!canUseServerApi()) {
      return state.highscores.slice();
    }
    try {
      const resp = await window.fetch(LEADERBOARD_API_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        return state.highscores.slice();
      }
      const data = await resp.json();
      if (data && Array.isArray(data.scores)) {
        state.serverSynced = true;
        state.highscores = normalizeScoresList(data.scores);
        state.serverHighScore =
          typeof data.highScore === 'number' && !Number.isNaN(data.highScore)
            ? Math.max(0, Math.floor(data.highScore))
            : getTopHighScore();
        saveHighscoresToStorage();
        renderHighscores();
      }
    } catch (err) {
      // Offline fallback: retain localStorage state
    }
    return state.highscores.slice();
  }

  async function saveCurrentScore(customName) {
    if (!state.currentRunId) {
      state.currentRunId = generateRunId();
    }

    const rawInput =
      customName !== undefined
        ? String(customName)
        : dom.nameInput
        ? dom.nameInput.value
        : '';
    const trimmedName = (
      rawInput.trim() ||
      loadRememberedPlayerName() ||
      'Jungle Climber'
    ).slice(0, 32);

    if (rawInput.trim()) {
      saveRememberedPlayerName(trimmedName);
    }
    if (dom.nameInput && customName !== undefined) {
      dom.nameInput.value = trimmedName;
    }

    const deathCauseText =
      state.deathReasonText ||
      DEATH_REASONS[state.deathCause] ||
      state.deathCause ||
      'Knocked off the Canopy Ladder!';

    const payload = {
      id: state.currentRunId,
      name: trimmedName,
      playerName: trimmedName,
      score: Math.max(1, Math.floor(state.score)),
      altitude: Math.max(0, Math.floor(state.altitude)),
      bananas: Math.max(0, Math.floor(state.bananas)),
      deathCause: deathCauseText,
      timestamp: Date.now(),
    };

    // Optimistic local upsert on the same currentRunId (no duplicate entries)
    const withoutCurrentRun = state.highscores.filter(
      (entry) => entry.id !== state.currentRunId
    );
    state.highscores = normalizeScoresList([...withoutCurrentRun, payload]);
    state.serverHighScore = Math.max(
      state.serverHighScore || 0,
      getTopHighScore()
    );
    state.scoreSavedForRun = true;

    saveHighscoresToStorage();
    renderHighscores();

    if (dom.btnSaveScore) {
      dom.btnSaveScore.textContent = 'SAVED ✓';
      dom.btnSaveScore.disabled = false;
    }
    if (dom.saveScoreFeedback) {
      dom.saveScoreFeedback.textContent = `Saved ${payload.name} (${formatScorePadded(payload.score)} pts) to Hall of Fame!`;
    }

    if (canUseServerApi()) {
      try {
        const resp = await window.fetch(LEADERBOARD_API_URL, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.scores)) {
            state.serverSynced = true;
            state.highscores = normalizeScoresList(data.scores);
            state.serverHighScore =
              typeof data.highScore === 'number' &&
              !Number.isNaN(data.highScore)
                ? Math.max(0, Math.floor(data.highScore))
                : getTopHighScore();
            saveHighscoresToStorage();
            renderHighscores();
          }
        }
      } catch (err) {
        // Offline localStorage cache already updated
      }
    }

    return state.highscores.slice();
  }

  const recordPlayerScore = saveCurrentScore;

  async function clearHighscores() {
    state.highscores = [];
    state.serverHighScore = 0;
    try {
      window.localStorage.removeItem(HIGHSCORE_STORAGE_KEY);
    } catch (e) {
      // Ignore storage errors
    }
    if (dom.hudHighscore) {
      dom.hudHighscore.textContent = 'HI 000000';
    }
    if (dom.saveScoreFeedback) {
      dom.saveScoreFeedback.textContent = '';
    }
    if (dom.btnSaveScore) {
      state.scoreSavedForRun = false;
      dom.btnSaveScore.textContent = 'SAVE SCORE';
      dom.btnSaveScore.disabled = false;
    }
    renderHighscores();

    if (canUseServerApi()) {
      let cleared = false;
      try {
        const delResp = await window.fetch(LEADERBOARD_API_URL, {
          method: 'DELETE',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (delResp.ok) {
          cleared = true;
          state.serverSynced = true;
        }
      } catch (err) {
        // Try POST /api/leaderboard/clear fallback below
      }

      if (!cleared) {
        try {
          const postResp = await window.fetch(`${LEADERBOARD_API_URL}/clear`, {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          if (postResp.ok) {
            state.serverSynced = true;
          }
        } catch (err) {
          // Offline mode fallback already cleared localStorage
        }
      }
    }

    return state.highscores.slice();
  }

  // --- Biome Helper ---
  function getCurrentBiome(altitude) {
    for (let i = BIOMES.length - 1; i >= 0; i--) {
      if (altitude >= BIOMES[i].minAltitude) {
        return BIOMES[i];
      }
    }
    return BIOMES[0];
  }

  function getLaneX(lane) {
    if (
      window.MonkeySprites &&
      typeof window.MonkeySprites.getLaneX === 'function'
    ) {
      return window.MonkeySprites.getLaneX(lane);
    }
    return lane === 1 ? LANE_X[1] : LANE_X[0];
  }

  // --- Particles & Floating Text Helpers ---
  function spawnFloatingText(text, x, screenY, color = '#ffd54f') {
    state.floatingTexts.push({
      text,
      x,
      y: screenY,
      screenY,
      vy: -55,
      alpha: 1.0,
      life: 0.95,
      maxLife: 0.95,
      color,
      scale: 1.0,
    });
  }

  function spawnBurstParticles(x, screenY, color, count = 14, speed = 150) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = speed * (0.45 + Math.random() * 0.75);
      state.particles.push({
        x,
        y: screenY,
        screenY,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 30,
        radius: 2.5 + Math.random() * 3.5,
        size: 3 + Math.random() * 4,
        color,
        alpha: 1.0,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        shape: 'circle',
      });
    }
  }

  // --- Obstacle Factory ---
  let nextEntityId = 1;

  function createObstacle(type, lane, worldY, overrides = {}) {
    const normalizedType = String(type || 'SPIKES').toUpperCase();
    const safeLane = lane === 1 ? 1 : 0;
    const x = getLaneX(safeLane);

    return {
      id: nextEntityId++,
      type: normalizedType,
      lane: safeLane,
      x,
      y: worldY,
      worldY,
      screenY: MONKEY_SCREEN_Y - (worldY - state.worldY),
      passed: false,
      closeCallAwarded: false,
      destroyed: false,
      // SPIKES defaults
      phase: 'retracted', // 'retracted' | 'warning' | 'extended' | 'retracting'
      phaseTimer: 0,
      extendRatio: 0,
      // DYNAMITE defaults
      fuseTime: 2.4,
      fuseRemaining: 2.4,
      fuseRatio: 1.0,
      fuseStarted: false,
      exploded: false,
      explodeTimer: 0,
      explodeProgress: 0,
      // SNAKE defaults
      state: 'coiled', // 'coiled' | 'telegraph' | 'striking' | 'eating'
      strikeProgress: 0,
      hissPlayed: false,
      eatTimer: 0,
      // COCONUT defaults
      warnTimer: 0.75,
      fallSpeed: 260,
      falling: false,
      rotation: 0,
      // BROKEN_RUNG defaults
      stepTimer: 0,
      crackRatio: 0,
      shaking: false,
      snapped: false,
      broken: false,
      ...overrides,
    };
  }

  function createCollectible(type, lane, worldY) {
    const safeLane = lane === 1 ? 1 : 0;
    return {
      id: nextEntityId++,
      type: String(type || 'BANANA').toUpperCase(),
      lane: safeLane,
      x: getLaneX(safeLane),
      y: worldY,
      worldY,
      screenY: MONKEY_SCREEN_Y - (worldY - state.worldY),
      collected: false,
      bobOffset: Math.random() * Math.PI * 2,
    };
  }

  // --- Initial Showcase Wave & Fair Procedural Spawner ---
  function seedInitialShowcaseObstacles() {
    // Monkey starts on lane 0 at worldY = 0 (screenY = 620).
    // Place signature obstacles in view above the monkey so active gameplay immediately showcases
    // both ladders, the climbing monkey, retracting spikes, burning-fuse dynamite, and a tree snake!
    state.obstacles = [];
    state.collectibles = [];

    // 1. Retracting Spikes on Right Ladder (lane = 1) at worldY = 175 (screenY = 445)
    state.obstacles.push(
      createObstacle('SPIKES', 1, 175, {
        phase: 'extended',
        phaseTimer: 0.15,
        extendRatio: 1.0,
      })
    );
    state.collectibles.push(createCollectible('BANANA', 0, 175));

    // 2. Burning Fuse Dynamite on Right Ladder (lane = 1) at worldY = 335 (screenY = 285)
    state.obstacles.push(
      createObstacle('DYNAMITE', 1, 335, {
        fuseTime: 2.6,
        fuseRemaining: 2.1,
        fuseRatio: 2.1 / 2.6,
        fuseStarted: true,
      })
    );
    state.collectibles.push(createCollectible('BANANA', 0, 335));

    // 3. Hungry Tree Snake on Left Ladder (lane = 0) at worldY = 495 (screenY = 125)
    state.obstacles.push(
      createObstacle('SNAKE', 0, 495, {
        state: 'telegraph',
      })
    );
    state.collectibles.push(createCollectible('BANANA', 1, 495));

    // 4. Rotting Rung on Right Ladder (lane = 1) at worldY = 665
    state.obstacles.push(createObstacle('BROKEN_RUNG', 1, 665));
    state.collectibles.push(createCollectible('SHIELD', 0, 665));

    state.nextSpawnWorldY = 835;
    state.lastOccupiedLane = 1;
    state.spawnCounter = 4;
  }

  function spawnProceduralBand(bandWorldY) {
    state.spawnCounter++;
    const altitude = Math.floor(bandWorldY / PIXELS_PER_METER);

    // Choose hazard lane (alternate frequently so player switches between ladders)
    let hazardLane = Math.random() < 0.5 ? 0 : 1;
    if (hazardLane === state.lastOccupiedLane && Math.random() < 0.65) {
      hazardLane = 1 - hazardLane;
    }
    state.lastOccupiedLane = hazardLane;
    const safeLane = 1 - hazardLane;

    // Pick obstacle type based on weighted distribution
    const roll = Math.random();
    let type = 'SPIKES';
    if (roll < 0.26) {
      type = 'SPIKES';
    } else if (roll < 0.52) {
      type = 'DYNAMITE';
    } else if (roll < 0.76) {
      type = 'SNAKE';
    } else if (roll < 0.9) {
      type = 'BROKEN_RUNG';
    } else {
      type = 'COCONUT';
    }

    const overrides = {};
    if (type === 'SPIKES') {
      const startPhases = ['retracted', 'warning', 'extended'];
      overrides.phase = startPhases[state.spawnCounter % startPhases.length];
      overrides.extendRatio =
        overrides.phase === 'extended'
          ? 1.0
          : overrides.phase === 'warning'
          ? 0.35
          : 0.0;
    } else if (type === 'DYNAMITE') {
      const fuse = Math.max(1.8, 2.6 - Math.min(0.6, altitude * 0.0005));
      overrides.fuseTime = fuse;
      overrides.fuseRemaining = fuse;
      overrides.fuseRatio = 1.0;
    }

    state.obstacles.push(
      createObstacle(type, hazardLane, bandWorldY, overrides)
    );

    // FAIRNESS INVARIANT: The opposite lane (safeLane) at bandWorldY is ALWAYS free of lethal hazards!
    const itemRoll = Math.random();
    if (itemRoll < 0.58) {
      state.collectibles.push(
        createCollectible('BANANA', safeLane, bandWorldY)
      );
    } else if (itemRoll < 0.66) {
      state.collectibles.push(
        createCollectible('GOLDEN_IDOL', safeLane, bandWorldY)
      );
    } else if (itemRoll < 0.73) {
      state.collectibles.push(
        createCollectible('SHIELD', safeLane, bandWorldY)
      );
    } else if (itemRoll < 0.79) {
      state.collectibles.push(createCollectible('CHILI', safeLane, bandWorldY));
    }
  }

  // --- Overlay Visibility Helpers ---
  function setOverlayVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.classList.remove('hidden', 'is-hidden');
      el.classList.add('active', 'visible');
      el.style.display = '';
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.classList.add('hidden');
      el.classList.remove('active', 'visible');
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  // --- Core Game Flow ---
  function startGame() {
    callAudio('init');

    state.status = 'playing';
    state.score = 0;
    state.scoreFloat = 0;
    state.altitude = 0;
    state.worldY = 0;
    state.bananas = 0;
    state.combo = 1;
    state.maxCombo = 1;
    state.deathTimer = 0;
    state.deathCause = '';
    state.deathReasonText = '';
    state.scoreSavedForRun = false;
    state.currentRunId = generateRunId();

    state.keys.up = false;
    state.keys.down = false;
    state.keys.touchBoost = false;

    const m = state.monkey;
    m.lane = 0;
    m.targetLane = 0;
    m.x = getLaneX(0);
    m.fromX = m.x;
    m.toX = m.x;
    m.screenY = MONKEY_SCREEN_Y;
    m.y = 0;
    m.climbPhase = 0;
    m.isJumping = false;
    m.jumpTimer = 0;
    m.jumpProgress = 0;
    m.dir = 1;
    m.shielded = false;
    m.shield = false;
    m.chiliTimer = 0;
    m.state = 'climbing';
    m.stepSoundAccum = 0;
    m.vx = 0;
    m.vy = 0;

    state.particles = [];
    state.floatingTexts = [];

    seedInitialShowcaseObstacles();

    setOverlayVisible(dom.startOverlay, false);
    setOverlayVisible(dom.gameoverOverlay, false);

    if (dom.btnSaveScore) {
      dom.btnSaveScore.textContent = 'SAVE SCORE';
      dom.btnSaveScore.disabled = false;
    }
    if (dom.saveScoreFeedback) {
      dom.saveScoreFeedback.textContent = '';
    }
    prefillPlayerNameInput();

    updateHud(1.0);
    renderHighscores();
    fetchLeaderboard();
  }

  function switchLane(targetLane) {
    if (state.status !== 'playing') return false;
    const m = state.monkey;

    let nextLane;
    if (targetLane === 0 || targetLane === 1) {
      nextLane = targetLane;
    } else {
      nextLane = 1 - m.lane;
    }

    if (nextLane === m.lane) {
      return false;
    }

    const oldLane = m.lane;

    // Check Close-Call Dodge bonus on oldLane before switching
    for (let i = 0; i < state.obstacles.length; i++) {
      const obs = state.obstacles[i];
      if (obs.destroyed || obs.closeCallAwarded) continue;
      if (obs.lane === oldLane) {
        const dy = obs.y - state.worldY;
        if (dy >= -20 && dy <= 75) {
          obs.closeCallAwarded = true;
          state.combo = Math.min(10, state.combo + 1);
          const bonus = 50 * state.combo;
          state.scoreFloat += bonus;
          state.score = Math.floor(state.scoreFloat);
          spawnFloatingText(
            `CLOSE CALL! +${bonus}`,
            getLaneX(oldLane),
            m.screenY - 36,
            '#4ade80'
          );
          break;
        }
      }
    }

    m.fromX = m.x;
    m.toX = getLaneX(nextLane);
    m.lane = nextLane;
    m.targetLane = nextLane;
    m.dir = nextLane > oldLane ? 1 : -1;
    m.isJumping = true;
    m.jumpTimer = 0;
    m.jumpProgress = 0;
    m.state = 'jumping';

    callAudio('playSwitchLadder');
    spawnBurstParticles(m.fromX, m.screenY + 10, '#a7f3d0', 6, 80);
    updateHud(getCurrentSpeedMultiplier());
    return true;
  }

  function absorbWithShieldOrChili(obs) {
    const m = state.monkey;
    if (m.chiliTimer > 0) {
      obs.destroyed = true;
      state.scoreFloat += 100;
      state.score = Math.floor(state.scoreFloat);
      spawnBurstParticles(obs.x, obs.screenY, '#ff6d00', 18, 200);
      spawnFloatingText('SMASH! +100', obs.x, obs.screenY - 20, '#ff9100');
      callAudio('playDynamiteBoom');
      return true;
    }
    if (m.shielded) {
      m.shielded = false;
      m.shield = false;
      obs.destroyed = true;
      spawnBurstParticles(obs.x, obs.screenY, '#34d399', 20, 190);
      spawnFloatingText('SHIELD BLOCKED!', m.x, m.screenY - 30, '#34d399');
      callAudio('playPowerup', 'SHIELD');
      return true;
    }
    return false;
  }

  function triggerDeath(cause = 'dead_snake', immediateOverlay = false) {
    if (state.status === 'gameover') {
      if (immediateOverlay) {
        setOverlayVisible(dom.gameoverOverlay, true);
      }
      return;
    }

    const normalizedCause = String(cause || 'dead_snake').toLowerCase();
    let finalState = 'dead_snake';
    if (
      normalizedCause.includes('spike') ||
      normalizedCause === 'dead_spikes'
    ) {
      finalState = 'dead_spikes';
    } else if (
      normalizedCause.includes('dynamite') ||
      normalizedCause.includes('tnt') ||
      normalizedCause.includes('boom') ||
      normalizedCause === 'dead_dynamite'
    ) {
      finalState = 'dead_dynamite';
    } else if (
      normalizedCause.includes('snake') ||
      normalizedCause.includes('viper') ||
      normalizedCause === 'dead_snake'
    ) {
      finalState = 'dead_snake';
    } else if (
      normalizedCause.includes('fall') ||
      normalizedCause.includes('coconut') ||
      normalizedCause.includes('rung') ||
      normalizedCause === 'dead_fall'
    ) {
      finalState = 'dead_fall';
    } else {
      finalState = normalizedCause;
    }

    state.status = 'gameover';
    state.deathTimer = 0;
    state.overlayRevealDelay = immediateOverlay ? 0 : 0.75;
    state.deathCause = finalState;
    state.deathReasonText =
      DEATH_REASONS[finalState] || 'Knocked off the Canopy Ladder!';

    const m = state.monkey;
    m.state = finalState;
    m.isJumping = false;
    m.x = getLaneX(m.lane);
    m.vy = finalState === 'dead_dynamite' ? -240 : -140;
    m.vx = m.lane === 0 ? -45 : 45;

    // If death is from snake, ensure a snake at monkey's position is in 'eating' state
    if (finalState === 'dead_snake') {
      let eatingSnake = state.obstacles.find(
        (o) =>
          o.type === 'SNAKE' &&
          o.lane === m.lane &&
          Math.abs(o.y - state.worldY) < 90
      );
      if (!eatingSnake) {
        eatingSnake = createObstacle('SNAKE', m.lane, state.worldY, {
          state: 'eating',
          eatTimer: 0,
        });
        state.obstacles.push(eatingSnake);
      } else {
        eatingSnake.state = 'eating';
        eatingSnake.eatTimer = 0;
      }
      callAudio('playSnakeChomp');
      spawnFloatingText('CHOMP! GULP!', m.x, m.screenY - 45, '#ef4444');
    } else if (finalState === 'dead_dynamite') {
      callAudio('playDynamiteBoom');
      spawnBurstParticles(m.x, m.screenY, '#ff5722', 28, 250);
      spawnFloatingText('KABOOM!', m.x, m.screenY - 45, '#ff5722');
    } else if (finalState === 'dead_spikes') {
      callAudio('playSpikeSnap');
      spawnBurstParticles(m.x, m.screenY, '#cbd5e1', 18, 170);
      spawnFloatingText('IMPALED!', m.x, m.screenY - 45, '#f87171');
    } else {
      spawnBurstParticles(m.x, m.screenY, '#a16207', 16, 150);
    }

    callAudio('playGameOver', finalState);

    // Populate Game Over overlay DOM immediately
    if (dom.deathReasonText) {
      dom.deathReasonText.textContent = state.deathReasonText;
    }
    if (dom.finalScore) {
      dom.finalScore.textContent = String(state.score);
    }
    if (dom.finalAltitude) {
      dom.finalAltitude.textContent = `${state.altitude}m`;
    }
    if (dom.finalBananas) {
      dom.finalBananas.textContent = String(state.bananas);
    }

    if (!state.currentRunId) {
      state.currentRunId = generateRunId();
    }
    prefillPlayerNameInput();

    if (immediateOverlay) {
      setOverlayVisible(dom.gameoverOverlay, true);
    }
    updateHud(0);
    fetchLeaderboard();
  }

  // --- Deterministic Test Obstacle Spawner ---
  function spawnTestObstacle(type, lane, offsetY) {
    const normalizedType = String(type || 'SPIKES').toUpperCase();
    const targetLane = lane === 0 || lane === 1 ? lane : state.monkey.lane;
    const safeOffsetY =
      typeof offsetY === 'number' && !Number.isNaN(offsetY) ? offsetY : 140;
    const targetWorldY = state.worldY + safeOffsetY;

    // Remove existing obstacles near targetWorldY so test behavior is 100% deterministic
    state.obstacles = state.obstacles.filter(
      (o) => Math.abs(o.y - targetWorldY) > 95
    );

    let overrides = {};
    if (normalizedType === 'SPIKES') {
      const warnTime = safeOffsetY > 45 ? 0.12 : 0.0;
      overrides = {
        isTestObstacle: true,
        phase: warnTime > 0 ? 'warning' : 'extended',
        phaseTimer: 0,
        warnDuration: warnTime,
        extendedDuration: 4.5,
        extendRatio: warnTime > 0 ? 0.35 : 1.0,
      };
    } else if (normalizedType === 'DYNAMITE') {
      const timeToReach = Math.max(0.25, safeOffsetY / BASE_CLIMB_SPEED);
      const fuse = Math.max(0.25, timeToReach * 0.92);
      overrides = {
        isTestObstacle: true,
        fuseTime: fuse,
        fuseRemaining: fuse,
        fuseRatio: 1.0,
        fuseStarted: true,
        exploded: false,
      };
    } else if (normalizedType === 'SNAKE') {
      overrides = {
        isTestObstacle: true,
        state: safeOffsetY < 160 ? 'striking' : 'telegraph',
        strikeProgress: safeOffsetY < 160 ? 0.8 : 0.4,
      };
    } else if (normalizedType === 'COCONUT') {
      overrides = {
        isTestObstacle: true,
        warnTimer: 0.1,
        falling: true,
        fallSpeed: 260,
      };
    } else if (normalizedType === 'BROKEN_RUNG') {
      overrides = {
        isTestObstacle: true,
        stepTimer: 0,
        crackRatio: 0.35,
        shaking: true,
        snapped: false,
        broken: false,
      };
    }

    const obs = createObstacle(
      normalizedType,
      targetLane,
      targetWorldY,
      overrides
    );
    state.obstacles.push(obs);
    return obs;
  }

  // --- Speed & Update Loop ---
  function getCurrentSpeedMultiplier() {
    if (state.status !== 'playing') return 0;
    const m = state.monkey;
    if (m.chiliTimer > 0) return CHILI_MULTIPLIER;
    if (state.keys.up || state.keys.touchBoost) return BOOST_MULTIPLIER;
    if (state.keys.down) return BRAKE_MULTIPLIER;
    return 1.0;
  }

  function updateHud(speedMult) {
    const m = state.monkey;

    if (dom.hudAltitude) {
      dom.hudAltitude.textContent = `${state.altitude}m`;
    }
    if (dom.hudScore) {
      dom.hudScore.textContent = formatScorePadded(state.score);
    }
    if (dom.hudHighscore) {
      const top = getTopHighScore();
      const displayHi =
        state.highscores.length === 0 ? 0 : Math.max(top, state.score);
      dom.hudHighscore.textContent = `HI ${formatScorePadded(displayHi)}`;
    }
    if (dom.hudCombo) {
      dom.hudCombo.textContent = `${state.combo}x`;
    }
    if (dom.hudPowerup) {
      if (m.chiliTimer > 0) {
        dom.hudPowerup.textContent = `CHILI (${m.chiliTimer.toFixed(1)}s)`;
        dom.hudPowerup.dataset.state = 'chili';
      } else if (m.shielded) {
        dom.hudPowerup.textContent = 'SHIELD';
        dom.hudPowerup.dataset.state = 'shield';
      } else {
        dom.hudPowerup.textContent = 'NONE';
        dom.hudPowerup.dataset.state = 'none';
      }
    }
    if (dom.hudSpeed) {
      const shownSpeed = state.status === 'playing' ? speedMult : 1.0;
      dom.hudSpeed.textContent = `${shownSpeed.toFixed(1)}x`;
    }
    if (dom.hudSpeedBar) {
      const fillPct =
        state.status === 'playing'
          ? Math.min(100, Math.max(15, Math.round((speedMult / 2.2) * 100)))
          : 45;
      dom.hudSpeedBar.style.width = `${fillPct}%`;
    }
    if (dom.hudLaneIndicator) {
      dom.hudLaneIndicator.textContent =
        m.lane === 0 ? 'LEFT LADDER' : 'RIGHT LADDER';
    }

    const biome = getCurrentBiome(state.altitude);
    if (dom.hudBiomeName) {
      dom.hudBiomeName.textContent = biome.shortName;
    }
    if (dom.biomeSteps && dom.biomeSteps.length > 0) {
      dom.biomeSteps.forEach((stepEl) => {
        const idx = Number(stepEl.getAttribute('data-biome'));
        stepEl.classList.toggle('active', idx === biome.index);
      });
    }
    if (dom.hudHazardMix) {
      dom.hudHazardMix.textContent = biome.hazardMix;
    }
  }

  function updateObstacles(dt) {
    const m = state.monkey;

    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obs = state.obstacles[i];
      if (obs.destroyed) {
        state.obstacles.splice(i, 1);
        continue;
      }

      const distY = obs.y - state.worldY; // positive when obstacle is above monkey
      obs.screenY = MONKEY_SCREEN_Y - distY;
      obs.x = getLaneX(obs.lane);

      // Cull obstacles well below the screen
      if (obs.screenY > CANVAS_HEIGHT + 160) {
        state.obstacles.splice(i, 1);
        continue;
      }

      const sameLane = obs.lane === m.lane;

      // 1. SPIKES
      if (obs.type === 'SPIKES') {
        obs.phaseTimer += dt;
        const retractedDur = obs.isTestObstacle ? 0.35 : 1.3;
        const warnDur =
          obs.warnDuration !== undefined ? obs.warnDuration : 0.55;
        const extDur =
          obs.extendedDuration !== undefined ? obs.extendedDuration : 1.1;
        const retractingDur = 0.25;

        if (obs.phase === 'retracted') {
          obs.extendRatio = 0.0;
          if (obs.phaseTimer >= retractedDur) {
            obs.phase = 'warning';
            obs.phaseTimer = 0;
          }
        } else if (obs.phase === 'warning') {
          obs.extendRatio = 0.35;
          if (obs.phaseTimer >= warnDur) {
            obs.phase = 'extended';
            obs.phaseTimer = 0;
            if (Math.abs(distY) < 420) {
              callAudio('playSpikeSnap');
            }
          }
        } else if (obs.phase === 'extended') {
          obs.extendRatio = 1.0;
          if (obs.phaseTimer >= extDur) {
            obs.phase = 'retracting';
            obs.phaseTimer = 0;
          }
        } else if (obs.phase === 'retracting') {
          obs.extendRatio = Math.max(0, 1.0 - obs.phaseTimer / retractingDur);
          if (obs.phaseTimer >= retractingDur) {
            obs.phase = 'retracted';
            obs.phaseTimer = 0;
          }
        }

        // Collision check when extended
        if (
          state.status === 'playing' &&
          obs.phase === 'extended' &&
          sameLane &&
          Math.abs(distY) <= 30
        ) {
          if (!absorbWithShieldOrChili(obs)) {
            triggerDeath('dead_spikes');
            return;
          }
        }
      }

      // 2. DYNAMITE
      else if (obs.type === 'DYNAMITE') {
        if (!obs.fuseStarted && distY <= 540) {
          obs.fuseStarted = true;
          callAudio('playDynamiteFuse');
        }

        if (obs.fuseStarted && !obs.exploded) {
          obs.fuseRemaining = Math.max(0, obs.fuseRemaining - dt);
          obs.fuseRatio =
            obs.fuseTime > 0 ? obs.fuseRemaining / obs.fuseTime : 0;

          // Emit fuse spark particles occasionally
          if (
            Math.random() < 0.35 &&
            obs.screenY > 0 &&
            obs.screenY < CANVAS_HEIGHT
          ) {
            state.particles.push({
              x: obs.x + 18,
              y: obs.screenY - 22,
              screenY: obs.screenY - 22,
              vx: (Math.random() - 0.5) * 70,
              vy: -40 - Math.random() * 50,
              radius: 2.2,
              size: 2.5,
              color: '#facc15',
              alpha: 1,
              life: 0.22,
              maxLife: 0.22,
              shape: 'circle',
            });
          }

          // Direct contact with Dynamite on the same lane OR fuse reaching 0 triggers detonation
          const directContact =
            state.status === 'playing' && sameLane && Math.abs(distY) <= 30;

          if (obs.fuseRemaining <= 0 || directContact) {
            obs.exploded = true;
            obs.fuseRemaining = 0;
            obs.fuseRatio = 0;
            obs.explodeTimer = 0.45;
            obs.explodeProgress = 0.05;
            callAudio('playDynamiteBoom');
            spawnBurstParticles(obs.x, obs.screenY, '#ff5722', 24, 220);

            if (
              state.status === 'playing' &&
              sameLane &&
              Math.abs(distY) <= 85
            ) {
              if (!absorbWithShieldOrChili(obs)) {
                triggerDeath('dead_dynamite');
                return;
              }
            }
          }
        } else if (obs.exploded) {
          obs.explodeTimer -= dt;
          obs.explodeProgress = Math.min(
            1,
            Math.max(0, 1 - obs.explodeTimer / 0.45)
          );
          if (
            state.status === 'playing' &&
            obs.explodeTimer > 0.15 &&
            sameLane &&
            Math.abs(distY) <= 65
          ) {
            if (!absorbWithShieldOrChili(obs)) {
              triggerDeath('dead_dynamite');
              return;
            }
          }
          if (obs.explodeTimer <= 0) {
            obs.destroyed = true;
          }
        }
      }

      // 3. SNAKE (Tree Viper that Eats the Monkey)
      else if (obs.type === 'SNAKE') {
        if (obs.state === 'eating') {
          obs.eatTimer += dt;
        } else {
          if (distY <= 270 && distY > 115) {
            if (obs.state !== 'telegraph') {
              obs.state = 'telegraph';
              if (!obs.hissPlayed) {
                obs.hissPlayed = true;
                callAudio('playSnakeHiss');
              }
            }
            obs.strikeProgress = Math.min(1, (270 - distY) / 155);
          } else if (distY <= 115 && distY >= -45) {
            obs.state = 'striking';
            obs.strikeProgress = 1.0;
          } else if (distY < -45) {
            obs.state = 'coiled';
            obs.strikeProgress = 0;
          }

          // Check if snake catches and eats the monkey
          if (
            state.status === 'playing' &&
            sameLane &&
            Math.abs(distY) <= 34
          ) {
            if (!absorbWithShieldOrChili(obs)) {
              obs.state = 'eating';
              obs.eatTimer = 0;
              triggerDeath('dead_snake');
              return;
            }
          }
        }
      }

      // 4. COCONUT (Falling Coconut)
      else if (obs.type === 'COCONUT') {
        if (distY <= 680) {
          if (obs.warnTimer > 0) {
            obs.warnTimer = Math.max(0, obs.warnTimer - dt);
          } else {
            obs.falling = true;
            obs.y -= obs.fallSpeed * dt;
            obs.worldY = obs.y;
            obs.rotation = (obs.rotation || 0) + 9 * dt;
          }
        }

        const updatedDistY = obs.y - state.worldY;
        obs.screenY = MONKEY_SCREEN_Y - updatedDistY;

        if (
          state.status === 'playing' &&
          sameLane &&
          Math.abs(updatedDistY) <= 28
        ) {
          if (!absorbWithShieldOrChili(obs)) {
            triggerDeath('dead_fall');
            return;
          }
        }
      }

      // 5. BROKEN_RUNG (Rotting / Collapsing Rung)
      else if (obs.type === 'BROKEN_RUNG') {
        if (
          state.status === 'playing' &&
          sameLane &&
          Math.abs(distY) <= 24 &&
          !m.isJumping
        ) {
          obs.shaking = true;
          obs.stepTimer += dt;
          obs.crackRatio = Math.min(1, obs.stepTimer / 0.11);
          if (obs.stepTimer >= 0.11) {
            obs.snapped = true;
            obs.broken = true;
            if (!absorbWithShieldOrChili(obs)) {
              triggerDeath('dead_fall');
              return;
            }
          }
        }
      }
    }
  }

  function updateCollectibles() {
    const m = state.monkey;

    for (let i = state.collectibles.length - 1; i >= 0; i--) {
      const item = state.collectibles[i];
      if (item.collected) {
        state.collectibles.splice(i, 1);
        continue;
      }

      const distY = item.y - state.worldY;
      item.screenY = MONKEY_SCREEN_Y - distY;
      item.x = getLaneX(item.lane);

      if (item.screenY > CANVAS_HEIGHT + 100) {
        state.collectibles.splice(i, 1);
        continue;
      }

      if (
        state.status === 'playing' &&
        item.lane === m.lane &&
        Math.abs(distY) <= 34
      ) {
        item.collected = true;
        if (item.type === 'BANANA') {
          state.bananas += 1;
          const pts = 25 * state.combo;
          state.scoreFloat += pts;
          state.score = Math.floor(state.scoreFloat);
          state.combo = Math.min(10, state.combo + 1);
          state.maxCombo = Math.max(state.maxCombo, state.combo);
          callAudio('playBananaPickup', state.combo);
          spawnBurstParticles(item.x, item.screenY, '#fde047', 10, 120);
          spawnFloatingText(
            `+${pts} (${state.combo}x)`,
            item.x,
            item.screenY - 20,
            '#fde047'
          );
        } else if (item.type === 'GOLDEN_IDOL') {
          const pts = 250;
          state.scoreFloat += pts;
          state.score = Math.floor(state.scoreFloat);
          callAudio('playBananaPickup', state.combo + 2);
          spawnBurstParticles(item.x, item.screenY, '#fbbf24', 16, 160);
          spawnFloatingText(
            'GOLDEN IDOL +250!',
            item.x,
            item.screenY - 24,
            '#fbbf24'
          );
        } else if (item.type === 'SHIELD') {
          m.shielded = true;
          m.shield = true;
          callAudio('playPowerup', 'SHIELD');
          spawnBurstParticles(item.x, item.screenY, '#34d399', 14, 140);
          spawnFloatingText(
            'VINE SHIELD!',
            item.x,
            item.screenY - 24,
            '#34d399'
          );
        } else if (item.type === 'CHILI') {
          m.chiliTimer = 4.5;
          callAudio('playPowerup', 'CHILI');
          spawnBurstParticles(item.x, item.screenY, '#ef4444', 18, 180);
          spawnFloatingText(
            'CHILI FLAME BOOST!',
            item.x,
            item.screenY - 24,
            '#f97316'
          );
        }
        state.collectibles.splice(i, 1);
      }
    }
  }

  function updateParticlesAndTexts(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.screenY = p.y;
      p.vy = (p.vy || 0) + 220 * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / (p.maxLife || 0.5));
      if (p.life <= 0) {
        state.particles.splice(i, 1);
      }
    }

    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const t = state.floatingTexts[i];
      t.y += (t.vy || -50) * dt;
      t.screenY = t.y;
      t.life -= dt;
      t.alpha = Math.max(0, t.life / (t.maxLife || 0.9));
      if (t.life <= 0) {
        state.floatingTexts.splice(i, 1);
      }
    }
  }

  function stepSimulation(dt) {
    const clampedDt = Math.min(0.1, Math.max(0, dt));
    state.time += clampedDt;

    const m = state.monkey;

    if (state.status === 'playing') {
      // Chili countdown
      if (m.chiliTimer > 0) {
        m.chiliTimer = Math.max(0, m.chiliTimer - clampedDt);
      }

      // Climb movement
      const speedMult = getCurrentSpeedMultiplier();
      const difficultyScale = 1 + Math.min(0.65, state.altitude * 0.00045);
      const climbDelta =
        BASE_CLIMB_SPEED * speedMult * difficultyScale * clampedDt;

      state.worldY += climbDelta;
      m.y = state.worldY;
      state.altitude = Math.floor(state.worldY / PIXELS_PER_METER);

      // Score increases with altitude climbed (plus bonus when boosting)
      const scoreRate = speedMult > 1.1 ? 1.5 : 1.0;
      state.scoreFloat += (climbDelta / PIXELS_PER_METER) * 10 * scoreRate;
      state.score = Math.floor(state.scoreFloat);

      // Climb animation phase & rung step audio
      m.climbPhase += (climbDelta / 36) * Math.PI;
      m.stepSoundAccum += climbDelta;
      if (m.stepSoundAccum >= 48) {
        m.stepSoundAccum %= 48;
        callAudio('playClimbStep', speedMult);
      }

      // Horizontal jump interpolation between Left (185) and Right (355) ladders
      if (m.isJumping) {
        m.jumpTimer += clampedDt;
        m.jumpProgress = Math.min(1, m.jumpTimer / JUMP_DURATION);
        const ease = 1 - Math.pow(1 - m.jumpProgress, 2);
        m.x = m.fromX + (m.toX - m.fromX) * ease;
        if (m.jumpProgress >= 1) {
          m.isJumping = false;
          m.jumpProgress = 0;
          m.x = getLaneX(m.lane);
          m.state = 'climbing';
        }
      } else {
        m.x = getLaneX(m.lane);
        m.state = 'climbing';
      }

      // Procedural obstacle spawning ahead of camera
      while (state.nextSpawnWorldY < state.worldY + 1150) {
        spawnProceduralBand(state.nextSpawnWorldY);
        const gap = Math.max(
          155,
          210 - Math.min(45, Math.floor(state.altitude * 0.04))
        );
        state.nextSpawnWorldY += gap;
      }

      updateCollectibles();
      updateObstacles(clampedDt);
      updateHud(speedMult);
    } else if (state.status === 'gameover') {
      state.deathTimer += clampedDt;
      if (state.deathTimer >= (state.overlayRevealDelay ?? 0.75)) {
        setOverlayVisible(dom.gameoverOverlay, true);
      }
      updateObstacles(clampedDt);
    }

    updateParticlesAndTexts(clampedDt);
  }

  // --- Canvas Rendering ---
  function renderScene() {
    const ctx = dom.ctx;
    if (!ctx) return;

    const sprites = window.MonkeySprites;
    const biomeObj = getCurrentBiome(state.altitude);

    if (sprites) {
      // 1. Background & Biomes
      if (typeof sprites.drawBackground === 'function') {
        sprites.drawBackground(ctx, state.worldY, biomeObj.index, state.time);
      }

      // 2. Dual Ladders (broken rungs are rendered via drawObstacle below at exact screenY)
      if (typeof sprites.drawLadders === 'function') {
        sprites.drawLadders(ctx, state.worldY, null, state.time);
      }

      // 3. Collectibles
      if (typeof sprites.drawCollectible === 'function') {
        for (let i = 0; i < state.collectibles.length; i++) {
          const item = state.collectibles[i];
          if (item.screenY >= -60 && item.screenY <= CANVAS_HEIGHT + 60) {
            sprites.drawCollectible(ctx, item, item.screenY, state.time);
          }
        }
      }

      // 4. Obstacles & Top Warning Indicators
      for (let i = 0; i < state.obstacles.length; i++) {
        const obs = state.obstacles[i];
        if (obs.type === 'COCONUT' && obs.warnTimer > 0 && obs.screenY >= 20) {
          if (typeof sprites.drawTopWarning === 'function') {
            sprites.drawTopWarning(ctx, obs.lane, obs.screenY, state.time);
          }
        }
        if (
          obs.screenY >= -90 &&
          obs.screenY <= CANVAS_HEIGHT + 90 &&
          typeof sprites.drawObstacle === 'function'
        ) {
          sprites.drawObstacle(ctx, obs, obs.screenY, state.time);
        }
      }

      // 5. Monkey Character
      if (typeof sprites.drawMonkey === 'function') {
        sprites.drawMonkey(ctx, state.monkey, state.time);
      }

      // 6. Particles & Floating Texts
      if (typeof sprites.drawParticles === 'function') {
        sprites.drawParticles(ctx, state.particles);
      }
      if (typeof sprites.drawFloatingTexts === 'function') {
        sprites.drawFloatingTexts(ctx, state.floatingTexts);
      }
    } else {
      ctx.fillStyle = '#071f18';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }

  // --- Main RAF Loop ---
  let lastFrameTime = performance.now();

  function frameLoop(now) {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    stepSimulation(dt);
    renderScene();

    window.requestAnimationFrame(frameLoop);
  }

  // --- Event Listeners & Controls ---
  function bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) {
        if (e.key === 'Enter' && state.status === 'gameover') {
          e.preventDefault();
          recordPlayerScore();
        }
        return;
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        if (state.status === 'playing') {
          switchLane(0);
        }
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        if (state.status === 'playing') {
          switchLane(1);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (state.status === 'playing') {
          switchLane(1 - state.monkey.lane);
        } else if (state.status === 'menu') {
          startGame();
        }
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        state.keys.up = true;
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        state.keys.down = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        state.keys.up = false;
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        state.keys.down = false;
      }
    });

    if (dom.btnStartGame) {
      dom.btnStartGame.addEventListener('click', () => {
        startGame();
      });
    }

    if (dom.btnPlayAgain) {
      dom.btnPlayAgain.addEventListener('click', () => {
        startGame();
      });
    }

    if (dom.scoreSaveForm) {
      dom.scoreSaveForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCurrentScore();
      });
    }

    if (dom.nameInput) {
      dom.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveCurrentScore();
        }
      });
      dom.nameInput.addEventListener('input', () => {
        if (state.scoreSavedForRun && dom.btnSaveScore) {
          dom.btnSaveScore.textContent = 'SAVE SCORE';
          dom.btnSaveScore.disabled = false;
        }
      });
    }

    if (dom.btnSaveScore) {
      dom.btnSaveScore.addEventListener('click', (e) => {
        e.preventDefault();
        saveCurrentScore();
      });
    }

    if (dom.btnResetScores) {
      dom.btnResetScores.addEventListener('click', (e) => {
        e.preventDefault();
        clearHighscores();
      });
    }

    if (dom.btnMute) {
      dom.btnMute.addEventListener('click', () => {
        const muted = Boolean(callAudio('toggleMute'));
        dom.btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
        dom.btnMute.classList.toggle('is-muted', muted);
        const iconEl = dom.btnMute.querySelector('.mute-icon');
        const labelEl = dom.btnMute.querySelector('.mute-label');
        if (iconEl) iconEl.textContent = muted ? '🔇' : '🔊';
        if (labelEl) labelEl.textContent = muted ? 'MUTED' : 'AUDIO ON';
      });
    }

    if (dom.btnTouchLeft) {
      dom.btnTouchLeft.addEventListener('click', () => {
        switchLane(0);
      });
    }

    if (dom.btnTouchRight) {
      dom.btnTouchRight.addEventListener('click', () => {
        switchLane(1);
      });
    }

    if (dom.btnTouchBoost) {
      const startBoost = (e) => {
        e.preventDefault();
        state.keys.touchBoost = true;
      };
      const endBoost = () => {
        state.keys.touchBoost = false;
      };
      dom.btnTouchBoost.addEventListener('mousedown', startBoost);
      dom.btnTouchBoost.addEventListener('touchstart', startBoost, {
        passive: false,
      });
      window.addEventListener('mouseup', endBoost);
      window.addEventListener('touchend', endBoost);
    }

    if (dom.canvas) {
      dom.canvas.addEventListener('pointerdown', (e) => {
        if (state.status !== 'playing') return;
        const rect = dom.canvas.getBoundingClientRect();
        const relX =
          ((e.clientX - rect.left) / Math.max(1, rect.width)) * CANVAS_WIDTH;
        const clickedLane = relX < CANVAS_WIDTH / 2 ? 0 : 1;
        if (clickedLane === state.monkey.lane) {
          switchLane(1 - state.monkey.lane);
        } else {
          switchLane(clickedLane);
        }
      });
    }
  }

  // --- Initialization ---
  function init() {
    cacheDom();
    loadHighscores();
    prefillPlayerNameInput();
    fetchLeaderboard();
    seedInitialShowcaseObstacles();
    setOverlayVisible(dom.startOverlay, true);
    setOverlayVisible(dom.gameoverOverlay, false);
    updateHud(1.0);
    bindEvents();
    lastFrameTime = performance.now();
    window.requestAnimationFrame(frameLoop);
  }

  // --- Deterministic Automation & Verifier Hook ---
  window.__MONKEY_GAME__ = {
    getState() {
      return {
        status: state.status,
        score: state.score,
        altitude: state.altitude,
        worldY: state.worldY,
        bananas: state.bananas,
        lane: state.monkey.lane,
        monkeyX: state.monkey.x,
        monkeyScreenY: state.monkey.screenY,
        monkeyState: state.monkey.state,
        shield: state.monkey.shielded,
        chiliTimer: state.monkey.chiliTimer,
        combo: state.combo,
        deathCause: state.deathCause,
        deathReasonText: state.deathReasonText,
        currentRunId: state.currentRunId,
        serverSynced: Boolean(state.serverSynced),
        obstaclesCount: state.obstacles.length,
        obstacles: state.obstacles.map((o) => ({
          id: o.id,
          type: o.type,
          lane: o.lane,
          y: o.y,
          screenY: o.screenY,
          phase: o.phase,
          extendRatio: o.extendRatio,
          fuseRatio: o.fuseRatio,
          exploded: o.exploded,
          state: o.state,
          broken: o.broken,
        })),
        highscores: state.highscores.slice(),
      };
    },
    startGame,
    switchLane,
    spawnTestObstacle,
    triggerDeath(cause = 'dead_snake', immediateOverlay = true) {
      return triggerDeath(cause, immediateOverlay);
    },
    fetchLeaderboard,
    saveCurrentScore,
    recordPlayerScore,
    clearHighscores,
    step(dtSeconds = 0.05) {
      stepSimulation(dtSeconds);
      renderScene();
      return this.getState();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
