import {
  CountryBall,
  Difficulty,
  RaceStanding,
  RecordedVideoItem,
  VideoQuality,
} from '../types/race';
import { applyGlossy3DBallOverlay, getFlagTextureCanvas } from './flags';

export const RECORD_FPS = 30;
export const POST_WIN_PODIUM_HOLD_MS = 3000;
export const SHORT_CLIP_SECONDS = 30;

export function computeExportDimensions(quality: VideoQuality): {
  width: number;
  height: number;
} {
  return quality === '1080p'
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

export function sanitizeFilenamePart(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 32) : 'Champion';
}

export function formatLevelSlugForFilename(
  levelNumber?: number,
  difficulty?: Difficulty,
  modeSlug?: string
): string {
  if (typeof levelNumber === 'number' && levelNumber >= 1) {
    return String(levelNumber);
  }
  if (modeSlug) return sanitizeFilenamePart(modeSlug);
  return difficulty ? sanitizeFilenamePart(difficulty) : 'Custom';
}

/**
 * Generates required filename format:
 * Full Race: FlagRace_Level_[LEVEL]_[WINNER]_FullRace.mp4
 * Short 30s: FlagRace_Level_[LEVEL]_[WINNER]_Short30s.mp4
 */
export function buildRaceVideoFilename(
  levelLabel: string,
  winnerName: string,
  isShort = false,
  ext: 'mp4' | 'webm' = 'mp4'
): string {
  const safeLevel = sanitizeFilenamePart(levelLabel);
  const safeWinner = sanitizeFilenamePart(winnerName);
  const suffix = isShort ? 'Short30s' : 'FullRace';
  return `FlagRace_Level_${safeLevel}_${safeWinner}_${suffix}.${ext}`;
}

export function computeShortClipStartSec(
  totalDurationSec: number,
  clipSeconds = SHORT_CLIP_SECONDS
): number {
  if (!Number.isFinite(totalDurationSec) || totalDurationSec <= 0) return 0;
  return Math.max(0, Number((totalDurationSec - clipSeconds).toFixed(2)));
}

export function selectBestRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm';
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Composites a 16:9 1080p/720p broadcast frame onto exportCtx from the live arena canvas,
 * adding only in-canvas Countdown, Live Race ticker, Photo Finish banner,
 * and the 3-second Winner Podium + Winner Announcement screen.
 */
let cachedBgCanvas: HTMLCanvasElement | null = null;
let cachedBgW = 0;
let cachedBgH = 0;

function getExportBgCanvas(exportW: number, exportH: number): HTMLCanvasElement {
  if (cachedBgCanvas && cachedBgW === exportW && cachedBgH === exportH) {
    return cachedBgCanvas;
  }
  const c = document.createElement('canvas');
  c.width = exportW;
  c.height = exportH;
  const gctx = c.getContext('2d');
  if (gctx) {
    const bg = gctx.createLinearGradient(0, 0, exportW, exportH);
    bg.addColorStop(0, '#040717');
    bg.addColorStop(0.5, '#0A0F2B');
    bg.addColorStop(1, '#040717');
    gctx.fillStyle = bg;
    gctx.fillRect(0, 0, exportW, exportH);
  }
  cachedBgCanvas = c;
  cachedBgW = exportW;
  cachedBgH = exportH;
  return c;
}

