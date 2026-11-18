import { Difficulty, ObstacleDef, ObstacleKind, TrackData } from '../types/race';

export const TRACK_WIDTH = 760;
export const WALL_THICKNESS = 32;
export const LEFT_WALL_X = WALL_THICKNESS;
export const RIGHT_WALL_X = TRACK_WIDTH - WALL_THICKNESS;
export const INNER_TRACK_WIDTH = RIGHT_WALL_X - LEFT_WALL_X; // 696px

export const BALL_RADIUS = 15; // 30px diameter -> 20 balls fit in 1 horizontal line inside 696px
export const START_GATE_Y = 140;
export const CHECKPOINT_INTERVAL = 500;
export const MAX_VERTICAL_DROP_GAP = 190; // Strictly < 200px between barriers
export const TOTAL_LEVELS = 100;

export interface DifficultyConfig {
  trackHeight: number;
  spinnerSpeedMul: number;
  movingSpeedMul: number;
  chuteGap: number;
  funnelNeckGap: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  Easy: {
    trackHeight: 2200,
    spinnerSpeedMul: 0.85,
    movingSpeedMul: 0.85,
    chuteGap: 145,
    funnelNeckGap: 124,
  },
  Medium: {
    trackHeight: 3000,
    spinnerSpeedMul: 1.0,
    movingSpeedMul: 1.0,
    chuteGap: 134,
    funnelNeckGap: 114,
  },
  Hard: {
    trackHeight: 3800,
    spinnerSpeedMul: 1.25,
    movingSpeedMul: 1.2,
    chuteGap: 124,
    funnelNeckGap: 106,
  },
  Impossible: {
    trackHeight: 4600,
    spinnerSpeedMul: 1.55,
    movingSpeedMul: 1.45,
    chuteGap: 116,
    funnelNeckGap: 98,
  },
};

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const OBSTACLE_PALETTE: Record<ObstacleKind, string> = {
  zigzag: '#00D4FF',
  spinner: '#FFD700',
  movingPlatform: '#38BDF8',
  funnel: '#C026D3',
  bouncyPad: '#39FF14',
  gate: '#FF2E63',
  loop: '#FFD700',
  seesaw: '#EAB308',
  bumper: '#FF2E63',
};

const BIG_OBSTACLE_CYCLE: ObstacleKind[] = [
  'spinner',
  'bouncyPad',
  'seesaw',
  'bumper',
  'movingPlatform',
  'gate',
  'loop',
];

export function buildCheckpoints(startY: number, finishY: number): number[] {
  const cps: number[] = [];
  for (let y = startY + CHECKPOINT_INTERVAL; y < finishY - 40; y += CHECKPOINT_INTERVAL) {
    cps.push(Math.round(y));
  }
  if (cps.length === 0) {
    cps.push(Math.round((startY + finishY) / 2));
  }
  return cps;
}

/**
 * Creates a wall-anchored diagonal snake ramp overlapping 8px inside LEFT_WALL_X or RIGHT_WALL_X
 * so there is ZERO side gap for shortcuts, leaving a single chute on the opposite wall.
 */
export function createWallAnchoredSnakeRamp(
  id: string,
  side: 'left' | 'right',
  y: number,
  chuteGap: number,
  slopeRad = 0.26
): ObstacleDef {
  const safeChute = Math.max(BALL_RADIUS * 2 + 48, Math.min(200, chuteGap));
  const targetHorizSpan = INNER_TRACK_WIDTH - safeChute;
  const width = Math.round(targetHorizSpan / Math.cos(slopeRad)) + 10;
  const halfSpanX = (width / 2) * Math.cos(slopeRad);
  const angle = side === 'left' ? slopeRad : -slopeRad;
  const x =
    side === 'left'
      ? Math.round(LEFT_WALL_X - 8 + halfSpanX)
      : Math.round(RIGHT_WALL_X + 8 - halfSpanX);

  return {
    id,
    kind: 'zigzag',
    x,
    y: Math.round(y),
    width,
    height: 18,
    angle,
    color: OBSTACLE_PALETTE.zigzag,
    wallAnchored: side,
  };
}

/**
 * Creates a full-width V-funnel sealed flush into BOTH LEFT_WALL_X and RIGHT_WALL_X
 * so every single ball must funnel through the exact same central neck.
 */
export function createSealedFunnel(
  id: string,
  y: number,
  neckGap: number,
  locked = false
): ObstacleDef {
  const safeGap = Math.max(BALL_RADIUS * 2 + 42, neckGap);
  const centerX = TRACK_WIDTH / 2;
  const sideSpace = centerX - safeGap / 2 - LEFT_WALL_X + 16;
  const angle = 0.34;
  const armWidth = Math.round(sideSpace / Math.cos(angle));

  return {
    id,
    kind: 'funnel',
    x: centerX,
    y: Math.round(y),
    width: armWidth,
    height: 18,
    gap: safeGap,
    angle,
    color: OBSTACLE_PALETTE.funnel,
    wallAnchored: 'both',
    locked,
  };
}

