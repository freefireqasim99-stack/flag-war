import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Volume2,
  VolumeX,
  Music,
  Video,
  Film,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import {
  AudioSettings,
  CountryBall,
  Difficulty,
  EliminationState,
  GameMode,
  GameState,
  ObstacleDef,
  RaceStanding,
  RecordedVideoItem,
  TournamentState,
  TrackData,
  VideoExportOptions,
} from './types/race';
import { createDefaultCountryBalls, deriveCountryCode } from './game/flags';
import {
  buildCustomTrack,
  createSealedFunnel,
  createStarterCustomObstacles,
  createWallAnchoredSnakeRamp,
  generateTrack,
  getLevelMeta,
  LEFT_WALL_X,
  RIGHT_WALL_X,
  TOTAL_LEVELS,
  TRACK_WIDTH,
} from './game/levelGenerator';
import {
  advanceEliminationRound,
  advanceTournamentHeat,
  buildInitialStandings,
  canRemoveBall,
  createEliminationState,
  createTournamentState,
  formatRaceClock,
  MAX_BALLS,
} from './game/raceLogic';
import { audioEngine } from './game/audioEngine';
import {
  DEFAULT_TRACK_ID,
  getTrackById,
  pickRandomTrendingTrack,
} from './game/musicLibrary';
import {
  deleteRecordedVideo,
  formatLevelSlugForFilename,
  listRecordedVideos,
  saveRecordedVideo,
} from './game/videoRecording';
import { RaceCanvas } from './components/RaceCanvas';
import { LobbyPanel } from './components/LobbyPanel';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { PodiumModal } from './components/PodiumModal';
import { MusicLibraryModal } from './components/MusicLibraryModal';
import { VideoReadyModal } from './components/VideoReadyModal';
import { MyVideosModal } from './components/MyVideosModal';
import { BuilderToolKind } from './components/ModeBuilderControls';

function createBuilderObstacle(
  tool: BuilderToolKind,
  trackX: number,
  trackY: number
): ObstacleDef {
  const safeY = Math.round(Math.max(240, Math.min(1820, trackY)));
  const safeX = Math.round(Math.max(LEFT_WALL_X + 125, Math.min(RIGHT_WALL_X - 125, trackX)));
  const uid = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  switch (tool) {
    case 'zigzag-left':
      return createWallAnchoredSnakeRamp(uid, 'left', safeY, 136, 0.25);
    case 'zigzag-right':
      return createWallAnchoredSnakeRamp(uid, 'right', safeY, 136, 0.25);
    case 'funnel':
      return createSealedFunnel(uid, safeY, 116);
    case 'spinner':
      return {
        id: uid,
        kind: 'spinner',
        x: safeX,
        y: safeY,
        width: 220,
        height: 18,
        speed: 0.036,
        direction: 1,
        color: '#FFD700',
      };
    case 'bouncyPad':
      return {
        id: uid,
        kind: 'bouncyPad',
        x: safeX,
        y: safeY,
        width: 220,
        height: 18,
        angle: 0.14,
        color: '#39FF14',
      };
    case 'bumper':
      return {
        id: uid,
        kind: 'bumper',
        x: safeX,
        y: safeY,
        radius: 26,
        gap: 112,
        color: '#FF2E63',
      };
    case 'movingPlatform':
      return {
        id: uid,
        kind: 'movingPlatform',
        x: TRACK_WIDTH / 2,
        y: safeY,
        width: 210,
        height: 20,
        range: 110,
        speed: 0.032,
        direction: 1,
        color: '#38BDF8',
      };
    case 'seesaw':
      return {
        id: uid,
        kind: 'seesaw',
        x: safeX,
        y: safeY,
        width: 240,
        height: 16,
        color: '#EAB308',
      };
  }
}

