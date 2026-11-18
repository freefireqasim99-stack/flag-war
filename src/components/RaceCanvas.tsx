import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import {
  CountryBall,
  GameState,
  RaceStanding,
  RecordedVideoItem,
  TrackData,
  VideoQuality,
} from '../types/race';
import {
  BALL_RADIUS,
  LEFT_WALL_X,
  RIGHT_WALL_X,
  TRACK_WIDTH,
} from '../game/levelGenerator';
import { applyGlossy3DBallOverlay, getFlagTextureCanvas } from '../game/flags';
import {
  computeBallCheckpoint,
  computeCameraTargetY,
  computeStallTimer,
  computeStandings,
  isOutOfTrackBounds,
  isValidWinner,
} from '../game/raceLogic';
import { audioEngine } from '../game/audioEngine';
import {
  buildRaceVideoFilename,
  computeExportDimensions,
  POST_WIN_PODIUM_HOLD_MS,
  RECORD_FPS,
  renderExportBroadcastFrame,
  selectBestRecorderMimeType,
} from '../game/videoRecording';

interface RaceCanvasProps {
  track: TrackData;
  balls: CountryBall[];
  gameState: GameState;
  raceRunId: number;
  speedMultiplier: 1 | 2;
  youtubeMode: boolean;
  videoQuality: VideoQuality;
  levelLabel: string;
  levelTitle: string;
  builderMode?: boolean;
  onBuilderCanvasClick?: (trackX: number, trackY: number, hitWallOrLocked: boolean) => void;
  onStandingsUpdate: (standings: RaceStanding[]) => void;
  onRaceTimeUpdate: (elapsedMs: number) => void;
  onCountdownChange: (step: number | null) => void;
  onRecordingStateChange?: (recording: boolean) => void;
  onRaceFinish: (
    finalStandings: RaceStanding[],
    recordedVideo: RecordedVideoItem | null
  ) => void;
}

interface BallSimMeta {
  country: CountryBall;
  body: Matter.Body;
  released: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  stallMs: number;
  checkpoint: number;
  lastSafeX: number;
  lastSafeY: number;
  touchedObstacleIds: Set<string>;
  trail: Array<{ x: number; y: number }>;
}

interface MovingObsMeta {
  kind: 'spinner' | 'movingPlatform';
  body: Matter.Body;
  originX: number;
  originY: number;
  speed: number;
  range: number;
  phase: number;
  width: number;
  color: string;
}

interface ImpactFlash {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
}

interface FireworkSpark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface ConfettiPiece {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vRot: number;
  color: string;
}

interface CrowdDot {
  side: 'left' | 'right';
  tier: number;
  xOffset: number;
  y: number;
  color: string;
  phase: number;
}

interface AmbientMote {
  x: number;
  yOffset: number;
  size: number;
  speed: number;
  color: string;
}

const CONFETTI_COLORS = ['#FFD700', '#00D4FF', '#FF2E63', '#22C55E', '#A855F7', '#FFFFFF'];
const FIREWORK_COLORS = ['#FFD700', '#FF2E63', '#00D4FF', '#39FF14', '#FFFFFF'];