export function getLevelMeta(levelNumber: number): {
  level: number;
  difficulty: Difficulty;
  trackHeight: number;
  seed: number;
  spinnerSpeedMul: number;
  movingSpeedMul: number;
  chuteGap: number;
  funnelNeckGap: number;
  title: string;
} {
  const level = Math.max(1, Math.min(TOTAL_LEVELS, Math.round(levelNumber)));
  const difficulty: Difficulty =
    level <= 20 ? 'Easy' : level <= 50 ? 'Medium' : level <= 80 ? 'Hard' : 'Impossible';
  const progress = (level - 1) / (TOTAL_LEVELS - 1);
  const trackHeight = Math.round(2150 + progress * 2650);

  return {
    level,
    difficulty,
    trackHeight,
    seed: level * 7919 + 20261117,
    spinnerSpeedMul: Number((0.8 + progress * 0.8).toFixed(2)),
    movingSpeedMul: Number((0.8 + progress * 0.7).toFixed(2)),
    chuteGap: Math.round(148 - progress * 26),
    funnelNeckGap: Math.max(102, Math.round(128 - progress * 24)),
    title: `Level ${level} · ${difficulty}`,
  };
}

/**
 * Generates a closed, fair single-path vertical SNAKE / ZIG-ZAG track:
 * - Every <= 190px has a wall-sealed barrier (zero straight vertical drop)
 * - Alternating left->right->left wall-anchored snake ramps
 * - V-Funnel into centered Big Obstacle into V-Funnel so all balls take the exact same route
 * - Final pre-finish V-Funnel bringing all balls together for a close finish
 * - Checkpoints every 500px
 */
export function generateTrack(
  difficulty: Difficulty,
  seed = Date.now(),
  levelNumber?: number
): TrackData {
  const levelCfg = levelNumber ? getLevelMeta(levelNumber) : null;
  const cfg = levelCfg ?? DIFFICULTY_CONFIGS[difficulty];
  const effectiveDiff = levelCfg ? levelCfg.difficulty : difficulty;
  const rand = mulberry32(seed);

  const startY = START_GATE_Y;
  const finishY = cfg.trackHeight - 210;
  const finalFunnelY = finishY - 170;
  const obstacles: ObstacleDef[] = [];

  let cursorY = startY + 155;
  let snakeSide: 'left' | 'right' = rand() > 0.5 ? 'left' : 'right';
  let bigIdx = levelNumber ? (levelNumber - 1) % BIG_OBSTACLE_CYCLE.length : 0;
  let stepIndex = 0;

  while (cursorY < finalFunnelY - 190) {
    // 1. First snake ramp (forces travel across entire track width into opposite wall)
    obstacles.push(
      createWallAnchoredSnakeRamp(
        `obs-${stepIndex}-snake-${snakeSide}`,
        snakeSide,
        cursorY,
        cfg.chuteGap,
        0.26
      )
    );
    snakeSide = snakeSide === 'left' ? 'right' : 'left';
    cursorY += 192;
    stepIndex++;

    if (cursorY >= finalFunnelY - 190) break;

    // 2. Second opposite snake ramp
    obstacles.push(
      createWallAnchoredSnakeRamp(
        `obs-${stepIndex}-snake-${snakeSide}`,
        snakeSide,
        cursorY,
        cfg.chuteGap,
        0.26
      )
    );
    snakeSide = snakeSide === 'left' ? 'right' : 'left';
    cursorY += 192;
    stepIndex++;

    if (cursorY >= finalFunnelY - 520) break;

    // 3. Collecting V-Funnel guides all balls directly into the center Big Obstacle chamber
    obstacles.push(createSealedFunnel(`obs-${stepIndex}-pre-funnel`, cursorY, cfg.funnelNeckGap));
    cursorY += 170;
    stepIndex++;

    // 4. Big Obstacle centered directly beneath funnel exit stream
    const kind = BIG_OBSTACLE_CYCLE[bigIdx % BIG_OBSTACLE_CYCLE.length];
    bigIdx++;
    const dir: 1 | -1 = bigIdx % 2 === 0 ? 1 : -1;
    const obsId = `obs-${stepIndex}-${kind}`;

    switch (kind) {
      case 'spinner': {
        obstacles.push({
          id: obsId,
          kind: 'spinner',
          x: TRACK_WIDTH / 2,
          y: cursorY,
          width: 240,
          height: 18,
          speed: dir * (0.034 + rand() * 0.012) * cfg.spinnerSpeedMul,
          direction: dir,
          color: OBSTACLE_PALETTE.spinner,
        });
        break;
      }
      case 'bouncyPad': {
        obstacles.push({
          id: obsId,
          kind: 'bouncyPad',
          x: TRACK_WIDTH / 2,
          y: cursorY,
          width: 260,
          height: 18,
          angle: dir * 0.16,
          color: OBSTACLE_PALETTE.bouncyPad,
        });
        break;
      }
      case 'movingPlatform': {
        obstacles.push({
          id: obsId,
          kind: 'movingPlatform',
          x: TRACK_WIDTH / 2,
          y: cursorY,
          width: 220,
          height: 20,
          range: 110,
          speed: (0.028 + rand() * 0.01) * cfg.movingSpeedMul,
          direction: dir,
          color: OBSTACLE_PALETTE.movingPlatform,
        });
        break;
      }
      case 'seesaw': {
        obstacles.push({
          id: obsId,
          kind: 'seesaw',
          x: TRACK_WIDTH / 2,
          y: cursorY,
          width: 260,
          height: 16,
          color: OBSTACLE_PALETTE.seesaw,
        });
        break;
      }
      case 'bumper': {
        obstacles.push({
          id: obsId,
          kind: 'bumper',
          x: TRACK_WIDTH / 2,
          y: cursorY,
          radius: 26,
          gap: 110,
          color: OBSTACLE_PALETTE.bumper,
        });
        break;
      }
      case 'gate': {
        obstacles.push({
          id: obsId,
          kind: 'gate',
          x: TRACK_WIDTH / 2,
          y: cursorY,
          width: 24,
          height: 44,
          gap: Math.max(118, cfg.funnelNeckGap + 14),
          color: OBSTACLE_PALETTE.gate,
        });
        break;
      }
      case 'loop': {
        obstacles.push({
          id: obsId,
          kind: 'loop',
          x: TRACK_WIDTH / 2 + dir * 20,
          y: cursorY,
          radius: 92,
          direction: dir,
          color: OBSTACLE_PALETTE.loop,
        });
        break;
      }
    }

    cursorY += 170;
    stepIndex++;

    // 5. Post-Obstacle Funnel collects all balls back to center before next snake
    obstacles.push(createSealedFunnel(`obs-${stepIndex}-post-funnel`, cursorY, cfg.funnelNeckGap));
    cursorY += 186;
    stepIndex++;
  }

  // Fill any remaining gap before finalFunnelY guaranteeing <= 200px max drop AND >= 190px ramp separation
  let prevY = obstacles.length > 0 ? obstacles[obstacles.length - 1].y : startY;
  while (finalFunnelY - prevY > 200) {
    const gap = finalFunnelY - prevY;
    if (gap < 355) {
      obstacles.push(
        createSealedFunnel(`obs-${stepIndex}-tail-funnel`, Math.round(prevY + gap / 2), cfg.funnelNeckGap)
      );
      stepIndex++;
      break;
    } else {
      const nextY = prevY + 190;
      obstacles.push(
        createWallAnchoredSnakeRamp(
          `obs-${stepIndex}-tail-snake-${snakeSide}`,
          snakeSide,
          nextY,
          cfg.chuteGap,
          0.26
        )
      );
      snakeSide = snakeSide === 'left' ? 'right' : 'left';
      prevY = nextY;
      stepIndex++;
    }
  }

  // Final Pre-Finish Funnel bringing all balls together right before Finish Line
  obstacles.push(
    createSealedFunnel('obs-final-funnel', finalFunnelY, Math.max(110, cfg.funnelNeckGap), true)
  );

  return {
    seed,
    difficulty: effectiveDiff,
    levelNumber,
    width: TRACK_WIDTH,
    height: cfg.trackHeight,
    startY,
    finishY,
    checkpoints: buildCheckpoints(startY, finishY),
    obstacles,
  };
}

