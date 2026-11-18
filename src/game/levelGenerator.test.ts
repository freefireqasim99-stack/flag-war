import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import {
  BALL_RADIUS,
  buildCustomTrack,
  CHECKPOINT_INTERVAL,
  createStarterCustomObstacles,
  DIFFICULTY_CONFIGS,
  generateTrack,
  LEFT_WALL_X,
  RIGHT_WALL_X,
  TOTAL_LEVELS,
  TRACK_WIDTH,
} from './levelGenerator';
import { Difficulty } from '../types/race';

test('track scales length and obstacle count across Easy, Medium, Hard, Impossible', () => {
  const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Impossible'];
  const tracks = difficulties.map((d) => generateTrack(d, 424242));

  for (let i = 1; i < tracks.length; i++) {
    assert.ok(tracks[i].height > tracks[i - 1].height, `${difficulties[i]} should be taller than ${difficulties[i - 1]}`);
    assert.ok(
      tracks[i].obstacles.length > tracks[i - 1].obstacles.length,
      `${difficulties[i]} should have more obstacles than ${difficulties[i - 1]}`
    );
  }
});

test('all 100 levels generate valid closed fair tracks with 500px checkpoints and <= 200px barrier spacing', () => {
  for (let lvl = 1; lvl <= TOTAL_LEVELS; lvl++) {
    const track = generateTrack('Easy', 0, lvl);
    assert.equal(track.levelNumber, lvl);
    assert.ok(track.checkpoints.length >= 2, `Level ${lvl} should have checkpoints every ${CHECKPOINT_INTERVAL}px`);

    // Ensure no straight vertical drop > 200px between consecutive obstacles
    const ys = track.obstacles.map((o) => o.y).sort((a, b) => a - b);
    assert.ok(ys[0] - track.startY <= 200, `Level ${lvl} first obstacle drop too large`);
    for (let i = 1; i < ys.length; i++) {
      assert.ok(ys[i] - ys[i - 1] <= 200, `Level ${lvl} vertical drop gap > 200px at index ${i}`);
    }
    // Ensure consecutive snake ramps never overlap or pinch into a V-trap (>= 188px apart)
    const snakes = track.obstacles.filter((o) => o.kind === 'zigzag').sort((a, b) => a.y - b.y);
    for (let i = 1; i < snakes.length; i++) {
      assert.ok(
        snakes[i].y - snakes[i - 1].y >= 188,
        `Level ${lvl} snake ramps too close (${snakes[i].y - snakes[i - 1].y}px) — V-trap risk`
      );
    }
    // Final obstacle is a locked pre-finish V-funnel
    const lastObs = track.obstacles[track.obstacles.length - 1];
    assert.equal(lastObs.kind, 'funnel');
    assert.equal(lastObs.locked, true);
  }
});

test('all funnel and gate gaps exceed ball diameter for navigability', () => {
  const ballDiameter = BALL_RADIUS * 2;
  (['Easy', 'Medium', 'Hard', 'Impossible'] as Difficulty[]).forEach((diff) => {
    const track = generateTrack(diff, 1337);
    for (const obs of track.obstacles) {
      if (obs.kind === 'funnel' || obs.kind === 'gate') {
        assert.ok((obs.gap ?? 0) >= ballDiameter * 1.8, `Gap too narrow in ${diff}: ${obs.gap}`);
      }
      assert.ok(obs.x >= 0 && obs.x <= TRACK_WIDTH);
      assert.ok(obs.y > track.startY && obs.y < track.finishY);
    }
    assert.ok(track.finishY < DIFFICULTY_CONFIGS[diff].trackHeight);
  });
});

test('custom track builder always keeps final funnel locked and blocks locked deletion', () => {
  const starter = createStarterCustomObstacles();
  const track = buildCustomTrack([...starter, { ...starter[0], id: 'fake-locked', locked: true }]);
  const lockedFunnels = track.obstacles.filter((o) => o.locked);
  assert.equal(lockedFunnels.length, 1);
  assert.equal(lockedFunnels[0].id, 'custom-final-funnel');
});

