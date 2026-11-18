import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceEliminationRound,
  advanceTournamentHeat,
  canAddBalls,
  canRemoveBall,
  computeBallCheckpoint,
  computeBallProgress,
  computeCameraTargetY,
  computeStallTimer,
  computeStandings,
  createEliminationState,
  createTournamentState,
  formatRaceTime,
  isOutOfTrackBounds,
  isValidWinner,
  MAX_BALLS,
  MIN_BALLS,
} from './raceLogic';
import { createDefaultCountryBalls, deriveCountryCode, deriveNameFromFilename } from './flags';
import { LEFT_WALL_X, RIGHT_WALL_X } from './levelGenerator';

test('enforces min 2 and max 20 balls', () => {
  assert.equal(canRemoveBall(MIN_BALLS), false);
  assert.equal(canRemoveBall(MIN_BALLS + 1), true);
  assert.equal(canAddBalls(MAX_BALLS, 1), false);
  assert.equal(canAddBalls(MAX_BALLS - 1, 1), true);
  assert.equal(canAddBalls(18, 3), false);
});

test('computes standings with finished balls ordered by finishTimeMs, checkpoints, and >=80% validWinner', () => {
  const standings = computeStandings(
    [
      { id: 'a', name: 'Pakistan', code: 'PAK', y: 900, vx: 0, vy: 5, checkpoint: 2, touchedObstacles: 7, finished: false, finishTimeMs: null },
      { id: 'b', name: 'Brazil', code: 'BRA', y: 1200, vx: 0, vy: 0, checkpoint: 4, touchedObstacles: 8, finished: true, finishTimeMs: 4200 },
      { id: 'c', name: 'Japan', code: 'JPN', y: 1200, vx: 0, vy: 0, checkpoint: 4, touchedObstacles: 9, finished: true, finishTimeMs: 3900 },
      { id: 'd', name: 'USA', code: 'USA', y: 1050, vx: 2, vy: 4, checkpoint: 3, touchedObstacles: 5, finished: false, finishTimeMs: null },
    ],
    100,
    1100,
    4,
    10
  );

  assert.deepEqual(
    standings.map((s) => s.id),
    ['c', 'b', 'd', 'a']
  );
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[0].validWinner, true);
  assert.equal(standings[0].checkpoint, 4);
  assert.equal(standings[2].checkpoint, 3);
  assert.equal(standings[3].validWinner, false);
  assert.equal(isValidWinner(8, 10), true);
  assert.equal(isValidWinner(7, 10), false);
});

test('progress and 500px checkpoints clamp and increment cleanly', () => {
  assert.equal(computeBallProgress(50, 100, 1100), 0);
  assert.equal(computeBallProgress(1500, 100, 1100), 100);
  assert.equal(computeBallProgress(600, 100, 1100), 50);

  const cps = [640, 1140, 1640, 2140];
  assert.equal(computeBallCheckpoint(200, cps), 0);
  assert.equal(computeBallCheckpoint(700, cps), 1);
  assert.equal(computeBallCheckpoint(1700, cps), 3);
  assert.equal(computeBallCheckpoint(2500, cps), 4);
});

test('detects out-of-bounds balls for checkpoint safety net', () => {
  assert.equal(isOutOfTrackBounds(380, 500, 2500), false);
  assert.equal(isOutOfTrackBounds(LEFT_WALL_X - 2, 500, 2500), true);
  assert.equal(isOutOfTrackBounds(RIGHT_WALL_X + 2, 500, 2500), true);
  assert.equal(isOutOfTrackBounds(380, 10, 2500), true);
});

test('stall timer triggers unstuck nudge after 3s of near-zero speed', () => {
  let timer = 0;
  let nudged = false;
  for (let i = 0; i < 31; i++) {
    const res = computeStallTimer(timer, 0.2, 100, false, true);
    timer = res.nextStallMs;
    if (res.shouldNudge) nudged = true;
  }
  assert.equal(nudged, true);

  const earlyRes = computeStallTimer(2000, 0.2, 500, false, true);
  assert.equal(earlyRes.shouldNudge, false);

  const fastRes = computeStallTimer(1200, 3.5, 100, false, true);
  assert.equal(fastRes.nextStallMs, 0);
  assert.equal(fastRes.shouldNudge, false);
});