export function renderExportBroadcastFrame(params: {
  exportCtx: CanvasRenderingContext2D;
  exportW: number;
  exportH: number;
  sourceCanvas: HTMLCanvasElement;
  standings: RaceStanding[];
  balls: CountryBall[];
  levelTitle: string;
  raceElapsedMs: number;
  countdownStep: number | null;
  photoFinishActive: boolean;
  podiumPhaseProgress: number | null; // 0..1 during 3-second Winner Podium hold
  winnerName: string | null;
  nowMs: number;
}): void {
  const {
    exportCtx,
    exportW,
    exportH,
    sourceCanvas,
    standings,
    balls,
    levelTitle,
    raceElapsedMs,
    countdownStep,
    photoFinishActive,
    podiumPhaseProgress,
    winnerName,
    nowMs,
  } = params;

  // Cached deep stadium letterbox backdrop
  exportCtx.drawImage(getExportBgCanvas(exportW, exportH), 0, 0);

  // Fit source arena canvas cleanly centered inside 16:9 frame (preserving full vertical arena)
  const srcW = Math.max(1, sourceCanvas.width);
  const srcH = Math.max(1, sourceCanvas.height);
  const scale = Math.min(exportW / srcW, exportH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (exportW - drawW) / 2;
  const dy = (exportH - drawH) / 2;

  exportCtx.drawImage(sourceCanvas, dx, dy, drawW, drawH);

  // Side broadcast pillar accents (fills any wide margins cleanly on 16:9)
  const marginW = dx;
  if (marginW > 80) {
    exportCtx.save();
    exportCtx.fillStyle = 'rgba(10, 15, 43, 0.85)';
    exportCtx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
    exportCtx.lineWidth = 2;

    // Left Broadcast Title + Top-5 Mini Standings Card
    const cardW = Math.min(marginW - 36, 300);
    const cardX = 18;
    const cardY = 24;
    exportCtx.fillRect(cardX, cardY, cardW, Math.min(exportH - 48, 430));
    exportCtx.strokeRect(cardX, cardY, cardW, Math.min(exportH - 48, 430));

    exportCtx.fillStyle = '#FFD700';
    exportCtx.font = `800 ${Math.round(exportH * 0.024)}px "Bungee", sans-serif`;
    exportCtx.textAlign = 'left';
    exportCtx.fillText('FLAG BALL RACE', cardX + 16, cardY + 38);

    exportCtx.fillStyle = '#00D4FF';
    exportCtx.font = `700 ${Math.round(exportH * 0.015)}px "JetBrains Mono", monospace`;
    exportCtx.fillText(levelTitle.toUpperCase(), cardX + 16, cardY + 62);

    const mins = Math.floor(raceElapsedMs / 60000);
    const secs = Math.floor((raceElapsedMs % 60000) / 1000);
    const ms = Math.floor((raceElapsedMs % 1000) / 10);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    exportCtx.fillStyle = '#FFFFFF';
    exportCtx.fillText(`TIME  ${timeStr}`, cardX + 16, cardY + 86);

    const topRows = standings.slice(0, 8);
    topRows.forEach((row, i) => {
      const ry = cardY + 114 + i * 36;
      exportCtx.fillStyle =
        i === 0
          ? 'rgba(255, 215, 0, 0.2)'
          : i === 1
          ? 'rgba(148, 163, 184, 0.16)'
          : 'rgba(255, 255, 255, 0.05)';
      exportCtx.fillRect(cardX + 12, ry, cardW - 24, 28);
      exportCtx.fillStyle = i === 0 ? '#FFD700' : '#FFFFFF';
      exportCtx.font = `700 ${Math.round(exportH * 0.015)}px "Poppins", sans-serif`;
      exportCtx.fillText(`#${row.rank} ${row.name.slice(0, 12)}`, cardX + 20, ry + 19);
      exportCtx.textAlign = 'right';
      exportCtx.fillStyle = '#00D4FF';
      exportCtx.fillText(`${row.progress}%`, cardX + cardW - 20, ry + 19);
      exportCtx.textAlign = 'left';
    });

    // Right Live Leader Highlight Card
    const rightX = exportW - cardW - 18;
    exportCtx.fillStyle = 'rgba(10, 15, 43, 0.85)';
    exportCtx.fillRect(rightX, cardY, cardW, 148);
    exportCtx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
    exportCtx.strokeRect(rightX, cardY, cardW, 148);

    exportCtx.fillStyle = '#FF2E63';
    exportCtx.beginPath();
    exportCtx.arc(rightX + 24, cardY + 26, 6, 0, Math.PI * 2);
    exportCtx.fill();

    exportCtx.fillStyle = '#FFFFFF';
    exportCtx.font = `800 ${Math.round(exportH * 0.015)}px "JetBrains Mono", monospace`;
    exportCtx.fillText('WORLD STADIUM LIVE', rightX + 38, cardY + 31);

    const leader = standings[0];
    exportCtx.fillStyle = '#FFD700';
    exportCtx.font = `800 ${Math.round(exportH * 0.025)}px "Bungee", sans-serif`;
    exportCtx.fillText(
      leader ? `#1 ${leader.name.toUpperCase().slice(0, 11)}` : 'READY',
      rightX + 18,
      cardY + 78
    );

    exportCtx.fillStyle = '#00D4FF';
    exportCtx.font = `700 ${Math.round(exportH * 0.016)}px "JetBrains Mono", monospace`;
    if (leader) {
      exportCtx.fillText(
        `CP ${leader.checkpoint}/${leader.totalCheckpoints} · ${leader.progress}%`,
        rightX + 18,
        cardY + 114
      );
    }
    exportCtx.restore();
  }

  // Countdown Overlay directly inside 16:9 canvas
  if (countdownStep !== null) {
    exportCtx.save();
    const boxW = exportW * 0.22;
    const boxH = exportH * 0.24;
    const bx = (exportW - boxW) / 2;
    const by = (exportH - boxH) / 2;

    exportCtx.fillStyle = 'rgba(10, 15, 43, 0.92)';
    exportCtx.strokeStyle = '#FFD700';
    exportCtx.lineWidth = 6;
    exportCtx.beginPath();
    exportCtx.roundRect(bx, by, boxW, boxH, 28);
    exportCtx.fill();
    exportCtx.stroke();

    exportCtx.fillStyle = '#FFD700';
    exportCtx.font = `800 ${Math.round(exportH * 0.14)}px "Bungee", sans-serif`;
    exportCtx.textAlign = 'center';
    exportCtx.textBaseline = 'middle';
    exportCtx.fillText(countdownStep === 0 ? 'GO!' : String(countdownStep), exportW / 2, exportH / 2 + 4);
    exportCtx.restore();
  }

  // Photo Finish Broadcast Flash Banner
  if (photoFinishActive && podiumPhaseProgress === null) {
    exportCtx.save();
    const bannerH = exportH * 0.11;
    const by = exportH * 0.08;
    exportCtx.fillStyle = 'rgba(255, 46, 99, 0.92)';
    exportCtx.fillRect(0, by, exportW, bannerH);
    exportCtx.fillStyle = '#FFD700';
    exportCtx.fillRect(0, by, exportW, 5);
    exportCtx.fillRect(0, by + bannerH - 5, exportW, 5);

    exportCtx.fillStyle = '#FFFFFF';
    exportCtx.font = `800 ${Math.round(exportH * 0.044)}px "Bungee", sans-serif`;
    exportCtx.textAlign = 'center';
    exportCtx.textBaseline = 'middle';
    exportCtx.fillText(
      `📸 PHOTO FINISH! ${winnerName ? `${winnerName.toUpperCase()} CROSSES FIRST!` : ''}`,
      exportW / 2,
      by + bannerH / 2
    );
    exportCtx.restore();
  }

  // 3-Second Winner Podium + Winner Announcement Screen ON Export Canvas
  if (podiumPhaseProgress !== null) {
    const fadeIn = Math.min(1, podiumPhaseProgress * 4);
    const ballMap = new Map(balls.map((b) => [b.id, b]));
    const first = standings[0];
    const second = standings[1];
    const third = standings[2];

    exportCtx.save();
    exportCtx.globalAlpha = fadeIn;
    exportCtx.fillStyle = 'rgba(4, 7, 23, 0.88)';
    exportCtx.fillRect(0, 0, exportW, exportH);

    // Stadium golden & cyan radial spotlights
    const spotLeft = exportCtx.createRadialGradient(
      exportW * 0.3,
      0,
      20,
      exportW * 0.3,
      exportH * 0.4,
      exportH * 0.8
    );
    spotLeft.addColorStop(0, 'rgba(255, 215, 0, 0.36)');
    spotLeft.addColorStop(1, 'rgba(255, 215, 0, 0)');
    exportCtx.fillStyle = spotLeft;
    exportCtx.fillRect(0, 0, exportW, exportH);

    const spotRight = exportCtx.createRadialGradient(
      exportW * 0.7,
      0,
      20,
      exportW * 0.7,
      exportH * 0.4,
      exportH * 0.8
    );
    spotRight.addColorStop(0, 'rgba(0, 212, 255, 0.3)');
    spotRight.addColorStop(1, 'rgba(0, 212, 255, 0)');
    exportCtx.fillStyle = spotRight;
    exportCtx.fillRect(0, 0, exportW, exportH);

    // Winner Announcement Headline
    exportCtx.textAlign = 'center';
    exportCtx.fillStyle = '#00D4FF';
    exportCtx.font = `700 ${Math.round(exportH * 0.025)}px "JetBrains Mono", monospace`;
    exportCtx.fillText(levelTitle.toUpperCase(), exportW / 2, exportH * 0.11);

    exportCtx.fillStyle = '#FFD700';
    exportCtx.font = `800 ${Math.round(exportH * 0.068)}px "Bungee", sans-serif`;
    exportCtx.fillText(
      `🏆 ${first ? `${first.name.toUpperCase()} WINS!` : 'CHAMPION CROWNED!'} 🏆`,
      exportW / 2,
      exportH * 0.2
    );

    // Draw Podium Steps (2nd Left, 1st Center, 3rd Right)
    const baseLineY = exportH * 0.84;
    const drawStep = (
      standing: RaceStanding | undefined,
      cx: number,
      pedW: number,
      pedH: number,
      gradTop: string,
      gradBot: string,
      rimColor: string,
      label: string,
      isChampion: boolean
    ) => {
      if (!standing) return;
      const ball = ballMap.get(standing.id);
      if (!ball) return;

      const py = baseLineY - pedH;
      const pGrad = exportCtx.createLinearGradient(0, py, 0, baseLineY);
      pGrad.addColorStop(0, gradTop);
      pGrad.addColorStop(1, gradBot);
      exportCtx.fillStyle = pGrad;
      exportCtx.fillRect(cx - pedW / 2, py, pedW, pedH);

      exportCtx.fillStyle = rimColor;
      exportCtx.fillRect(cx - pedW / 2, py, pedW, 8);

      exportCtx.fillStyle = '#FFFFFF';
      exportCtx.font = `800 ${Math.round(exportH * 0.04)}px "Bungee", sans-serif`;
      exportCtx.fillText(label, cx, py + exportH * 0.068);

      const ballR = isChampion ? exportH * 0.082 : exportH * 0.062;
      const floatOff = isChampion ? Math.sin(nowMs * 0.008) * 6 : 0;
      const ballCy = py - ballR - exportH * 0.08 + floatOff;

      if (isChampion) {
        exportCtx.font = `${Math.round(exportH * 0.055)}px sans-serif`;
        exportCtx.fillText('👑', cx, ballCy - ballR - exportH * 0.032);
      }

      const tex = getFlagTextureCanvas(ball, 128);
      if (tex) {
        exportCtx.save();
        exportCtx.beginPath();
        exportCtx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
        exportCtx.clip();
        exportCtx.drawImage(tex, cx - ballR, ballCy - ballR, ballR * 2, ballR * 2);
        exportCtx.restore();
      }
      applyGlossy3DBallOverlay(exportCtx, cx, ballCy, ballR);

      exportCtx.fillStyle = '#FFFFFF';
      exportCtx.font = `800 ${Math.round(exportH * 0.026)}px "Poppins", sans-serif`;
      exportCtx.fillText(`${ball.emoji} ${standing.name}`, cx, py - exportH * 0.03);
    };

    drawStep(
      second,
      exportW * 0.28,
      exportW * 0.16,
      exportH * 0.22,
      'rgba(148, 163, 184, 0.55)',
      'rgba(15, 23, 42, 0.9)',
      '#E2E8F0',
      '2ND',
      false
    );
    drawStep(
      first,
      exportW * 0.5,
      exportW * 0.2,
      exportH * 0.31,
      'rgba(255, 215, 0, 0.65)',
      'rgba(146, 64, 14, 0.85)',
      '#FFD700',
      '1ST',
      true
    );
    drawStep(
      third,
      exportW * 0.72,
      exportW * 0.16,
      exportH * 0.17,
      'rgba(217, 119, 6, 0.5)',
      'rgba(69, 26, 3, 0.9)',
      '#F59E0B',
      '3RD',
      false
    );

    exportCtx.restore();
  }
}

// ==================== INDEXED DB "MY VIDEOS" GALLERY ====================
const DB_NAME = 'flagBallRaceVideosDB';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

function openVideosDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function saveRecordedVideo(item: RecordedVideoItem): Promise<void> {
  const db = await openVideosDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to save video'));
    };
  });
}

