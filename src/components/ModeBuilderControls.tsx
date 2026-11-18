import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Trophy,
  Wand2,
} from 'lucide-react';
import {
  CountryBall,
  Difficulty,
  EliminationState,
  GameMode,
  ObstacleDef,
  ObstacleKind,
  TournamentState,
} from '../types/race';
import { getLevelMeta, TOTAL_LEVELS } from '../game/levelGenerator';

export type BuilderToolKind =
  | 'zigzag-left'
  | 'zigzag-right'
  | 'funnel'
  | 'spinner'
  | 'bouncyPad'
  | 'bumper'
  | 'movingPlatform'
  | 'seesaw';

interface ModeBuilderControlsProps {
  gameMode: GameMode;
  difficulty: Difficulty;
  currentLevel: number;
  completedLevels: number[];
  obstacleCount: number;
  trackHeight: number;
  disabled: boolean;
  balls: CountryBall[];
  tournamentState: TournamentState;
  eliminationState: EliminationState;
  customObstacles: ObstacleDef[];
  selectedBuilderTool: BuilderToolKind;
  builderNotice: string | null;
  onModeChange: (mode: GameMode) => void;
  onLevelChange: (level: number) => void;
  onDifficultyChange: (d: Difficulty) => void;
  onGenerateLevel: () => void;
  onResetTournament: () => void;
  onResetElimination: () => void;
  onSelectBuilderTool: (tool: BuilderToolKind) => void;
  onAddBuilderObstaclePreset: (tool: BuilderToolKind) => void;
  onDeleteCustomObstacle: (id: string) => void;
  onAttemptDeleteLockedWall: (wallLabel: string) => void;
  onAutoFillCustomTrack: () => void;
  onClearCustomObstacles: () => void;
}

const MODES: Array<{ id: GameMode; label: string }> = [
  { id: 'levels', label: '100 Levels' },
  { id: 'quick', label: 'Quick Race' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'elimination', label: 'Elimination' },
  { id: 'builder', label: 'Builder' },
];

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Impossible'];

const BUILDER_TOOLS: Array<{ id: BuilderToolKind; label: string }> = [
  { id: 'zigzag-left', label: 'Snake L' },
  { id: 'zigzag-right', label: 'Snake R' },
  { id: 'funnel', label: 'V-Funnel' },
  { id: 'spinner', label: 'Spinner' },
  { id: 'bouncyPad', label: 'Bouncy' },
  { id: 'bumper', label: 'Bumper' },
  { id: 'movingPlatform', label: 'Mover' },
  { id: 'seesaw', label: 'Seesaw' },
];

const LOCKED_STRUCTURES = [
  { id: 'lock-left-wall', label: 'Left Neon Wall (Blue)' },
  { id: 'lock-right-wall', label: 'Right Neon Wall (Pink)' },
  { id: 'lock-top-cap', label: 'Top NO ESCAPE Cap' },
  { id: 'lock-final-funnel', label: 'Final Finish Funnel' },
];

function formatKindLabel(kind: ObstacleKind, wallAnchored?: string): string {
  if (kind === 'zigzag') {
    return wallAnchored === 'right' ? 'Snake Ramp (R)' : 'Snake Ramp (L)';
  }
  switch (kind) {
    case 'funnel':
      return 'V-Funnel';
    case 'spinner':
      return 'Spinner';
    case 'bouncyPad':
      return 'Bouncy Pad';
    case 'bumper':
      return 'Bumper';
    case 'movingPlatform':
      return 'Moving Platform';
    case 'seesaw':
      return 'Seesaw';
    case 'gate':
      return 'Gate';
    case 'loop':
      return 'Loop';
    default:
      return kind;
  }
}

