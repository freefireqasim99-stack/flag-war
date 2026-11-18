import React from 'react';
import { CountryBall, RaceStanding } from '../types/race';
import { FlagAvatar } from './FlagAvatar';
import { formatRaceTime } from '../game/raceLogic';

interface LeaderboardPanelProps {
  standings: RaceStanding[];
  balls: CountryBall[];
  compact?: boolean;
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  standings,
  balls,
  compact = false,
}) => {
  const ballMap = new Map(balls.map((b) => [b.id, b]));

  return (
    <aside
      aria-label="Live race leaderboard"
      data-testid="live-leaderboard"
      className={`glass-panel flex flex-col rounded-2xl ${
        compact ? 'p-3 gap-2 h-full' : 'p-3.5 sm:p-4 gap-3 lg:h-full'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <h2
          className={`font-display tracking-wide text-electric-gradient whitespace-nowrap ${
            compact ? 'text-sm' : 'text-base'
          }`}
        >
          Live Standings
        </h2>
        <span className="font-mono-tabular text-[11px] font-semibold text-[#FFD700] whitespace-nowrap">
          {standings.filter((s) => s.finished).length}/{standings.length} FINISHED
        </span>
      </div>

      {/* Horizontal scroll strip on mobile, vertical broadcast stack on lg+ */}
      <div
        className={
          compact
            ? 'flex flex-col gap-1.5 overflow-y-auto pr-1 flex-1'
            : 'flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto pb-1 lg:pb-0 lg:pr-1 flex-1 snap-x'
        }
      >
        {standings.map((item) => {
          const ball = ballMap.get(item.id);
          if (!ball) return null;

          const isFirst = item.rank === 1;
          const isSecond = item.rank === 2;
          const isThird = item.rank === 3;

          const cardStyle = isFirst
            ? 'border-[#FFD700]/80 bg-gradient-to-r from-[#FFD700]/25 via-amber-500/15 to-[#0A0F2B]/90 animate-pulse-gold'
            : isSecond
            ? 'border-slate-300/60 bg-gradient-to-r from-slate-300/15 to-[#0A0F2B]/85'
            : isThird
            ? 'border-amber-600/60 bg-gradient-to-r from-amber-700/20 to-[#0A0F2B]/85'
            : 'border-white/10 bg-[#0A0F2B]/70';

          const rankBadgeStyle = isFirst
            ? 'bg-gradient-to-b from-[#FFF3B0] to-[#FFD700] text-[#0A0F2B]'
            : isSecond
            ? 'bg-gradient-to-b from-white to-slate-400 text-[#0A0F2B]'
            : isThird
            ? 'bg-gradient-to-b from-amber-500 to-amber-800 text-white'
            : 'bg-slate-800/90 text-slate-200';

          const speedPct = Math.min(100, Math.round((item.speed / 280) * 100));

          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all duration-200 shrink-0 snap-start ${
                compact ? 'w-full' : 'w-[225px] lg:w-full'
              } ${cardStyle}`}
            >
              <span
                className={`font-mono-tabular w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 shadow ${rankBadgeStyle}`}
              >
                {item.rank}
              </span>

              <FlagAvatar ball={ball} size={compact ? 26 : 30} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-xs font-bold text-white">
                    {isFirst && (
                      <span aria-hidden="true" className="mr-1">
                        👑
                      </span>
                    )}
                    {item.name}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.rankDelta > 0 && (
                      <span
                        className="font-mono-tabular text-[11px] font-extrabold text-emerald-400"
                        aria-label={`Moved up ${item.rankDelta}`}
                      >
                        ↑
                      </span>
                    )}
                    {item.rankDelta < 0 && (
                      <span
                        className="font-mono-tabular text-[11px] font-extrabold text-[#FF2E63]"
                        aria-label={`Dropped ${Math.abs(item.rankDelta)}`}
                      >
                        ↓
                      </span>
                    )}
                    <span className="font-mono-tabular text-[11px] font-bold text-[#FFD700]">
                      {item.finished ? formatRaceTime(item.finishTimeMs) : `${item.progress}%`}
                    </span>
                  </div>
                </div>

                {/* Speed Meter + Progress + Checkpoint */}
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-black/50 overflow-hidden border border-white/5">
                    <div
                      className={`h-full rounded-full transition-all duration-150 ${
                        item.finished
                          ? 'bg-emerald-400'
                          : isFirst
                          ? 'bg-gradient-to-r from-[#FFD700] to-amber-300'
                          : 'bg-gradient-to-r from-[#00D4FF] to-sky-300'
                      }`}
                      style={{ width: `${item.finished ? 100 : Math.max(item.progress, speedPct * 0.6)}%` }}
                    />
                  </div>
                  <span className="font-mono-tabular text-[10px] font-semibold text-[#00D4FF] w-14 text-right shrink-0">
                    {item.finished ? 'DONE' : `${item.speed} km/h`}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono-tabular">
                  <span className="text-slate-300 font-semibold">
                    {compact ? 'CP' : 'Checkpoint'} {item.checkpoint}/{item.totalCheckpoints}
                  </span>
                  {item.finished && (
                    <span className={item.validWinner ? 'text-emerald-400 font-bold' : 'text-[#FF2E63] font-bold'}>
                      {item.validWinner ? 'VALID' : 'SKIPPED'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