test('physics invariant: no ball finishes without touching >= 80% of obstacles and zero balls escape side walls', () => {
  const track = generateTrack('Easy', 101, 1);
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 1.05, scale: 0.001 },
    positionIterations: 10,
    velocityIterations: 8,
  });
  const world = engine.world;
  Matter.Composite.add(world, [
    Matter.Bodies.rectangle(LEFT_WALL_X - 70, track.height / 2, 140, track.height + 600, { isStatic: true, restitution: 0.78 }),
    Matter.Bodies.rectangle(RIGHT_WALL_X + 70, track.height / 2, 140, track.height + 600, { isStatic: true, restitution: 0.78 }),
    Matter.Bodies.rectangle(TRACK_WIDTH / 2, 10, TRACK_WIDTH + 140, 40, { isStatic: true, restitution: 0.6 }),
  ]);

  const spinners: Matter.Body[] = [];
  const obsTag = new Map<number, string>();
  for (const obs of track.obstacles) {
    const tag = (b: Matter.Body) => obsTag.set(b.id, obs.id);
    if (obs.kind === 'zigzag') {
      const b = Matter.Bodies.rectangle(obs.x, obs.y, obs.width ?? 280, obs.height ?? 18, { isStatic: true, angle: obs.angle ?? 0.23, restitution: 0.72, friction: 0.01 });
      Matter.Composite.add(world, b);
      tag(b);
    } else if (obs.kind === 'funnel') {
      const gap = obs.gap ?? 114;
      const armW = obs.width ?? 260;
      const ang = obs.angle ?? 0.34;
      const off = gap / 2 + (Math.cos(ang) * armW) / 2;
      const l = Matter.Bodies.rectangle(obs.x - off, obs.y, armW, 18, { isStatic: true, angle: ang, restitution: 0.68, friction: 0.008 });
      const r = Matter.Bodies.rectangle(obs.x + off, obs.y, armW, 18, { isStatic: true, angle: -ang, restitution: 0.68, friction: 0.008 });
      Matter.Composite.add(world, [l, r]);
      tag(l);
      tag(r);
    } else if (obs.kind === 'spinner') {
      const w = obs.width ?? 240;
      const h = obs.height ?? 18;
      const a = Matter.Bodies.rectangle(obs.x, obs.y, w, h);
      const b = Matter.Bodies.rectangle(obs.x, obs.y, h, w);
      const sp = Matter.Body.create({ parts: [a, b], isStatic: true, restitution: 0.85 });
      Matter.Composite.add(world, sp);
      tag(sp);
      tag(a);
      tag(b);
      spinners.push(sp);
    } else if (obs.kind === 'bumper') {
      const rad = obs.radius ?? 26;
      const g = obs.gap ?? 110;
      const xs = g > 0 ? [obs.x - g, obs.x, obs.x + g] : [obs.x];
      for (const bx of xs) {
        if (bx < LEFT_WALL_X + rad + 6 || bx > RIGHT_WALL_X - rad - 6) continue;
        const bmp = Matter.Bodies.circle(bx, obs.y, rad, { isStatic: true, restitution: 1.25 });
        Matter.Composite.add(world, bmp);
        tag(bmp);
      }
    }
  }

  const usableSpan = (RIGHT_WALL_X - 24) - (LEFT_WALL_X + 24);
  const balls = Array.from({ length: 10 }, (_, i) => {
    const x = LEFT_WALL_X + 24 + (i / 9) * usableSpan;
    const b = Matter.Bodies.circle(x, track.startY - 26, BALL_RADIUS, { restitution: 0.72, friction: 0.012 });
    Matter.Composite.add(world, b);
    return { b, touched: new Set<string>(), stallMs: 0, fin: false, escaped: false };
  });

  const bodyToBall = new Map(balls.map((x) => [x.b.id, x]));
  Matter.Events.on(engine, 'collisionStart', (ev) => {
    for (const p of ev.pairs) {
      const bA = bodyToBall.get(p.bodyA.id);
      const bB = bodyToBall.get(p.bodyB.id);
      const oA = obsTag.get(p.bodyA.id);
      const oB = obsTag.get(p.bodyB.id);
      if (bA && oB) bA.touched.add(oB);
      if (bB && oA) bB.touched.add(oA);
    }
  });

  let steps = 0;
  while (steps < 6000 && balls.some((x) => !x.fin)) {
    for (const sp of spinners) Matter.Body.rotate(sp, 0.02);
    Matter.Engine.update(engine, 8.3);
    steps++;
    for (const m of balls) {
      const spd = Math.hypot(m.b.velocity.x, m.b.velocity.y);
      if (spd > 12) {
        const s = 12 / spd;
        Matter.Body.setVelocity(m.b, { x: m.b.velocity.x * s, y: m.b.velocity.y * s });
      }
      if (m.b.position.x < LEFT_WALL_X || m.b.position.x > RIGHT_WALL_X) m.escaped = true;
      if (m.fin) continue;
      if (m.b.position.y >= track.finishY) {
        m.fin = true;
        continue;
      }
      if (spd < 0.45) {
        m.stallMs += 8.3;
        if (m.stallMs >= 3000) {
          m.stallMs = 0;
          Matter.Body.setVelocity(m.b, { x: (m.b.position.x < TRACK_WIDTH / 2 ? 1 : -1) * 5.2, y: -4.2 });
        }
      } else {
        m.stallMs = 0;
      }
    }
  }

  for (const m of balls) {
    assert.equal(m.escaped, false, 'Ball escaped side walls');
    assert.equal(m.fin, true, 'All balls should finish');
    assert.ok(
      m.touched.size / track.obstacles.length >= 0.8,
      `Ball touched only ${m.touched.size}/${track.obstacles.length} obstacles`
    );
  }
});
