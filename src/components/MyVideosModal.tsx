import React, { useEffect, useState } from 'react';
import { Download, Film, Play, Trash2, X } from 'lucide-react';
import { RecordedVideoItem } from '../types/race';
import {
  buildRaceVideoFilename,
  convertWebmToMp4,
  triggerBlobDownload,
} from '../game/videoRecording';

interface MyVideosModalProps {
  open: boolean;
  videos: RecordedVideoItem[];
  onDeleteVideo: (id: string) => void;
  onSaveMp4Blob: (id: string, mp4Blob: Blob) => void;
  onClose: () => void;
}

export const MyVideosModal: React.FC<MyVideosModalProps> = ({
  open,
  videos,
  onDeleteVideo,
  onSaveMp4Blob,
  onClose,
}) => {
  const [activeReplayItem, setActiveReplayItem] = useState<RecordedVideoItem | null>(null);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeReplayItem) {
      setReplayUrl(null);
      return;
    }
    const blob = activeReplayItem.mp4Blob ?? activeReplayItem.webmBlob;
    const url = URL.createObjectURL(blob);
    setReplayUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeReplayItem]);

  useEffect(() => {
    if (!open) {
      setActiveReplayItem(null);
    }
  }, [open]);

  if (!open) return null;

  const handleDownloadAgain = async (item: RecordedVideoItem) => {
    setFailedId(null);
    if (item.mp4Blob) {
      triggerBlobDownload(item.mp4Blob, item.filename);
      return;
    }
    setConvertingId(item.id);
    setProgressPct(5);
    try {
      const mp4 = await convertWebmToMp4(item.webmBlob, {
        onProgress: (pct) => setProgressPct(pct),
      });
      onSaveMp4Blob(item.id, mp4);
      triggerBlobDownload(mp4, item.filename);
      setConvertingId(null);
    } catch {
      setConvertingId(null);
      setFailedId(item.id);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="My Videos Gallery"
      data-testid="my-videos-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040717]/92 p-3 sm:p-5 overflow-y-auto"
    >
      <div className="glass-panel relative w-full max-w-4xl rounded-3xl border border-[#00D4FF]/40 p-4 sm:p-6 shadow-[0_0_50px_rgba(0,212,255,0.22)] my-auto max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <Film className="w-6 h-6 text-[#00D4FF]" />
            <div>
              <h2 className="font-display text-xl sm:text-2xl tracking-wide text-gold-3d">
                MY VIDEOS GALLERY ({videos.length})
              </h2>
              <p className="text-xs text-slate-300">
                Saved locally in your browser (IndexedDB) — replay or download anytime
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close My Videos Gallery"
            className="rounded-xl bg-white/10 hover:bg-white/20 p-2 text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inline Video Player when watching a saved race */}
        {activeReplayItem && replayUrl && (
          <div className="mt-3.5 rounded-2xl border border-[#FFD700]/45 bg-black overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-3 py-2 bg-[#0A0F2B] border-b border-white/10">
              <span className="text-xs font-bold text-[#FFD700] truncate">
                Playing: {activeReplayItem.winnerName} · Level {activeReplayItem.levelLabel}
              </span>
              <button
                type="button"
                onClick={() => setActiveReplayItem(null)}
                className="text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                Close Player
              </button>
            </div>
            <video
              src={replayUrl}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[300px] bg-black"
            />
          </div>
        )}

        {/* Gallery Grid */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {videos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#06091B]/65 p-10 text-center">
              <Film className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="font-display text-base text-white">NO RECORDED RACES YET</p>
              <p className="text-xs text-slate-300 mt-1">
                Press START RACE to automatically record the full race in 16:9 30fps!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {videos.map((item) => {
                const isConverting = convertingId === item.id;
                const showFallback = failedId === item.id;
                const webmFilename = buildRaceVideoFilename(
                  item.levelLabel,
                  item.winnerName,
                  false,
                  'webm'
                );

                return (
                  <article
                    key={item.id}
                    data-testid={`saved-video-card-${item.id}`}
                    className="rounded-2xl border border-white/12 bg-[#06091B]/85 overflow-hidden flex flex-col"
                  >
                    <div className="relative aspect-video bg-[#040717]">
                      {item.thumbnailDataUrl && (
                        <img
                          src={item.thumbnailDataUrl}
                          alt={`${item.winnerName} win thumbnail`}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute top-2 left-2 rounded-lg bg-black/75 px-2 py-0.5 text-[10px] font-bold text-[#FFD700]">
                        🏆 {item.winnerName}
                      </div>
                      <div className="absolute top-2 right-2 rounded-lg bg-black/75 px-2 py-0.5 font-mono-tabular text-[10px] font-bold text-[#00D4FF]">
                        {item.quality} · {item.durationSec.toFixed(1)}s
                      </div>
                    </div>

                    <div className="p-3 flex flex-col gap-2">
                      <div>
                        <p className="text-xs font-extrabold text-white truncate">
                          Level {item.levelLabel} · {item.difficulty}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>

                      {isConverting && (
                        <p className="text-[11px] font-bold text-[#FFD700]">
                          Converting to MP4... {progressPct}%
                        </p>
                      )}

                      {showFallback && (
                        <button
                          type="button"
                          onClick={() => triggerBlobDownload(item.webmBlob, webmFilename)}
                          className="w-full py-1.5 px-2 rounded-lg bg-[#00D4FF] text-[#050819] text-xs font-extrabold cursor-pointer"
                        >
                          Download as WebM (Also works on YouTube)
                        </button>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveReplayItem(item)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Watch
                        </button>

                        <button
                          type="button"
                          disabled={isConverting}
                          onClick={() => handleDownloadAgain(item)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-[#FFD700] text-[#050819] text-xs font-extrabold cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download again
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteVideo(item.id)}
                          aria-label={`Delete video ${item.filename}`}
                          className="p-1.5 rounded-xl bg-[#FF2E63]/15 hover:bg-[#FF2E63]/35 text-[#FF2E63] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