export default function App() {
  const [balls, setBalls] = useState<CountryBall[]>(() => createDefaultCountryBalls());
  const [gameMode, setGameMode] = useState<GameMode>('levels');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [customObstacles, setCustomObstacles] = useState<ObstacleDef[]>(() =>
    createStarterCustomObstacles()
  );
  const [selectedBuilderTool, setSelectedBuilderTool] = useState<BuilderToolKind>('zigzag-left');
  const [builderNotice, setBuilderNotice] = useState<string | null>(null);

  const [tournamentState, setTournamentState] = useState<TournamentState>(() =>
    createTournamentState(createDefaultCountryBalls())
  );
  const [eliminationState, setEliminationState] = useState<EliminationState>(() =>
    createEliminationState(createDefaultCountryBalls())
  );

  const [track, setTrack] = useState<TrackData>(() => {
    const meta = getLevelMeta(1);
    return generateTrack(meta.difficulty, meta.seed, 1);
  });

  const [gameState, setGameState] = useState<GameState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });
  const [raceRunId, setRaceRunId] = useState(1);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [countdownStep, setCountdownStep] = useState<number | null>(null);
  const [raceElapsedMs, setRaceElapsedMs] = useState(0);

  const activeRaceBalls = useMemo(() => {
    if (gameMode === 'tournament') {
      const heat = tournamentState.heatsInRound[tournamentState.heatIndex];
      return heat && heat.length >= 2 ? heat : balls;
    }
    if (gameMode === 'elimination') {
      return eliminationState.activeBalls.length >= 2 ? eliminationState.activeBalls : balls;
    }
    return balls;
  }, [gameMode, tournamentState, eliminationState, balls]);

  const [standings, setStandings] = useState<RaceStanding[]>(() =>
    buildInitialStandings(balls, track.checkpoints.length, track.obstacles.length)
  );
  const [finalStandings, setFinalStandings] = useState<RaceStanding[] | null>(null);
  const [youtubeMode, setYoutubeMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    muted: false,
    volume: 0.7,
    sfxVolume: 0.7,
    musicVolume: 0.65,
    musicEnabled: true,
    selectedTrackId: DEFAULT_TRACK_ID,
    autoPickTrending: false,
    commentaryEnabled: true,
  });

  const [videoExportOptions, setVideoExportOptions] = useState<VideoExportOptions>({
    quality: '1080p',
    includeCommentary: true,
    includeMusic: true,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [latestRecordedVideo, setLatestRecordedVideo] = useState<RecordedVideoItem | null>(null);
  const [savedVideos, setSavedVideos] = useState<RecordedVideoItem[]>([]);
  const [musicLibraryOpen, setMusicLibraryOpen] = useState(false);
  const [videoReadyOpen, setVideoReadyOpen] = useState(false);
  const [myVideosOpen, setMyVideosOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    audioEngine.updateSettings(audioSettings);
  }, [audioSettings]);

  useEffect(() => {
    audioEngine.setRecordingAudioOptions({
      includeMusic: videoExportOptions.includeMusic,
      includeCommentary: videoExportOptions.includeCommentary,
    });
  }, [videoExportOptions.includeMusic, videoExportOptions.includeCommentary]);

  useEffect(() => {
    listRecordedVideos().then((items) => {
      setSavedVideos(items);
    });
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const syncStandingsForTrack = useCallback((raceBalls: CountryBall[], nextTrack: TrackData) => {
    setStandings(
      buildInitialStandings(raceBalls, nextTrack.checkpoints.length, nextTrack.obstacles.length)
    );
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const maybeAutoPickTrending = useCallback(() => {
    if (!audioSettings.autoPickTrending) return;
    const picked = pickRandomTrendingTrack(
      audioSettings.selectedTrackId === 'none' ? undefined : audioSettings.selectedTrackId
    );
    setAudioSettings((prev) => ({
      ...prev,
      musicEnabled: true,
      selectedTrackId: picked.id,
    }));
  }, [audioSettings.autoPickTrending, audioSettings.selectedTrackId]);

  const handleStartRace = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    audioEngine.unlock();
    audioEngine.stopPreview();
    audioEngine.restoreMusicLevel();
    maybeAutoPickTrending();
    setMusicLibraryOpen(false);
    setVideoReadyOpen(false);
    setMyVideosOpen(false);
    setBuilderNotice(null);
    setFinalStandings(null);
    setLatestRecordedVideo(null);
    setCountdownStep(null);
    setRaceElapsedMs(0);
    syncStandingsForTrack(activeRaceBalls, track);
    setRaceRunId((id) => id + 1);
    setGameState('playing');
  }, [activeRaceBalls, track, syncStandingsForTrack, maybeAutoPickTrending]);

  const handleRestartRace = useCallback(() => {
    audioEngine.unlock();
    audioEngine.stopMusic();
    audioEngine.stopCommentarySpeech();
    audioEngine.restoreMusicLevel();
    maybeAutoPickTrending();
    setVideoReadyOpen(false);
    setFinalStandings(null);
    setLatestRecordedVideo(null);
    setCountdownStep(null);
    setRaceElapsedMs(0);
    syncStandingsForTrack(activeRaceBalls, track);
    setRaceRunId((id) => id + 1);
    setGameState('playing');
  }, [activeRaceBalls, track, syncStandingsForTrack, maybeAutoPickTrending]);

  const handleBackToLobby = useCallback(() => {
    audioEngine.stopMusic();
    audioEngine.stopCommentarySpeech();
    audioEngine.restoreMusicLevel();
    setVideoReadyOpen(false);
    setFinalStandings(null);
    setLatestRecordedVideo(null);
    setCountdownStep(null);
    setRaceElapsedMs(0);
    syncStandingsForTrack(activeRaceBalls, track);
    setRaceRunId((id) => id + 1);
    setGameState('title');
  }, [activeRaceBalls, track, syncStandingsForTrack]);

  const handleLevelChange = useCallback(
    (level: number) => {
      const clamped = Math.max(1, Math.min(TOTAL_LEVELS, level));
      const meta = getLevelMeta(clamped);
      const nextTrack = generateTrack(meta.difficulty, meta.seed, clamped);
      setCurrentLevel(clamped);
      setDifficulty(meta.difficulty);
      setTrack(nextTrack);
      setRaceElapsedMs(0);
      syncStandingsForTrack(activeRaceBalls, nextTrack);
      setRaceRunId((id) => id + 1);
    },
    [activeRaceBalls, syncStandingsForTrack]
  );

  const handleGenerateLevel = useCallback(
    (nextDiff?: Difficulty) => {
      const targetDiff = nextDiff ?? difficulty;
      const nextTrack = generateTrack(targetDiff, Date.now() + Math.floor(Math.random() * 10000));
      setTrack(nextTrack);
      setRaceElapsedMs(0);
      syncStandingsForTrack(activeRaceBalls, nextTrack);
      setRaceRunId((id) => id + 1);
    },
    [difficulty, activeRaceBalls, syncStandingsForTrack]
  );

  const handleDifficultyChange = useCallback(
    (nextDiff: Difficulty) => {
      setDifficulty(nextDiff);
      handleGenerateLevel(nextDiff);
    },
    [handleGenerateLevel]
  );

  const handleModeChange = useCallback(
    (nextMode: GameMode) => {
      setGameMode(nextMode);
      setBuilderNotice(null);
      setFinalStandings(null);
      setRaceElapsedMs(0);

      if (nextMode === 'levels') {
        const meta = getLevelMeta(currentLevel);
        const nextTrack = generateTrack(meta.difficulty, meta.seed, currentLevel);
        setDifficulty(meta.difficulty);
        setTrack(nextTrack);
        syncStandingsForTrack(balls, nextTrack);
      } else if (nextMode === 'builder') {
        const nextTrack = buildCustomTrack(customObstacles);
        setDifficulty('Medium');
        setTrack(nextTrack);
        syncStandingsForTrack(balls, nextTrack);
      } else if (nextMode === 'tournament') {
        const freshTourn = createTournamentState(balls);
        setTournamentState(freshTourn);
        const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
        setTrack(nextTrack);
        const heatBalls = freshTourn.heatsInRound[0] ?? balls;
        syncStandingsForTrack(heatBalls, nextTrack);
      } else if (nextMode === 'elimination') {
        const freshElim = createEliminationState(balls);
        setEliminationState(freshElim);
        const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
        setTrack(nextTrack);
        syncStandingsForTrack(freshElim.activeBalls, nextTrack);
      } else {
        const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
        setTrack(nextTrack);
        syncStandingsForTrack(balls, nextTrack);
      }
      setRaceRunId((id) => id + 1);
    },
    [balls, currentLevel, customObstacles, difficulty, syncStandingsForTrack]
  );

  const handleResetTournament = useCallback(() => {
    const fresh = createTournamentState(balls);
    setTournamentState(fresh);
    const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
    setTrack(nextTrack);
    syncStandingsForTrack(fresh.heatsInRound[0] ?? balls, nextTrack);
    setRaceRunId((id) => id + 1);
  }, [balls, difficulty, syncStandingsForTrack]);

  const handleResetElimination = useCallback(() => {
    const fresh = createEliminationState(balls);
    setEliminationState(fresh);
    const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
    setTrack(nextTrack);
    syncStandingsForTrack(fresh.activeBalls, nextTrack);
    setRaceRunId((id) => id + 1);
  }, [balls, difficulty, syncStandingsForTrack]);

  const handleBuilderCanvasClick = useCallback(
    (trackX: number, trackY: number, hitWallOrLocked: boolean) => {
      if (hitWallOrLocked) {
        setBuilderNotice(
          'Side walls, top NO ESCAPE cap & final funnel are locked and cannot be edited or deleted.'
        );
        return;
      }
      const nextObs = createBuilderObstacle(selectedBuilderTool, trackX, trackY);
      setCustomObstacles((prev) => {
        const updated = [...prev, nextObs].sort((a, b) => a.y - b.y);
        const nextTrack = buildCustomTrack(updated);
        setTrack(nextTrack);
        syncStandingsForTrack(balls, nextTrack);
        return updated;
      });
      setBuilderNotice(null);
      setRaceRunId((id) => id + 1);
    },
    [selectedBuilderTool, balls, syncStandingsForTrack]
  );

  const handleAddBuilderPreset = useCallback(
    (tool: BuilderToolKind) => {
      setCustomObstacles((prev) => {
        const lastY = prev.length > 0 ? prev[prev.length - 1].y : 260;
        const targetY = lastY + 170 > 1780 ? 320 + ((prev.length * 145) % 1350) : lastY + 170;
        const nextObs = createBuilderObstacle(tool, TRACK_WIDTH / 2, targetY);
        const updated = [...prev, nextObs].sort((a, b) => a.y - b.y);
        const nextTrack = buildCustomTrack(updated);
        setTrack(nextTrack);
        syncStandingsForTrack(balls, nextTrack);
        return updated;
      });
      setBuilderNotice(null);
      setRaceRunId((id) => id + 1);
    },
    [balls, syncStandingsForTrack]
  );

  const handleDeleteCustomObstacle = useCallback(
    (id: string) => {
      setCustomObstacles((prev) => {
        const target = prev.find((o) => o.id === id);
        if (target?.locked) {
          setBuilderNotice('Side walls and final funnel are locked and cannot be deleted.');
          return prev;
        }
        const updated = prev.filter((o) => o.id !== id);
        const nextTrack = buildCustomTrack(updated);
        setTrack(nextTrack);
        syncStandingsForTrack(balls, nextTrack);
        return updated;
      });
      setBuilderNotice(null);
      setRaceRunId((id) => id + 1);
    },
    [balls, syncStandingsForTrack]
  );

  const handleAttemptDeleteLockedWall = useCallback((wallLabel: string) => {
    setBuilderNotice(`${wallLabel} is permanently locked and cannot be deleted.`);
  }, []);

  const handleAutoFillCustomTrack = useCallback(() => {
    const starter = createStarterCustomObstacles();
    setCustomObstacles(starter);
    const nextTrack = buildCustomTrack(starter);
    setTrack(nextTrack);
    syncStandingsForTrack(balls, nextTrack);
    setBuilderNotice(null);
    setRaceRunId((id) => id + 1);
  }, [balls, syncStandingsForTrack]);

  const handleClearCustomObstacles = useCallback(() => {
    setCustomObstacles([]);
    const nextTrack = buildCustomTrack([]);
    setTrack(nextTrack);
    syncStandingsForTrack(balls, nextTrack);
    setBuilderNotice(
      'Custom obstacles cleared. Locked side walls & final finish funnel remain intact.'
    );
    setRaceRunId((id) => id + 1);
  }, [balls, syncStandingsForTrack]);

  const handleNewRandomTrackAndRace = useCallback(() => {
    audioEngine.unlock();
    audioEngine.stopMusic();
    audioEngine.restoreMusicLevel();
    maybeAutoPickTrending();
    const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
    setTrack(nextTrack);
    setVideoReadyOpen(false);
    setFinalStandings(null);
    setLatestRecordedVideo(null);
    setCountdownStep(null);
    setRaceElapsedMs(0);
    syncStandingsForTrack(activeRaceBalls, nextTrack);
    setRaceRunId((id) => id + 1);
    setGameState('playing');
  }, [difficulty, activeRaceBalls, syncStandingsForTrack, maybeAutoPickTrending]);

  const updateBallsAndResetBrackets = useCallback(
    (updatedBalls: CountryBall[]) => {
      const nextTourn = createTournamentState(updatedBalls);
      const nextElim = createEliminationState(updatedBalls);
      setTournamentState(nextTourn);
      setEliminationState(nextElim);
      if (gameMode === 'tournament') {
        syncStandingsForTrack(nextTourn.heatsInRound[0] ?? updatedBalls, track);
      } else if (gameMode === 'elimination') {
        syncStandingsForTrack(nextElim.activeBalls, track);
      } else {
        syncStandingsForTrack(updatedBalls, track);
      }
    },
    [gameMode, track, syncStandingsForTrack]
  );

  const handleAddBalls = useCallback(
    (newBalls: CountryBall[]) => {
      setBalls((prev) => {
        const merged = [...prev, ...newBalls].slice(0, MAX_BALLS);
        updateBallsAndResetBrackets(merged);
        return merged;
      });
    },
    [updateBallsAndResetBrackets]
  );

  const handleRenameBall = useCallback((id: string, name: string) => {
    setBalls((prev) => {
      const updated = prev.map((b) =>
        b.id === id ? { ...b, name, code: deriveCountryCode(name) } : b
      );
      setStandings((curr) =>
        curr.map((s) => (s.id === id ? { ...s, name, code: deriveCountryCode(name) } : s))
      );
      return updated;
    });
  }, []);

  const handleDeleteBall = useCallback(
    (id: string) => {
      setBalls((prev) => {
        if (!canRemoveBall(prev.length)) return prev;
        const filtered = prev.filter((b) => b.id !== id);
        updateBallsAndResetBrackets(filtered);
        return filtered;
      });
    },
    [updateBallsAndResetBrackets]
  );

  const handleResetDefaults = useCallback(() => {
    const defaults = createDefaultCountryBalls();
    setBalls(defaults);
    updateBallsAndResetBrackets(defaults);
  }, [updateBallsAndResetBrackets]);

  const handleRaceFinish = useCallback(
    (results: RaceStanding[], recordedVideo: RecordedVideoItem | null) => {
      if (gameMode === 'levels') {
        setCompletedLevels((prev) => (prev.includes(currentLevel) ? prev : [...prev, currentLevel]));
      }
      setFinalStandings(results);
      setLatestRecordedVideo(recordedVideo);
      setGameState('gameover');
      if (recordedVideo) {
        setVideoReadyOpen(true);
        saveRecordedVideo(recordedVideo)
          .then(() => listRecordedVideos())
          .then((items) => setSavedVideos(items))
          .catch(() => {
            setSavedVideos((prev) => [recordedVideo, ...prev]);
          });
      }
    },
    [gameMode, currentLevel]
  );

  const handleSaveMp4Blob = useCallback((videoId: string, mp4Blob: Blob) => {
    setLatestRecordedVideo((prev) => (prev && prev.id === videoId ? { ...prev, mp4Blob } : prev));
    setSavedVideos((prev) => {
      const updated = prev.map((v) => (v.id === videoId ? { ...v, mp4Blob } : v));
      const target = updated.find((v) => v.id === videoId);
      if (target) {
        saveRecordedVideo(target).catch(() => {});
      }
      return updated;
    });
  }, []);

  const handleDeleteSavedVideo = useCallback((videoId: string) => {
    deleteRecordedVideo(videoId).catch(() => {});
    setSavedVideos((prev) => prev.filter((v) => v.id !== videoId));
  }, []);

  const handleAdvanceMode = useCallback(() => {
    if (!finalStandings) return;
    audioEngine.stopMusic();
    audioEngine.restoreMusicLevel();
    maybeAutoPickTrending();
    setVideoReadyOpen(false);
    setLatestRecordedVideo(null);

    if (gameMode === 'levels' && currentLevel < TOTAL_LEVELS) {
      const nextLevel = currentLevel + 1;
      const meta = getLevelMeta(nextLevel);
      const nextTrack = generateTrack(meta.difficulty, meta.seed, nextLevel);
      setCurrentLevel(nextLevel);
      setDifficulty(meta.difficulty);
      setTrack(nextTrack);
      setFinalStandings(null);
      setCountdownStep(null);
      setRaceElapsedMs(0);
      syncStandingsForTrack(balls, nextTrack);
      setRaceRunId((id) => id + 1);
      setGameState('playing');
      return;
    }

    if (gameMode === 'tournament') {
      const nextState = advanceTournamentHeat(tournamentState, finalStandings, balls);
      setTournamentState(nextState);
      if (nextState.champion) {
        const resetTourn = createTournamentState(balls);
        setTournamentState(resetTourn);
      }
      const nextHeatBalls = nextState.champion
        ? balls
        : nextState.heatsInRound[nextState.heatIndex] ?? balls;
      const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
      setTrack(nextTrack);
      setFinalStandings(null);
      setCountdownStep(null);
      setRaceElapsedMs(0);
      syncStandingsForTrack(nextHeatBalls, nextTrack);
      setRaceRunId((id) => id + 1);
      setGameState('playing');
      return;
    }

    if (gameMode === 'elimination') {
      const nextElim = advanceEliminationRound(eliminationState, finalStandings);
      if (nextElim.champion) {
        const fresh = createEliminationState(balls);
        setEliminationState(fresh);
        syncStandingsForTrack(fresh.activeBalls, track);
      } else {
        setEliminationState(nextElim);
        syncStandingsForTrack(nextElim.activeBalls, track);
      }
      const nextTrack = generateTrack(difficulty, Date.now() + Math.floor(Math.random() * 10000));
      setTrack(nextTrack);
      setFinalStandings(null);
      setCountdownStep(null);
      setRaceElapsedMs(0);
      setRaceRunId((id) => id + 1);
      setGameState('playing');
    }
  }, [
    finalStandings,
    gameMode,
    currentLevel,
    tournamentState,
    eliminationState,
    balls,
    difficulty,
    track,
    syncStandingsForTrack,
    maybeAutoPickTrending,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (isTyping) return;

      if (e.key === 'Escape') {
        if (youtubeMode) {
          setYoutubeMode(false);
          return;
        }
        if (gameState === 'playing') {
          audioEngine.stopMusic(true);
          setGameState('paused');
        } else if (gameState === 'paused') {
          audioEngine.startMusic();
          setGameState('playing');
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (gameState === 'playing') {
          audioEngine.stopMusic(true);
          setGameState('paused');
        } else if (gameState === 'paused') {
          audioEngine.startMusic();
          setGameState('playing');
        }
      } else if ((e.key === 'Enter' || e.key === ' ') && gameState === 'title') {
        e.preventDefault();
        handleStartRace();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, youtubeMode, handleStartRace]);

  const leaderStanding = standings[0];
  const raceProgressPct = useMemo(() => {
    if (gameState === 'title') return 0;
    if (gameState === 'gameover') return 100;
    return leaderStanding?.progress ?? 0;
  }, [gameState, leaderStanding]);

  const activeTrackInfo = useMemo(
    () => getTrackById(audioSettings.selectedTrackId),
    [audioSettings.selectedTrackId]
  );

  const exportLevelLabel = useMemo(() => {
    if (gameMode === 'levels') return formatLevelSlugForFilename(currentLevel);
    if (gameMode === 'tournament') return formatLevelSlugForFilename(undefined, difficulty, `TournR${tournamentState.round}`);
    if (gameMode === 'elimination') return formatLevelSlugForFilename(undefined, difficulty, `ElimR${eliminationState.round}`);
    if (gameMode === 'builder') return 'Custom';
    return formatLevelSlugForFilename(undefined, difficulty, difficulty);
  }, [gameMode, currentLevel, difficulty, tournamentState.round, eliminationState.round]);

  const modeSubtitle = useMemo(() => {
    if (gameMode === 'levels') return `Level ${currentLevel}/${TOTAL_LEVELS} · ${difficulty} Track`;
    if (gameMode === 'tournament') {
      return `Tournament Round ${tournamentState.round}/${tournamentState.totalRounds} · Heat ${
        tournamentState.heatIndex + 1
      }/${tournamentState.heatsInRound.length}`;
    }
    if (gameMode === 'elimination') {
      return `Elimination Round ${eliminationState.round} · ${eliminationState.activeBalls.length} Contenders`;
    }
    if (gameMode === 'builder') return 'Custom Fair Track Builder · Locked Walls';
    return `Quick Race · ${difficulty} Track`;
  }, [gameMode, currentLevel, difficulty, tournamentState, eliminationState]);

  const podiumProgressInfo = useMemo(() => {
    if (!finalStandings) return { nextLabel: null, championName: null };

    if (gameMode === 'levels') {
      return {
        nextLabel: currentLevel < TOTAL_LEVELS ? `Next Level (Level ${currentLevel + 1})` : null,
        championName: null,
      };
    }
    if (gameMode === 'tournament') {
      const isFinalHeat = tournamentState.heatsInRound.length === 1;
      if (isFinalHeat) {
        return {
          nextLabel: 'New Tournament',
          championName: finalStandings[0]?.name ?? null,
        };
      }
      const moreHeatsInRound = tournamentState.heatIndex + 1 < tournamentState.heatsInRound.length;
      return {
        nextLabel: moreHeatsInRound
          ? `Start Heat ${tournamentState.heatIndex + 2}/${tournamentState.heatsInRound.length}`
          : `Start Round ${tournamentState.round + 1}`,
        championName: null,
      };
    }
    if (gameMode === 'elimination') {
      const isFinalElim = eliminationState.activeBalls.length <= 2;
      return {
        nextLabel: isFinalElim
          ? 'New Elimination'
          : `Start Elimination Round ${eliminationState.round + 1}`,
        championName: isFinalElim ? finalStandings[0]?.name ?? null : null,
      };
    }
    return { nextLabel: null, championName: null };
  }, [finalStandings, gameMode, currentLevel, tournamentState, eliminationState]);

  const marqueeText =
    'WORLD CHAMPIONSHIP • 100 LEVELS • CLOSED WALLS • SINGLE FAIR PATH • TOURNAMENT & ELIMINATION • ';

  return (
    <div
      data-testid={youtubeMode ? 'youtube-recording-stage' : 'championship-arena'}
      className={
        youtubeMode
          ? 'fixed inset-0 bg-black flex items-center justify-center p-0 sm:p-3 select-none'
          : 'min-h-screen flex flex-col bg-[#0A0F2B] text-white relative overflow-x-hidden pb-20'
      }
    >
      {/* Ambient Stadium Radial Glows */}
      {!youtubeMode && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div
            className="absolute -top-40 -left-32 w-[540px] h-[540px] rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, #00D4FF 0%, transparent 70%)' }}
          />
          <div
            className="absolute -top-36 -right-32 w-[540px] h-[540px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #FF2E63 0%, transparent 70%)' }}
          />
        </div>
      )}

      <div
        className={
          youtubeMode
            ? 'relative w-full max-w-[1600px] aspect-video max-h-full rounded-none sm:rounded-xl overflow-hidden border border-white/15 bg-black flex flex-col'
            : 'relative z-10 flex flex-col flex-1 min-h-0'
        }
      >
        {/* Cinematic Top Letterbox Bar in YouTube Mode */}
        {youtubeMode && (
          <div className="bg-black h-7 sm:h-9 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF2E63] animate-ping" />
              <span className="font-display text-xs sm:text-sm tracking-wider text-gold-3d">
                FLAG BALL RACE · {modeSubtitle.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono-tabular text-xs font-bold text-[#00D4FF]">
                {formatRaceClock(raceElapsedMs)}
              </span>
              <span className="font-mono-tabular text-xs font-bold text-[#FFD700]">
                {leaderStanding ? `#1 ${leaderStanding.name}` : 'READY'} · {raceProgressPct}%
              </span>
            </div>
          </div>
        )}

        {/* Normal Mode: Hero Banner + Scrolling Marquee (Lobby) + Broadcast Telemetry Bar */}
        {!youtubeMode && (
          <div className="px-3 sm:px-5 pt-3">
            {/* Cinematic Hero Banner on Lobby */}
            {gameState === 'title' && (
              <div className="max-w-[1560px] mx-auto mb-3">
                <div className="glass-panel relative overflow-hidden rounded-2xl px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-[#FFD700]/35">
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shine" />

                  <div className="flex items-center gap-3 text-center sm:text-left">
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 44 44"
                      fill="none"
                      aria-hidden="true"
                      className="shrink-0 drop-shadow-[0_0_14px_rgba(255,215,0,0.65)]"
                    >
                      <circle cx="22" cy="22" r="20" fill="#0A0F2B" stroke="#FFD700" strokeWidth="3" />
                      <path d="M13 30L22 10L31 30H13Z" fill="#FFD700" />
                      <circle cx="22" cy="24" r="4.5" fill="#FF2E63" />
                    </svg>
                    <div>
                      <h1 className="font-display text-2xl sm:text-4xl tracking-wider text-gold-3d leading-none">
                        FLAG BALL RACE
                      </h1>
                      <p className="text-xs font-semibold text-[#00D4FF] mt-1 tracking-wide">
                        {modeSubtitle.toUpperCase()} · {activeRaceBalls.length} RACERS
                      </p>
                    </div>
                  </div>

                  {/* Primary 3D Pulsing Green-to-Yellow START RACE CTA + Music Library + My Videos */}
                  <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-start="true"
                      onClick={handleStartRace}
                      className="btn-3d animate-start-pulse flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-400 to-[#FFD700] text-[#050819] font-display text-base sm:text-xl tracking-wide whitespace-nowrap cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      START RACE
                    </button>

                    <button
                      type="button"
                      data-testid="open-music-library-btn"
                      onClick={() => setMusicLibraryOpen(true)}
                      className="btn-3d flex items-center gap-1.5 px-3.5 py-3 rounded-2xl bg-gradient-to-b from-[#00D4FF] to-blue-600 border-b-4 border-blue-950 text-xs font-extrabold text-[#050819] whitespace-nowrap cursor-pointer shadow-[0_6px_18px_rgba(0,212,255,0.35)]"
                    >
                      <Music className="w-4 h-4" />
                      Music Library
                    </button>

                    <button
                      type="button"
                      data-testid="open-my-videos-btn"
                      onClick={() => setMyVideosOpen(true)}
                      className="btn-3d flex items-center gap-1.5 px-3.5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border-b-4 border-slate-900 text-xs font-bold text-white whitespace-nowrap cursor-pointer"
                    >
                      <Film className="w-4 h-4 text-[#FFD700]" />
                      My Videos ({savedVideos.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setYoutubeMode(true)}
                      className="btn-3d hidden md:flex items-center gap-1.5 px-3.5 py-3 rounded-2xl bg-gradient-to-b from-[#FF2E63] to-rose-700 border-b-4 border-rose-950 text-xs font-bold text-white whitespace-nowrap cursor-pointer shadow-[0_6px_18px_rgba(255,46,99,0.4)]"
                    >
                      <Video className="w-4 h-4" />
                      YT Mode
                    </button>
                  </div>
                </div>

                {/* Scrolling Championship Marquee */}
                <div className="mt-2 overflow-hidden rounded-xl border border-[#00D4FF]/25 bg-[#06091B]/80 py-1.5">
                  <div className="flex w-max animate-marquee whitespace-nowrap">
                    <span className="font-display text-xs tracking-widest text-[#FFD700] px-4">
                      {marqueeText}
                    </span>
                    <span className="font-display text-xs tracking-widest text-[#00D4FF] px-4">
                      {marqueeText}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Top Broadcast Telemetry Bar (LIVE + REC 16:9 + Music Track + Progress Bar) */}
            <div className="max-w-[1560px] mx-auto glass-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2 rounded-lg bg-[#FF2E63]/20 border border-[#FF2E63]/50 px-2.5 py-1">
                  <span className="w-2 h-2 rounded-full bg-[#FF2E63] animate-ping" />
                  <span className="font-display text-[11px] tracking-wider text-white">
                    {isRecording ? `REC ${videoExportOptions.quality}` : 'LIVE'}
                  </span>
                </div>

                {gameState !== 'title' && (
                  <h1 className="font-display text-base sm:text-xl tracking-wide text-gold-3d leading-none">
                    FLAG BALL RACE
                  </h1>
                )}

                <span className="hidden md:inline-block font-mono-tabular text-[11px] font-bold text-[#00D4FF] bg-[#06091B]/80 border border-white/10 rounded-lg px-2.5 py-1">
                  {modeSubtitle}
                </span>

                <div className="flex items-center gap-1.5 rounded-lg bg-[#06091B]/85 border border-white/10 px-2.5 py-1">
                  <span className="text-[10px] font-bold text-[#00D4FF] uppercase">Time</span>
                  <span
                    data-testid="race-timer"
                    className="font-mono-tabular text-xs font-extrabold text-white"
                  >
                    {formatRaceClock(raceElapsedMs)}
                  </span>
                </div>
              </div>

              {/* Gradient Progress Bar with Animated Shine */}
              <div className="flex-1 min-w-[180px] flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-valuenow={raceProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Race progress"
                  className="relative flex-1 h-3 rounded-full bg-[#050819] border border-white/10 overflow-hidden"
                >
                  <div
                    className={`relative h-full bg-gradient-to-r from-[#00D4FF] via-[#FFD700] to-[#FF2E63] overflow-hidden ${
                      raceProgressPct === 0 ? '' : 'transition-all duration-150'
                    }`}
                    style={{ width: `${raceProgressPct}%` }}
                  >
                    <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shine" />
                  </div>
                </div>
                <span className="font-mono-tabular text-xs font-extrabold text-[#FFD700] w-10 text-right shrink-0">
                  {raceProgressPct}%
                </span>
              </div>

              {/* Music Copyright-Free Status & Quick Actions */}
              {gameState === 'title' ? (
                <div className="hidden xl:flex items-center gap-2 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-lg px-2.5 py-1">
                  <span>
                    🎵{' '}
                    {!audioSettings.musicEnabled || !activeTrackInfo
                      ? 'No Music'
                      : activeTrackInfo.title}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>Copyright-Free ✅</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRestartRace}
                    className="btn-3d flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-orange-400 to-orange-600 border-b-4 border-orange-900 text-[#0A0F2B] font-bold text-xs whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart
                  </button>

                  <button
                    type="button"
                    onClick={() => setYoutubeMode(true)}
                    className="btn-3d flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-[#FF2E63] to-rose-700 border-b-4 border-rose-950 text-white font-bold text-xs whitespace-nowrap cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    YouTube Recording Mode
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Stadium Arena Grid */}
        <main
          className={
            youtubeMode
              ? 'flex-1 min-h-0 grid grid-cols-[1fr_275px] gap-3 p-3 bg-[#050819]'
              : 'flex-1 max-w-[1560px] w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[384px_1fr_310px] gap-4 min-h-0'
          }
        >
          {/* Left: Flag Upload Lobby & Level/Mode/Builder Controls */}
          {!youtubeMode && (
            <div className="order-3 lg:order-1">
              <LobbyPanel
                balls={balls}
                gameMode={gameMode}
                difficulty={difficulty}
                currentLevel={currentLevel}
                completedLevels={completedLevels}
                obstacleCount={track.obstacles.length}
                trackHeight={track.height}
                disabled={gameState === 'playing' || gameState === 'paused'}
                tournamentState={tournamentState}
                eliminationState={eliminationState}
                customObstacles={customObstacles}
                selectedBuilderTool={selectedBuilderTool}
                builderNotice={builderNotice}
                onAddBalls={handleAddBalls}
                onRenameBall={handleRenameBall}
                onDeleteBall={handleDeleteBall}
                onResetDefaults={handleResetDefaults}
                onModeChange={handleModeChange}
                onLevelChange={handleLevelChange}
                onDifficultyChange={handleDifficultyChange}
                onGenerateLevel={() => handleGenerateLevel()}
                onResetTournament={handleResetTournament}
                onResetElimination={handleResetElimination}
                onSelectBuilderTool={setSelectedBuilderTool}
                onAddBuilderObstaclePreset={handleAddBuilderPreset}
                onDeleteCustomObstacle={handleDeleteCustomObstacle}
                onAttemptDeleteLockedWall={handleAttemptDeleteLockedWall}
                onAutoFillCustomTrack={handleAutoFillCustomTrack}
                onClearCustomObstacles={handleClearCustomObstacles}
              />
            </div>
          )}

          {/* Center: 3D World Stadium Closed-Wall Physics Track */}
          <div
            className={
              youtubeMode
                ? 'relative min-h-0'
                : 'order-1 lg:order-2 relative h-[480px] sm:h-[580px] lg:h-[calc(100vh-276px)] min-h-[440px]'
            }
          >
            <RaceCanvas
              track={track}
              balls={activeRaceBalls}
              gameState={gameState}
              raceRunId={raceRunId}
              speedMultiplier={speedMultiplier}
              youtubeMode={youtubeMode}
              videoQuality={videoExportOptions.quality}
              levelLabel={exportLevelLabel}
              levelTitle={modeSubtitle}
              builderMode={gameMode === 'builder' && gameState === 'title'}
              onBuilderCanvasClick={handleBuilderCanvasClick}
              onStandingsUpdate={setStandings}
              onRaceTimeUpdate={setRaceElapsedMs}
              onCountdownChange={setCountdownStep}
              onRecordingStateChange={setIsRecording}
              onRaceFinish={handleRaceFinish}
            />

            {gameState === 'title' && !youtubeMode && (
              <div className="pointer-events-none hidden sm:flex absolute bottom-3 left-3 right-3 items-center justify-between gap-2">
                <span className="rounded-xl bg-[#0A0F2B]/90 border border-[#00D4FF]/35 px-3 py-1.5 text-xs font-medium text-slate-200">
                  {gameMode === 'builder'
                    ? 'Click inside track to place obstacle · Side walls are permanently locked'
                    : 'Closed Neon Walls · Single Fair Path · Press Enter or START RACE'}
                </span>
                <button
                  type="button"
                  onClick={handleStartRace}
                  className="pointer-events-auto lg:hidden btn-3d px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-[#FFD700] border-b-4 border-emerald-800 text-[#0A0F2B] font-display text-sm whitespace-nowrap shrink-0 cursor-pointer"
                >
                  START RACE
                </button>
              </div>
            )}

            {/* Cinematic Countdown 3, 2, 1, GO! */}
            {countdownStep !== null && (
              <div
                data-testid="countdown-overlay"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="rounded-3xl bg-[#0A0F2B]/92 border-4 border-[#FFD700] px-12 py-6 shadow-[0_0_50px_rgba(255,215,0,0.65)] animate-drop-bounce">
                  <span className="font-display text-7xl sm:text-8xl tracking-wider text-gold-3d">
                    {countdownStep === 0 ? 'GO!' : countdownStep}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right (Desktop) / Bottom Horizontal Scroll (Mobile): F1 Live Leaderboard */}
          <div
            className={
              youtubeMode
                ? 'min-h-0'
                : 'order-2 lg:order-3 lg:h-[calc(100vh-230px)] lg:min-h-[450px]'
            }
          >
            <LeaderboardPanel
              standings={standings}
              balls={activeRaceBalls}
              compact={youtubeMode}
            />
          </div>
        </main>

        {/* Bottom Cinematic Letterbox Bar in YouTube Mode */}
        {youtubeMode && (
          <div className="bg-black h-7 sm:h-9 px-4 flex items-center justify-between border-t border-white/10 shrink-0">
            <span className="text-[11px] font-semibold text-slate-400">
              WORLD STADIUM BROADCAST FEED · 16:9 CINEMA
            </span>
            <button
              type="button"
              onClick={() => setYoutubeMode(false)}
              aria-label="Exit YouTube Recording Mode"
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              <Minimize2 className="w-3 h-3" />
              Exit YouTube Mode (Esc)
            </button>
          </div>
        )}
      </div>

      {/* Bottom Glass Control Bar (Pause, Speed, Mute, Music, Fullscreen) */}
      {!youtubeMode && (
        <nav
          aria-label="Race broadcast controls"
          className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-40 w-max max-w-[96vw] glass-bar rounded-2xl px-2.5 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"
        >
          {gameState === 'title' ? (
            <button
              type="button"
              onClick={handleStartRace}
              className="btn-3d flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-[#FFD700] border-b-4 border-emerald-800 text-[#050819] font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start
            </button>
          ) : gameState === 'playing' ? (
            <button
              type="button"
              onClick={() => {
                audioEngine.stopMusic(true);
                setGameState('paused');
              }}
              className="btn-3d flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-b from-[#FFD700] to-amber-600 border-b-4 border-amber-900 text-[#0A0F2B] font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                audioEngine.startMusic();
                setGameState('playing');
              }}
              className="btn-3d flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 border-b-4 border-emerald-900 text-[#050819] font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Resume
            </button>
          )}

          {gameState !== 'title' && (
            <button
              type="button"
              onClick={handleRestartRace}
              className="btn-3d flex items-center gap-1 px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-orange-400 to-orange-600 border-b-4 border-orange-900 text-[#0A0F2B] font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart
            </button>
          )}

          <button
            type="button"
            onClick={() => setSpeedMultiplier((s) => (s === 1 ? 2 : 1))}
            aria-pressed={speedMultiplier === 2}
            aria-label="2x Speed"
            className={`btn-3d flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 rounded-xl border-b-4 font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer ${
              speedMultiplier === 2
                ? 'bg-gradient-to-b from-[#00D4FF] to-blue-600 border-blue-900 text-[#050819]'
                : 'bg-white/10 border-slate-900 text-white hover:bg-white/15'
            }`}
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>2x</span>
            <span className="hidden sm:inline">Speed</span>
          </button>

          <div className="flex items-center gap-1.5 rounded-xl bg-[#06091B]/80 border border-white/10 px-2 sm:px-2.5 py-1">
            <button
              type="button"
              onClick={() => setAudioSettings((s) => ({ ...s, muted: !s.muted }))}
              aria-label={audioSettings.muted ? 'Unmute audio' : 'Mute audio'}
              className="p-0.5 text-white hover:text-[#FFD700] cursor-pointer"
            >
              {audioSettings.muted ? (
                <VolumeX className="w-4 h-4 text-[#FF2E63]" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>

            <label className="hidden md:flex items-center gap-1 text-[10px] font-bold text-[#00D4FF]">
              <span>SFX</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioSettings.muted ? 0 : audioSettings.sfxVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setAudioSettings((s) => ({
                    ...s,
                    sfxVolume: val,
                    volume: val,
                    muted: val === 0 && s.musicVolume === 0,
                  }));
                }}
                aria-label="SFX volume"
                className="w-16 accent-[#00D4FF] cursor-pointer"
              />
            </label>

            <label className="hidden md:flex items-center gap-1 text-[10px] font-bold text-[#FFD700]">
              <span>Music</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioSettings.muted ? 0 : audioSettings.musicVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setAudioSettings((s) => ({
                    ...s,
                    musicVolume: val,
                    muted: false,
                  }));
                }}
                aria-label="Music volume"
                className="w-16 accent-[#FFD700] cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={() => setMusicLibraryOpen(true)}
              aria-label="Open Music Library"
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                audioSettings.musicEnabled && !audioSettings.muted
                  ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/50'
                  : 'bg-white/5 text-slate-400 border border-white/10'
              }`}
            >
              <Music className="w-3 h-3" />
              Music Library
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMyVideosOpen(true)}
            aria-label="Open My Videos"
            className="btn-3d hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border-b-4 border-slate-900 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Film className="w-3.5 h-3.5 text-[#00D4FF]" />
            <span>My Videos</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="btn-3d flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border-b-4 border-slate-900 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Fullscreen</span>
          </button>

          <button
            type="button"
            onClick={() => setYoutubeMode(true)}
            aria-label="YouTube Recording Mode"
            className="btn-3d sm:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-b from-[#FF2E63] to-rose-700 border-b-4 border-rose-950 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Video className="w-3.5 h-3.5" />
            YT
          </button>
        </nav>
      )}

      {/* Pause Modal */}
      {gameState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Race Paused"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040717]/88 p-4"
        >
          <div className="glass-panel animate-drop-bounce w-full max-w-sm rounded-3xl border border-[#00D4FF]/40 p-6 text-center shadow-2xl">
            <h2 className="font-display text-3xl tracking-wide text-gold-3d">RACE PAUSED</h2>
            <p className="text-sm font-medium text-[#00D4FF] mt-1">
              {leaderStanding ? `Current Leader: ${leaderStanding.name}` : 'Simulation frozen'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  audioEngine.startMusic();
                  setGameState('playing');
                }}
                className="btn-3d w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-[#FFD700] border-b-4 border-emerald-800 text-[#050819] font-bold text-sm cursor-pointer"
              >
                Resume Race
              </button>
              <button
                type="button"
                onClick={handleRestartRace}
                className="btn-3d w-full py-2.5 rounded-xl bg-gradient-to-b from-orange-400 to-orange-600 border-b-4 border-orange-900 text-[#0A0F2B] font-bold text-sm cursor-pointer"
              >
                Restart Same Track
              </button>
              <button
                type="button"
                onClick={handleBackToLobby}
                className="btn-3d w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border-b-4 border-slate-900 text-white font-semibold text-sm cursor-pointer"
              >
                Back to Lobby Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic 3D Podium Modal (shown when gameover & Video Ready panel is closed/switched) */}
      {gameState === 'gameover' && finalStandings && !videoReadyOpen && (
        <PodiumModal
          standings={finalStandings}
          balls={activeRaceBalls}
          difficulty={difficulty}
          gameMode={gameMode}
          levelNumber={currentLevel}
          modeSubtitle={modeSubtitle}
          nextActionLabel={podiumProgressInfo.nextLabel}
          championName={podiumProgressInfo.championName}
          hasRecordedVideo={Boolean(latestRecordedVideo)}
          onOpenVideoReady={() => setVideoReadyOpen(true)}
          onAdvanceMode={handleAdvanceMode}
          onRaceAgainSameTrack={handleRestartRace}
          onNewRandomTrack={handleNewRandomTrackAndRace}
          onBackToLobby={handleBackToLobby}
        />
      )}

      {/* Feature 14: VIDEO READY Modal after race finishes */}
      {gameState === 'gameover' && finalStandings && (
        <VideoReadyModal
          open={videoReadyOpen}
          recordedVideo={latestRecordedVideo}
          standings={finalStandings}
          modeSubtitle={modeSubtitle}
          exportOptions={videoExportOptions}
          nextActionLabel={podiumProgressInfo.nextLabel}
          championName={podiumProgressInfo.championName}
          onUpdateExportOptions={setVideoExportOptions}
          onSaveMp4Blob={handleSaveMp4Blob}
          onOpenPodium={() => setVideoReadyOpen(false)}
          onOpenMyVideos={() => setMyVideosOpen(true)}
          onAdvanceMode={handleAdvanceMode}
          onRaceAgainSameTrack={handleRestartRace}
          onClose={() => setVideoReadyOpen(false)}
        />
      )}

      {/* Feature 15: Built-in Copyright-Free Music Library Modal */}
      <MusicLibraryModal
        open={musicLibraryOpen}
        audioSettings={audioSettings}
        onUpdateAudioSettings={setAudioSettings}
        onClose={() => setMusicLibraryOpen(false)}
      />

      {/* Feature 14: My Videos IndexedDB Gallery Modal */}
      <MyVideosModal
        open={myVideosOpen}
        videos={savedVideos}
        onDeleteVideo={handleDeleteSavedVideo}
        onSaveMp4Blob={handleSaveMp4Blob}
        onClose={() => setMyVideosOpen(false)}
      />
    </div>
  );
}