export const ModeBuilderControls: React.FC<ModeBuilderControlsProps> = ({
  gameMode,
  difficulty,
  currentLevel,
  completedLevels,
  obstacleCount,
  trackHeight,
  disabled,
  tournamentState,
  eliminationState,
  customObstacles,
  selectedBuilderTool,
  builderNotice,
  onModeChange,
  onLevelChange,
  onDifficultyChange,
  onGenerateLevel,
  onResetTournament,
  onResetElimination,
  onSelectBuilderTool,
  onAddBuilderObstaclePreset,
  onDeleteCustomObstacle,
  onAttemptDeleteLockedWall,
  onAutoFillCustomTrack,
  onClearCustomObstacles,
}) => {
  const [levelInput, setLevelInput] = useState(String(currentLevel));

  const levelMeta = getLevelMeta(currentLevel);
  const isLevelCompleted = completedLevels.includes(currentLevel);

  const commitLevelJump = () => {
    const parsed = parseInt(levelInput, 10);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(1, Math.min(TOTAL_LEVELS, parsed));
      onLevelChange(clamped);
      setLevelInput(String(clamped));
    } else {
      setLevelInput(String(currentLevel));
    }
  };

  return (
    <section className="flex flex-col gap-3 border-b border-white/10 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base tracking-wide text-electric-gradient">
          Championship Mode
        </h2>
        <span className="font-mono-tabular text-xs text-[#00D4FF]">
          {obstacleCount} obs · {Math.round(trackHeight / 100)}m
        </span>
      </div>

      {/* 5-Mode Selector */}
      <div
        role="tablist"
        aria-label="Game modes"
        className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 gap-1.5 rounded-xl bg-[#06091B]/85 p-1 border border-white/10"
      >
        {MODES.map((m) => {
          const active = gameMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onModeChange(m.id)}
              className={`btn-3d px-2 py-1.5 text-[11px] font-bold rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                active
                  ? 'bg-gradient-to-b from-[#00D4FF] to-blue-600 text-[#050819] shadow-[0_3px_0_#1e3a8a]'
                  : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* 100 LEVELS MODE */}
      {gameMode === 'levels' && (
        <div
          data-testid="levels-mode-panel"
          className="rounded-xl border border-[#00D4FF]/30 bg-[#06091B]/75 p-3 flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-sm text-[#FFD700] tracking-wide">
                LEVEL {currentLevel} / {TOTAL_LEVELS}
              </p>
              <p className="text-[11px] font-semibold text-slate-300">
                Tier: <span className="text-[#00D4FF]">{levelMeta.difficulty}</span>
                {isLevelCompleted && (
                  <span className="ml-2 text-emerald-400 font-bold">✓ Cleared</span>
                )}
              </p>
            </div>
            <span className="font-mono-tabular text-[11px] font-bold text-slate-300">
              {completedLevels.length}/{TOTAL_LEVELS} Done
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || currentLevel <= 1}
              onClick={() => {
                const next = Math.max(1, currentLevel - 1);
                setLevelInput(String(next));
                onLevelChange(next);
              }}
              aria-label="Previous level"
              className="btn-3d p-2 rounded-lg bg-white/10 hover:bg-white/15 border-b-2 border-slate-900 text-white cursor-pointer disabled:opacity-35"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 flex items-center gap-1.5">
              <label htmlFor="level-jump-input" className="sr-only">
                Jump to level 1 to 100
              </label>
              <input
                id="level-jump-input"
                type="number"
                min={1}
                max={TOTAL_LEVELS}
                disabled={disabled}
                value={levelInput}
                onChange={(e) => setLevelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitLevelJump();
                }}
                onBlur={commitLevelJump}
                className="w-full rounded-lg bg-[#0A0F2B] border border-[#00D4FF]/40 px-2.5 py-1.5 text-xs font-mono-tabular font-bold text-white text-center focus:outline-none focus:border-[#FFD700]"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={commitLevelJump}
                className="btn-3d px-2.5 py-1.5 rounded-lg bg-gradient-to-b from-[#FFD700] to-amber-500 border-b-2 border-amber-800 text-[11px] font-bold text-[#0A0F2B] whitespace-nowrap cursor-pointer disabled:opacity-40"
              >
                Go
              </button>
            </div>

            <button
              type="button"
              disabled={disabled || currentLevel >= TOTAL_LEVELS}
              onClick={() => {
                const next = Math.min(TOTAL_LEVELS, currentLevel + 1);
                setLevelInput(String(next));
                onLevelChange(next);
              }}
              aria-label="Next level"
              className="btn-3d p-2 rounded-lg bg-white/10 hover:bg-white/15 border-b-2 border-slate-900 text-white cursor-pointer disabled:opacity-35"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Tier Milestones */}
          <div className="grid grid-cols-5 gap-1">
            {[1, 20, 50, 80, 100].map((lvl) => (
              <button
                key={lvl}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setLevelInput(String(lvl));
                  onLevelChange(lvl);
                }}
                className={`px-1.5 py-1 rounded text-[10px] font-mono-tabular font-bold cursor-pointer transition-colors ${
                  currentLevel === lvl
                    ? 'bg-[#00D4FF] text-[#050819]'
                    : 'bg-white/5 text-slate-300 hover:bg-white/15'
                }`}
              >
                L{lvl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUICK RACE DIFFICULTY + RANDOM TRACK */}
      {(gameMode === 'quick' || gameMode === 'tournament' || gameMode === 'elimination') && (
        <div className="flex flex-col gap-2">
          <div
            role="group"
            aria-label="Track difficulty"
            className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#06091B]/80 p-1 border border-white/10"
          >
            {DIFFICULTIES.map((diff) => {
              const active = difficulty === diff;
              return (
                <button
                  key={diff}
                  type="button"
                  disabled={disabled}
                  onClick={() => onDifficultyChange(diff)}
                  className={`btn-3d px-2 py-1.5 text-[11px] font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                    active
                      ? 'bg-gradient-to-b from-[#FFD700] to-amber-500 text-[#0A0F2B] shadow-[0_3px_0_#92400e]'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {diff}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={onGenerateLevel}
            className="btn-3d flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl bg-gradient-to-b from-purple-500 via-purple-600 to-indigo-800 border-b-4 border-purple-950 text-xs font-bold text-white shadow-[0_6px_20px_rgba(168,85,247,0.35)] whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <span aria-hidden="true">🎲</span>
            Generate Random Fair Track
          </button>
        </div>
      )}

      {/* TOURNAMENT STATUS */}
      {gameMode === 'tournament' && (
        <div
          data-testid="tournament-mode-panel"
          className="rounded-xl border border-[#FFD700]/35 bg-[#06091B]/80 p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#FFD700]">
              <Trophy className="w-4 h-4" />
              <span>
                Round {tournamentState.round}/{tournamentState.totalRounds} · Heat{' '}
                {tournamentState.heatIndex + 1}/{tournamentState.heatsInRound.length}
              </span>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={onResetTournament}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#00D4FF] hover:text-[#FFD700] cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <p className="text-[11px] text-slate-300">
            Heat lineup ({tournamentState.heatsInRound[tournamentState.heatIndex]?.length ?? 0} balls):{' '}
            <span className="text-white font-semibold">
              {(tournamentState.heatsInRound[tournamentState.heatIndex] ?? [])
                .map((b) => b.name)
                .join(', ')}
            </span>
          </p>
        </div>
      )}

      {/* ELIMINATION STATUS */}
      {gameMode === 'elimination' && (
        <div
          data-testid="elimination-mode-panel"
          className="rounded-xl border border-[#FF2E63]/35 bg-[#06091B]/80 p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#FF2E63]">
              Elimination Round {eliminationState.round} · {eliminationState.activeBalls.length} Left
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={onResetElimination}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#00D4FF] hover:text-[#FFD700] cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <p className="text-[11px] text-slate-300">
            Last {eliminationState.activeBalls.length > 10 ? '2 finishers' : 'finisher'} eliminated each round until 1 Champion remains.
          </p>
        </div>
      )}

      {/* CUSTOM TRACK BUILDER MODE */}
      {gameMode === 'builder' && (
        <div
          data-testid="builder-mode-panel"
          className="rounded-xl border border-[#00D4FF]/35 bg-[#06091B]/80 p-3 flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#00D4FF]">
              Click track or Add Preset
            </span>
            <span className="font-mono-tabular text-[11px] text-[#FFD700]">
              {customObstacles.length} Custom
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {BUILDER_TOOLS.map((tool) => {
              const active = selectedBuilderTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectBuilderTool(tool.id)}
                  className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#FFD700] text-[#050819]'
                      : 'bg-white/10 text-slate-200 hover:bg-white/15'
                  }`}
                >
                  {tool.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddBuilderObstaclePreset(selectedBuilderTool)}
              className="btn-3d flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-600 border-b-2 border-emerald-900 text-[11px] font-bold text-[#050819] cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Selected
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onAutoFillCustomTrack}
              className="btn-3d flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-gradient-to-b from-purple-500 to-indigo-700 border-b-2 border-purple-950 text-[11px] font-bold text-white cursor-pointer disabled:opacity-40"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Starter
            </button>
            <button
              type="button"
              disabled={disabled || customObstacles.length === 0}
              onClick={onClearCustomObstacles}
              aria-label="Clear custom obstacles"
              className="btn-3d p-1.5 rounded-lg bg-white/10 hover:bg-[#FF2E63]/30 border-b-2 border-slate-900 text-white cursor-pointer disabled:opacity-35"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {builderNotice && (
            <div
              role="alert"
              data-testid="builder-lock-warning"
              className="flex items-center gap-1.5 rounded-lg border border-[#FF2E63]/60 bg-[#FF2E63]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#FFD700]"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#FF2E63] shrink-0" />
              <span>{builderNotice}</span>
            </div>
          )}

          {/* Locked Side Walls & User Obstacles List */}
          <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
            {LOCKED_STRUCTURES.map((wall) => (
              <div
                key={wall.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#00D4FF]/25 bg-[#0A0F2B]/90 px-2 py-1 text-[11px]"
              >
                <span className="flex items-center gap-1.5 font-semibold text-slate-200 truncate">
                  <Lock className="w-3 h-3 text-[#00D4FF] shrink-0" />
                  {wall.label}
                </span>
                <button
                  type="button"
                  onClick={() => onAttemptDeleteLockedWall(wall.label)}
                  aria-label={`Locked ${wall.label}`}
                  className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-bold text-slate-400 hover:text-[#FF2E63] cursor-pointer shrink-0"
                >
                  Locked
                </button>
              </div>
            ))}

            {customObstacles.map((obs, idx) => (
              <div
                key={obs.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0A0F2B]/70 px-2 py-1 text-[11px]"
              >
                <span className="truncate font-medium text-white">
                  #{idx + 1} {formatKindLabel(obs.kind, obs.wallAnchored)}{' '}
                  <span className="font-mono-tabular text-[10px] text-slate-400">
                    (y:{Math.round(obs.y)})
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDeleteCustomObstacle(obs.id)}
                  aria-label={`Delete obstacle ${idx + 1}`}
                  className="p-0.5 text-slate-300 hover:text-[#FF2E63] cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