export function createStarterCustomObstacles(): ObstacleDef[] {
  return [
    createWallAnchoredSnakeRamp('custom-ramp-1', 'left', 280, 140, 0.25),
    createWallAnchoredSnakeRamp('custom-ramp-2', 'right', 475, 140, 0.25),
    createSealedFunnel('custom-funnel-1', 660, 120),
    {
      id: 'custom-spinner-1',
      kind: 'spinner',
      x: TRACK_WIDTH / 2,
      y: 825,
      width: 230,
      height: 18,
      speed: 0.036,
      direction: 1,
      color: OBSTACLE_PALETTE.spinner,
    },
    createSealedFunnel('custom-funnel-2', 990, 120),
    createWallAnchoredSnakeRamp('custom-ramp-3', 'left', 1175, 140, 0.25),
    createWallAnchoredSnakeRamp('custom-ramp-4', 'right', 1370, 140, 0.25),
    {
      id: 'custom-bumper-1',
      kind: 'bumper',
      x: TRACK_WIDTH / 2,
      y: 1550,
      radius: 26,
      gap: 115,
      color: OBSTACLE_PALETTE.bumper,
    },
    createSealedFunnel('custom-funnel-3', 1715, 120),
  ];
}

export function buildCustomTrack(customObstacles: ObstacleDef[]): TrackData {
  const trackHeight = 2300;
  const startY = START_GATE_Y;
  const finishY = trackHeight - 210;
  const finalFunnelY = finishY - 170;

  const userSafeObstacles = customObstacles.filter((o) => !o.locked);
  const finalFunnel = createSealedFunnel('custom-final-funnel', finalFunnelY, 116, true);

  return {
    seed: 99999,
    difficulty: 'Medium',
    isCustom: true,
    width: TRACK_WIDTH,
    height: trackHeight,
    startY,
    finishY,
    checkpoints: buildCheckpoints(startY, finishY),
    obstacles: [...userSafeObstacles, finalFunnel],
  };
}
