/**
 * Canopy Dash: Dual-Ladder Monkey Climb
 * 2D Canvas Rendering Engine (`window.MonkeySprites`)
 * Canvas logical resolution: 540 x 840
 */
(function (global) {
  'use strict';

  const CANVAS_WIDTH = 540;
  const CANVAS_HEIGHT = 840;

  // Dual Ladder Geometry
  const LANE_CENTERS = [185, 355];
  const LADDER_WIDTH = 96;
  const HALF_LADDER = LADDER_WIDTH / 2; // 48px -> Left: [137, 233], Right: [307, 403]
  const RUNG_SPACING = 48;
  const PIXELS_PER_METER = 25;

  // Pre-seeded deterministic parallax stars/foliage/spores
  const AMBIENT_NODES = Array.from({ length: 46 }, (_, i) => ({
    xSeed: ((i * 137.5) % 520) + 10,
    ySeed: (i * 89.3) % 840,
    size: 1.5 + (i % 4) * 0.9,
    speed: 0.2 + (i % 5) * 0.12,
    phase: i * 0.75
  }));

  const VINE_NODES = Array.from({ length: 7 }, (_, i) => ({
    x: i % 2 === 0 ? 18 + (i * 19) % 70 : 445 + (i * 23) % 75,
    swayOffset: i * 1.1,
    thickness: 4 + (i % 3) * 2
  }));

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
  }

  function lerpColor(hexA, hexB, t) {
    const ratio = clamp(t, 0, 1);
    const a = parseInt(hexA.slice(1), 16);
    const b = parseInt(hexB.slice(1), 16);
    const r1 = (a >> 16) & 255, g1 = (a >> 8) & 255, b1 = a & 255;
    const r2 = (b >> 16) & 255, g2 = (b >> 8) & 255, b2 = b & 255;
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const bl = Math.round(b1 + (b2 - b1) * ratio);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /**
   * Returns horizontal center X for lane 0 (185) or lane 1 (355).
   * Supports fractional lane values for smooth interpolation.
   */
  function getLaneX(lane) {
    if (typeof lane !== 'number' || Number.isNaN(lane)) return LANE_CENTERS[0];
    if (lane <= 0) return LANE_CENTERS[0];
    if (lane >= 1) return LANE_CENTERS[1];
    return lerp(LANE_CENTERS[0], LANE_CENTERS[1], lane);
  }

  /**
   * Determines biome metadata from altitude in meters or cameraY in pixels.
   */
  function resolveBiomeInfo(cameraY, biomeArg) {
    const rawY = typeof cameraY === 'number' && !Number.isNaN(cameraY) ? Math.max(0, cameraY) : 0;
    // If game.js passes altitude directly or world cameraY in pixels, normalize smoothly:
    const altitudeM = rawY > 2500 ? rawY / PIXELS_PER_METER : rawY / PIXELS_PER_METER;
    // Also check if biomeArg is an explicit index or string
    let index = 0;
    let blend = 0;

    if (altitudeM < 250) {
      index = 0;
      blend = clamp((altitudeM - 200) / 50, 0, 1);
    } else if (altitudeM < 600) {
      index = 1;
      blend = clamp((altitudeM - 530) / 70, 0, 1);
    } else if (altitudeM < 1000) {
      index = 2;
      blend = clamp((altitudeM - 920) / 80, 0, 1);
    } else {
      index = 3;
      blend = 0;
    }

    if (typeof biomeArg === 'string') {
      const lower = biomeArg.toLowerCase();
      if (lower.includes('mist') || lower.includes('cloud')) index = 1;
      else if (lower.includes('temple') || lower.includes('ruin') || lower.includes('aztec')) index = 2;
      else if (lower.includes('volcano') || lower.includes('obsidian') || lower.includes('magma')) index = 3;
      else if (lower.includes('canopy') || lower.includes('jungle') || lower.includes('rainforest')) index = 0;
    } else if (typeof biomeArg === 'number' && biomeArg >= 0 && biomeArg <= 3) {
      index = Math.floor(biomeArg);
    }

    return { index, blend, altitudeM, rawY };
  }

  const BIOME_PALETTES = [
    // 0: Lush Rainforest Canopy (0m - 250m)
    {
      name: 'Lush Rainforest Canopy',
      skyTop: '#061f18',
      skyMid: '#0d382a',
      skyBot: '#164d38',
      accentGlow: 'rgba(130, 255, 165, 0.14)',
      sporeColor: '#a7ff83',
      foliageColor: '#08291f',
      foliageHighlight: '#1b5e43'
    },
    // 1: Golden Cloud Mist (250m - 600m)
    {
      name: 'Golden Cloud Mist',
      skyTop: '#1e1633',
      skyMid: '#4a2940',
      skyBot: '#874c3c',
      accentGlow: 'rgba(255, 198, 105, 0.18)',
      sporeColor: '#ffe082',
      foliageColor: '#2a1a2e',
      foliageHighlight: '#693c47'
    },
    // 2: Ancient Aztec/Jungle Temple Ruins (600m - 1000m)
    {
      name: 'Ancient Temple Ruins',
      skyTop: '#0d1b26',
      skyMid: '#182f3c',
      skyBot: '#264653',
      accentGlow: 'rgba(64, 224, 208, 0.16)',
      sporeColor: '#48cae4',
      foliageColor: '#12232e',
      foliageHighlight: '#2b5868'
    },
    // 3: Obsidian Volcano Summit (1000m+)
    {
      name: 'Obsidian Volcano Summit',
      skyTop: '#090714',
      skyMid: '#240f1e',
      skyBot: '#591616',
      accentGlow: 'rgba(255, 87, 34, 0.22)',
      sporeColor: '#ff6d00',
      foliageColor: '#1a0b12',
      foliageHighlight: '#4f1818'
    }
  ];

  /**
   * 2. Background & 4 Altitude Biomes
   */
  function drawBackground(ctx, cameraY = 0, biome = null, time = 0) {
    if (!ctx) return;
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const info = resolveBiomeInfo(cameraY, biome);
    const curr = BIOME_PALETTES[info.index] || BIOME_PALETTES[0];
    const next = BIOME_PALETTES[Math.min(3, info.index + 1)] || curr;

    const topCol = lerpColor(curr.skyTop, next.skyTop, info.blend);
    const midCol = lerpColor(curr.skyMid, next.skyMid, info.blend);
    const botCol = lerpColor(curr.skyBot, next.skyBot, info.blend);

    ctx.save();

    // Base Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGrad.addColorStop(0, topCol);
    skyGrad.addColorStop(0.55, midCol);
    skyGrad.addColorStop(1, botCol);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Biome-specific parallax layers
    const scrollSlow = (info.rawY * 0.15) % CANVAS_HEIGHT;
    const scrollMed = (info.rawY * 0.35) % CANVAS_HEIGHT;

    // Diagonal Sunbeams / Temple Rays / Magma Plumes
    ctx.save();
    if (info.index === 0 || info.index === 1) {
      ctx.fillStyle = curr.accentGlow;
      for (let i = 0; i < 3; i++) {
        const beamX = 70 + i * 165 + Math.sin(t * 0.4 + i) * 18;
        ctx.beginPath();
        ctx.moveTo(beamX - 35, 0);
        ctx.lineTo(beamX + 45, 0);
        ctx.lineTo(beamX + 140, CANVAS_HEIGHT);
        ctx.lineTo(beamX + 20, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
      }
    } else if (info.index === 2) {
      // Carved stone pillar silhouettes in background
      ctx.fillStyle = 'rgba(12, 28, 36, 0.55)';
      const pillarPositions = [28, 468];
      for (let p = 0; p < pillarPositions.length; p++) {
        const px = pillarPositions[p];
        ctx.fillRect(px, 0, 44, CANVAS_HEIGHT);
        // Glowing cyan Aztec runes scrolling down pillars
        ctx.strokeStyle = 'rgba(72, 202, 228, 0.35)';
        ctx.lineWidth = 2;
        for (let ry = -120; ry < CANVAS_HEIGHT + 120; ry += 120) {
          const drawY = ((ry + scrollSlow) % (CANVAS_HEIGHT + 120)) - 60;
          ctx.strokeRect(px + 10, drawY, 24, 36);
          ctx.beginPath();
          ctx.moveTo(px + 16, drawY + 12);
          ctx.lineTo(px + 28, drawY + 12);
          ctx.moveTo(px + 22, drawY + 12);
          ctx.lineTo(px + 22, drawY + 26);
          ctx.stroke();
        }
      }
    } else if (info.index === 3) {
      // Volcano magma glow at bottom & starfield at top
      const magmaGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT * 0.55, 0, CANVAS_HEIGHT);
      magmaGrad.addColorStop(0, 'rgba(255, 60, 0, 0)');
      magmaGrad.addColorStop(1, `rgba(255, 80, 10, ${0.28 + Math.sin(t * 3) * 0.06})`);
      ctx.fillStyle = magmaGrad;
      ctx.fillRect(0, CANVAS_HEIGHT * 0.55, CANVAS_WIDTH, CANVAS_HEIGHT * 0.45);
    }
    ctx.restore();

    // Parallax Distant Silhouettes (Canopy leaves / Cloud layers / Temple steps / Volcanic ridges)
    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      const layerOffset = ((info.rawY * (0.18 + layer * 0.12)) % 280);
      ctx.fillStyle = layer === 0 ? curr.foliageColor : curr.foliageHighlight;
      ctx.globalAlpha = layer === 0 ? 0.55 : 0.32;

      for (let yBase = -280; yBase < CANVAS_HEIGHT + 280; yBase += 280) {
        const y = yBase + layerOffset;
        // Left border foliage/rock silhouette
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(65, y + 40, 85, y + 120, 35, y + 180);
        ctx.bezierCurveTo(75, y + 210, 60, y + 260, 0, y + 285);
        ctx.closePath();
        ctx.fill();

        // Right border foliage/rock silhouette
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH, y + 30);
        ctx.bezierCurveTo(CANVAS_WIDTH - 65, y + 70, CANVAS_WIDTH - 85, y + 150, CANVAS_WIDTH - 35, y + 205);
        ctx.bezierCurveTo(CANVAS_WIDTH - 75, y + 235, CANVAS_WIDTH - 55, y + 275, CANVAS_WIDTH, y + 310);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Hanging Background Vines (Biomes 0, 1, 2)
    if (info.index < 3) {
      ctx.save();
      ctx.strokeStyle = info.index === 1 ? 'rgba(65, 35, 50, 0.55)' : 'rgba(14, 58, 40, 0.65)';
      for (let i = 0; i < VINE_NODES.length; i++) {
        const v = VINE_NODES[i];
        ctx.lineWidth = v.thickness;
        ctx.beginPath();
        for (let vy = -60; vy <= CANVAS_HEIGHT + 60; vy += 60) {
          const sway = Math.sin(t * 1.4 + v.swayOffset + (vy + scrollMed) * 0.012) * 10;
          if (vy === -60) ctx.moveTo(v.x + sway, vy);
          else ctx.lineTo(v.x + sway, vy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Ambient Fireflies / Golden Spores / Temple Motes / Rising Embers
    ctx.save();
    for (let i = 0; i < AMBIENT_NODES.length; i++) {
      const node = AMBIENT_NODES[i];
      const floatY = info.index === 3
        ? (node.ySeed - t * 48 * node.speed + info.rawY * 0.25) % CANVAS_HEIGHT
        : (node.ySeed + Math.sin(t * 1.2 + node.phase) * 18 + info.rawY * 0.22) % CANVAS_HEIGHT;
      const drawY = (floatY + CANVAS_HEIGHT) % CANVAS_HEIGHT;
      const drawX = node.xSeed + Math.cos(t * 1.5 + node.phase) * 12;
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.4 + node.phase));

      ctx.globalAlpha = pulse * 0.75;
      ctx.fillStyle = curr.sporeColor;
      ctx.beginPath();
      ctx.arc(drawX, drawY, node.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Helper to check if a rung index or worldY is marked broken in `brokenRungs`
   */
  function findBrokenRungState(brokenRungs, rungIndex, rungWorldY, lane) {
    if (!brokenRungs) return null;
    if (Array.isArray(brokenRungs)) {
      for (let i = 0; i < brokenRungs.length; i++) {
        const br = brokenRungs[i];
        if (!br) continue;
        if (typeof br === 'number') {
          if (Math.abs(br - rungWorldY) < 20 || br === rungIndex) {
            return { broken: true, crackRatio: 0.6 };
          }
        } else if (typeof br === 'object') {
          const laneMatch = br.lane === undefined || br.lane === lane;
          const yVal = br.worldY !== undefined ? br.worldY : br.y;
          if (laneMatch && (br.rungIndex === rungIndex || (yVal !== undefined && Math.abs(yVal - rungWorldY) < 22))) {
            return br;
          }
        }
      }
    } else if (brokenRungs instanceof Set) {
      if (brokenRungs.has(rungIndex) || brokenRungs.has(`${lane}:${rungIndex}`)) {
        return { broken: true, crackRatio: 0.6 };
      }
    } else if (typeof brokenRungs === 'object') {
      const key = `${lane}:${rungIndex}`;
      if (brokenRungs[key]) return brokenRungs[key];
      if (brokenRungs[rungIndex]) return brokenRungs[rungIndex];
    }
    return null;
  }

  /**
   * Renders a cracked/splintering rung at (centerX, screenY)
   */
  function drawCrackedRungGraphic(ctx, centerX, screenY, stateObj, time) {
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const isSnapped = Boolean(stateObj && (stateObj.snapped || stateObj.broken === 'snapped' || stateObj.state === 'snapped' || (stateObj.crackRatio && stateObj.crackRatio >= 1)));
    const shake = stateObj && (stateObj.shaking || stateObj.stepping || (stateObj.crackRatio > 0.2 && !isSnapped))
      ? Math.sin(t * 55) * 2.5
      : 0;

    const leftX = centerX - HALF_LADDER + 5;
    const rightX = centerX + HALF_LADDER - 5;
    const y = screenY + shake;

    ctx.save();
    if (isSnapped) {
      // Left snapped half drooping down
      ctx.save();
      ctx.translate(leftX, y);
      ctx.rotate(0.38);
      ctx.fillStyle = '#5c4028';
      ctx.strokeStyle = '#2d1c0e';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, 0, -4, 34, 8, 3);
      ctx.fill();
      ctx.stroke();
      // Jagged splinter tip
      ctx.beginPath();
      ctx.moveTo(34, -4);
      ctx.lineTo(41, -1);
      ctx.lineTo(35, 2);
      ctx.lineTo(39, 4);
      ctx.lineTo(34, 4);
      ctx.fill();
      ctx.restore();

      // Right snapped half drooping down
      ctx.save();
      ctx.translate(rightX, y);
      ctx.rotate(-0.38);
      ctx.fillStyle = '#5c4028';
      ctx.strokeStyle = '#2d1c0e';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, -34, -4, 34, 8, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      // Cracked rotting wood rung with moss and dark fracture lines
      const rungGrad = ctx.createLinearGradient(leftX, y - 5, leftX, y + 5);
      rungGrad.addColorStop(0, '#785536');
      rungGrad.addColorStop(0.5, '#593d23');
      rungGrad.addColorStop(1, '#3b2614');
      ctx.fillStyle = rungGrad;
      ctx.strokeStyle = '#26170a';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, leftX, y - 4.5, rightX - leftX, 9, 3);
      ctx.fill();
      ctx.stroke();

      // Moss patches
      ctx.fillStyle = '#4f772d';
      ctx.beginPath();
      ctx.arc(centerX - 18, y - 3, 4, 0, Math.PI * 2);
      ctx.arc(centerX + 20, y + 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Prominent jagged center crack
      ctx.strokeStyle = '#140b04';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(centerX - 6, y - 5);
      ctx.lineTo(centerX - 1, y - 1);
      ctx.lineTo(centerX + 4, y + 1);
      ctx.lineTo(centerX - 2, y + 5);
      ctx.stroke();

      // Falling wood chips below cracked rung
      ctx.fillStyle = '#8d633e';
      for (let c = 0; c < 3; c++) {
        const chipY = y + 6 + ((t * 35 + c * 9) % 18);
        const chipX = centerX - 10 + c * 10 + Math.sin(t * 8 + c) * 2;
        ctx.fillRect(chipX, chipY, 3, 2);
      }
    }
    ctx.restore();
  }

  /**
   * 2b. Dual Bamboo/Hardwood Ladders (`drawLadders(ctx, cameraY, brokenRungs, time)`)
   */
  function drawLadders(ctx, cameraY = 0, brokenRungs = null, time = 0) {
    if (!ctx) return;
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const camY = typeof cameraY === 'number' && !Number.isNaN(cameraY) ? cameraY : 0;

    ctx.save();

    // Determine visible worldY range
    // Convention: cameraY is worldY at the bottom or reference of screen, or scroll offset.
    // Let's make scrolling rungs completely seamless for any cameraY convention!
    const offsetPx = ((camY % RUNG_SPACING) + RUNG_SPACING) % RUNG_SPACING;
    const baseRungIndex = Math.floor(camY / RUNG_SPACING);

    for (let lane = 0; lane < 2; lane++) {
      const centerX = LANE_CENTERS[lane];
      const leftRailX = centerX - HALF_LADDER;
      const rightRailX = centerX + HALF_LADDER;

      // Subtle drop shadow behind ladder
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.fillRect(leftRailX - 4, 0, LADDER_WIDTH + 8, CANVAS_HEIGHT);

      // Draw Horizontal Rungs every 48px
      const numRungs = Math.ceil(CANVAS_HEIGHT / RUNG_SPACING) + 2;
      for (let i = -1; i < numRungs; i++) {
        const screenY = i * RUNG_SPACING + offsetPx;
        if (screenY < -20 || screenY > CANVAS_HEIGHT + 20) continue;

        const rungIndex = baseRungIndex + (numRungs - i);
        const approxWorldY = camY + (CANVAS_HEIGHT - screenY);
        const brokenState = findBrokenRungState(brokenRungs, rungIndex, approxWorldY, lane);

        if (brokenState) {
          drawCrackedRungGraphic(ctx, centerX, screenY, brokenState, t);
          continue;
        }

        // Intact bamboo/hardwood rung
        const rungLeft = leftRailX + 4;
        const rungWidth = LADDER_WIDTH - 8;
        const rungGrad = ctx.createLinearGradient(rungLeft, screenY - 5, rungLeft, screenY + 5);
        rungGrad.addColorStop(0, '#e0b36a');
        rungGrad.addColorStop(0.35, '#c28d42');
        rungGrad.addColorStop(0.85, '#8f6022');
        rungGrad.addColorStop(1, '#5e3c11');

        ctx.fillStyle = rungGrad;
        ctx.strokeStyle = '#3d2508';
        ctx.lineWidth = 1.4;
        roundRectPath(ctx, rungLeft, screenY - 4.5, rungWidth, 9, 3.5);
        ctx.fill();
        ctx.stroke();

        // Top specular highlight on rung
        ctx.strokeStyle = 'rgba(255, 243, 210, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rungLeft + 6, screenY - 2.5);
        ctx.lineTo(rungLeft + rungWidth - 6, screenY - 2.5);
        ctx.stroke();
      }

      // Draw Left and Right Bamboo Side-Rails (`width = 12px` centered on rail X)
      const rails = [leftRailX, rightRailX];
      for (let r = 0; r < rails.length; r++) {
        const rx = rails[r];
        const railGrad = ctx.createLinearGradient(rx - 6, 0, rx + 6, 0);
        railGrad.addColorStop(0, '#6e491a');
        railGrad.addColorStop(0.3, '#d4a556');
        railGrad.addColorStop(0.55, '#ecc378');
        railGrad.addColorStop(0.85, '#9c6c2b');
        railGrad.addColorStop(1, '#4f330f');

        ctx.fillStyle = railGrad;
        ctx.fillRect(rx - 6, 0, 12, CANVAS_HEIGHT);

        ctx.strokeStyle = '#2e1c06';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx - 6, -2, 12, CANVAS_HEIGHT + 4);

        // Bamboo segment nodes & dark hemp lashing knots every 48px
        for (let i = -1; i < numRungs; i++) {
          const knotY = i * RUNG_SPACING + offsetPx;
          if (knotY < -20 || knotY > CANVAS_HEIGHT + 20) continue;

          // Hemp rope lashing X-wrap
          ctx.fillStyle = '#4a3219';
          roundRectPath(ctx, rx - 7.5, knotY - 6, 15, 12, 2.5);
          ctx.fill();
          ctx.strokeStyle = '#8c663b';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(rx - 6, knotY - 4);
          ctx.lineTo(rx + 6, knotY + 4);
          ctx.moveTo(rx + 6, knotY - 4);
          ctx.lineTo(rx - 6, knotY + 4);
          ctx.stroke();
        }
      }
    }

    // Draw Altitude Milestone Banners every 100m (2500px) across center gap between ladders
    const pixelsPer100m = 100 * PIXELS_PER_METER; // 2500px
    const firstMilestoneIndex = Math.max(1, Math.floor(camY / pixelsPer100m));
    for (let mIdx = firstMilestoneIndex; mIdx <= firstMilestoneIndex + 2; mIdx++) {
      const milestoneWorldY = mIdx * pixelsPer100m;
      // Support cameraY as bottom or top reference
      const screenY = CANVAS_HEIGHT - (milestoneWorldY - camY);
      if (screenY >= -40 && screenY <= CANVAS_HEIGHT + 40) {
        const bannerX = 235;
        const bannerW = 70;
        ctx.save();
        // Rope connecting both ladders
        ctx.strokeStyle = '#c28d42';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(233, screenY);
        ctx.lineTo(307, screenY);
        ctx.stroke();

        // Wooden milestone plaque
        ctx.fillStyle = '#2b1b0e';
        ctx.strokeStyle = '#f4b942';
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, bannerX, screenY - 11, bannerW, 22, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffe082';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${mIdx * 100}m`, 270, screenY + 0.5);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * Top-of-lane Warning Banner for Falling Coconuts (`drawTopWarning(ctx, lane, screenY, time)`)
   */
  function drawTopWarning(ctx, lane = 0, screenY = -50, time = 0) {
    if (!ctx) return;
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const centerX = getLaneX(lane);
    const pulse = 0.55 + 0.45 * Math.sin(t * 18);
    const bounceY = 28 + Math.sin(t * 14) * 4;

    ctx.save();
    ctx.translate(centerX, bounceY);

    // Outer pulsing danger halo
    ctx.fillStyle = `rgba(255, 61, 0, ${0.28 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();

    // Warning triangle / shield badge
    ctx.fillStyle = '#d32f2f';
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, -20, -18, 40, 36, 8);
    ctx.fill();
    ctx.stroke();

    // Downward bounce arrow + exclamation
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🥥!', 0, -2);

    ctx.fillStyle = '#ffea00';
    ctx.beginPath();
    ctx.moveTo(-8, 10);
    ctx.lineTo(8, 10);
    ctx.lineTo(0, 17);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /**
   * 3. Obstacles Renderer (`drawObstacle(ctx, obs, screenY, time)`)
   * Supports: 'SPIKES', 'DYNAMITE', 'SNAKE', 'COCONUT', 'BROKEN_RUNG'
   */
  function drawObstacle(ctx, obs, screenY, time = 0) {
    if (!ctx || !obs) return;
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const type = String(obs.type || 'SPIKES').toUpperCase();
    const lane = obs.lane !== undefined ? obs.lane : 0;
    const centerX = obs.x !== undefined ? obs.x : getLaneX(lane);
    const y = typeof screenY === 'number' ? screenY : (obs.screenY !== undefined ? obs.screenY : obs.y || 0);

    // If a coconut is above the screen, draw the top warning banner automatically
    if (type === 'COCONUT' && y < 20) {
      drawTopWarning(ctx, lane, y, t);
      if (y < -40) return;
    }

    if (y < -120 || y > CANVAS_HEIGHT + 120) return;

    switch (type) {
      case 'SPIKES':
        drawSpikesObstacle(ctx, obs, centerX, y, t);
        break;
      case 'DYNAMITE':
        drawDynamiteObstacle(ctx, obs, centerX, y, t);
        break;
      case 'SNAKE':
        drawSnakeObstacle(ctx, obs, centerX, y, t);
        break;
      case 'COCONUT':
        drawCoconutObstacle(ctx, obs, centerX, y, t);
        break;
      case 'BROKEN_RUNG':
        drawCrackedRungGraphic(ctx, centerX, y, obs, t);
        break;
      default:
        drawSpikesObstacle(ctx, obs, centerX, y, t);
        break;
    }
  }

  function drawSpikesObstacle(ctx, obs, centerX, y, t) {
    const phase = String(obs.phase || obs.state || 'extended').toLowerCase();
    let ratio = typeof obs.extendRatio === 'number' ? clamp(obs.extendRatio, 0, 1) : null;
    if (ratio === null) {
      if (phase === 'retracted') ratio = 0.0;
      else if (phase === 'warning') ratio = 0.25 + 0.1 * Math.sin(t * 30);
      else if (phase === 'retracting') ratio = 0.4;
      else ratio = 1.0; // extended
    }

    const isWarning = phase === 'warning' || (ratio > 0.08 && ratio < 0.45);
    const isExtended = phase === 'extended' || ratio >= 0.7;

    ctx.save();
    ctx.translate(centerX, y);

    // Dark forged-iron housing bar mounted across ladder rails
    const boxW = LADDER_WIDTH - 4;
    const boxH = 16;
    const ironGrad = ctx.createLinearGradient(0, -boxH / 2, 0, boxH / 2);
    ironGrad.addColorStop(0, '#495057');
    ironGrad.addColorStop(0.5, '#2b3035');
    ironGrad.addColorStop(1, '#16191d');

    ctx.fillStyle = ironGrad;
    ctx.strokeStyle = isWarning ? '#ff9100' : (isExtended ? '#ff5252' : '#111');
    ctx.lineWidth = isWarning || isExtended ? 2 : 1.5;
    roundRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    // Brass rivets & spike slots along housing
    const spikeXs = [-32, -16, 0, 16, 32];
    for (let i = 0; i < spikeXs.length; i++) {
      const sx = spikeXs[i];
      // Dark slot opening
      ctx.fillStyle = '#0b0d0e';
      ctx.fillRect(sx - 4, -boxH / 2 + 2, 8, boxH - 4);

      // Metallic spike protruding upward AND downward / outward
      if (ratio > 0.02) {
        const spikeLen = 6 + ratio * 22;
        const chromeGrad = ctx.createLinearGradient(sx - 5, 0, sx + 5, 0);
        chromeGrad.addColorStop(0, '#e9ecef');
        chromeGrad.addColorStop(0.45, '#ffffff');
        chromeGrad.addColorStop(0.55, '#adb5bd');
        chromeGrad.addColorStop(1, '#495057');

        ctx.fillStyle = chromeGrad;
        ctx.strokeStyle = '#212529';
        ctx.lineWidth = 1;

        // Upper spike blade
        ctx.beginPath();
        ctx.moveTo(sx - 5, -4);
        ctx.lineTo(sx, -4 - spikeLen);
        ctx.lineTo(sx + 5, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Lower spike blade
        ctx.beginPath();
        ctx.moveTo(sx - 4.5, 4);
        ctx.lineTo(sx, 4 + spikeLen * 0.75);
        ctx.lineTo(sx + 4.5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crimson hazard tip on fully extended spikes
        if (isExtended) {
          ctx.fillStyle = '#ff1744';
          ctx.beginPath();
          ctx.arc(sx, -4 - spikeLen, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Warning telegraph badge (`!`)
    if (isWarning) {
      const flash = 0.5 + 0.5 * Math.sin(t * 28);
      ctx.fillStyle = `rgba(255, 171, 0, ${0.3 + flash * 0.5})`;
      ctx.beginPath();
      ctx.arc(0, -18, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffd600';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, -18);
    }

    ctx.restore();
  }

  function drawDynamiteObstacle(ctx, obs, centerX, y, t) {
    const fuseRatio = typeof obs.fuseRatio === 'number' ? clamp(obs.fuseRatio, 0, 1) : 0.65;
    const exploded = Boolean(obs.exploded || obs.state === 'exploded');

    ctx.save();
    ctx.translate(centerX, y);

    if (exploded) {
      const expProgress = typeof obs.explodeProgress === 'number'
        ? clamp(obs.explodeProgress, 0, 1)
        : clamp(1 - (obs.explodeTimer || 0.25) / 0.45, 0.15, 1);
      const radius = 26 + expProgress * 64;

      // Fiery outer shockwave ring
      ctx.strokeStyle = `rgba(255, 214, 0, ${1 - expProgress * 0.7})`;
      ctx.lineWidth = 6 * (1 - expProgress * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Core fireball
      const fireGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius * 0.85);
      fireGrad.addColorStop(0, '#ffffff');
      fireGrad.addColorStop(0.3, '#ffea00');
      fireGrad.addColorStop(0.65, '#ff3d00');
      fireGrad.addColorStop(1, 'rgba(90, 20, 10, 0)');
      ctx.fillStyle = fireGrad;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // Billowing cartoon smoke puffs
      ctx.fillStyle = `rgba(55, 55, 62, ${0.75 * (1 - expProgress * 0.5)})`;
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 + t * 2;
        const dist = radius * 0.55;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, 14 + (i % 2) * 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      return;
    }

    // Pulsing danger aura when fuseRatio < 0.35
    if (fuseRatio < 0.35) {
      const dangerPulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 24));
      const blastRadius = 72;
      ctx.fillStyle = `rgba(255, 23, 68, ${0.14 + dangerPulse * 0.2})`;
      ctx.strokeStyle = `rgba(255, 82, 82, ${0.4 + dangerPulse * 0.45})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, blastRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Slight jitter as countdown nears 0
    const shake = fuseRatio < 0.35 ? Math.sin(t * 50) * 2.2 : 0;
    ctx.translate(shake, 0);

    // 3 Bundled Red TNT Sticks strapped horizontally/diagonally to the rung
    const stickOffsets = [-9, 0, 9];
    for (let i = 0; i < stickOffsets.length; i++) {
      const sy = stickOffsets[i];
      const tntGrad = ctx.createLinearGradient(-26, sy - 4, -26, sy + 4);
      tntGrad.addColorStop(0, '#ff5252');
      tntGrad.addColorStop(0.5, '#d50000');
      tntGrad.addColorStop(1, '#7f0000');

      ctx.fillStyle = tntGrad;
      ctx.strokeStyle = '#3e0000';
      ctx.lineWidth = 1.3;
      roundRectPath(ctx, -26, sy - 4.5, 52, 9, 3);
      ctx.fill();
      ctx.stroke();
    }

    // Black & gold binding straps
    ctx.fillStyle = '#212529';
    ctx.fillRect(-16, -14, 6, 28);
    ctx.fillRect(10, -14, 6, 28);

    // Center "TNT" & countdown gauge badge
    ctx.fillStyle = '#fff8e1';
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, -14, -9, 28, 18, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fuseRatio < 0.35 && Math.sin(t * 30) > 0 ? '#d50000' : '#111111';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 0, 0.5);

    // Burning cord fuse curving out from right side
    const fuseLen = 8 + fuseRatio * 24;
    const tipX = 26 + fuseLen * 0.75;
    const tipY = -6 - Math.sin(fuseRatio * Math.PI) * 10;

    ctx.strokeStyle = '#d7ccc8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.quadraticCurveTo(26 + fuseLen * 0.4, -12, tipX, tipY);
    ctx.stroke();

    // Sputtering yellow-orange spark at fuse tip
    const sparkRadius = 5 + Math.sin(t * 45) * 2.5;
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkRadius + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkRadius * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Spark rays
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 5; s++) {
      const ang = t * 18 + (s * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + Math.cos(ang) * (sparkRadius + 5), tipY + Math.sin(ang) * (sparkRadius + 5));
      ctx.stroke();
    }

    // Visual arc countdown ring above bundle
    ctx.strokeStyle = fuseRatio < 0.35 ? '#ff1744' : '#ffea00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -22, 7, -Math.PI / 2, -Math.PI / 2 + fuseRatio * Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawSnakeObstacle(ctx, obs, centerX, y, t) {
    const state = String(obs.state || obs.phase || 'coiled').toLowerCase();
    const isTelegraph = state === 'telegraph' || state === 'warning';
    const isStriking = state === 'striking' || state === 'attack';
    const isEating = state === 'eating' || state === 'chomp';

    ctx.save();
    ctx.translate(centerX, y);

    // Telegraph strike zone indicator
    if (isTelegraph || isStriking) {
      const flash = 0.4 + 0.6 * Math.abs(Math.sin(t * 22));
      ctx.fillStyle = `rgba(255, 23, 68, ${0.15 * flash})`;
      roundRectPath(ctx, -HALF_LADDER + 4, -24, LADDER_WIDTH - 8, 48, 8);
      ctx.fill();
    }

    // Coiled emerald & gold body wrapped around the left/right rail and rung
    const bodyGrad = ctx.createLinearGradient(-36, -20, 36, 20);
    bodyGrad.addColorStop(0, '#00c853');
    bodyGrad.addColorStop(0.5, '#2e7d32');
    bodyGrad.addColorStop(1, '#1b5e20');

    // Draw sinuous coils
    ctx.strokeStyle = '#0d3b14';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-36, 14);
    ctx.bezierCurveTo(-18, 22, 16, 12, -26, -4);
    ctx.bezierCurveTo(-38, -16, 10, -18, -14, -2);
    ctx.stroke();

    ctx.strokeStyle = bodyGrad;
    ctx.lineWidth = 10;
    ctx.stroke();

    // Gold diamond scale markings along coil
    ctx.fillStyle = '#ffd600';
    const scalePoints = [
      [-26, 14],
      [-10, 14],
      [-22, -4],
      [-12, -10]
    ];
    for (let i = 0; i < scalePoints.length; i++) {
      const [sx, sy] = scalePoints[i];
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3);
      ctx.lineTo(sx + 4, sy);
      ctx.lineTo(sx, sy + 3);
      ctx.lineTo(sx - 4, sy);
      ctx.closePath();
      ctx.fill();
    }

    // If 'eating', draw the comical monkey-shaped bulge inside the snake's belly!
    if (isEating) {
      const gulpPulse = Math.sin(t * 14) * 2.5;
      ctx.save();
      ctx.translate(2, 4);

      // Massive round belly bulge
      ctx.fillStyle = '#2e7d32';
      ctx.strokeStyle = '#0d3b14';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26 + gulpPulse, 20 - gulpPulse * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Yellow ribbed belly scales stretched over the monkey bulge
      ctx.fillStyle = '#dce775';
      ctx.beginPath();
      ctx.ellipse(0, 6, 22 + gulpPulse, 10, 0, 0, Math.PI);
      ctx.fill();

      // Cartoon chomp / gulp action lines radiating outward
      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 2;
      for (let c = 0; c < 6; c++) {
        const ang = (c * Math.PI) / 3 + t * 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 28, Math.sin(ang) * 22);
        ctx.lineTo(Math.cos(ang) * 36, Math.sin(ang) * 28);
        ctx.stroke();
      }

      // Comical "GULP!" text badge
      ctx.fillStyle = '#ffea00';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CHOMP!', 0, -24);
      ctx.restore();
    }

    // Snake Head Position & Jaws based on state
    let headX = 6 + Math.sin(t * 4) * 3;
    let headY = -4 + Math.cos(t * 3) * 2;
    let jawOpen = 0.15;

    if (isTelegraph) {
      headX = -18 + Math.sin(t * 35) * 2;
      headY = -8;
      jawOpen = 0.75;
    } else if (isStriking) {
      headX = 24;
      headY = 0;
      jawOpen = 1.0;
    } else if (isEating) {
      headX = 20;
      headY = -2;
      jawOpen = 0.35 + Math.abs(Math.sin(t * 16)) * 0.45;
    }

    ctx.save();
    ctx.translate(headX, headY);

    // Upper head & snout
    ctx.fillStyle = '#00e676';
    ctx.strokeStyle = '#0d3b14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -4 * jawOpen, 15, 9, -0.15 * jawOpen, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Lower jaw & mouth interior when open
    if (jawOpen > 0.25) {
      ctx.fillStyle = '#ad1457';
      ctx.beginPath();
      ctx.ellipse(3, 3, 12, 8 * jawOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      // Razor white curved fangs
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(11, 4);
      ctx.lineTo(5, -2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(13, -3);
      ctx.lineTo(15, 4);
      ctx.lineTo(10, -2);
      ctx.closePath();
      ctx.fill();
    }

    // Flicking red forked tongue
    if (!isEating || Math.sin(t * 12) > 0) {
      const tongueLen = isTelegraph || isStriking ? 16 : 10 + Math.sin(t * 20) * 5;
      if (tongueLen > 4) {
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(14 + tongueLen, 0);
        ctx.lineTo(14 + tongueLen + 5, -4);
        ctx.moveTo(14 + tongueLen, 0);
        ctx.lineTo(14 + tongueLen + 5, 4);
        ctx.stroke();
      }
    }

    // Fierce golden reptilian eye with vertical slit pupil
    ctx.fillStyle = isTelegraph || isStriking ? '#ffab00' : '#ffea00';
    ctx.beginPath();
    ctx.arc(3, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.ellipse(3.5, -6, 1.3, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Angry brow ridge
    ctx.strokeStyle = '#0d3b14';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.lineTo(8, -7);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  function drawCoconutObstacle(ctx, obs, centerX, y, t) {
    ctx.save();
    ctx.translate(centerX, y);

    // Falling motion blur streaks above the coconut
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 10, -18);
      ctx.lineTo(i * 10, -42 - (i === 0 ? 12 : 0));
      ctx.stroke();
    }

    // Spinning heavy spiky coconut
    const rot = (obs.rotation !== undefined ? obs.rotation : t * 9);
    ctx.rotate(rot);

    const cocoGrad = ctx.createRadialGradient(-5, -5, 3, 0, 0, 19);
    cocoGrad.addColorStop(0, '#8d6e63');
    cocoGrad.addColorStop(0.65, '#4e342e');
    cocoGrad.addColorStop(1, '#271815');

    ctx.fillStyle = cocoGrad;
    ctx.strokeStyle = '#1b0f0d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Husk spikes around perimeter
    ctx.fillStyle = '#5d4037';
    for (let s = 0; s < 8; s++) {
      const ang = (s * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang - 0.2) * 17, Math.sin(ang - 0.2) * 17);
      ctx.lineTo(Math.cos(ang) * 22, Math.sin(ang) * 22);
      ctx.lineTo(Math.cos(ang + 0.2) * 17, Math.sin(ang + 0.2) * 17);
      ctx.closePath();
      ctx.fill();
    }

    // Three dark coconut bowling-ball dimples
    ctx.fillStyle = '#1b0f0d';
    ctx.beginPath();
    ctx.arc(-5, -4, 2.6, 0, Math.PI * 2);
    ctx.arc(5, -4, 2.6, 0, Math.PI * 2);
    ctx.arc(0, 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * 4. Collectibles (`drawCollectible(ctx, item, screenY, time)`)
   * Supports: 'BANANA', 'GOLDEN_IDOL', 'SHIELD', 'CHILI'
   */
  function drawCollectible(ctx, item, screenY, time = 0) {
    if (!ctx || !item || item.collected) return;
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const type = String(item.type || 'BANANA').toUpperCase();
    const lane = item.lane !== undefined ? item.lane : 0;
    const centerX = item.x !== undefined ? item.x : getLaneX(lane);
    const baseScreenY = typeof screenY === 'number' ? screenY : (item.screenY !== undefined ? item.screenY : item.y || 0);
    if (baseScreenY < -80 || baseScreenY > CANVAS_HEIGHT + 80) return;

    const bob = Math.sin(t * 5 + (item.id || baseScreenY) * 0.1) * 4.5;
    const y = baseScreenY + bob;

    ctx.save();
    ctx.translate(centerX, y);

    if (type === 'BANANA') {
      // Soft golden glow halo
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      glow.addColorStop(0, 'rgba(255, 238, 88, 0.45)');
      glow.addColorStop(1, 'rgba(255, 238, 88, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      // Curved golden banana bunch
      ctx.rotate(-0.2 + Math.sin(t * 3) * 0.08);
      for (let b = -1; b <= 1; b++) {
        ctx.save();
        ctx.translate(b * 4, Math.abs(b) * 2);
        ctx.rotate(b * 0.18);
        ctx.fillStyle = b === 0 ? '#ffee58' : '#fdd835';
        ctx.strokeStyle = '#f57f17';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-10, -8);
        ctx.quadraticCurveTo(2, 12, 12, -4);
        ctx.quadraticCurveTo(2, 4, -10, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // Stem tip
      ctx.fillStyle = '#558b2f';
      ctx.beginPath();
      ctx.arc(-9, -8, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'GOLDEN_IDOL' || type === 'IDOL') {
      // Radiant sun-gold aura
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
      glow.addColorStop(0, 'rgba(255, 215, 0, 0.65)');
      glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();

      // Ancient Golden Monkey Idol statue
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#8d6e00';
      ctx.lineWidth = 2;
      roundRectPath(ctx, -11, -15, 22, 30, 6);
      ctx.fill();
      ctx.stroke();

      // Ruby eyes
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(-4, -5, 2.5, 0, Math.PI * 2);
      ctx.arc(4, -5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Carved grin
      ctx.strokeStyle = '#5c4500';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-6, 2, 12, 5);
    } else if (type === 'SHIELD') {
      // Emerald Vine Bubble Shield pickup
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      ctx.scale(pulse, pulse);

      const shieldGrad = ctx.createRadialGradient(-5, -5, 3, 0, 0, 18);
      shieldGrad.addColorStop(0, 'rgba(185, 246, 202, 0.9)');
      shieldGrad.addColorStop(0.6, 'rgba(0, 230, 118, 0.65)');
      shieldGrad.addColorStop(1, 'rgba(0, 150, 80, 0.9)');

      ctx.fillStyle = shieldGrad;
      ctx.strokeStyle = '#69f0ae';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Leaf emblem inside bubble
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(8, -2, 0, 8);
      ctx.quadraticCurveTo(-8, -2, 0, -8);
      ctx.fill();
    } else if (type === 'CHILI') {
      // Fiery Red-Hot Jungle Chili Pepper
      const flameGlow = ctx.createRadialGradient(0, 0, 3, 0, 0, 25);
      flameGlow.addColorStop(0, 'rgba(255, 109, 0, 0.65)');
      flameGlow.addColorStop(1, 'rgba(255, 23, 68, 0)');
      ctx.fillStyle = flameGlow;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(Math.sin(t * 8) * 0.15);
      ctx.fillStyle = '#ff1744';
      ctx.strokeStyle = '#b71c1c';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-8, -10);
      ctx.quadraticCurveTo(6, -12, 12, 10);
      ctx.quadraticCurveTo(-4, 6, -8, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Green calyx stem
      ctx.strokeStyle = '#64dd17';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -9);
      ctx.quadraticCurveTo(-10, -15, -4, -17);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 5. The Monkey Character (`drawMonkey(ctx, monkey, time)`)
   * Supports states: 'climbing', 'jumping', 'dead_spikes', 'dead_dynamite', 'dead_snake', 'dead_fall'
   */
  function drawMonkey(ctx, monkey, time = 0) {
    if (!ctx || !monkey) return;
    const t = typeof time === 'number' ? time : performance.now() * 0.001;
    const state = String(monkey.state || 'climbing').toLowerCase();

    const baseX = typeof monkey.x === 'number' ? monkey.x : getLaneX(monkey.lane || 0);
    const baseY = typeof monkey.screenY === 'number'
      ? monkey.screenY
      : (typeof monkey.y === 'number' ? monkey.y : CANVAS_HEIGHT * 0.72);

    const isJumping = Boolean(monkey.isJumping || state === 'jumping');
    const jumpProg = typeof monkey.jumpProgress === 'number' ? clamp(monkey.jumpProgress, 0, 1) : 0;
    const jumpArcY = isJumping ? -Math.sin(jumpProg * Math.PI) * 32 : 0;

    const climbPhase = typeof monkey.climbPhase === 'number' ? monkey.climbPhase : t * 10;
    const shielded = Boolean(monkey.shielded || monkey.shield);
    const chiliActive = (typeof monkey.chiliTimer === 'number' && monkey.chiliTimer > 0) || Boolean(monkey.chili);

    ctx.save();

    // Motion after-images when jumping between ladders or Chili Flame Dashing
    if (isJumping || chiliActive) {
      const trailCount = chiliActive ? 4 : 3;
      for (let i = 1; i <= trailCount; i++) {
        ctx.save();
        const trailX = isJumping
          ? baseX - (monkey.dir || (baseX > 270 ? 1 : -1)) * i * 16
          : baseX + Math.sin(t * 25 + i) * 5;
        const trailY = baseY + (chiliActive ? i * 14 : jumpArcY + i * 4);
        ctx.globalAlpha = 0.28 / i;
        ctx.fillStyle = chiliActive ? '#ff6d00' : '#ffb74d';
        ctx.beginPath();
        ctx.arc(trailX, trailY, 18 - i * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.translate(baseX, baseY + jumpArcY);

    // Chili Flame Aura behind monkey
    if (chiliActive) {
      const flameH = 42 + Math.sin(t * 35) * 8;
      const flameGrad = ctx.createRadialGradient(0, 6, 4, 0, 10, flameH);
      flameGrad.addColorStop(0, 'rgba(255, 255, 140, 0.95)');
      flameGrad.addColorStop(0.45, 'rgba(255, 109, 0, 0.8)');
      flameGrad.addColorStop(1, 'rgba(213, 0, 0, 0)');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.ellipse(0, 8, 28, flameH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Special Death Animation: 'dead_snake' (Eaten by Giant Viper!)
    if (state === 'dead_snake') {
      const deathT = typeof monkey.deathTimer === 'number' ? monkey.deathTimer : (t % 1.2);
      // First half: monkey feet kicking frantically out of jaws; Second half: floating dizzy star & headband
      const kick = Math.sin(t * 42) * 8;
      ctx.save();
      if (deathT < 0.65) {
        // Two furry legs kicking outward
        ctx.strokeStyle = '#6d4c41';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-14 - kick, 18);
        ctx.moveTo(8, 0);
        ctx.lineTo(14 + kick, 16);
        ctx.stroke();

        // Monkey paws/feet
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(-14 - kick, 19, 4.5, 0, Math.PI * 2);
        ctx.arc(14 + kick, 17, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Orbiting dizzy stars & floating red bandana above the snake
      for (let s = 0; s < 3; s++) {
        const ang = t * 6 + (s * Math.PI * 2) / 3;
        const sx = Math.cos(ang) * 22;
        const sy = -24 + Math.sin(ang) * 7;
        ctx.fillStyle = '#ffea00';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();
      return;
    }

    // Rotation for jump somersault or death tumble
    if (state === 'dead_fall' || state === 'dead_spikes' || state === 'dead_dynamite') {
      const spin = t * 9;
      ctx.rotate(Math.sin(spin) * 0.45 + (state === 'dead_fall' ? t * 6 : 0));
    } else if (isJumping) {
      const dir = monkey.dir || (baseX > 270 ? 1 : -1);
      ctx.rotate(dir * Math.sin(jumpProg * Math.PI) * 0.42);
    }

    const furMain = state === 'dead_dynamite' ? '#2b2b2b' : '#795548';
    const furDark = state === 'dead_dynamite' ? '#141414' : '#4e342e';
    const skinTone = state === 'dead_dynamite' ? '#757575' : '#ffcc80';

    // 1. Prehensile Curled Tail swaying rhythmically
    ctx.save();
    const tailSway = Math.sin(climbPhase * 0.8 + t * 4) * 10;
    ctx.strokeStyle = furDark;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.bezierCurveTo(18 + tailSway, 26, 28 + tailSway, 8, 20 + tailSway * 0.6, -2);
    ctx.arc(17 + tailSway * 0.6, -2, 4, 0, Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();

    // 2. Alternating Arms & Legs gripping the ladder rungs
    const leftSwing = Math.sin(climbPhase) * 9;
    const rightSwing = -leftSwing;
    const flail = state.startsWith('dead_') ? Math.sin(t * 38) * 12 : 0;

    ctx.strokeStyle = furMain;
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';

    // Left & Right Legs
    ctx.beginPath();
    ctx.moveTo(-7, 10);
    ctx.quadraticCurveTo(-18, 14 + leftSwing * 0.5, -14 - flail, 22 + leftSwing);
    ctx.moveTo(7, 10);
    ctx.quadraticCurveTo(18, 14 + rightSwing * 0.5, 14 + flail, 22 + rightSwing);
    ctx.stroke();

    // Left & Right Arms reaching up to rungs
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.quadraticCurveTo(-22, -10 + rightSwing * 0.5, -16 - flail, -20 + rightSwing);
    ctx.moveTo(9, -4);
    ctx.quadraticCurveTo(22, -10 + leftSwing * 0.5, 16 + flail, -20 + leftSwing);
    ctx.stroke();

    // Paws (Hands & Feet)
    ctx.fillStyle = skinTone;
    const paws = [
      [-14 - flail, 22 + leftSwing],
      [14 + flail, 22 + rightSwing],
      [-16 - flail, -20 + rightSwing],
      [16 + flail, -20 + leftSwing]
    ];
    for (let i = 0; i < paws.length; i++) {
      ctx.beginPath();
      ctx.arc(paws[i][0], paws[i][1], 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Athletic Torso & Cream Belly Patch
    ctx.fillStyle = furMain;
    ctx.strokeStyle = furDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.ellipse(0, 5, 8.5, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Head & Round Monkey Ears
    ctx.fillStyle = furMain;
    ctx.strokeStyle = furDark;
    ctx.beginPath();
    ctx.arc(-14, -14, 6, 0, Math.PI * 2);
    ctx.arc(14, -14, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.arc(-14, -14, 3.2, 0, Math.PI * 2);
    ctx.arc(14, -14, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Main Head Sphere
    ctx.fillStyle = furMain;
    ctx.beginPath();
    ctx.arc(0, -14, 13.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face Mask
    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.ellipse(0, -12, 10.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Expressive Eyes (Wide shocked eyes on dynamite/fall, dizzy X/stars on spikes, determined on climb)
    if (state === 'dead_spikes' || state === 'dead_fall') {
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2;
      const ex = [-4.5, 4.5];
      for (let i = 0; i < ex.length; i++) {
        ctx.beginPath();
        ctx.moveTo(ex[i] - 2.5, -16.5);
        ctx.lineTo(ex[i] + 2.5, -11.5);
        ctx.moveTo(ex[i] + 2.5, -16.5);
        ctx.lineTo(ex[i] - 2.5, -11.5);
        ctx.stroke();
      }
    } else if (state === 'dead_dynamite') {
      // Wide soot-covered cartoon eyes blinking in shock
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-4.5, -14, 4.2, 0, Math.PI * 2);
      ctx.arc(4.5, -14, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(-4.5, -14, 1.5, 0, Math.PI * 2);
      ctx.arc(4.5, -14, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-4.2, -14, 3.3, 0, Math.PI * 2);
      ctx.arc(4.2, -14, 3.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.arc(-4.2, -14.5, 1.9, 0, Math.PI * 2);
      ctx.arc(4.2, -14.5, 1.9, 0, Math.PI * 2);
      ctx.fill();

      // Tiny eye shine
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-3.5, -15.2, 0.8, 0, Math.PI * 2);
      ctx.arc(4.9, -15.2, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cute Nose & Smile / O-mouth
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.ellipse(0, -10.5, 2.2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (state.startsWith('dead_')) {
      ctx.arc(0, -7, 2.8, 0, Math.PI * 2);
    } else {
      ctx.arc(0, -8.5, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();

    // 5. Signature Red Bandana Headband with fluttering tails
    ctx.fillStyle = '#ff1744';
    ctx.strokeStyle = '#b71c1c';
    ctx.lineWidth = 1.2;
    roundRectPath(ctx, -13, -23, 26, 5.5, 2.5);
    ctx.fill();
    ctx.stroke();

    // Fluttering headband ribbons on the side
    const ribbonWave = Math.sin(t * 18 + climbPhase) * 5;
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(12, -21);
    ctx.quadraticCurveTo(20, -19 + ribbonWave * 0.5, 24, -13 + ribbonWave);
    ctx.moveTo(12, -19);
    ctx.quadraticCurveTo(18, -14 - ribbonWave * 0.4, 21, -8 - ribbonWave * 0.6);
    ctx.stroke();

    // 6. Emerald Vine Bubble Shield Overlay if active
    if (shielded) {
      const shieldPulse = 1 + Math.sin(t * 7) * 0.05;
      ctx.save();
      ctx.scale(shieldPulse, shieldPulse);
      ctx.strokeStyle = 'rgba(105, 240, 174, 0.88)';
      ctx.fillStyle = 'rgba(0, 230, 118, 0.16)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -2, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * 6a. Particle Renderer (`drawParticles(ctx, particles)`)
   */
  function drawParticles(ctx, particles) {
    if (!ctx || !Array.isArray(particles) || particles.length === 0) return;
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p) continue;
      const px = p.x !== undefined ? p.x : 0;
      const py = p.screenY !== undefined ? p.screenY : (p.y !== undefined ? p.y : 0);
      if (py < -50 || py > CANVAS_HEIGHT + 50) continue;

      const alpha = typeof p.alpha === 'number'
        ? clamp(p.alpha, 0, 1)
        : (typeof p.life === 'number' && typeof p.maxLife === 'number' && p.maxLife > 0
          ? clamp(p.life / p.maxLife, 0, 1)
          : 0.9);
      const size = typeof p.size === 'number' ? p.size : (typeof p.radius === 'number' ? p.radius : 4);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color || '#ffd600';
      ctx.translate(px, py);
      if (p.rotation) ctx.rotate(p.rotation);

      if (p.shape === 'rect' || p.type === 'splinter') {
        ctx.fillRect(-size, -size * 0.5, size * 2, size);
      } else if (p.shape === 'ring' || p.type === 'shockwave') {
        ctx.strokeStyle = p.color || '#ffea00';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * 6b. Floating Score & Callout Popups (`drawFloatingTexts(ctx, texts)`)
   */
  function drawFloatingTexts(ctx, texts) {
    if (!ctx || !Array.isArray(texts) || texts.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < texts.length; i++) {
      const item = texts[i];
      if (!item || !item.text) continue;
      const tx = item.x !== undefined ? item.x : CANVAS_WIDTH / 2;
      const ty = item.screenY !== undefined ? item.screenY : (item.y !== undefined ? item.y : 200);
      const alpha = typeof item.alpha === 'number'
        ? clamp(item.alpha, 0, 1)
        : (typeof item.life === 'number' && typeof item.maxLife === 'number' && item.maxLife > 0
          ? clamp(item.life / item.maxLife, 0, 1)
          : 1);
      const scale = typeof item.scale === 'number' ? item.scale : 1;
      const fontSize = item.size || 16;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);
      ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", "Inter", sans-serif`;

      // Crisp dark outline for readability over any biome
      ctx.strokeStyle = 'rgba(10, 16, 14, 0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(String(item.text), 0, 0);

      ctx.fillStyle = item.color || '#ffee58';
      ctx.fillText(String(item.text), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  const MonkeySprites = {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    LANE_CENTERS,
    LADDER_WIDTH,
    RUNG_SPACING,
    PIXELS_PER_METER,
    getLaneX,
    resolveBiomeInfo,
    drawBackground,
    drawLadders,
    drawTopWarning,
    drawObstacle,
    drawCollectible,
    drawMonkey,
    drawParticles,
    drawFloatingTexts
  };

  global.MonkeySprites = MonkeySprites;
})(typeof window !== 'undefined' ? window : globalThis);
