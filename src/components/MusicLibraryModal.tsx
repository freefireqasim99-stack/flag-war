import React, { useEffect, useState } from 'react';
import {
  Check,
  Music,
  Play,
  Shuffle,
  Square,
  Volume2,
  VolumeX,
  X,
  ShieldCheck,
} from 'lucide-react';
import { AudioSettings, MusicCategoryId } from '../types/race';
import {
  getTrackById,
  getTracksByCategory,
  MUSIC_CATEGORIES,
  MUSIC_TRACKS,
  pickRandomTrendingTrack,
} from '../game/musicLibrary';
import { audioEngine } from '../game/audioEngine';

interface MusicLibraryModalProps {
  open: boolean;
  audioSettings: AudioSettings;
  onUpdateAudioSettings: (updater: (prev: AudioSettings) => AudioSettings) => void;
  onClose: () => void;
}

export const MusicLibraryModal: React.FC<MusicLibraryModalProps> = ({
  open,
  audioSettings,
  onUpdateAudioSettings,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<MusicCategoryId | 'all'>('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open && previewingId) {
      audioEngine.stopPreview();
      setPreviewingId(null);
    }
  }, [open, previewingId]);

  if (!open) return null;

  const selectedTrack = getTrackById(audioSettings.selectedTrackId);

  const handleTogglePreview = (trackId: string) => {
    audioEngine.unlock();
    if (previewingId === trackId) {
      audioEngine.stopPreview();
      setPreviewingId(null);
    } else {
      audioEngine.previewTrack(trackId);
      setPreviewingId(trackId);
    }
  };

  const handleUseTrack = (trackId: string) => {
    audioEngine.unlock();
    audioEngine.stopPreview();
    setPreviewingId(null);
    onUpdateAudioSettings((prev) => ({
      ...prev,
      musicEnabled: true,
      autoPickTrending: false,
      selectedTrackId: trackId,
    }));
  };

  const handleNoMusic = () => {
    audioEngine.stopPreview();
    setPreviewingId(null);
    onUpdateAudioSettings((prev) => ({
      ...prev,
      musicEnabled: false,
      autoPickTrending: false,
      selectedTrackId: 'none',
    }));
  };

  const handleAutoPickTrending = () => {
    audioEngine.unlock();
    const picked = pickRandomTrendingTrack(
      audioSettings.selectedTrackId === 'none' ? undefined : audioSettings.selectedTrackId
    );
    onUpdateAudioSettings((prev) => ({
      ...prev,
      musicEnabled: true,
      autoPickTrending: !prev.autoPickTrending ? true : true,
      selectedTrackId: picked.id,
    }));
    audioEngine.previewTrack(picked.id);
    setPreviewingId(picked.id);
  };

  const categoriesToRender =
    activeCategory === 'all'
      ? MUSIC_CATEGORIES
      : MUSIC_CATEGORIES.filter((c) => c.id === activeCategory);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trending Music Library"
      data-testid="music-library-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040717]/90 p-3 sm:p-5 overflow-y-auto"
    >
      <div className="glass-panel relative w-full max-w-4xl rounded-3xl border border-[#00D4FF]/40 p-4 sm:p-6 shadow-[0_0_50px_rgba(0,212,255,0.22)] my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <Music className="w-6 h-6 text-[#FFD700]" />
              <h2 className="font-display text-xl sm:text-2xl tracking-wide text-gold-3d">
                MUSIC LIBRARY ({MUSIC_TRACKS.length} BUILT-IN TRACKS)
              </h2>
            </div>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 px-2.5 py-1 text-xs font-bold text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              All music is Copyright-Free - Safe for YouTube Monetization ✅
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              audioEngine.stopPreview();
              setPreviewingId(null);
              onClose();
            }}
            aria-label="Close Music Library"
            className="rounded-xl bg-white/10 hover:bg-white/20 p-2 text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Quick Controls + Separate Volume Sliders */}
        <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-white/10 pb-3.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="auto-pick-trending-btn"
              onClick={handleAutoPickTrending}
              className={`btn-3d flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-b-4 text-xs font-bold whitespace-nowrap cursor-pointer ${
                audioSettings.autoPickTrending
                  ? 'bg-gradient-to-r from-[#FF2E63] to-[#FFD700] border-rose-950 text-[#050819]'
                  : 'bg-gradient-to-b from-[#00D4FF] to-blue-600 border-blue-900 text-[#050819]'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              Auto-Pick Trending Music
              {audioSettings.autoPickTrending && ' (ON)'}
            </button>

            <button
              type="button"
              data-testid="no-music-btn"
              onClick={handleNoMusic}
              className={`btn-3d flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-b-4 text-xs font-bold whitespace-nowrap cursor-pointer ${
                !audioSettings.musicEnabled || audioSettings.selectedTrackId === 'none'
                  ? 'bg-[#FF2E63] border-rose-950 text-white'
                  : 'bg-white/10 hover:bg-white/15 border-slate-900 text-slate-200'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5" />
              No Music
            </button>

            <span className="text-xs font-semibold text-slate-300 ml-1">
              Active:{' '}
              <strong className="text-[#FFD700]">
                {!audioSettings.musicEnabled || !selectedTrack ? 'No Music' : selectedTrack.title}
              </strong>
            </span>
          </div>

          {/* Separate Music Volume & SFX Volume Sliders */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#06091B]/80 border border-white/10 px-3 py-2">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#FFD700]">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Music className="w-3 h-3" /> Music Volume
                </span>
                <span className="font-mono-tabular">
                  {Math.round(audioSettings.musicVolume * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioSettings.musicVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onUpdateAudioSettings((prev) => ({
                    ...prev,
                    musicVolume: val,
                    muted: false,
                  }));
                }}
                aria-label="Music Volume"
                className="w-full accent-[#FFD700] cursor-pointer"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#00D4FF]">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> SFX Volume
                </span>
                <span className="font-mono-tabular">
                  {Math.round(audioSettings.sfxVolume * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioSettings.sfxVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onUpdateAudioSettings((prev) => ({
                    ...prev,
                    sfxVolume: val,
                    volume: val,
                    muted: false,
                  }));
                }}
                aria-label="Sound Effects Volume"
                className="w-full accent-[#00D4FF] cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="mt-3 flex flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-[#FFD700] text-[#050819]'
                : 'bg-white/8 text-slate-200 hover:bg-white/15'
            }`}
          >
            All 5 Categories (20)
          </button>
          {MUSIC_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-[#00D4FF] text-[#050819]'
                  : 'bg-white/8 text-slate-200 hover:bg-white/15'
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>

        {/* Scrollable Track Grid across Categories */}
        <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-4">
          {categoriesToRender.map((category) => {
            const tracks = getTracksByCategory(category.id);
            return (
              <section
                key={category.id}
                className="rounded-2xl border border-white/10 bg-[#06091B]/75 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div>
                    <h3 className="font-display text-sm sm:text-base tracking-wide text-white">
                      {category.title}
                    </h3>
                    <p className="text-[11px] text-slate-300">{category.subtitle}</p>
                  </div>
                  <span className="font-mono-tabular text-[11px] font-bold text-[#00D4FF]">
                    {tracks.length} tracks
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {tracks.map((track) => {
                    const isPreviewing = previewingId === track.id;
                    const isSelected =
                      audioSettings.musicEnabled && audioSettings.selectedTrackId === track.id;
                    return (
                      <div
                        key={track.id}
                        data-testid={`music-track-${track.id}`}
                        className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'border-[#FFD700] bg-[#FFD700]/12'
                            : 'border-white/10 bg-[#0D1535]/75 hover:border-[#00D4FF]/45'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: track.accentColor }}
                            />
                            <p className="font-bold text-xs sm:text-sm text-white truncate">
                              {track.title}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">
                            {track.description}
                          </p>
                          <p className="font-mono-tabular text-[10px] text-[#00D4FF] mt-0.5">
                            {track.bpm} BPM · {track.energy} Energy
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTogglePreview(track.id)}
                            aria-label={isPreviewing ? `Stop ${track.title}` : `Play ${track.title}`}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                              isPreviewing
                                ? 'bg-[#FF2E63] text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                          >
                            {isPreviewing ? (
                              <>
                                <Square className="w-3 h-3 fill-current" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" />
                                Play
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUseTrack(track.id)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#FFD700] text-[#050819]'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            {isSelected ? 'Selected' : 'Use This Track'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