test('camera smoothly chases leading unfinished ball within track bounds', () => {
  const baseStanding = {
    rankDelta: 0,
    checkpoint: 2,
    totalCheckpoints: 6,
    touchedObstacles: 8,
    totalObstacles: 10,
    validWinner: true,
  };
  const standings = [
    { ...baseStanding, id: '1', name: 'A', code: 'AAA', rank: 1, progress: 100, speed: 0, y: 3000, finished: true, finishTimeMs: 1000 },
    { ...baseStanding, id: '2', name: 'B', code: 'BBB', rank: 2, progress: 50, speed: 50, y: 1600, finished: false, finishTimeMs: null },
  ];
  const nextCam = computeCameraTargetY(standings, 0, 800, 3300, 0.05);
  assert.ok(nextCam > 0 && nextCam < 1600);
});

test('tournament and elimination modes advance heats and crown 1 champion', () => {
  const balls = createDefaultCountryBalls(); // 10 balls
  let tour = createTournamentState(balls);
  assert.equal(tour.heatsInRound.length, 2);

  // Finish heat 1 & 2
  for (let h = 0; h < 2; h++) {
    const heatBalls = tour.heatsInRound[tour.heatIndex];
    const mockStandings = buildMockStandings(heatBalls);
    tour = advanceTournamentHeat(tour, mockStandings, balls);
  }
  assert.equal(tour.round, 2);
  assert.equal(tour.champion, null);

  // Final round
  const finalStandings = buildMockStandings(tour.heatsInRound[0]);
  tour = advanceTournamentHeat(tour, finalStandings, balls);
  assert.ok(tour.champion !== null);

  // Elimination mode eliminates bottom racer(s) down to 1 winner
  let elim = createEliminationState(balls.slice(0, 3));
  elim = advanceEliminationRound(elim, buildMockStandings(elim.activeBalls));
  assert.equal(elim.activeBalls.length, 2);
  assert.equal(elim.eliminatedBalls.length, 1);

  elim = advanceEliminationRound(elim, buildMockStandings(elim.activeBalls));
  assert.ok(elim.champion !== null);
  assert.equal(elim.eliminatedBalls.length, 2);
});

function buildMockStandings(balls: ReturnType<typeof createDefaultCountryBalls>) {
  return balls.map((b, idx) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    rank: idx + 1,
    rankDelta: 0,
    progress: 100,
    speed: 0,
    y: 2000,
    checkpoint: 4,
    totalCheckpoints: 4,
    touchedObstacles: 10,
    totalObstacles: 10,
    validWinner: true,
    finished: true,
    finishTimeMs: 1000 + idx * 100,
  }));
}

test('computes rankDelta overtake arrows and formats times cleanly', () => {
  const standings = computeStandings(
    [
      { id: 'a', name: 'Pakistan', code: 'PAK', y: 950, vx: 0, vy: 5, checkpoint: 2, touchedObstacles: 8, finished: false, finishTimeMs: null },
      { id: 'b', name: 'Brazil', code: 'BRA', y: 800, vx: 0, vy: 4, checkpoint: 1, touchedObstacles: 7, finished: false, finishTimeMs: null },
    ],
    100,
    1100,
    4,
    10,
    { a: 2, b: 1 }
  );
  assert.equal(standings[0].id, 'a');
  assert.equal(standings[0].rankDelta, 1);
  assert.equal(standings[1].id, 'b');
  assert.equal(standings[1].rankDelta, -1);
  assert.equal(formatRaceTime(12345), '12.35s');
  assert.equal(formatRaceTime(null), '--.--s');
  assert.equal(deriveCountryCode('Pakistan'), 'PAK');
  assert.equal(deriveCountryCode('UK'), 'UKX');
  assert.equal(deriveNameFromFilename('south_korea_flag.png'), 'South Korea Flag');
});