export const RaceCanvas: React.FC<RaceCanvasProps> = ({
  track,
  balls,
  gameState,
  raceRunId,
  speedMultiplier,
  videoQuality,
  levelLabel,
  levelTitle,
  builderMode = false,
  onBuilderCanvasClick,
  onStandingsUpdate,
  onRaceTimeUpdate,
  onCountdownChange,
  onRecordingStateChange,
  onRaceFinish,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const gameStateRef = useRef<GameState>(gameState);
  const speedMulRef = useRef<1 | 2>(speedMultiplier);
  const builderModeRef = useRef<boolean>(builderMode);
  const videoMetaRef = useRef({ videoQuality, levelLabel, levelTitle });
  const callbacksRef = useRef({
    onBuilderCanvasClick,
    onStandingsUpdate,
    onRaceTimeUpdate,
    onCountdownChange,
    onRecordingStateChange,
    onRaceFinish,
  });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    speedMulRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    builderModeRef.current = builderMode;
  }, [builderMode]);

  useEffect(() => {
    videoMetaRef.current = { videoQuality, levelLabel, levelTitle };
  }, [videoQuality, levelLabel, levelTitle]);

  useEffect(() => {
    callbacksRef.current = {
      onBuilderCanvasClick,
      onStandingsUpdate,
      onRaceTimeUpdate,
      onCountdownChange,
      onRecordingStateChange,
      onRaceFinish,
    };
  }, [
    onBuilderCanvasClick,
    onStandingsUpdate,
    onRaceTimeUpdate,
    onCountdownChange,
    onRecordingStateChange,
    onRaceFinish,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.05, scale: 0.001 },
      positionIterations: 10,
      velocityIterations: 8,
    });
    const world = engine.world;

    // 1. CLOSED SIDES + TOP CEILING CAP (Thick solid Matter bodies aligned flush to LEFT_WALL_X and RIGHT_WALL_X)
    const wallCollisionThick = 160;
    const walls = [
      Matter.Bodies.rectangle(
        LEFT_WALL_X - wallCollisionThick / 2,
        track.height / 2,
        wallCollisionThick,
        track.height + 600,
        {
          isStatic: true,
          restitution: 0.8,
          friction: 0.01,
          label: 'leftWall',
        }
      ),
      Matter.Bodies.rectangle(
        RIGHT_WALL_X + wallCollisionThick / 2,
        track.height / 2,
        wallCollisionThick,
        track.height + 600,
        {
          isStatic: true,
          restitution: 0.8,
          friction: 0.01,
          label: 'rightWall',
        }
      ),
      // Top reinforced glass/spike ceiling cap so balls can never jump out the top
      Matter.Bodies.rectangle(TRACK_WIDTH / 2, 30, TRACK_WIDTH + 160, 44, {
        isStatic: true,
        restitution: 0.65,
        friction: 0.02,
        label: 'topCap',
      }),
      Matter.Bodies.rectangle(TRACK_WIDTH / 2, track.finishY + 190, TRACK_WIDTH + 160, 60, {
        isStatic: true,
        restitution: 0.35,
        friction: 0.2,
        label: 'floor',
      }),
    ];
    Matter.Composite.add(world, walls);

    const movingObs: MovingObsMeta[] = [];
    const renderableStaticBodies: Array<{ body: Matter.Body; color: string; kind: string }> = [];
    const seesawBodies: Array<{ body: Matter.Body; color: string }> = [];
    const bumperBodies: Array<{ body: Matter.Body; color: string; radius: number }> = [];
    const obsIdByBodyId = new Map<number, string>();

    const tagObstacleBody = (body: Matter.Body, obsId: string) => {
      obsIdByBodyId.set(body.id, obsId);
    };

    track.obstacles.forEach((obs) => {
      switch (obs.kind) {
        case 'zigzag': {
          const b = Matter.Bodies.rectangle(obs.x, obs.y, obs.width ?? 280, obs.height ?? 18, {
            isStatic: true,
            angle: obs.angle ?? 0.26,
            restitution: 0.72,
            friction: 0.003,
            chamfer: { radius: 8 },
            label: 'wall',
          });
          Matter.Composite.add(world, b);
          tagObstacleBody(b, obs.id);
          renderableStaticBodies.push({ body: b, color: '#00D4FF', kind: 'zigzag' });
          break;
        }
        case 'spinner': {
          const w = obs.width ?? 230;
          const h = obs.height ?? 18;
          const barA = Matter.Bodies.rectangle(obs.x, obs.y, w, h, { chamfer: { radius: 6 } });
          const barB = Matter.Bodies.rectangle(obs.x, obs.y, h, w, { chamfer: { radius: 6 } });
          const spinner = Matter.Body.create({
            parts: [barA, barB],
            isStatic: true,
            restitution: 0.85,
            friction: 0.015,
            label: 'spinner',
          });
          Matter.Composite.add(world, spinner);
          tagObstacleBody(spinner, obs.id);
          tagObstacleBody(barA, obs.id);
          tagObstacleBody(barB, obs.id);
          movingObs.push({
            kind: 'spinner',
            body: spinner,
            originX: obs.x,
            originY: obs.y,
            speed: (obs.speed ?? 0.034) * 0.5,
            range: 0,
            phase: 0,
            width: w,
            color: '#FFD700',
          });
          break;
        }
        case 'movingPlatform': {
          const w = obs.width ?? 210;
          const plat = Matter.Bodies.rectangle(obs.x, obs.y, w, obs.height ?? 20, {
            isStatic: true,
            restitution: 0.85,
            friction: 0.015,
            chamfer: { radius: 8 },
            label: 'movingPlatform',
          });
          Matter.Composite.add(world, plat);
          tagObstacleBody(plat, obs.id);
          movingObs.push({
            kind: 'movingPlatform',
            body: plat,
            originX: obs.x,
            originY: obs.y,
            speed: (obs.speed ?? 0.026) * 0.5,
            range: obs.range ?? 110,
            phase: (obs.direction ?? 1) > 0 ? 0 : Math.PI,
            width: w,
            color: '#00D4FF',
          });
          break;
        }
        case 'funnel': {
          const gap = obs.gap ?? 114;
          const armW = obs.width ?? 260;
          const angle = obs.angle ?? 0.34;
          const offset = gap / 2 + (Math.cos(angle) * armW) / 2;
          const leftArm = Matter.Bodies.rectangle(obs.x - offset, obs.y, armW, 18, {
            isStatic: true,
            angle: angle,
            restitution: 0.68,
            friction: 0.008,
            chamfer: { radius: 8 },
            label: 'wall',
          });
          const rightArm = Matter.Bodies.rectangle(obs.x + offset, obs.y, armW, 18, {
            isStatic: true,
            angle: -angle,
            restitution: 0.68,
            friction: 0.008,
            chamfer: { radius: 8 },
            label: 'wall',
          });
          Matter.Composite.add(world, [leftArm, rightArm]);
          tagObstacleBody(leftArm, obs.id);
          tagObstacleBody(rightArm, obs.id);
          renderableStaticBodies.push(
            { body: leftArm, color: '#C026D3', kind: 'funnel' },
            { body: rightArm, color: '#C026D3', kind: 'funnel' }
          );
          break;
        }
        case 'bouncyPad': {
          const pad = Matter.Bodies.rectangle(obs.x, obs.y, obs.width ?? 250, obs.height ?? 18, {
            isStatic: true,
            angle: obs.angle ?? 0.14,
            restitution: 1.35,
            friction: 0.01,
            chamfer: { radius: 8 },
            label: 'bouncyPad',
          });
          Matter.Composite.add(world, pad);
          tagObstacleBody(pad, obs.id);
          renderableStaticBodies.push({ body: pad, color: '#39FF14', kind: 'bouncyPad' });
          break;
        }
        case 'gate': {
          const gap = obs.gap ?? 120;
          const pillarH = obs.height ?? 44;
          const leftPillar = Matter.Bodies.rectangle(obs.x - gap / 2 - 20, obs.y, 40, pillarH, {
            isStatic: true,
            restitution: 0.7,
            chamfer: { radius: 8 },
            label: 'wall',
          });
          const rightPillar = Matter.Bodies.rectangle(obs.x + gap / 2 + 20, obs.y, 40, pillarH, {
            isStatic: true,
            restitution: 0.7,
            chamfer: { radius: 8 },
            label: 'wall',
          });
          const leftCapW = Math.max(40, obs.x - gap / 2 - LEFT_WALL_X + 12);
          const rightCapW = Math.max(40, RIGHT_WALL_X - (obs.x + gap / 2) + 12);
          const leftCap = Matter.Bodies.rectangle(
            LEFT_WALL_X - 6 + leftCapW / 2,
            obs.y - pillarH / 2 - 12,
            leftCapW,
            16,
            {
              isStatic: true,
              angle: 0.24,
              restitution: 0.7,
              chamfer: { radius: 7 },
              label: 'wall',
            }
          );
          const rightCap = Matter.Bodies.rectangle(
            RIGHT_WALL_X + 6 - rightCapW / 2,
            obs.y - pillarH / 2 - 12,
            rightCapW,
            16,
            {
              isStatic: true,
              angle: -0.24,
              restitution: 0.7,
              chamfer: { radius: 7 },
              label: 'wall',
            }
          );
          Matter.Composite.add(world, [leftPillar, rightPillar, leftCap, rightCap]);
          tagObstacleBody(leftPillar, obs.id);
          tagObstacleBody(rightPillar, obs.id);
          tagObstacleBody(leftCap, obs.id);
          tagObstacleBody(rightCap, obs.id);
          renderableStaticBodies.push(
            { body: leftPillar, color: '#FF2E63', kind: 'gate' },
            { body: rightPillar, color: '#FF2E63', kind: 'gate' },
            { body: leftCap, color: '#FF2E63', kind: 'gate' },
            { body: rightCap, color: '#FF2E63', kind: 'gate' }
          );
          break;
        }
        case 'loop': {
          const r = obs.radius ?? 92;
          const dir = obs.direction ?? 1;
          const segs = 8;
          const startAng = dir === 1 ? -Math.PI * 0.38 : Math.PI * 0.62;
          const endAng = dir === 1 ? Math.PI * 0.38 : Math.PI * 1.38;
          for (let i = 0; i < segs; i++) {
            const t = (i + 0.5) / segs;
            const ang = startAng + (endAng - startAng) * t;
            const sx = obs.x + Math.cos(ang) * r;
            const sy = obs.y + Math.sin(ang) * r;
            const seg = Matter.Bodies.rectangle(sx, sy, 46, 14, {
              isStatic: true,
              angle: ang + Math.PI / 2,
              restitution: 0.85,
              friction: 0.008,
              chamfer: { radius: 6 },
              label: 'wall',
            });
            Matter.Composite.add(world, seg);
            tagObstacleBody(seg, obs.id);
            renderableStaticBodies.push({ body: seg, color: '#FFD700', kind: 'loop' });
          }
          break;
        }
        case 'seesaw': {
          const plank = Matter.Bodies.rectangle(obs.x, obs.y, obs.width ?? 260, obs.height ?? 16, {
            density: 0.004,
            restitution: 0.65,
            friction: 0.02,
            frictionAir: 0.02,
            chamfer: { radius: 7 },
            label: 'wall',
          });
          const pivot = Matter.Constraint.create({
            pointA: { x: obs.x, y: obs.y },
            bodyB: plank,
            stiffness: 1,
            length: 0,
          });
          Matter.Composite.add(world, [plank, pivot]);
          tagObstacleBody(plank, obs.id);
          seesawBodies.push({ body: plank, color: '#FFD700' });
          break;
        }
        case 'bumper': {
          const rad = obs.radius ?? 26;
          const g = obs.gap ?? 110;
          const xs = g > 0 ? [obs.x - g, obs.x, obs.x + g] : [obs.x];
          xs.forEach((bx) => {
            if (bx < LEFT_WALL_X + rad + 6 || bx > RIGHT_WALL_X - rad - 6) return;
            const bmp = Matter.Bodies.circle(bx, obs.y, rad, {
              isStatic: true,
              restitution: 1.25,
              friction: 0.005,
              label: 'bumper',
            });
            Matter.Composite.add(world, bmp);
            tagObstacleBody(bmp, obs.id);
            bumperBodies.push({ body: bmp, color: '#FF2E63', radius: rad });
          });
          break;
        }
      }
    });

    // 2. SINGLE HORIZONTAL STARTING LINE + EQUAL SPACING BEHIND SIMULTANEOUS START GATE
    const ballMetas: BallSimMeta[] = [];
    const usableStartLeft = LEFT_WALL_X + 26;
    const usableStartRight = RIGHT_WALL_X - 26;
    const usableStartSpan = usableStartRight - usableStartLeft;
    const startYPos = track.startY - 26;

    balls.forEach((country, idx) => {
      const startX =
        balls.length <= 1
          ? TRACK_WIDTH / 2
          : usableStartLeft + (idx / (balls.length - 1)) * usableStartSpan;

      const body = Matter.Bodies.circle(startX, startYPos, BALL_RADIUS, {
        restitution: 0.72,
        friction: 0.012,
        frictionAir: 0.002,
        density: 0.003,
        label: 'ball',
      });
      Matter.Body.setStatic(body, true);
      Matter.Composite.add(world, body);

      ballMetas.push({
        country,
        body,
        released: false,
        finished: false,
        finishTimeMs: null,
        stallMs: 0,
        checkpoint: 0,
        lastSafeX: TRACK_WIDTH / 2,
        lastSafeY: startYPos,
        touchedObstacleIds: new Set<string>(),
        trail: [],
      });
    });

    const ballMetaByBodyId = new Map<number, BallSimMeta>(
      ballMetas.map((m) => [m.body.id, m])
    );

    // Pooled Impact Flashes
    const flashes: ImpactFlash[] = Array.from({ length: 32 }, () => ({
      x: 0,
      y: 0,
      radius: 12,
      color: '#FFD700',
      alpha: 0,
    }));
    let flashCursor = 0;

    const pushFlash = (x: number, y: number, color: string, radius = 26) => {
      const f = flashes[flashCursor];
      f.x = x;
      f.y = y;
      f.color = color;
      f.radius = radius;
      f.alpha = 1;
      flashCursor = (flashCursor + 1) % flashes.length;
    };

    // Pooled Fireworks Sparks & Confetti
    const fireworkSparks: FireworkSpark[] = Array.from({ length: 120 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      color: '#FFD700',
    }));
    let fwCursor = 0;

    const triggerFirework = (cx: number, cy: number) => {
      const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
      for (let i = 0; i < 24; i++) {
        const sp = fireworkSparks[fwCursor];
        fwCursor = (fwCursor + 1) % fireworkSparks.length;
        const ang = (i / 24) * Math.PI * 2 + Math.random() * 0.2;
        const spd = 2.5 + Math.random() * 5.5;
        sp.active = true;
        sp.x = cx;
        sp.y = cy;
        sp.vx = Math.cos(ang) * spd;
        sp.vy = Math.sin(ang) * spd - 1.5;
        sp.life = 0;
        sp.maxLife = 0.75 + Math.random() * 0.5;
        sp.color = i % 3 === 0 ? '#FFFFFF' : color;
      }
    };

    const confetti: ConfettiPiece[] = Array.from({ length: 160 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 6,
      rot: 0,
      vRot: 0,
      color: '#FFD700',
    }));
    let confettiActive = false;

    const triggerConfetti = (originY: number) => {
      confettiActive = true;
      confetti.forEach((p, idx) => {
        p.active = true;
        p.x = LEFT_WALL_X + 60 + Math.random() * (RIGHT_WALL_X - LEFT_WALL_X - 120);
        p.y = originY - 50 + (Math.random() - 0.5) * 70;
        p.vx = (Math.random() - 0.5) * 12;
        p.vy = -5 - Math.random() * 11;
        p.size = 5 + Math.random() * 6;
        p.rot = Math.random() * Math.PI * 2;
        p.vRot = (Math.random() - 0.5) * 0.25;
        p.color = CONFETTI_COLORS[idx % CONFETTI_COLORS.length];
      });
    };

    // Pre-rendered 3D glossy marble dome overlay
    const domePad = 4;
    const domeSize = (BALL_RADIUS + domePad) * 2;
    const glossyDomeCanvas = document.createElement('canvas');
    glossyDomeCanvas.width = domeSize;
    glossyDomeCanvas.height = domeSize;
    const domeCtx = glossyDomeCanvas.getContext('2d');
    if (domeCtx) {
      applyGlossy3DBallOverlay(domeCtx, BALL_RADIUS + domePad, BALL_RADIUS + domePad, BALL_RADIUS);
    }

    const skyCacheCanvas = document.createElement('canvas');
    const rebuildSkyCache = (w: number, h: number) => {
      skyCacheCanvas.width = Math.max(1, Math.floor(w));
      skyCacheCanvas.height = Math.max(1, Math.floor(h));
      const sctx = skyCacheCanvas.getContext('2d');
      if (!sctx) return;
      const skyGrad = sctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#050819');
      skyGrad.addColorStop(0.5, '#0A0F2B');
      skyGrad.addColorStop(1, '#070B22');
      sctx.fillStyle = skyGrad;
      sctx.fillRect(0, 0, w, h);

      for (let c = 0; c < 4; c++) {
        const cloudX = (c * 290 + 110) % Math.max(200, w);
        const cloudY = 60 + c * 52;
        const cloudGrad = sctx.createRadialGradient(cloudX, cloudY, 10, cloudX, cloudY, 130);
        cloudGrad.addColorStop(0, 'rgba(0, 212, 255, 0.08)');
        cloudGrad.addColorStop(1, 'rgba(10, 15, 43, 0)');
        sctx.fillStyle = cloudGrad;
        sctx.fillRect(cloudX - 130, cloudY - 70, 260, 140);
      }
    };

    const CROWD_ROW_STEP = 32;
    const crowdRows: Array<{ y: number; dots: CrowdDot[] }> = [];
    const crowdColors = ['#FFD700', '#00D4FF', '#FF2E63', '#22C55E', '#FFFFFF', '#A855F7'];
    for (let y = 90; y < track.height; y += CROWD_ROW_STEP) {
      const rowDots: CrowdDot[] = [];
      for (let tier = 0; tier < 4; tier++) {
        rowDots.push({
          side: 'left',
          tier,
          xOffset: 20 + tier * 24,
          y: y + (tier % 2) * 12,
          color: crowdColors[(Math.floor(y / CROWD_ROW_STEP) + tier) % crowdColors.length],
          phase: Math.random() * Math.PI * 2,
        });
        rowDots.push({
          side: 'right',
          tier,
          xOffset: 20 + tier * 24,
          y: y + ((tier + 1) % 2) * 12,
          color: crowdColors[(Math.floor(y / CROWD_ROW_STEP) + tier + 3) % crowdColors.length],
          phase: Math.random() * Math.PI * 2,
        });
      }
      crowdRows.push({ y, dots: rowDots });
    }

    const motes: AmbientMote[] = Array.from({ length: 34 }, (_, i) => ({
      x: LEFT_WALL_X + 20 + ((i * 89) % (RIGHT_WALL_X - LEFT_WALL_X - 40)),
      yOffset: (i * 173) % 900,
      size: 1.5 + (i % 3),
      speed: 14 + (i % 5) * 6,
      color: i % 2 === 0 ? '#00D4FF' : '#FFD700',
    }));

    let shakeTrauma = 0;
    const addTrauma = (amount: number) => {
      shakeTrauma = Math.min(1, shakeTrauma + amount);
    };

    // Collision tracking: obstacle touch counting, side wall THUD + flash, bumper glow
    Matter.Events.on(engine, 'collisionStart', (event) => {
      if (gameStateRef.current !== 'playing') return;
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const speedA = Math.hypot(bodyA.velocity.x, bodyA.velocity.y);
        const speedB = Math.hypot(bodyB.velocity.x, bodyB.velocity.y);
        const impact = Math.min(1, (speedA + speedB) / 14);

        // Track touched obstacles per ball for >=80% valid winner verification
        const metaA = ballMetaByBodyId.get(bodyA.id);
        const metaB = ballMetaByBodyId.get(bodyB.id);
        const obsA = obsIdByBodyId.get(bodyA.id);
        const obsB = obsIdByBodyId.get(bodyB.id);
        if (metaA && obsB) metaA.touchedObstacleIds.add(obsB);
        if (metaB && obsA) metaB.touchedObstacleIds.add(obsA);

        const isLeftWall = bodyA.label === 'leftWall' || bodyB.label === 'leftWall';
        const isRightWall = bodyA.label === 'rightWall' || bodyB.label === 'rightWall';

        if (isLeftWall || isRightWall) {
          const bMeta = metaA ?? metaB;
          if (bMeta && impact > 0.14) {
            audioEngine.playWallThud(impact);
            pushFlash(
              isLeftWall ? LEFT_WALL_X + 4 : RIGHT_WALL_X - 4,
              bMeta.body.position.y,
              isLeftWall ? '#00D4FF' : '#FF2E63',
              26
            );
            if (impact > 0.65) addTrauma(0.12);
          }
        } else if (bodyA.label === 'ball' && bodyB.label === 'ball') {
          if (impact > 0.14) audioEngine.playBallCollision(impact);
          if (impact > 0.65) addTrauma(0.16);
        } else if (
          bodyA.label === 'bumper' ||
          bodyB.label === 'bumper' ||
          bodyA.label === 'bouncyPad' ||
          bodyB.label === 'bouncyPad'
        ) {
          const isPad = bodyA.label === 'bouncyPad' || bodyB.label === 'bouncyPad';
          const target = bodyA.label === 'bumper' || bodyA.label === 'bouncyPad' ? bodyA : bodyB;
          const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
          if (ballBody.label === 'ball') {
            const dx = ballBody.position.x - target.position.x;
            const dy = ballBody.position.y - target.position.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            Matter.Body.setVelocity(ballBody, {
              x: ballBody.velocity.x + (dx / len) * (isPad ? 1.6 : 2.5),
              y: ballBody.velocity.y + (dy / len) * (isPad ? 2.2 : 2.5),
            });
          }
          pushFlash(
            target.position.x,
            target.position.y,
            isPad ? '#39FF14' : '#FF2E63',
            isPad ? 34 : 38
          );
          addTrauma(0.2);
          audioEngine.playBumperHit();
        } else if ((bodyA.label === 'ball' || bodyB.label === 'ball') && impact > 0.22) {
          audioEngine.playWallBounce(impact);
        }
      }
    });

    // Race lifecycle & timing state
    let rafId = 0;
    let lastTime = performance.now();
    let simAccumulatorMs = 0;
    let cameraY = 0;
    let cameraZoom = 1;
    let manualScrollY = 0;
    let countdownStarted = false;
    let countdownMsLeft = 0;
    let lastBeepStep: number | null = null;
    let activeCountdownOverlay: number | null = null;
    let raceActiveStarted = false;
    let gateOpenProgress = 0; // 0 = closed, 1 = fully opened sideways
    let raceElapsedMs = 0;
    let finishedCount = 0;
    let photoFinishActive = false;
    let firstWinnerName: string | null = null;
    let firstFinishElapsedMs: number | null = null;
    let drumRollPlayed = false;
    let raceCompleted = false;
    let postWinTimerStarted = false;
    let postWinElapsedMs = 0;
    let finishReported = false;
    let finalStandingsSnapshot: RaceStanding[] = [];
    let lastHudEmitAt = 0;
    let crowdExcitement = 0;
    let previousRankMap: Record<string, number> = {};
    let announcedLeaderId: string | null = null;
    let currentScale = 1;
    let currentOffsetX = 0;

    // 16:9 Broadcast Recording State (Auto-start on START, auto-stop 3s after Winner Announcement)
    let exportCanvas: HTMLCanvasElement | null = null;
    let exportCtx: CanvasRenderingContext2D | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let recordedChunks: Blob[] = [];
    let recorderStartedAt = 0;
    let recordedMimeType = 'video/webm';
    let lastExportFrameAt = 0;
    let capturedThumbnailUrl = '';
    let isDisposed = false;

    const startBroadcastRecording = () => {
      try {
        const dims = computeExportDimensions(videoMetaRef.current.videoQuality);
        exportCanvas = document.createElement('canvas');
        exportCanvas.width = dims.width;
        exportCanvas.height = dims.height;
        exportCtx = exportCanvas.getContext('2d');

        if (!exportCanvas || typeof exportCanvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
          return;
        }

        const videoStream = exportCanvas.captureStream(RECORD_FPS);
        const audioStream = audioEngine.getRecordingAudioStream();
        const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
        if (audioStream) {
          audioStream.getAudioTracks().forEach((t) => combinedTracks.push(t));
        }
        const combinedStream = new MediaStream(combinedTracks);

        recordedMimeType = selectBestRecorderMimeType();
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType: recordedMimeType,
          videoBitsPerSecond: videoMetaRef.current.videoQuality === '1080p' ? 5_000_000 : 2_800_000,
        });
        mediaRecorder.ondataavailable = (evt) => {
          if (evt.data && evt.data.size > 0) {
            recordedChunks.push(evt.data);
          }
        };
        mediaRecorder.start(250);
        recorderStartedAt = performance.now();
        callbacksRef.current.onRecordingStateChange?.(true);
      } catch {
        mediaRecorder = null;
        callbacksRef.current.onRecordingStateChange?.(false);
      }
    };

    const finalizeRecordingAndFinish = (standingsToSend: RaceStanding[]) => {
      if (finishReported || isDisposed) return;
      finishReported = true;
      callbacksRef.current.onRecordingStateChange?.(false);

      const topWinner = standingsToSend[0];
      const winnerName = topWinner?.name ?? 'Champion';
      const winnerCode = topWinner?.code ?? 'WIN';
      const meta = videoMetaRef.current;

      const finishWithBlob = (webmBlob: Blob | null) => {
        if (isDisposed) return;
        if (!webmBlob || webmBlob.size === 0) {
          callbacksRef.current.onRaceFinish(standingsToSend, null);
          return;
        }
        const durationSec = Math.max(
          1,
          Number(((performance.now() - recorderStartedAt) / 1000).toFixed(1))
        );
        const videoItem: RecordedVideoItem = {
          id: `race-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: buildRaceVideoFilename(meta.levelLabel, winnerName, false, 'mp4'),
          shortFilename: buildRaceVideoFilename(meta.levelLabel, winnerName, true, 'mp4'),
          winnerName,
          winnerCode,
          levelLabel: meta.levelLabel,
          difficulty: track.difficulty,
          createdAt: Date.now(),
          durationSec,
          quality: meta.videoQuality,
          thumbnailDataUrl: capturedThumbnailUrl,
          mimeType: recordedMimeType,
          webmBlob,
          mp4Blob: null,
        };
        callbacksRef.current.onRaceFinish(standingsToSend, videoItem);
      };

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          const blob =
            recordedChunks.length > 0
              ? new Blob(recordedChunks, { type: recordedMimeType })
              : null;
          finishWithBlob(blob);
        };
        mediaRecorder.onstop = done;
        setTimeout(done, 1500);
        try {
          mediaRecorder.stop();
        } catch {
          done();
        }
      } else {
        finishWithBlob(
          recordedChunks.length > 0
            ? new Blob(recordedChunks, { type: recordedMimeType })
            : null
        );
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (gameStateRef.current === 'title') {
        const viewH = container.clientHeight || 720;
        const maxCam = Math.max(0, track.height - viewH);
        manualScrollY = Math.max(0, Math.min(maxCam, manualScrollY + e.deltaY * 0.75));
      }
    };
    canvas.addEventListener('wheel', handleWheel, { passive: true });

    const handleCanvasClick = (e: MouseEvent) => {
      if (!builderModeRef.current || gameStateRef.current !== 'title') return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const trackX = (clickX - currentOffsetX) / Math.max(0.1, currentScale);
      const trackY = clickY / Math.max(0.1, currentScale) + cameraY;

      const hitSideWall =
        trackX <= LEFT_WALL_X + 8 ||
        trackX >= RIGHT_WALL_X - 8 ||
        trackY <= track.startY + 25 ||
        trackY >= track.finishY - 210;
      callbacksRef.current.onBuilderCanvasClick?.(trackX, trackY, hitSideWall);
    };
    canvas.addEventListener('click', handleCanvasClick);

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(360, Math.floor(rect.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        rebuildSkyCache(w, h);
      }
    };

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);
    resizeCanvas();

    const totalCheckpoints = track.checkpoints.length;
    const totalObstacles = track.obstacles.length;

    const initialStandings = computeStandings(
      ballMetas.map((m) => ({
        id: m.country.id,
        name: m.country.name,
        code: m.country.code,
        y: m.body.position.y,
        vx: m.body.velocity.x,
        vy: m.body.velocity.y,
        checkpoint: m.checkpoint,
        touchedObstacles: 0,
        finished: false,
        finishTimeMs: null,
      })),
      track.startY,
      track.finishY,
      totalCheckpoints,
      totalObstacles
    );
    initialStandings.forEach((s) => {
      previousRankMap[s.id] = s.rank;
    });
    callbacksRef.current.onStandingsUpdate(initialStandings);
    callbacksRef.current.onRaceTimeUpdate(0);

    const stepSimulation = (now: number) => {
      rafId = requestAnimationFrame(stepSimulation);
      const rawDtMs = Math.min(140, Math.max(1, now - lastTime));
      lastTime = now;
      const dtSec = rawDtMs / 1000;
      const state = gameStateRef.current;

      if (state === 'playing' && !countdownStarted && !raceActiveStarted) {
        countdownStarted = true;
        countdownMsLeft = 2400;
        lastBeepStep = 4;
        cameraY = 0;
        simAccumulatorMs = 0;
        audioEngine.unlock();
        audioEngine.restoreMusicLevel();
        audioEngine.startMusic();
        startBroadcastRecording();
      }

      if (state === 'playing') {
        const FIXED_STEP_MS = 8.3; // 120Hz physics substeps prevent wall tunneling
        simAccumulatorMs += rawDtMs * speedMulRef.current;
        let subSteps = 0;
        const MAX_SUBSTEPS = 48;

        while (simAccumulatorMs >= FIXED_STEP_MS && subSteps < MAX_SUBSTEPS) {
          simAccumulatorMs -= FIXED_STEP_MS;
          subSteps++;
          const stepMs = FIXED_STEP_MS;

          if (countdownStarted && !raceActiveStarted) {
            countdownMsLeft -= stepMs;
            const currentStep =
              countdownMsLeft > 1600 ? 3 : countdownMsLeft > 800 ? 2 : countdownMsLeft > 0 ? 1 : 0;
            if (currentStep !== lastBeepStep) {
              lastBeepStep = currentStep;
              if (currentStep > 0) {
                activeCountdownOverlay = currentStep;
                callbacksRef.current.onCountdownChange(currentStep);
                audioEngine.playCountdownBeep(currentStep as 3 | 2 | 1);
                audioEngine.announceCommentary(String(currentStep), 'countdown');
              } else {
                activeCountdownOverlay = 0;
                callbacksRef.current.onCountdownChange(0);
                audioEngine.playCountdownBeep(0);
                audioEngine.announceCommentary('Go!', 'countdown');
                raceActiveStarted = true;
                // Open Start Gate & release ALL balls simultaneously (zero staggered delay)
                ballMetas.forEach((meta) => {
                  meta.released = true;
                  Matter.Body.setStatic(meta.body, false);
                  Matter.Body.setVelocity(meta.body, {
                    x: (Math.random() - 0.5) * 0.6,
                    y: 1.8,
                  });
                });
                setTimeout(() => {
                  activeCountdownOverlay = null;
                  callbacksRef.current.onCountdownChange(null);
                }, 500);
              }
            }
          }

          if (raceActiveStarted && gateOpenProgress < 1) {
            gateOpenProgress = Math.min(1, gateOpenProgress + stepMs / 240);
          }

          movingObs.forEach((m) => {
            if (m.kind === 'spinner') {
              Matter.Body.rotate(m.body, m.speed);
            } else if (m.kind === 'movingPlatform') {
              m.phase += m.speed;
              const nextX = m.originX + Math.sin(m.phase) * m.range;
              const prevX = m.body.position.x;
              Matter.Body.setPosition(m.body, { x: nextX, y: m.originY });
              Matter.Body.setVelocity(m.body, { x: nextX - prevX, y: 0 });
            }
          });

          if (raceActiveStarted && !raceCompleted) {
            raceElapsedMs += stepMs;
            Matter.Engine.update(engine, stepMs);

            ballMetas.forEach((meta) => {
              if (!meta.released) return;

              // Clamp max speed so balls never tunnel past side walls or barriers
              const speed = Math.hypot(meta.body.velocity.x, meta.body.velocity.y);
              if (speed > 12) {
                const s = 12 / speed;
                Matter.Body.setVelocity(meta.body, {
                  x: meta.body.velocity.x * s,
                  y: meta.body.velocity.y * s,
                });
              }

              // Safety net: if somehow outside track bounds, teleport instantly back to last checkpoint inside tunnel
              if (isOutOfTrackBounds(meta.body.position.x, meta.body.position.y, track.height)) {
                Matter.Body.setPosition(meta.body, {
                  x: meta.lastSafeX,
                  y: meta.lastSafeY,
                });
                Matter.Body.setVelocity(meta.body, { x: 0, y: 2.0 });
                pushFlash(meta.lastSafeX, meta.lastSafeY, '#00D4FF', 34);
              } else {
                // Hard wall inner clamp so balls always bounce inside tunnel walls
                if (meta.body.position.x < LEFT_WALL_X + BALL_RADIUS) {
                  Matter.Body.setPosition(meta.body, {
                    x: LEFT_WALL_X + BALL_RADIUS,
                    y: meta.body.position.y,
                  });
                  if (meta.body.velocity.x < 0) {
                    Matter.Body.setVelocity(meta.body, {
                      x: Math.abs(meta.body.velocity.x) * 0.78,
                      y: meta.body.velocity.y,
                    });
                  }
                } else if (meta.body.position.x > RIGHT_WALL_X - BALL_RADIUS) {
                  Matter.Body.setPosition(meta.body, {
                    x: RIGHT_WALL_X - BALL_RADIUS,
                    y: meta.body.position.y,
                  });
                  if (meta.body.velocity.x > 0) {
                    Matter.Body.setVelocity(meta.body, {
                      x: -Math.abs(meta.body.velocity.x) * 0.78,
                      y: meta.body.velocity.y,
                    });
                  }
                }
              }

              // Update invisible 500px checkpoint progress
              const reachedCp = computeBallCheckpoint(meta.body.position.y, track.checkpoints);
              if (reachedCp > meta.checkpoint) {
                meta.checkpoint = reachedCp;
                meta.lastSafeX = TRACK_WIDTH / 2;
                meta.lastSafeY = track.checkpoints[reachedCp - 1] ?? meta.lastSafeY;
              }

              if (Math.random() < 0.35) {
                meta.trail.push({ x: meta.body.position.x, y: meta.body.position.y });
                if (meta.trail.length > 7) meta.trail.shift();
              }

              // Finish check + >= 80% obstacle touch validation
              if (!meta.finished && meta.body.position.y >= track.finishY) {
                const valid = isValidWinner(meta.touchedObstacleIds.size, totalObstacles);
                if (!valid && totalObstacles > 0 && meta.checkpoint < totalCheckpoints) {
                  // Teleport back to last checkpoint if somehow skipped obstacles
                  Matter.Body.setPosition(meta.body, {
                    x: meta.lastSafeX,
                    y: meta.lastSafeY,
                  });
                  Matter.Body.setVelocity(meta.body, { x: 0, y: 1.5 });
                  pushFlash(meta.lastSafeX, meta.lastSafeY, '#FF2E63', 38);
                } else {
                  meta.finished = true;
                  meta.checkpoint = totalCheckpoints;
                  meta.finishTimeMs = Math.round(raceElapsedMs);
                  finishedCount++;
                  crowdExcitement = 1;
                  addTrauma(0.28);
                  audioEngine.playFinishCheer();
                  pushFlash(meta.body.position.x, track.finishY, '#FFD700', 52);
                  triggerFirework(meta.body.position.x, track.finishY - 90);

                  if (finishedCount === 1) {
                    photoFinishActive = true;
                    firstWinnerName = meta.country.name;
                    firstFinishElapsedMs = raceElapsedMs;
                    audioEngine.triggerFinishDrop();
                    audioEngine.playWinnerFanfare();
                    audioEngine.announceCommentary(
                      `Photo finish! ${meta.country.name} crosses first!`,
                      'photofinish'
                    );
                    triggerConfetti(track.finishY);
                    triggerFirework(TRACK_WIDTH * 0.25, track.finishY - 120);
                    triggerFirework(TRACK_WIDTH * 0.75, track.finishY - 120);
                  }
                  if (finishedCount === 2 && balls.length >= 3 && !drumRollPlayed) {
                    drumRollPlayed = true;
                    audioEngine.playDrumRoll();
                  }
                }
              }

              // 3-second stall auto-nudge towards next checkpoint
              const stall = computeStallTimer(meta.stallMs, speed, stepMs, meta.finished, meta.released);
              meta.stallMs = stall.nextStallMs;
              if (stall.shouldNudge) {
                const dir = meta.body.position.x < TRACK_WIDTH / 2 ? 1 : -1;
                Matter.Body.setVelocity(meta.body, {
                  x: dir * (5.2 + Math.random() * 2.0),
                  y: -4.2,
                });
                pushFlash(meta.body.position.x, meta.body.position.y, '#00D4FF', 34);
              }
            });

            const readyForPodium =
              finishedCount === ballMetas.length ||
              (firstFinishElapsedMs !== null &&
                (finishedCount >= Math.min(3, ballMetas.length) ||
                  raceElapsedMs - firstFinishElapsedMs >= 2000));

            if (readyForPodium && !raceCompleted) {
              raceCompleted = true;
              postWinTimerStarted = true;
              postWinElapsedMs = 0;
              finalStandingsSnapshot = computeStandings(
                ballMetas.map((m) => ({
                  id: m.country.id,
                  name: m.country.name,
                  code: m.country.code,
                  y: m.body.position.y,
                  vx: m.body.velocity.x,
                  vy: m.body.velocity.y,
                  checkpoint: m.checkpoint,
                  touchedObstacles: m.touchedObstacleIds.size,
                  finished: m.finished,
                  finishTimeMs: m.finishTimeMs,
                })),
                track.startY,
                track.finishY,
                totalCheckpoints,
                totalObstacles,
                previousRankMap
              );
              callbacksRef.current.onStandingsUpdate(finalStandingsSnapshot);
              callbacksRef.current.onRaceTimeUpdate(raceElapsedMs);
              const winName = finalStandingsSnapshot[0]?.name ?? firstWinnerName ?? 'Champion';
              audioEngine.announceCommentary(`${winName} is the champion!`, 'winner');
            }
          }
        }
      } else if (state === 'title') {
        movingObs.forEach((m) => {
          if (m.kind === 'spinner') Matter.Body.rotate(m.body, m.speed * 0.9 * (rawDtMs / 16.67));
        });
      }

      // Real-time 3-second Winner Podium & Winner Announcement hold before auto-stopping recording
      if (state === 'playing' && postWinTimerStarted && !finishReported) {
        postWinElapsedMs += rawDtMs;
        if (Math.random() < 0.16) {
          triggerFirework(
            LEFT_WALL_X + 60 + Math.random() * (RIGHT_WALL_X - LEFT_WALL_X - 120),
            track.finishY - 80 - Math.random() * 140
          );
        }
        if (postWinElapsedMs >= POST_WIN_PODIUM_HOLD_MS) {
          finalizeRecordingAndFinish(finalStandingsSnapshot);
        }
      }

      // Decay visual particles & trauma
      shakeTrauma = Math.max(0, shakeTrauma - dtSec * 2.4);
      flashes.forEach((f) => {
        if (f.alpha > 0) {
          f.alpha = Math.max(0, f.alpha - dtSec * 3.0);
          f.radius += dtSec * 42;
        }
      });
      fireworkSparks.forEach((sp) => {
        if (!sp.active) return;
        sp.life += dtSec;
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.12;
        sp.vx *= 0.985;
        if (sp.life >= sp.maxLife) sp.active = false;
      });
      if (confettiActive) {
        confetti.forEach((p) => {
          if (!p.active) return;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.24;
          p.vx *= 0.99;
          p.rot += p.vRot;
          if (p.y > track.height + 120) p.active = false;
        });
      }
      crowdExcitement = Math.max(0, crowdExcitement - dtSec * 0.65);

      const currentStandings = computeStandings(
        ballMetas.map((m) => ({
          id: m.country.id,
          name: m.country.name,
          code: m.country.code,
          y: m.body.position.y,
          vx: m.body.velocity.x,
          vy: m.body.velocity.y,
          checkpoint: m.checkpoint,
          touchedObstacles: m.touchedObstacleIds.size,
          finished: m.finished,
          finishTimeMs: m.finishTimeMs,
        })),
        track.startY,
        track.finishY,
        totalCheckpoints,
        totalObstacles,
        previousRankMap
      );

      if (state === 'playing' && now - lastHudEmitAt > 95) {
        lastHudEmitAt = now;
        const nextMap: Record<string, number> = {};
        currentStandings.forEach((s) => {
          nextMap[s.id] = s.rank;
        });
        previousRankMap = nextMap;
        const topLeader = currentStandings[0];
        if (topLeader) {
          audioEngine.setRaceProgress(topLeader.progress / 100);
          if (
            raceActiveStarted &&
            !raceCompleted &&
            raceElapsedMs > 1400 &&
            announcedLeaderId &&
            topLeader.id !== announcedLeaderId
          ) {
            audioEngine.announceCommentary(
              `${topLeader.name} takes the lead!`,
              'overtake'
            );
          }
          announcedLeaderId = topLeader.id;
        }
        callbacksRef.current.onStandingsUpdate(currentStandings);
        callbacksRef.current.onRaceTimeUpdate(raceElapsedMs);
      }

      // Compute viewport transform
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      const baseScale = Math.min(cssW / (TRACK_WIDTH + 180), 1.15);
      const targetZoom = state === 'playing' && raceActiveStarted ? 1.06 : 1.0;
      cameraZoom += (targetZoom - cameraZoom) * Math.min(1, dtSec * 2.5);
      const scale = baseScale * cameraZoom;
      const virtualViewH = cssH / scale;

      if (state === 'title') {
        cameraY += (manualScrollY - cameraY) * 0.14;
      } else {
        cameraY = computeCameraTargetY(currentStandings, cameraY, virtualViewH, track.height, dtSec);
      }

      const shakeMag = shakeTrauma * shakeTrauma * 9;
      const shakeX = (Math.random() - 0.5) * shakeMag;
      const shakeY = (Math.random() - 0.5) * shakeMag;
      const trackScreenOffsetX = (cssW - TRACK_WIDTH * scale) / 2 + shakeX;
      currentScale = scale;
      currentOffsetX = trackScreenOffsetX;

      // ================== RENDER 3D CLOSED-WALL WORLD STADIUM ==================
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(skyCacheCanvas, 0, 0, cssW, cssH);

      // Sweeping floodlights
      ctx.save();
      const sway = Math.sin(now * 0.0012) * 35;
      const leftBeam = ctx.createLinearGradient(0, 0, cssW * 0.55 + sway, cssH * 0.85);
      leftBeam.addColorStop(0, 'rgba(0, 212, 255, 0.14)');
      leftBeam.addColorStop(1, 'rgba(0, 212, 255, 0)');
      ctx.fillStyle = leftBeam;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cssW * 0.25, 0);
      ctx.lineTo(cssW * 0.65 + sway, cssH);
      ctx.lineTo(cssW * 0.25 + sway, cssH);
      ctx.closePath();
      ctx.fill();

      const rightBeam = ctx.createLinearGradient(cssW, 0, cssW * 0.45 - sway, cssH * 0.85);
      rightBeam.addColorStop(0, 'rgba(255, 215, 0, 0.12)');
      rightBeam.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = rightBeam;
      ctx.beginPath();
      ctx.moveTo(cssW, 0);
      ctx.lineTo(cssW * 0.75, 0);
      ctx.lineTo(cssW * 0.75 - sway, cssH);
      ctx.lineTo(cssW * 0.35 - sway, cssH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(trackScreenOffsetX, shakeY);
      ctx.scale(scale, scale);
      ctx.translate(0, -cameraY);

      const visTop = cameraY - 60;
      const visBot = cameraY + virtualViewH + 60;

      // Grandstands outside the closed metallic walls
      const standW = 150;
      const leftStandGrad = ctx.createLinearGradient(-standW, 0, 0, 0);
      leftStandGrad.addColorStop(0, '#070A1D');
      leftStandGrad.addColorStop(1, '#10183D');
      ctx.fillStyle = leftStandGrad;
      ctx.fillRect(-standW, visTop, standW, virtualViewH + 120);

      const rightStandGrad = ctx.createLinearGradient(TRACK_WIDTH, 0, TRACK_WIDTH + standW, 0);
      rightStandGrad.addColorStop(0, '#10183D');
      rightStandGrad.addColorStop(1, '#070A1D');
      ctx.fillStyle = rightStandGrad;
      ctx.fillRect(TRACK_WIDTH, visTop, standW, virtualViewH + 120);

      const firstRowIdx = Math.max(0, Math.floor((visTop - 90) / CROWD_ROW_STEP));
      const lastRowIdx = Math.min(crowdRows.length - 1, Math.ceil((visBot - 90) / CROWD_ROW_STEP));
      for (let rIdx = firstRowIdx; rIdx <= lastRowIdx; rIdx++) {
        const row = crowdRows[rIdx];
        for (let dIdx = 0; dIdx < row.dots.length; dIdx++) {
          const dot = row.dots[dIdx];
          const bob = Math.sin(now * 0.006 + dot.phase) * (2.2 + crowdExcitement * 8);
          const cx = dot.side === 'left' ? -dot.xOffset : TRACK_WIDTH + dot.xOffset;
          const isStrobe = Math.sin(now * 0.015 + rIdx * 7 + dIdx) > 0.992;
          ctx.fillStyle = isStrobe ? '#FFFFFF' : dot.color;
          ctx.globalAlpha = isStrobe ? 0.95 : 0.4 + crowdExcitement * 0.55;
          ctx.beginPath();
          ctx.arc(cx, dot.y + bob, isStrobe ? 5.5 : 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Track inner tunnel surface
      const laneGrad = ctx.createLinearGradient(LEFT_WALL_X, 0, RIGHT_WALL_X, 0);
      laneGrad.addColorStop(0, '#090F29');
      laneGrad.addColorStop(0.5, '#121D4A');
      laneGrad.addColorStop(1, '#090F29');
      ctx.fillStyle = laneGrad;
      ctx.fillRect(LEFT_WALL_X, Math.max(0, visTop), RIGHT_WALL_X - LEFT_WALL_X, virtualViewH + 120);

      // Grid lines inside tunnel
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = LEFT_WALL_X + 75; gx < RIGHT_WALL_X - 20; gx += 95) {
        ctx.beginPath();
        ctx.moveTo(gx, Math.max(0, visTop));
        ctx.lineTo(gx, visBot);
        ctx.stroke();
      }

      // Floating motes
      motes.forEach((m) => {
        const py = visTop + ((m.yOffset + now * 0.01 * m.speed) % (virtualViewH + 100));
        ctx.fillStyle = m.color;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(m.x, py, m.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // 500px Checkpoint Markers
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      track.checkpoints.forEach((cpY, idx) => {
        if (cpY < visTop || cpY > visBot) return;
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.22)';
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(LEFT_WALL_X + 6, cpY);
        ctx.lineTo(RIGHT_WALL_X - 6, cpY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.65)';
        ctx.fillText(`CP ${idx + 1}/${totalCheckpoints}`, LEFT_WALL_X + 12, cpY - 7);
      });

      // Top "NO ESCAPE" Reinforced Glass Dome + Spikes + Jumbotron
      if (visTop < 260) {
        // Glass ceiling bar
        ctx.fillStyle = 'rgba(0, 212, 255, 0.14)';
        ctx.fillRect(LEFT_WALL_X, 50, RIGHT_WALL_X - LEFT_WALL_X, 14);
        ctx.strokeStyle = '#00D4FF';
        ctx.lineWidth = 2;
        ctx.strokeRect(LEFT_WALL_X, 50, RIGHT_WALL_X - LEFT_WALL_X, 14);

        // Downward security spikes along top ceiling
        ctx.fillStyle = '#FF2E63';
        for (let sx = LEFT_WALL_X + 16; sx < RIGHT_WALL_X - 12; sx += 24) {
          ctx.beginPath();
          ctx.moveTo(sx - 6, 64);
          ctx.lineTo(sx + 6, 64);
          ctx.lineTo(sx, 74);
          ctx.closePath();
          ctx.fill();
        }

        // LED Jumbotron
        const jx = TRACK_WIDTH / 2 - 210;
        const jy = 14;
        ctx.fillStyle = '#050817';
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2.5;
        ctx.fillRect(jx, jy, 420, 32);
        ctx.strokeRect(jx, jy, 420, 32);

        const leader = currentStandings[0];
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = '700 13.5px "Bungee", sans-serif';
        ctx.fillText(
          raceActiveStarted && leader
            ? `LIVE #1 ${leader.name.toUpperCase()} · CP ${leader.checkpoint}/${totalCheckpoints}`
            : track.levelNumber
            ? `LEVEL ${track.levelNumber} · CLOSED FAIR STADIUM`
            : 'CLOSED FAIR STADIUM · NO ESCAPE',
          TRACK_WIDTH / 2,
          jy + 21
        );
      }

      // Simultaneous Mechanical START GATE (slides open cleanly on GO!)
      const gateHalfW = ((RIGHT_WALL_X - LEFT_WALL_X) / 2) * (1 - gateOpenProgress);
      if (gateHalfW > 2) {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(LEFT_WALL_X, track.startY - 4, gateHalfW, 8);
        ctx.fillRect(RIGHT_WALL_X - gateHalfW, track.startY - 4, gateHalfW, 8);
        ctx.fillStyle = '#0A0F2B';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        if (gateOpenProgress === 0) {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
          ctx.fillText('START GATE LOCKED — FAIR HORIZONTAL LINE', TRACK_WIDTH / 2, track.startY + 18);
        }
      }

      // Checkered Finish Gate
      if (track.finishY >= visTop - 140 && track.finishY <= visBot + 140) {
        const glow = ctx.createLinearGradient(0, track.finishY - 50, 0, track.finishY + 60);
        glow.addColorStop(0, 'rgba(255, 215, 0, 0)');
        glow.addColorStop(0.5, 'rgba(255, 215, 0, 0.25)');
        glow.addColorStop(1, 'rgba(255, 46, 99, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(LEFT_WALL_X, track.finishY - 50, RIGHT_WALL_X - LEFT_WALL_X, 110);

        const sq = 20;
        const colsCheck = Math.floor((RIGHT_WALL_X - LEFT_WALL_X) / sq);
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < colsCheck; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : '#0A0F2B';
            ctx.fillRect(LEFT_WALL_X + c * sq, track.finishY + r * sq, sq, sq);
          }
        }
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(LEFT_WALL_X, track.finishY - 4, RIGHT_WALL_X - LEFT_WALL_X, 4);
        ctx.font = '700 26px "Bungee", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('FINISH LINE', TRACK_WIDTH / 2, track.finishY - 14);
      }

      // CLOSED DARK METALLIC SIDE WALLS (Neon Blue Left, Neon Pink Right) + "NO ESCAPE" Spikes/Glass Caps
      const wallTopY = Math.max(0, visTop);
      const wallVisH = virtualViewH + 120;

      // Left dark metallic wall
      const leftWallGrad = ctx.createLinearGradient(0, 0, LEFT_WALL_X, 0);
      leftWallGrad.addColorStop(0, '#070B1E');
      leftWallGrad.addColorStop(0.65, '#1B274F');
      leftWallGrad.addColorStop(1, '#0D1535');
      ctx.fillStyle = leftWallGrad;
      ctx.fillRect(0, wallTopY, LEFT_WALL_X, wallVisH);

      // Right dark metallic wall
      const rightWallGrad = ctx.createLinearGradient(RIGHT_WALL_X, 0, TRACK_WIDTH, 0);
      rightWallGrad.addColorStop(0, '#0D1535');
      rightWallGrad.addColorStop(0.35, '#1B274F');
      rightWallGrad.addColorStop(1, '#070B1E');
      ctx.fillStyle = rightWallGrad;
      ctx.fillRect(RIGHT_WALL_X, wallTopY, TRACK_WIDTH - RIGHT_WALL_X, wallVisH);

      // Metallic hazard ribs along left & right walls
      const firstRibY = Math.floor(wallTopY / 40) * 40;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let ry = firstRibY; ry < visBot + 40; ry += 40) {
        ctx.fillRect(6, ry, LEFT_WALL_X - 12, 4);
        ctx.fillRect(RIGHT_WALL_X + 6, ry, TRACK_WIDTH - RIGHT_WALL_X - 12, 4);
      }

      // Glowing Neon Inner Borders: Blue on Left, Pink on Right
      ctx.fillStyle = 'rgba(0, 212, 255, 0.35)';
      ctx.fillRect(LEFT_WALL_X - 6, wallTopY, 8, wallVisH);
      ctx.fillStyle = '#00D4FF';
      ctx.fillRect(LEFT_WALL_X - 3, wallTopY, 4, wallVisH);

      ctx.fillStyle = 'rgba(255, 46, 99, 0.35)';
      ctx.fillRect(RIGHT_WALL_X - 2, wallTopY, 8, wallVisH);
      ctx.fillStyle = '#FF2E63';
      ctx.fillRect(RIGHT_WALL_X - 1, wallTopY, 4, wallVisH);

      // Wall top caps with spikes + "NO ESCAPE" lock indicator
      if (visTop < 120) {
        ctx.fillStyle = '#00D4FF';
        ctx.fillRect(0, 30, LEFT_WALL_X + 4, 12);
        ctx.fillStyle = '#FF2E63';
        ctx.fillRect(RIGHT_WALL_X - 4, 30, TRACK_WIDTH - RIGHT_WALL_X + 4, 12);
      }

      // Draw 3D beveled obstacles
      const draw3DObstaclePoly = (
        body: Matter.Body,
        topColor: string,
        botColor: string,
        neonEdge: string
      ) => {
        const { min, max } = body.bounds;
        if (max.y < visTop - 50 || min.y > visBot + 50) return;

        ctx.save();
        ctx.translate(4, 6);
        ctx.beginPath();
        body.vertices.forEach((v, i) => {
          if (i === 0) ctx.moveTo(v.x, v.y);
          else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        body.vertices.forEach((v, i) => {
          if (i === 0) ctx.moveTo(v.x, v.y);
          else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        const grad = ctx.createLinearGradient(min.x, min.y, max.x, max.y);
        grad.addColorStop(0, topColor);
        grad.addColorStop(1, botColor);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineJoin = 'round';
        ctx.strokeStyle = neonEdge;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 7;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.restore();
      };

      renderableStaticBodies.forEach((item) => {
        if (item.kind === 'funnel') {
          draw3DObstaclePoly(item.body, '#9333EA', '#4C1D95', '#E879F9');
        } else if (item.kind === 'bouncyPad') {
          draw3DObstaclePoly(item.body, '#22C55E', '#065F46', '#39FF14');
        } else if (item.kind === 'gate') {
          draw3DObstaclePoly(item.body, '#475569', '#0F172A', '#FF2E63');
        } else if (item.kind === 'loop') {
          draw3DObstaclePoly(item.body, '#475569', '#1E293B', '#FFD700');
        } else {
          draw3DObstaclePoly(item.body, '#475569', '#1E293B', '#00D4FF');
        }
      });

      seesawBodies.forEach((s) => {
        draw3DObstaclePoly(s.body, '#64748B', '#1E293B', '#FFD700');
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(s.body.position.x, s.body.position.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      movingObs.forEach((m) => {
        if (m.kind === 'spinner') {
          const { min, max } = m.body.bounds;
          if (max.y < visTop - 80 || min.y > visBot + 80) return;
          const parts = m.body.parts.slice(1);
          parts.forEach((p, idx) =>
            draw3DObstaclePoly(
              p,
              idx === 0 ? '#FFD700' : '#FF2E63',
              idx === 0 ? '#B45309' : '#9F1239',
              idx === 0 ? '#FFFBEB' : '#FF7597'
            )
          );
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.32)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(m.body.position.x, m.body.position.y, m.width * 0.48, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.arc(m.body.position.x, m.body.position.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FF2E63';
          ctx.beginPath();
          ctx.arc(m.body.position.x, m.body.position.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          draw3DObstaclePoly(m.body, '#38BDF8', '#1E3A8A', '#00D4FF');
        }
      });

      bumperBodies.forEach((b) => {
        const y = b.body.position.y;
        if (y < visTop - 60 || y > visBot + 60) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.body.position.x, y, b.radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 46, 99, 0.25)';
        ctx.fill();

        const grad = ctx.createRadialGradient(
          b.body.position.x - 5,
          y - 5,
          3,
          b.body.position.x,
          y,
          b.radius
        );
        grad.addColorStop(0, '#FF7597');
        grad.addColorStop(0.6, '#FF2E63');
        grad.addColorStop(1, '#881337');
        ctx.beginPath();
        ctx.arc(b.body.position.x, y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFD700';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.body.position.x, y, b.radius * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.restore();
      });

      flashes.forEach((f) => {
        if (f.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      const leaderId = currentStandings[0]?.id;

      ballMetas.forEach((meta) => {
        const bx = meta.body.position.x;
        const by = meta.body.position.y;
        if (by < visTop - 70 || by > visBot + 70) return;

        const spd = Math.hypot(meta.body.velocity.x, meta.body.velocity.y);
        if (spd > 7.5 && raceActiveStarted) {
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 212, 255, 0.45)';
          ctx.lineWidth = 2;
          for (let l = -1; l <= 1; l++) {
            const ox = bx + l * 8;
            ctx.beginPath();
            ctx.moveTo(ox, by - BALL_RADIUS - 5);
            ctx.lineTo(ox - meta.body.velocity.x * 1.4, by - BALL_RADIUS - 22);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (meta.trail.length > 1) {
          for (let i = 0; i < meta.trail.length; i++) {
            const pt = meta.trail[i];
            const ratio = (i + 1) / meta.trail.length;
            ctx.fillStyle = meta.country.primaryColor || '#00D4FF';
            ctx.globalAlpha = ratio * 0.25;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, BALL_RADIUS * ratio * 0.68, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.arc(bx + 2.5, by + 5, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        const tex = getFlagTextureCanvas(meta.country, 128);
        if (tex) {
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(meta.body.angle);
          ctx.beginPath();
          ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(tex, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
          ctx.restore();
        }

        ctx.drawImage(glossyDomeCanvas, bx - BALL_RADIUS - domePad, by - BALL_RADIUS - domePad);

        const isLeader = meta.country.id === leaderId && raceActiveStarted;
        if (isLeader) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(bx, by, BALL_RADIUS + 3.5, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(bx, by, BALL_RADIUS + 3.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(10, 15, 43, 0.85)';
        ctx.fillRect(bx - 15, by - BALL_RADIUS - 16, 30, 13);
        ctx.fillStyle = isLeader ? '#FFD700' : '#FFFFFF';
        ctx.font = '700 8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(meta.country.code, bx, by - BALL_RADIUS - 7);
      });

      fireworkSparks.forEach((sp) => {
        if (!sp.active) return;
        const alpha = Math.max(0, 1 - sp.life / sp.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      if (confettiActive) {
        confetti.forEach((p) => {
          if (!p.active) return;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        });
      }

      ctx.restore();

      // Render 3-Second Live Winner Podium Banner right inside live canvas during post-win capture
      if (state === 'playing' && postWinTimerStarted && finalStandingsSnapshot[0]) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const bannerW = Math.min(cssW - 32, 460);
        const bannerX = (cssW - bannerW) / 2;
        const bannerY = Math.max(18, cssH * 0.1);
        ctx.fillStyle = 'rgba(4, 7, 23, 0.92)';
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(bannerX, bannerY, bannerW, 86, 18);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = '800 22px "Bungee", sans-serif';
        ctx.fillText(
          `🏆 ${finalStandingsSnapshot[0].name.toUpperCase()} WINS!`,
          cssW / 2,
          bannerY + 38
        );
        const secsLeft = Math.max(
          0.1,
          (POST_WIN_PODIUM_HOLD_MS - postWinElapsedMs) / 1000
        ).toFixed(1);
        ctx.fillStyle = '#00D4FF';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillText(
          `● CAPTURING 3S WINNER PODIUM FOR MP4 (${secsLeft}s)`,
          cssW / 2,
          bannerY + 66
        );
        ctx.restore();
      }

      // 30fps Composite onto 16:9 1080p/720p Broadcast Recording Canvas
      if (
        state === 'playing' &&
        exportCtx &&
        exportCanvas &&
        now - lastExportFrameAt >= 1000 / RECORD_FPS - 3
      ) {
        lastExportFrameAt = now;
        const podiumProgress = postWinTimerStarted
          ? Math.min(1, postWinElapsedMs / POST_WIN_PODIUM_HOLD_MS)
          : null;

        renderExportBroadcastFrame({
          exportCtx,
          exportW: exportCanvas.width,
          exportH: exportCanvas.height,
          sourceCanvas: canvas,
          standings: raceCompleted ? finalStandingsSnapshot : currentStandings,
          balls,
          levelTitle: videoMetaRef.current.levelTitle,
          raceElapsedMs,
          countdownStep: activeCountdownOverlay,
          photoFinishActive,
          podiumPhaseProgress: podiumProgress,
          winnerName: firstWinnerName,
          nowMs: now,
        });

        // Snap crisp Winner Podium thumbnail at ~0.55s into the 3-second Podium phase
        if (postWinTimerStarted && !capturedThumbnailUrl && postWinElapsedMs >= 450) {
          try {
            capturedThumbnailUrl = exportCanvas.toDataURL('image/jpeg', 0.82);
          } catch {
            // ignore thumbnail snapshot error
          }
        }
      }
    };

    rafId = requestAnimationFrame(stepSimulation);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('click', handleCanvasClick);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {
          // ignore
        }
      }
      callbacksRef.current.onRecordingStateChange?.(false);
      Matter.World.clear(world, false);
      Matter.Engine.clear(engine);
    };
  }, [track, balls, raceRunId]);

  return (
    <div
      ref={containerRef}
      data-testid="race-arena"
      className="relative w-full h-full overflow-hidden rounded-2xl border border-[#00D4FF]/35 bg-[#050819] shadow-[0_0_40px_rgba(0,212,255,0.16)]"
    >
      <canvas
        ref={canvasRef}
        data-testid="race-canvas"
        className={`block w-full h-full ${builderMode ? 'cursor-crosshair' : ''}`}
        aria-label="Flag Ball Race World Stadium closed-wall physics track"
      />
    </div>
  );
};
