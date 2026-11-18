import {
  CountryBall,
  EliminationState,
  RaceStanding,
  TournamentState,
} from '../types/race';
import { BALL_RADIUS, LEFT_WALL_X, RIGHT_WALL_X } from './levelGenerator';

export const MIN_BALLS = 2;
export const MAX_BALLS = 20;
export const STALL_NUDGE_THRESHOLD_MS = 3000;
export const MIN_OBSTACLE_TOUCH_RATIO = 0.8;

export interface BallTelemetryInput {
  id: string;
  name: string;
  code: string;
  y: number;
  vx: number;
  vy: number;
  checkpoint: number;
  touchedObstacles: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export function canAddBalls(currentCount: number, incomingCount = 1): boolean {
  return currentCount + incomingCount <= MAX_BALLS;
}

export function canRemoveBall(currentCount: number): boolean {
  return currentCount > MIN_BALLS;
}

export function computeBallProgress(y: number, startY: number, finishY: number): number {
  const span = Math.max(1, finishY - startY);
  const raw = ((y - startY) / span) * 100;
  return Math.max(0, Math.min(100, raw));
}

export function computeBallCheckpoint(y: number, checkpoints: number[]): number {
  let reached = 0;
  for (let i = 0; i < checkpoints.length; i++) {
    if (y >= checkpoints[i]) reached = i + 1;
    else break;
  }
  return reached;
}

export function isOutOfTrackBounds(x: number, y: number, trackHeight: number): boolean {
  return (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < LEFT_WALL_X ||
    x > RIGHT_WALL_X ||
    y < 36 ||
    y > trackHeight + 80
  );
}

export function isValidWinner(touchedObstacles: number, totalObstacles: number): boolean {
  if (totalObstacles <= 0) return true;
  return touchedObstacles / totalObstacles >= MIN_OBSTACLE_TOUCH_RATIO;
}

/**
 * Computes real-time leaderboard standings:
 * 1. Finished valid balls sorted by earliest finishTimeMs.
 * 2. Active balls sorted by highest Y position (closest to finish line).
 */
export function computeStandings(
  balls: BallTelemetryInput[],
  startY: number,
  finishY: number,
  totalCheckpoints: number,
  totalObstacles: number,
  previousRanks?: Record<string, number>
): RaceStanding[] {
  const sorted = [...balls].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity);
    }
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    return b.y - a.y;
  });

  return sorted.map((b, idx) => {
    const rank = idx + 1;
    const prevRank = previousRanks?.[b.id];
    const rankDelta = prevRank !== undefined ? prevRank - rank : 0;
    const speedRaw = Math.hypot(b.vx, b.vy);
    const speedDisplay = b.finished ? 0 : Math.round(speedRaw * 14);
    const valid = isValidWinner(b.touchedObstacles, totalObstacles);

    return {
      id: b.id,
      name: b.name,
      code: b.code,
      rank,
      rankDelta,
      progress: b.finished ? 100 : Math.round(computeBallProgress(b.y, startY, finishY)),
      speed: speedDisplay,
      y: b.y,
      checkpoint: b.finished ? totalCheckpoints : b.checkpoint,
      totalCheckpoints,
      touchedObstacles: b.touchedObstacles,
      totalObstacles,
      validWinner: valid,
      finished: b.finished,
      finishTimeMs: b.finishTimeMs,
    };
  });
}

/**
 * Computes smooth vertical camera position following the leading active ball.
 */
export function computeCameraTargetY(
  standings: RaceStanding[],
  currentCameraY: number,
  viewportHeight: number,
  trackHeight: number,
  dtSeconds: number
): number {
  const activeLeader = standings.find((s) => !s.finished) ?? standings[standings.length - 1];
  if (!activeLeader) return 0;

  const maxCamY = Math.max(0, trackHeight - viewportHeight);
  const desiredY = Math.max(0, Math.min(maxCamY, activeLeader.y - viewportHeight * 0.42));
  const lerp = 1 - Math.exp(-5.5 * Math.min(dtSeconds, 0.05));
  return currentCameraY + (desiredY - currentCameraY) * lerp;
}

