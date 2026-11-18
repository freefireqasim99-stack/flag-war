import React, { useState } from 'react';
import { RotateCcw, Download, Share2, Check, ArrowRight, Film } from 'lucide-react';
import { CountryBall, Difficulty, GameMode, RaceStanding } from '../types/race';
import { FlagAvatar } from './FlagAvatar';
import { formatRaceTime } from '../game/raceLogic';
import { downloadWinnerPodiumImage } from '../game/winnerImage';

interface PodiumModalProps {
  standings: RaceStanding[];
  balls: CountryBall[];
  difficulty: Difficulty;
  gameMode: GameMode;
  levelNumber: number;
  modeSubtitle: string;
  nextActionLabel?: string | null;
  championName?: string | null;
  hasRecordedVideo?: boolean;
  onOpenVideoReady?: () => void;
  onAdvanceMode?: () => void;
  onRaceAgainSameTrack: () => void;
  onNewRandomTrack: () => void;
  onBackToLobby: () => void;
}

export const PodiumModal: React.FC<PodiumModalProps> = ({
  standings,
  balls,
  difficulty,
  gameMode,
  modeSubtitle,
  nextActionLabel,
  championName,
  hasRecordedVideo = false,
  onOpenVideoReady,
  onAdvanceMode,
  onRaceAgainSameTrack,
  onNewRandomTrack,
  onBackToLobby,
}) => {
  const [copied, setCopied] = useState(false);
  const ballMap = new Map(balls.map((b) => [b.id, b]));
  const first = standings[0];
  const second = standings[1];
  const third = standings[2];
  const winnerBall = first ? ballMap.get(first.id) : undefined;

  const handleShareWinner = async () => {
    const summary = `🏆 ${first?.name.toUpperCase() ?? 'CHAMPION'} WINS the Flag Ball Race (${modeSubtitle}) in ${formatRaceTime(
      first?.finishTimeMs ?? null
    )}! #1 ${first?.name ?? ''} · #2 ${second?.name ?? ''} · #3 ${third?.name ?? ''}`;
    try {
      await navigator.clipboard?.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      downloadWinnerPodiumImage(standings, balls, difficulty);
    }
  };

  const renderPodiumStep = (
    standing: RaceStanding | undefined,
    place: 1 | 2 | 3,
    pedestalHeight: string,
    blockGradient: string,
    topRim: string,
    label: string
  ) => {
    if (!standing) return null;
    const ball = ballMap.get(standing.id);
    if (!ball) return null;

    return (
      <div className="flex flex-col items-center justify-end gap-2">
        <div className="flex flex-col items-center gap-1.5 relative">
          {place === 1 && (
            <span
              aria-hidden="true"
              className="text-3xl sm:text-4xl animate-float-ball drop-shadow-[0_0_12px_rgba(255,215,0,0.85)]"
            >
              👑
            </span>
          )}
          <div
            className={`rounded-full ${
              place === 1
                ? 'p-1.5 bg-gradient-to-tr from-[#FFD700] via-white to-[#FF2E63] shadow-[0_0_34px_rgba(255,215,0,0.85)]'
                : ''
            }`}
          >
            <div className={place === 1 ? 'animate-spin-slow' : ''}>
              <FlagAvatar ball={ball} size={place === 1 ? 82 : place === 2 ? 60 : 54} />
            </div>
          </div>
          <span className="text-sm sm:text-base font-extrabold text-white text-center max-w-[130px] truncate mt-1">
            {ball.emoji} {standing.name}
          </span>
          <span className="font-mono-tabular text-xs font-bold text-[#FFD700]">
            {formatRaceTime(standing.finishTimeMs)}
          </span>
        </div>

        {/* 3D Perspective Podium Pedestal */}
        <div
          className={`w-28 sm:w-36 ${pedestalHeight} rounded-t-xl border-t-4 ${topRim} ${blockGradient} shadow-[0_14px_30px_rgba(0,0,0,0.65)] flex flex-col items-center justify-start pt-3`}
        >
          <span className="font-display text-2xl sm:text-3xl tracking-wider text-white drop-shadow">
            {label}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Championship Podium and Final Results"
      data-testid="podium-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040717]/92 p-3 sm:p-4 overflow-y-auto"
    >
      {/* Top Stadium Spotlights + Fireworks Backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-24 left-1/4 w-96 h-[520px] opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(255, 215, 0, 0.55), transparent 70%)',
          }}
        />
        <div
          className="absolute -top-24 right-1/4 w-96 h-[520px] opacity-35"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(0, 212, 255, 0.5), transparent 70%)',
          }}
        />
      </div>

      <div className="glass-panel animate-drop-bounce relative w-full max-w-4xl rounded-3xl border border-[#FFD700]/40 p-5 sm:p-7 shadow-[0_0_60px_rgba(255,215,0,0.22)] my-auto">
        {/* Huge Golden 3D Winner Headline */}
        <div className="text-center border-b border-white/10 pb-4">
          <p className="font-mono-tabular text-xs font-bold uppercase tracking-widest text-[#00D4FF]">
            {modeSubtitle}
          </p>
          <h2 className="font-display text-3xl sm:text-5xl tracking-wide text-gold-3d mt-1">
            {championName
              ? `🏆 ${championName.toUpperCase()} IS CHAMPION! 🏆`
              : `🏆 ${first ? `${first.name.toUpperCase()} WINS!` : 'RACE COMPLETE!'} 🏆`}
          </h2>
        </div>

        {/* 3D Podium: 2nd Left (Silver), 1st Center (Gold), 3rd Right (Bronze) */}
        <div className="flex items-end justify-center gap-3 sm:gap-6 pt-6 pb-6 border-b border-white/10">
          {renderPodiumStep(
            second,
            2,
            'h-24 sm:h-28',
            'bg-gradient-to-b from-slate-400/35 via-slate-600/45 to-[#0A0F2B]',
            'border-slate-200',
            '2ND'
          )}
          {renderPodiumStep(
            first,
            1,
            'h-32 sm:h-36',
            'bg-gradient-to-b from-[#FFD700]/45 via-amber-600/40 to-[#0A0F2B]',
            'border-[#FFD700]',
            '1ST'
          )}
          {renderPodiumStep(
            third,
            3,
            'h-20 sm:h-24',
            'bg-gradient-to-b from-amber-600/40 via-amber-800/45 to-[#0A0F2B]',
            'border-amber-500',
            '3RD'
          )}
        </div>

        {/* Split: Final Standings Table + Viral YouTube Thumbnail Share Card */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_290px] gap-4">
          <div>
            <h3 className="font-display text-sm tracking-wide text-white mb-2">
              Full Final Standings (Fair Path &amp; Checkpoint Check)
            </h3>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#06091B]/85">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#10183D] text-xs text-[#00D4FF] border-b border-white/10">
                  <tr>
                    <th className="py-2 px-3 font-bold">Pos</th>
                    <th className="py-2 px-3 font-bold">Flag</th>
                    <th className="py-2 px-3 font-bold">Country</th>
                    <th className="py-2 px-3 font-bold text-center">CP · Obs%</th>
                    <th className="py-2 px-3 font-bold text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {standings.map((row) => {
                    const ball = ballMap.get(row.id);
                    const obsPct =
                      row.totalObstacles > 0
                        ? Math.min(100, Math.round((row.touchedObstacles / row.totalObstacles) * 100))
                        : 100;
                    return (
                      <tr key={row.id} className={row.rank === 1 ? 'bg-[#FFD700]/12' : ''}>
                        <td className="py-2 px-3 font-mono-tabular font-extrabold text-white">
                          #{row.rank}
                        </td>
                        <td className="py-2 px-3">
                          {ball && <FlagAvatar ball={ball} size={26} />}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">
                          {ball?.emoji} {row.name}
                        </td>
                        <td className="py-2 px-3 font-mono-tabular text-xs text-center">
                          <span className="text-[#00D4FF]">
                            {row.checkpoint}/{row.totalCheckpoints}
                          </span>{' '}
                          ·{' '}
                          <span className={row.validWinner ? 'text-emerald-400 font-bold' : 'text-[#FF2E63] font-bold'}>
                            {obsPct}%
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono-tabular font-bold text-right text-[#FFD700]">
                          {formatRaceTime(row.finishTimeMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* YouTube Thumbnail-Style Share Winner Card */}
          <div className="rounded-2xl border border-[#FF2E63]/50 bg-gradient-to-br from-[#1B124A] via-[#0A0F2B] to-[#2B0920] p-3.5 flex flex-col justify-between shadow-[0_0_24px_rgba(255,46,99,0.25)]">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#FF2E63] uppercase tracking-wider">YouTube Share Card</span>
              <span className="font-mono-tabular text-[#FFD700]">{balls.length} NATIONS</span>
            </div>

            <div className="my-3 flex items-center justify-center gap-3">
              {winnerBall && <FlagAvatar ball={winnerBall} size={56} />}
              <div className="text-left min-w-0">
                <p className="font-display text-lg leading-tight text-gold-3d truncate">
                  {first?.name.toUpperCase()}
                </p>
                <p className="text-xs font-bold text-white">
                  {championName ? 'TOURNAMENT CHAMPION' : 'WINNER'} ·{' '}
                  {formatRaceTime(first?.finishTimeMs ?? null)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShareWinner}
              className="btn-3d flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl bg-gradient-to-b from-[#FF2E63] to-rose-700 border-b-4 border-rose-950 text-xs font-bold text-white cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copied Winner Card!' : 'Share Winner'}
            </button>
          </div>
        </div>

        {/* 3D Arcade Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {nextActionLabel && onAdvanceMode && (
            <button
              type="button"
              data-start="true"
              onClick={onAdvanceMode}
              className="btn-3d flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-lime-400 to-[#FFD700] border-b-4 border-emerald-800 text-[#0A0F2B] font-bold text-sm whitespace-nowrap cursor-pointer shadow-[0_6px_22px_rgba(16,185,129,0.4)]"
            >
              <span>{nextActionLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onRaceAgainSameTrack}
            className="btn-3d flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 border-b-4 border-amber-900 text-[#0A0F2B] font-bold text-sm whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Race Again
          </button>

          {gameMode !== 'builder' && gameMode !== 'levels' && (
            <button
              type="button"
              onClick={onNewRandomTrack}
              className="btn-3d flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-purple-500 to-indigo-800 border-b-4 border-purple-950 text-white font-bold text-sm whitespace-nowrap cursor-pointer shadow-[0_6px_22px_rgba(168,85,247,0.4)]"
            >
              <span aria-hidden="true">🎲</span>
              New Random Track
            </button>
          )}

          {hasRecordedVideo && onOpenVideoReady && (
            <button
              type="button"
              onClick={onOpenVideoReady}
              className="btn-3d flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF2E63] to-purple-600 border-b-4 border-rose-950 text-white font-bold text-sm whitespace-nowrap cursor-pointer shadow-[0_6px_22px_rgba(255,46,99,0.4)]"
            >
              <Film className="w-4 h-4" />
              Video Ready (MP4)
            </button>
          )}

          <button
            type="button"
            onClick={() => downloadWinnerPodiumImage(standings, balls, difficulty)}
            className="btn-3d flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#00D4FF] to-blue-700 border-b-4 border-blue-950 text-[#050819] font-bold text-sm whitespace-nowrap cursor-pointer shadow-[0_6px_22px_rgba(0,212,255,0.35)]"
          >
            <Download className="w-4 h-4" />
            Download Image
          </button>

          <button
            type="button"
            onClick={onBackToLobby}
            className="btn-3d px-4 py-2.5 rounded-xl bg-gradient-to-b from-orange-400 to-orange-600 border-b-4 border-orange-900 text-[#0A0F2B] font-bold text-sm whitespace-nowrap cursor-pointer"
          >
            Edit Flags &amp; Setup
          </button>
        </div>
      </div>
    </div>
  );
};
