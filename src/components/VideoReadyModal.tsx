import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  Film,
  Mic,
  Music,
  Play,
  RotateCcw,
  Trophy,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  RaceStanding,
  RecordedVideoItem,
  VideoExportOptions,
  VideoQuality,
} from '../types/race';
import {
  buildRaceVideoFilename,
  computeShortClipStartSec,
  convertWebmToMp4,
  triggerBlobDownload,
} from '../game/videoRecording';
import { formatRaceTime } from '../game/raceLogic';

interface VideoReadyModalProps {
  open: boolean;
  recordedVideo: RecordedVideoItem | null;
  standings: RaceStanding[];
  modeSubtitle: string;
  exportOptions: VideoExportOptions;
  nextActionLabel?: string | null;
  championName?: string | null;
  onUpdateExportOptions: (updater: (prev: VideoExportOptions) => VideoExportOptions) => void;
  onSaveMp4Blob?: (videoId: string, mp4Blob: Blob) => void;
  onOpenPodium: () => void;
  onOpenMyVideos: () => void;
  onAdvanceMode?: () => void;
  onRaceAgainSameTrack: () => void;
  onClose: () => void;
}

export const VideoReadyModal: React.FC<VideoReadyModalProps> = ({
  open,
  recordedVideo,
  standings,
  modeSubtitle,
  exportOptions,
  nextActionLabel,
  championName,
  onUpdateExportOptions,
  onSaveMp4Blob,
  onOpenPodium,
  onOpenMyVideos,
  onAdvanceMode,
  onRaceAgainSameTrack,
  onClose,
}) => {
  const [convertingKind, setConvertingKind] = useState<'full' | 'short' | null>(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [showReplayPlayer, setShowReplayPlayer] = useState(false);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!recordedVideo || !showReplayPlayer) {
      setReplayUrl(null);
      return;
    }
    const blob = recordedVideo.mp4Blob ?? recordedVideo.webmBlob;
    const url = URL.createObjectURL(blob);
    setReplayUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [recordedVideo, showReplayPlayer]);

  useEffect(() => {
    setConversionError(null);
    setConversionProgress(0);
    setConvertingKind(null);
    setShowReplayPlayer(false);
  }, [recordedVideo?.id]);

  if (!open || !recordedVideo) return null;

  const first = standings[0];
  const muteExportAudio = !exportOptions.includeMusic && !exportOptions.includeCommentary;
  const fullMp4Name = buildRaceVideoFilename(
    recordedVideo.levelLabel,
    recordedVideo.winnerName,
    false,
    'mp4'
  );
  const shortMp4Name = buildRaceVideoFilename(
    recordedVideo.levelLabel,
    recordedVideo.winnerName,
    true,
    'mp4'
  );
  const fallbackWebmName = buildRaceVideoFilename(
    recordedVideo.levelLabel,
    recordedVideo.winnerName,
    false,
    'webm'
  );

  const handleDownloadMp4 = async (isShort: boolean) => {
    setConversionError(null);
    setConvertingKind(isShort ? 'short' : 'full');
    setConversionProgress(2);

    try {
      const startSec = isShort ? computeShortClipStartSec(recordedVideo.durationSec) : 0;

      // Reuse already-converted MP4 if full race & audio not muted & cached
      if (!isShort && !muteExportAudio && recordedVideo.mp4Blob) {
        setConversionProgress(100);
        triggerBlobDownload(recordedVideo.mp4Blob, fullMp4Name);
        setConvertingKind(null);
        return;
      }

      const mp4Blob = await convertWebmToMp4(recordedVideo.webmBlob, {
        startSec,
        muteAudio: muteExportAudio,
        onProgress: (pct) => setConversionProgress(pct),
      });

      if (!isShort && !muteExportAudio && onSaveMp4Blob) {
        onSaveMp4Blob(recordedVideo.id, mp4Blob);
      }

      triggerBlobDownload(mp4Blob, isShort ? shortMp4Name : fullMp4Name);
      setConvertingKind(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'MP4 conversion could not complete in this browser.';
      setConversionError(msg);
      setConvertingKind(null);
    }
  };

  const handleFallbackWebmDownload = () => {
    triggerBlobDownload(recordedVideo.webmBlob, fallbackWebmName);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Video Ready Screen"
      data-testid="video-ready-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040717]/92 p-3 sm:p-5 overflow-y-auto"
    >
      <div className="glass-panel animate-drop-bounce relative w-full max-w-3xl rounded-3xl border border-[#FFD700]/45 p-5 sm:p-7 shadow-[0_0_60px_rgba(255,215,0,0.24)] my-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Video Ready Screen"
          className="absolute top-4 right-4 rounded-xl bg-white/10 hover:bg-white/20 p-2 text-slate-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Banner */}
        <div className="text-center border-b border-white/10 pb-4">
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 px-3 py-1 text-xs font-extrabold text-emerald-300 tracking-wider">
            <Film className="w-4 h-4" />
            VIDEO READY · 16:9 {recordedVideo.quality} 30FPS
          </div>
          <h2 className="font-display text-2xl sm:text-4xl tracking-wide text-gold-3d mt-2">
            {championName
              ? `🏆 ${championName.toUpperCase()} IS CHAMPION!`
              : `🏆 ${first ? `${first.name.toUpperCase()} WINS!` : 'RACE VIDEO READY!'}`}
          </h2>
          <p className="text-xs font-semibold text-[#00D4FF] mt-1">
            {modeSubtitle} · Win Time {formatRaceTime(first?.finishTimeMs ?? null)} · Recorded{' '}
            {recordedVideo.durationSec.toFixed(1)}s (includes Countdown + 3s Podium)
          </p>
        </div>

        {/* Inline Replay Player OR Captured Podium Thumbnail */}
        <div className="mt-4 rounded-2xl overflow-hidden border border-[#00D4FF]/35 bg-[#050819]">
          {showReplayPlayer && replayUrl ? (
            <div className="relative">
              <video
                data-testid="full-replay-video"
                src={replayUrl}
                controls
                autoPlay
                playsInline
                className="w-full aspect-video bg-black"
              />
              <button
                type="button"
                onClick={() => setShowReplayPlayer(false)}
                className="absolute top-2.5 right-2.5 rounded-lg bg-black/75 hover:bg-black px-2.5 py-1 text-xs font-bold text-white cursor-pointer"
              >
                Close Replay
              </button>
            </div>
          ) : (
            <div className="relative aspect-video bg-[#050819] flex items-center justify-center overflow-hidden">
              {recordedVideo.thumbnailDataUrl && (
                <img
                  src={recordedVideo.thumbnailDataUrl}
                  alt={`${recordedVideo.winnerName} winner podium frame`}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#040717]/90 via-transparent to-black/30 flex flex-col justify-between p-3 sm:p-4">
                <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                  <span className="rounded bg-black/70 px-2 py-0.5 text-[#FFD700] font-bold">
                    {fullMp4Name}
                  </span>
                  <span className="rounded bg-black/70 px-2 py-0.5 text-[#00D4FF] font-bold">
                    16:9 · {recordedVideo.quality} · 30fps
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowReplayPlayer(true)}
                    className="btn-3d flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#00D4FF] to-blue-600 border-b-4 border-blue-950 text-[#050819] font-extrabold text-sm cursor-pointer shadow-[0_0_30px_rgba(0,212,255,0.5)]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Watch Full Replay
                  </button>
                </div>
                <div />
              </div>
            </div>
          )}
        </div>

        {/* Quality Selector & Video Audio Toggles */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl border border-white/10 bg-[#06091B]/80 p-3">
          {/* 720p / 1080p Selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[#00D4FF] uppercase">
              Video Quality
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['720p', '1080p'] as VideoQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() =>
                    onUpdateExportOptions((prev) => ({ ...prev, quality: q }))
                  }
                  className={`py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                    exportOptions.quality === q
                      ? 'bg-[#FFD700] text-[#050819]'
                      : 'bg-white/10 text-slate-200 hover:bg-white/15'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Include Commentary Voice Toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-300 uppercase">
              Include Commentary Voice in Video
            </span>
            <button
              type="button"
              data-testid="toggle-commentary-in-video"
              onClick={() =>
                onUpdateExportOptions((prev) => ({
                  ...prev,
                  includeCommentary: !prev.includeCommentary,
                }))
              }
              aria-pressed={exportOptions.includeCommentary}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                exportOptions.includeCommentary
                  ? 'bg-emerald-500 text-[#050819]'
                  : 'bg-white/10 text-slate-300'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              {exportOptions.includeCommentary ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Include Music Toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-300 uppercase">
              Include Music in Video
            </span>
            <button
              type="button"
              data-testid="toggle-music-in-video"
              onClick={() =>
                onUpdateExportOptions((prev) => ({
                  ...prev,
                  includeMusic: !prev.includeMusic,
                }))
              }
              aria-pressed={exportOptions.includeMusic}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                exportOptions.includeMusic
                  ? 'bg-[#FFD700] text-[#050819]'
                  : 'bg-white/10 text-slate-300'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              {exportOptions.includeMusic ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* MP4 Conversion Progress Bar */}
        {convertingKind && (
          <div
            data-testid="mp4-conversion-progress"
            className="mt-3 rounded-xl border border-[#FFD700]/40 bg-[#0A0F2B] p-3"
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-[#FFD700]">
                Converting to MP4... {conversionProgress}%
              </span>
              <span className="font-mono-tabular text-[#00D4FF]">
                {convertingKind === 'short' ? 'Short 30s Clip' : 'Full Race'}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#050819] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00D4FF] via-[#FFD700] to-[#FF2E63] transition-all duration-150"
                style={{ width: `${conversionProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Fallback to WebM if MP4 conversion fails */}
        {conversionError && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-[#FF2E63]/55 bg-[#FF2E63]/12 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-[#FF2E63] shrink-0 mt-0.5" />
              <span>MP4 converter unavailable ({conversionError}).</span>
            </div>
            <button
              type="button"
              data-testid="fallback-webm-btn"
              onClick={handleFallbackWebmDownload}
              className="btn-3d shrink-0 px-3.5 py-2 rounded-xl bg-gradient-to-b from-[#00D4FF] to-blue-600 border-b-4 border-blue-950 text-[#050819] font-extrabold text-xs whitespace-nowrap cursor-pointer"
            >
              Download as WebM (Also works on YouTube)
            </button>
          </div>
        )}

        {/* 3 Primary Required Video Ready Action Options */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={convertingKind !== null}
            onClick={() => handleDownloadMp4(false)}
            className="btn-3d flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-400 via-lime-400 to-[#FFD700] border-b-4 border-emerald-900 text-[#050819] font-extrabold text-xs sm:text-sm cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4 shrink-0" />
            Download Full Race MP4
          </button>

          <button
            type="button"
            disabled={convertingKind !== null}
            onClick={() => handleDownloadMp4(true)}
            className="btn-3d flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-b from-[#FF2E63] to-rose-700 border-b-4 border-rose-950 text-white font-extrabold text-xs sm:text-sm cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4 shrink-0" />
            Download Short Clip (Last 30 Sec)
          </button>

          <button
            type="button"
            onClick={() => setShowReplayPlayer((prev) => !prev)}
            className="btn-3d flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-b from-[#00D4FF] to-blue-700 border-b-4 border-blue-950 text-[#050819] font-extrabold text-xs sm:text-sm cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            Watch Full Replay
          </button>
        </div>

        {/* Navigation / Progression Footer */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenPodium}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-[#FFD700]" />
              View Winner Podium &amp; Standings
            </button>

            <button
              type="button"
              onClick={onOpenMyVideos}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-[#00D4FF] cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              My Videos Gallery
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRaceAgainSameTrack}
              className="btn-3d flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 border-b-4 border-amber-900 text-[#050819] font-bold text-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Race Again
            </button>

            {nextActionLabel && onAdvanceMode && (
              <button
                type="button"
                onClick={onAdvanceMode}
                className="btn-3d flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-[#FFD700] border-b-4 border-emerald-900 text-[#050819] font-bold text-xs cursor-pointer"
              >
                {nextActionLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
