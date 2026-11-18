export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Impossible';

export type GameMode = 'levels' | 'quick' | 'tournament' | 'elimination' | 'builder';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type DefaultFlagKey =
  | 'pakistan'
  | 'india'
  | 'usa'
  | 'brazil'
  | 'japan'
  | 'uk'
  | 'france'
  | 'germany'
  | 'turkey'
  | 'china';

export interface CountryBall {
  id: string;
  name: string;
  code: string;
  emoji: string;
  flagType: 'default' | 'custom';
  defaultKey?: DefaultFlagKey;
  imageDataUrl?: string;
  primaryColor: string;
  secondaryColor: string;
}

export type ObstacleKind =
  | 'zigzag'
  | 'spinner'
  | 'movingPlatform'
  | 'funnel'
  | 'bouncyPad'
  | 'gate'
  | 'loop'
  | 'seesaw'
  | 'bumper';

export interface ObstacleDef {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  angle?: number;
  speed?: number;
  range?: number;
  gap?: number;
  direction?: 1 | -1;
  color: string;
  wallAnchored?: 'left' | 'right' | 'both' | 'none';
  locked?: boolean;
}

export interface TrackData {
  seed: number;
  difficulty: Difficulty;
  levelNumber?: number;
  isCustom?: boolean;
  width: number;
  height: number;
  startY: number;
  finishY: number;
  checkpoints: number[];
  obstacles: ObstacleDef[];
}

export interface RaceStanding {
  id: string;
  name: string;
  code: string;
  rank: number;
  rankDelta: number;
  progress: number;
  speed: number;
  y: number;
  checkpoint: number;
  totalCheckpoints: number;
  touchedObstacles: number;
  totalObstacles: number;
  validWinner: boolean;
  finished: boolean;
  finishTimeMs: number | null;
}

export type MusicCategoryId =
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'sports'
  | 'gaming';

export interface MusicTrackDef {
  id: string;
  categoryId: MusicCategoryId;
  title: string;
  description: string;
  bpm: number;
  energy: 'Chill' | 'Medium' | 'High' | 'Extreme';
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  bassNotes: number[];
  leadNotes: number[];
  arpNotes?: number[];
  hasCowbell?: boolean;
  hasHorns?: boolean;
  isBuildup?: boolean;
  accentColor: string;
}

export interface AudioSettings {
  muted: boolean;
  volume: number; // kept for legacy compat (mirrors sfxVolume)
  sfxVolume: number;
  musicVolume: number;
  musicEnabled: boolean;
  selectedTrackId: string | 'none';
  autoPickTrending: boolean;
  commentaryEnabled: boolean;
}

export type VideoQuality = '720p' | '1080p';

export interface VideoExportOptions {
  quality: VideoQuality;
  includeCommentary: boolean;
  includeMusic: boolean;
}

export interface RecordedVideoItem {
  id: string;
  filename: string;
  shortFilename: string;
  winnerName: string;
  winnerCode: string;
  levelLabel: string;
  difficulty: Difficulty;
  createdAt: number;
  durationSec: number;
  quality: VideoQuality;
  thumbnailDataUrl: string;
  mimeType: string;
  webmBlob: Blob;
  mp4Blob?: Blob | null;
}

export interface TournamentState {
  round: number;
  totalRounds: number;
  heatIndex: number;
  heatsInRound: CountryBall[][];
  advancingBalls: CountryBall[];
  champion: CountryBall | null;
}

export interface EliminationState {
  round: number;
  activeBalls: CountryBall[];
  eliminatedBalls: Array<{ ball: CountryBall; roundEliminated: number }>;
  champion: CountryBall | null;
}