export function formatRaceTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '--.--s';
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatRaceClock(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function computeStallTimer(
  prevStallMs: number,
  speedPxPerStep: number,
  dtMs: number,
  finished: boolean,
  released: boolean
): { nextStallMs: number; shouldNudge: boolean } {
  if (finished || !released) {
    return { nextStallMs: 0, shouldNudge: false };
  }
  if (speedPxPerStep < 0.45) {
    const next = prevStallMs + dtMs;
    if (next >= STALL_NUDGE_THRESHOLD_MS) {
      return { nextStallMs: 0, shouldNudge: true };
    }
    return { nextStallMs: next, shouldNudge: false };
  }
  return { nextStallMs: 0, shouldNudge: false };
}

export function buildInitialStandings(
  balls: CountryBall[],
  totalCheckpoints = 6,
  totalObstacles = 0
): RaceStanding[] {
  return balls.map((b, idx) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    rank: idx + 1,
    rankDelta: 0,
    progress: 0,
    speed: 0,
    y: 0,
    checkpoint: 0,
    totalCheckpoints,
    touchedObstacles: 0,
    totalObstacles,
    validWinner: true,
    finished: false,
    finishTimeMs: null,
  }));
}

function splitIntoHeats(balls: CountryBall[], maxPerHeat = 5): CountryBall[][] {
  if (balls.length <= maxPerHeat) return [balls];
  const heatCount = Math.ceil(balls.length / maxPerHeat);
  const heats: CountryBall[][] = Array.from({ length: heatCount }, () => []);
  balls.forEach((b, idx) => {
    heats[idx % heatCount].push(b);
  });
  return heats;
}

export function createTournamentState(balls: CountryBall[]): TournamentState {
  const heats = splitIntoHeats(balls, 5);
  let remaining = balls.length;
  let totalRounds = 1;
  while (remaining > 5) {
    const hCount = Math.ceil(remaining / 5);
    remaining = hCount * 2;
    totalRounds++;
  }
  return {
    round: 1,
    totalRounds,
    heatIndex: 0,
    heatsInRound: heats,
    advancingBalls: [],
    champion: null,
  };
}

export function advanceTournamentHeat(
  state: TournamentState,
  standings: RaceStanding[],
  allBalls: CountryBall[]
): TournamentState {
  const ballMap = new Map(allBalls.map((b) => [b.id, b]));
  const isFinal = state.heatsInRound.length === 1;

  if (isFinal) {
    const winner = standings[0] ? ballMap.get(standings[0].id) ?? null : null;
    return {
      ...state,
      champion: winner,
    };
  }

  const currentHeat = state.heatsInRound[state.heatIndex] ?? [];
  const advanceCount = Math.max(2, Math.floor(currentHeat.length / 2));
  const heatWinners = standings
    .slice(0, advanceCount)
    .map((s) => ballMap.get(s.id))
    .filter((b): b is CountryBall => Boolean(b));

  const nextAdvancing = [...state.advancingBalls, ...heatWinners];
  const nextHeatIdx = state.heatIndex + 1;

  if (nextHeatIdx < state.heatsInRound.length) {
    return {
      ...state,
      heatIndex: nextHeatIdx,
      advancingBalls: nextAdvancing,
    };
  }

  // Build next round heats from advancing qualifiers
  const nextHeats = splitIntoHeats(nextAdvancing, 5);
  return {
    round: state.round + 1,
    totalRounds: Math.max(state.totalRounds, state.round + 1),
    heatIndex: 0,
    heatsInRound: nextHeats,
    advancingBalls: [],
    champion: null,
  };
}

export function createEliminationState(balls: CountryBall[]): EliminationState {
  return {
    round: 1,
    activeBalls: [...balls],
    eliminatedBalls: [],
    champion: null,
  };
}

export function advanceEliminationRound(
  state: EliminationState,
  standings: RaceStanding[]
): EliminationState {
  const ballMap = new Map(state.activeBalls.map((b) => [b.id, b]));
  const ordered = standings
    .map((s) => ballMap.get(s.id))
    .filter((b): b is CountryBall => Boolean(b));

  if (ordered.length <= 2) {
    const winner = ordered[0] ?? null;
    const loser = ordered[1];
    return {
      ...state,
      activeBalls: winner ? [winner] : [],
      eliminatedBalls: loser
        ? [...state.eliminatedBalls, { ball: loser, roundEliminated: state.round }]
        : state.eliminatedBalls,
      champion: winner,
    };
  }

  const dropCount = ordered.length > 10 ? 2 : 1;
  const survivors = ordered.slice(0, ordered.length - dropCount);
  const dropped = ordered
    .slice(ordered.length - dropCount)
    .map((ball) => ({ ball, roundEliminated: state.round }));

  return {
    round: state.round + 1,
    activeBalls: survivors,
    eliminatedBalls: [...state.eliminatedBalls, ...dropped],
    champion: survivors.length === 1 ? survivors[0] : null,
  };
}
