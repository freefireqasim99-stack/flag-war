import React, { useRef, useState } from 'react';
import { Upload, Trash2, RotateCcw, Check, Pencil } from 'lucide-react';
import {
  CountryBall,
  Difficulty,
  EliminationState,
  GameMode,
  ObstacleDef,
  TournamentState,
} from '../types/race';
import { FlagAvatar } from './FlagAvatar';
import { deriveCountryCode, deriveNameFromFilename, processUploadedFlagImage } from '../game/flags';
import { canAddBalls, canRemoveBall, MAX_BALLS, MIN_BALLS } from '../game/raceLogic';
import { BuilderToolKind, ModeBuilderControls } from './ModeBuilderControls';

interface LobbyPanelProps {
  balls: CountryBall[];
  gameMode: GameMode;
  difficulty: Difficulty;
  currentLevel: number;
  completedLevels: number[];
  obstacleCount: number;
  trackHeight: number;
  disabled: boolean;
  tournamentState: TournamentState;
  eliminationState: EliminationState;
  customObstacles: ObstacleDef[];
  selectedBuilderTool: BuilderToolKind;
  builderNotice: string | null;
  onAddBalls: (newBalls: CountryBall[]) => void;
  onRenameBall: (id: string, name: string) => void;
  onDeleteBall: (id: string) => void;
  onResetDefaults: () => void;
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

export const LobbyPanel: React.FC<LobbyPanelProps> = ({
  balls,
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
  onAddBalls,
  onRenameBall,
  onDeleteBall,
  onResetDefaults,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [countryNameInput, setCountryNameInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);

    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      setUploadError('Please select PNG or JPG image files.');
      return;
    }

    const availableSlots = MAX_BALLS - balls.length;
    if (availableSlots <= 0) {
      setUploadError(`Maximum ${MAX_BALLS} country balls allowed. Delete one to add more.`);
      return;
    }

    const filesToProcess = files.slice(0, availableSlots);
    const created: CountryBall[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const processed = await processUploadedFlagImage(file);
        const customName =
          filesToProcess.length === 1 && countryNameInput.trim().length > 0
            ? countryNameInput.trim()
            : deriveNameFromFilename(file.name);

        created.push({
          id: `custom-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: customName,
          code: deriveCountryCode(customName),
          emoji: '🏳️',
          flagType: 'custom',
          imageDataUrl: processed.imageDataUrl,
          primaryColor: processed.primaryColor,
          secondaryColor: processed.secondaryColor,
        });
      } catch {
        setUploadError(`Could not process "${file.name}". Try a valid PNG or JPG image.`);
      }
    }

    if (created.length > 0) {
      onAddBalls(created);
      setCountryNameInput('');
      if (files.length > availableSlots) {
        setUploadError(`Added ${created.length} flag(s). Reached the ${MAX_BALLS}-ball limit.`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startEditing = (ball: CountryBall) => {
    setEditingId(ball.id);
    setEditingText(ball.name);
  };

  const commitEdit = (id: string) => {
    const trimmed = editingText.trim();
    if (trimmed.length > 0) {
      onRenameBall(id, trimmed);
    }
    setEditingId(null);
  };

  const contenderA = balls[0];
  const contenderB = balls[1];

  return (
    <aside
      aria-label="Championship setup and flag lobby"
      className="glass-panel animate-slide-in flex flex-col gap-4 rounded-2xl p-4"
    >
      {/* VS Head-to-Head Matchup Banner when 2+ countries selected */}
      {balls.length >= 2 && contenderA && contenderB && (
        <div className="rounded-xl border border-[#FF2E63]/35 bg-gradient-to-r from-[#00D4FF]/10 via-[#FF2E63]/15 to-[#FFD700]/10 px-3 py-2.5 flex items-center justify-between gap-2 shadow-inner">
          <div className="flex items-center gap-2 min-w-0">
            <FlagAvatar ball={contenderA} size={30} className="animate-float-ball" />
            <span className="truncate text-xs font-bold text-white">{contenderA.name}</span>
          </div>

          <span className="font-display text-lg font-black tracking-wider text-[#FF2E63] animate-vs shrink-0 px-1">
            VS
          </span>

          <div className="flex items-center gap-2 min-w-0 justify-end">
            <span className="truncate text-xs font-bold text-white">{contenderB.name}</span>
            <FlagAvatar ball={contenderB} size={30} className="animate-float-ball" />
          </div>
        </div>
      )}

      {/* Game Modes, 100 Levels, Tournament, Elimination & Custom Builder */}
      <ModeBuilderControls
        gameMode={gameMode}
        difficulty={difficulty}
        currentLevel={currentLevel}
        completedLevels={completedLevels}
        obstacleCount={obstacleCount}
        trackHeight={trackHeight}
        disabled={disabled}
        balls={balls}
        tournamentState={tournamentState}
        eliminationState={eliminationState}
        customObstacles={customObstacles}
        selectedBuilderTool={selectedBuilderTool}
        builderNotice={builderNotice}
        onModeChange={onModeChange}
        onLevelChange={onLevelChange}
        onDifficultyChange={onDifficultyChange}
        onGenerateLevel={onGenerateLevel}
        onResetTournament={onResetTournament}
        onResetElimination={onResetElimination}
        onSelectBuilderTool={onSelectBuilderTool}
        onAddBuilderObstaclePreset={onAddBuilderObstaclePreset}
        onDeleteCustomObstacle={onDeleteCustomObstacle}
        onAttemptDeleteLockedWall={onAttemptDeleteLockedWall}
        onAutoFillCustomTrack={onAutoFillCustomTrack}
        onClearCustomObstacles={onClearCustomObstacles}
      />

      {/* Flag Upload System */}
      <section className="flex flex-col gap-2.5 border-b border-white/10 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base tracking-wide text-electric-gradient">
            Upload Country Flags
          </h2>
          <span className="font-mono-tabular text-xs text-[#FFD700]">
            {balls.length}/{MAX_BALLS} (min {MIN_BALLS})
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="country-name-input" className="text-xs font-semibold text-slate-200">
            Country Name (for next single flag upload)
          </label>
          <input
            id="country-name-input"
            type="text"
            value={countryNameInput}
            onChange={(e) => setCountryNameInput(e.target.value)}
            placeholder="e.g., Pakistan, Brazil, Canada..."
            disabled={disabled || !canAddBalls(balls.length)}
            maxLength={24}
            className="w-full rounded-xl bg-[#06091B]/80 border border-[#00D4FF]/30 px-3 py-2 text-xs font-medium text-white placeholder:text-slate-400 focus:outline-none focus:border-[#FFD700] disabled:opacity-50"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (!disabled) handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-3 transition-colors ${
            isDragging
              ? 'border-[#FFD700] bg-[#FFD700]/15'
              : 'border-[#00D4FF]/35 bg-[#06091B]/60 hover:border-[#00D4FF]/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={disabled || !canAddBalls(balls.length)}
            onChange={(e) => handleFiles(e.target.files)}
            className="sr-only"
            id="flag-file-upload"
            aria-label="Upload PNG or JPG flag images"
          />
          <button
            type="button"
            disabled={disabled || !canAddBalls(balls.length)}
            onClick={() => fileInputRef.current?.click()}
            className="btn-3d flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl bg-gradient-to-b from-[#00D4FF] to-blue-600 border-b-4 border-blue-900 text-xs font-bold text-[#050819] shadow-[0_6px_18px_rgba(0,212,255,0.35)] whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            <Upload className="w-4 h-4" />
            Upload PNG / JPG Flags
          </button>
          <p className="text-[11px] text-slate-300 text-center">
            Auto-cropped into 3D glossy marble balls
          </p>
        </div>

        {uploadError && (
          <p role="alert" className="text-xs font-semibold text-[#FF2E63]">
            {uploadError}
          </p>
        )}
      </section>

      {/* Lobby Grid with 3D Glossy Marble Balls + Hover Bounce */}
      <section className="flex flex-col gap-2.5 min-h-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm tracking-wide text-white">
            Active Racers ({balls.length})
          </h3>
          <button
            type="button"
            disabled={disabled}
            onClick={onResetDefaults}
            className="flex items-center gap-1 text-xs font-semibold text-[#00D4FF] hover:text-[#FFD700] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset 10 Defaults
          </button>
        </div>

        <div
          data-testid="lobby-ball-grid"
          className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1"
        >
          {balls.map((ball, idx) => {
            const isEditing = editingId === ball.id;
            const removable = canRemoveBall(balls.length);
            return (
              <div
                key={ball.id}
                style={{ animationDelay: `${idx * 30}ms` }}
                className="animate-drop-bounce group flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0A0F2B]/75 hover:border-[#FFD700]/60 hover:bg-[#141D4D]/90 px-2 py-1.5 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.03]"
              >
                <div className="transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5">
                  <FlagAvatar
                    ball={ball}
                    size={26}
                    className="animate-float-ball"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(ball.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        aria-label={`Edit name for ${ball.name}`}
                        maxLength={20}
                        autoFocus
                        className="w-full rounded bg-[#06091B] border border-[#FFD700] px-1.5 py-0.5 text-xs text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => commitEdit(ball.id)}
                        aria-label={`Save name for ${ball.name}`}
                        className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-0.5">
                      <span className="truncate text-[11px] font-bold text-white">
                        <span aria-hidden="true" className="mr-1">
                          {ball.emoji}
                        </span>
                        {ball.name}
                      </span>
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => startEditing(ball)}
                          aria-label={`Rename '${ball.name}'`}
                          className="p-0.5 text-slate-300 hover:text-[#FFD700] transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || !removable}
                          onClick={() => onDeleteBall(ball.id)}
                          aria-label={`Delete '${ball.name}'`}
                          title={removable ? `Delete ${ball.name}` : `Minimum ${MIN_BALLS} balls required`}
                          className="p-0.5 text-slate-300 hover:text-[#FF2E63] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
};