export async function listRecordedVideos(): Promise<RecordedVideoItem[]> {
  try {
    const db = await openVideosDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        const items = (req.result as RecordedVideoItem[]) ?? [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

export async function deleteRecordedVideo(id: string): Promise<void> {
  const db = await openVideosDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ==================== FFMPEG.WASM VIA CDN CONVERTER ====================
interface FFmpegInstance {
  load(opts: { coreURL: string; wasmURL: string; classWorkerURL?: string }): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  on(event: 'progress', cb: (evt: { progress: number; time: number }) => void): void;
  off?(event: 'progress', cb: (evt: { progress: number; time: number }) => void): void;
}

let cachedFFmpeg: FFmpegInstance | null = null;
let ffmpegLoadingPromise: Promise<FFmpegInstance> | null = null;

async function fetchToBlobUrl(url: string, mimeType: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`CDN fetch failed (${resp.status}) for ${url}`);
  }
  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: mimeType });
  return URL.createObjectURL(blob);
}

function loadScriptTag(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function getFFmpegInstance(onProgress: (pct: number) => void): Promise<FFmpegInstance> {
  if (cachedFFmpeg) return cachedFFmpeg;
  if (ffmpegLoadingPromise) return ffmpegLoadingPromise;

  ffmpegLoadingPromise = (async () => {
    onProgress(5);
    const cdnBases = [
      'https://cdn.jsdelivr.net/npm',
      'https://unpkg.com',
    ];

    let lastErr: unknown = null;
    for (const base of cdnBases) {
      try {
        await loadScriptTag(`${base}/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js`);
        const globalFF = (window as unknown as {
          FFmpegWASM?: { FFmpeg: new () => FFmpegInstance };
        }).FFmpegWASM;

        if (!globalFF?.FFmpeg) {
          throw new Error('FFmpegWASM global not initialized');
        }

        onProgress(12);
        const [classWorkerURL, coreURL, wasmURL] = await Promise.all([
          fetchToBlobUrl(
            `${base}/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js`,
            'text/javascript'
          ),
          fetchToBlobUrl(
            `${base}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js`,
            'text/javascript'
          ),
          fetchToBlobUrl(
            `${base}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm`,
            'application/wasm'
          ),
        ]);

        onProgress(24);
        const ffmpeg = new globalFF.FFmpeg();
        await ffmpeg.load({
          classWorkerURL,
          coreURL,
          wasmURL,
        });

        cachedFFmpeg = ffmpeg;
        onProgress(32);
        return ffmpeg;
      } catch (err) {
        lastErr = err;
      }
    }

    ffmpegLoadingPromise = null;
    throw lastErr instanceof Error ? lastErr : new Error('Unable to load ffmpeg.wasm from CDN');
  })();

  return ffmpegLoadingPromise;
}

export async function convertWebmToMp4(
  webmBlob: Blob,
  options: {
    startSec?: number;
    muteAudio?: boolean;
    onProgress: (pct: number) => void;
  }
): Promise<Blob> {
  const { startSec = 0, muteAudio = false, onProgress } = options;
  const ffmpeg = await getFFmpegInstance(onProgress);

  const inputName = `input_${Date.now()}.webm`;
  const outputName = `output_${Date.now()}.mp4`;

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.min(99, Math.max(32, Math.round(32 + progress * 67)));
    onProgress(pct);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    const bytes = new Uint8Array(await webmBlob.arrayBuffer());
    await ffmpeg.writeFile(inputName, bytes);

    const args: string[] = [];
    if (startSec > 0) {
      args.push('-ss', String(startSec));
    }
    args.push(
      '-i',
      inputName,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(RECORD_FPS)
    );
    if (muteAudio) {
      args.push('-an');
    } else {
      args.push('-c:a', 'aac', '-b:a', '128k');
    }
    args.push('-movflags', '+faststart', outputName);

    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`FFmpeg conversion exited with code ${exitCode}`);
    }

    const mp4Data = await ffmpeg.readFile(outputName);
    onProgress(100);
    const mp4Buffer = mp4Data.buffer.slice(
      mp4Data.byteOffset,
      mp4Data.byteOffset + mp4Data.byteLength
    ) as ArrayBuffer;
    return new Blob([mp4Buffer], { type: 'video/mp4' });
  } finally {
    ffmpeg.off?.('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore cleanup
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore cleanup
    }
  }
}
