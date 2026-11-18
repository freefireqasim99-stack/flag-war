import { AudioSettings, MusicTrackDef } from '../types/race';
import { DEFAULT_TRACK_ID, getTrackById } from './musicLibrary';

class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private commentaryGain: GainNode | null = null;

  // Dedicated MediaStreamDestination for 16:9 Video Recording
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  private recSfxGain: GainNode | null = null;
  private recMusicGain: GainNode | null = null;
  private recCommentaryGain: GainNode | null = null;
  private includeMusicInRec = true;
  private includeCommentaryInRec = true;

  private noiseBuffer: AudioBuffer | null = null;
  private settings: AudioSettings = {
    muted: false,
    volume: 0.7,
    sfxVolume: 0.7,
    musicVolume: 0.65,
    musicEnabled: true,
    selectedTrackId: DEFAULT_TRACK_ID,
    autoPickTrending: false,
    commentaryEnabled: true,
  };

  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicPlaying = false;
  private previewTrackId: string | null = null;
  private finishBoostActive = false;
  private raceProgressRatio = 0;
  private lastBounceAt = 0;
  private lastBallHitAt = 0;
  private lastCommentaryAt = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.commentaryGain = this.ctx.createGain();

      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this.commentaryGain.connect(this.ctx.destination);

      // Recording bus (independent of speaker mute state so MP4 exports cleanly)
      try {
        this.mediaDest = this.ctx.createMediaStreamDestination();
        this.recSfxGain = this.ctx.createGain();
        this.recMusicGain = this.ctx.createGain();
        this.recCommentaryGain = this.ctx.createGain();

        this.recSfxGain.connect(this.mediaDest);
        this.recMusicGain.connect(this.mediaDest);
        this.recCommentaryGain.connect(this.mediaDest);
      } catch {
        this.mediaDest = null;
      }

      this.syncGains();
      this.buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  private syncGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const muted = this.settings.muted;
    const sfxTarget = muted ? 0 : Math.max(0, Math.min(1, this.settings.sfxVolume));
    const finishMul = this.finishBoostActive ? 1.38 : 1.0;
    const musicEnabledNow =
      (this.settings.musicEnabled && this.settings.selectedTrackId !== 'none') ||
      Boolean(this.previewTrackId);
    const musicTarget =
      muted || !musicEnabledNow
        ? 0
        : Math.max(0, Math.min(1.35, this.settings.musicVolume * finishMul));
    const commTarget =
      muted || !this.settings.commentaryEnabled ? 0 : Math.max(0.25, sfxTarget);

    this.sfxGain?.gain.setTargetAtTime(sfxTarget, now, 0.025);
    this.musicGain?.gain.setTargetAtTime(musicTarget, now, 0.04);
    this.commentaryGain?.gain.setTargetAtTime(commTarget, now, 0.025);

    // Recording stream gains (respect MP4 toggles even if user muted desktop speakers)
    if (this.recSfxGain && this.recMusicGain && this.recCommentaryGain) {
      this.recSfxGain.gain.setTargetAtTime(
        Math.max(0.35, this.settings.sfxVolume),
        now,
        0.025
      );
      this.recMusicGain.gain.setTargetAtTime(
        this.includeMusicInRec && musicEnabledNow
          ? Math.max(0.25, Math.min(1.25, this.settings.musicVolume * finishMul))
          : 0,
        now,
        0.03
      );
      this.recCommentaryGain.gain.setTargetAtTime(
        this.includeCommentaryInRec ? 0.85 : 0,
        now,
        0.025
      );
    }
  }

  private routeSfx(node: AudioNode): void {
    if (this.sfxGain) node.connect(this.sfxGain);
    if (this.recSfxGain) node.connect(this.recSfxGain);
  }

  private routeMusic(node: AudioNode): void {
    if (this.musicGain) node.connect(this.musicGain);
    if (this.recMusicGain) node.connect(this.recMusicGain);
  }

  private routeCommentary(node: AudioNode): void {
    if (this.commentaryGain) node.connect(this.commentaryGain);
    if (this.recCommentaryGain) node.connect(this.recCommentaryGain);
  }

  public unlock(): void {
    this.ensureContext();
  }

  public getRecordingAudioStream(): MediaStream | null {
    this.ensureContext();
    return this.mediaDest?.stream ?? null;
  }

  public setRecordingAudioOptions(opts: {
    includeMusic: boolean;
    includeCommentary: boolean;
  }): void {
    this.includeMusicInRec = opts.includeMusic;
    this.includeCommentaryInRec = opts.includeCommentary;
    this.syncGains();
  }

  public updateSettings(next: AudioSettings): void {
    const prevTrack = this.settings.selectedTrackId;
    this.settings = { ...next };
    this.syncGains();

    if (next.selectedTrackId === 'none' || !next.musicEnabled || next.muted) {
      if (!this.previewTrackId) {
        this.stopMusic(true);
      }
    } else if (this.musicPlaying) {
      if (prevTrack !== next.selectedTrackId) {
        this.restartScheduler();
      } else if (this.musicTimer === null) {
        this.startMusic();
      }
    }
  }

  public setRaceProgress(ratio01: number): void {
    this.raceProgressRatio = Math.max(0, Math.min(1, ratio01));
  }

  public getPreviewTrackId(): string | null {
    return this.previewTrackId;
  }

  public previewTrack(trackId: string): void {
    this.ensureContext();
    if (this.previewTrackId === trackId) {
      this.stopPreview();
      return;
    }
    this.previewTrackId = trackId;
    this.finishBoostActive = false;
    this.syncGains();
    this.restartScheduler();
  }

  public stopPreview(): void {
    this.previewTrackId = null;
    if (!this.musicPlaying) {
      this.stopScheduler();
    } else {
      this.restartScheduler();
    }
    this.syncGains();
  }

  public triggerFinishDrop(): void {
    this.finishBoostActive = true;
    this.syncGains();
    const ctx = this.ensureContext();
    if (!ctx) return;

    // 808 Sub Drop + White Noise Crash at Winner Crossing
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.65);
    subGain.gain.setValueAtTime(0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    sub.connect(subGain);
    this.routeMusic(subGain);
    sub.start(now);
    sub.stop(now + 0.75);

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3400;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      src.connect(hp);
      hp.connect(ng);
      this.routeMusic(ng);
      src.start(now);
      src.stop(now + 0.58);
    }
  }

  public restoreMusicLevel(): void {
    this.finishBoostActive = false;
    this.raceProgressRatio = 0;
    this.syncGains();
  }

  public announceCommentary(
    phrase: string,
    tone: 'countdown' | 'overtake' | 'photofinish' | 'winner'
  ): void {
    const perfNow = performance.now();
    if (tone === 'overtake' && perfNow - this.lastCommentaryAt < 4200) return;
    this.lastCommentaryAt = perfNow;

    const ctx = this.ensureContext();
    if (ctx && (this.includeCommentaryInRec || this.settings.commentaryEnabled)) {
      // Broadcast PA chime / announcer inflection recorded directly into MediaStream!
      const now = ctx.currentTime;
      const notes =
        tone === 'winner'
          ? [523.25, 659.25, 783.99, 1046.5]
          : tone === 'photofinish'
          ? [659.25, 880, 1174.66]
          : tone === 'overtake'
          ? [440, 587.33]
          : [523.25];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const form = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.065);
        form.type = 'bandpass';
        form.frequency.setValueAtTime(1450, now + idx * 0.065);
        form.Q.value = 1.6;
        g.gain.setValueAtTime(0.09, now + idx * 0.065);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.16);
        osc.connect(form);
        form.connect(g);
        this.routeCommentary(g);
        osc.start(now + idx * 0.065);
        osc.stop(now + idx * 0.065 + 0.17);
      });
    }

    // Live Web Speech API broadcast voice when commentary is ON and not muted
    if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      this.settings.commentaryEnabled &&
      !this.settings.muted
    ) {
      try {
        if (tone === 'winner' || tone === 'photofinish') {
          window.speechSynthesis.cancel();
        }
        if (window.speechSynthesis.speaking && tone === 'overtake') return;
        const utter = new SpeechSynthesisUtterance(phrase);
        utter.rate = tone === 'countdown' ? 1.18 : 1.08;
        utter.pitch = tone === 'winner' ? 1.16 : 1.04;
        utter.volume = Math.max(0.2, Math.min(1, this.settings.sfxVolume));
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore speechSynthesis errors in headless/locked tabs
      }
    }
  }

  public stopCommentarySpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  public playCountdownBeep(step: 3 | 2 | 1 | 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (step === 0) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.14);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(261.63, now);
      subGain.gain.setValueAtTime(0.32, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      sub.connect(subGain);
      this.routeSfx(subGain);
      sub.start(now);
      sub.stop(now + 0.46);
    } else {
      osc.type = 'triangle';
      const freq = step === 3 ? 440 : step === 2 ? 493.88 : 587.33;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    }

    osc.connect(gain);
    this.routeSfx(gain);
    osc.start(now);
    osc.stop(now + (step === 0 ? 0.5 : 0.24));
  }

  public playWallBounce(intensity = 0.5): void {
    const perfNow = performance.now();
    if (perfNow - this.lastBounceAt < 50) return;
    this.lastBounceAt = perfNow;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const amp = Math.min(0.16, 0.04 + intensity * 0.11);
    const pitch = 180 + Math.random() * 90 + intensity * 120;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.08);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    this.routeSfx(gain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playWallThud(intensity = 0.6): void {
    const perfNow = performance.now();
    if (perfNow - this.lastBounceAt < 45) return;
    this.lastBounceAt = perfNow;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const amp = Math.min(0.24, 0.08 + intensity * 0.14);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(125 + intensity * 35, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    this.routeSfx(gain);
    osc.start(now);
    osc.stop(now + 0.125);
  }

  public playBallCollision(intensity = 0.5): void {
    const perfNow = performance.now();
    if (perfNow - this.lastBallHitAt < 40) return;
    this.lastBallHitAt = perfNow;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const amp = Math.min(0.15, 0.03 + intensity * 0.09);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620 + Math.random() * 180, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.055);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    this.routeSfx(gain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playBumperHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.09);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    this.routeSfx(gain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playFinishCheer(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.linearRampToValueAtTime(1450, now + 0.45);
      filter.Q.value = 1.4;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

      src.connect(filter);
      filter.connect(gain);
      this.routeSfx(gain);
      src.start(now);
      src.stop(now + 1.0);
    }

    [659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.15, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
      osc.connect(gain);
      this.routeSfx(gain);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.27);
    });
  }

  public playDrumRoll(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const hits = 14;
    for (let i = 0; i < hits; i++) {
      const t = now + i * 0.055;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1200;

      const gain = ctx.createGain();
      const amp = 0.05 + (i / hits) * 0.16;
      gain.gain.setValueAtTime(amp, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      src.connect(filter);
      filter.connect(gain);
      this.routeSfx(gain);
      src.start(t);
      src.stop(t + 0.055);
    }
  }

  public playWinnerFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0, d: 0.16 },
      { f: 659.25, t: 0.15, d: 0.16 },
      { f: 783.99, t: 0.3, d: 0.18 },
      { f: 1046.5, t: 0.48, d: 0.65 },
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc2.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      osc2.frequency.setValueAtTime(n.f * 0.5, now + n.t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, now + n.t);

      gain.gain.setValueAtTime(0.001, now + n.t);
      gain.gain.linearRampToValueAtTime(0.2, now + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      this.routeSfx(gain);

      osc.start(now + n.t);
      osc2.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.03);
      osc2.stop(now + n.t + n.d + 0.03);
    });
  }

  private getActiveTrack(): MusicTrackDef | null {
    if (this.previewTrackId) {
      return getTrackById(this.previewTrackId);
    }
    if (!this.settings.musicEnabled || this.settings.selectedTrackId === 'none') {
      return null;
    }
    return getTrackById(this.settings.selectedTrackId);
  }

  private scheduleMusicStep(): void {
    const track = this.getActiveTrack();
    if (!this.ctx || !track) return;

    const now = this.ctx.currentTime;
    const step = this.musicStep % 8;
    const buildupSemitone =
      track.isBuildup && this.raceProgressRatio > 0.25
        ? Math.pow(2, Math.floor(this.raceProgressRatio * 5) / 12)
        : 1;
    const intensityBoost = this.finishBoostActive ? 1.28 : 1.0;

    // 1. Punchy 808 / Arena Kick on even steps
    if (step % 2 === 0 || (this.finishBoostActive && step === 5)) {
      const kick = this.ctx.createOscillator();
      const kGain = this.ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(145, now);
      kick.frequency.exponentialRampToValueAtTime(42, now + 0.12);
      kGain.gain.setValueAtTime(0.2 * intensityBoost, now);
      kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      kick.connect(kGain);
      this.routeMusic(kGain);
      kick.start(now);
      kick.stop(now + 0.15);
    }

    // 2. Snare / Clap on backbeats (step 2 & 6)
    if ((step === 2 || step === 6) && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1850;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.095 * intensityBoost, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      src.connect(bp);
      bp.connect(sg);
      this.routeMusic(sg);
      src.start(now);
      src.stop(now + 0.12);
    }

    // 3. Crisp Hi-Hat on off-beats
    if (step % 2 === 1 && this.noiseBuffer) {
      const hat = this.ctx.createBufferSource();
      hat.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6500;
      const hg = this.ctx.createGain();
      hg.gain.setValueAtTime(0.036 * intensityBoost, now);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      hat.connect(hp);
      hp.connect(hg);
      this.routeMusic(hg);
      hat.start(now);
      hat.stop(now + 0.05);
    }

    // 4. Driving Synth Bass
    const bassFreq = track.bassNotes[step % track.bassNotes.length] * buildupSemitone;
    if (bassFreq > 0) {
      const bass = this.ctx.createOscillator();
      const bFilter = this.ctx.createBiquadFilter();
      const bGain = this.ctx.createGain();
      bass.type = track.bassWave;
      bass.frequency.setValueAtTime(bassFreq, now);
      bFilter.type = 'lowpass';
      bFilter.frequency.setValueAtTime(this.finishBoostActive ? 820 : 520, now);
      bGain.gain.setValueAtTime(0.1 * intensityBoost, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      bass.connect(bFilter);
      bFilter.connect(bGain);
      this.routeMusic(bGain);
      bass.start(now);
      bass.stop(now + 0.21);
    }

    // 5. Lead Synth / Brass Horn
    const leadFreq = track.leadNotes[step % track.leadNotes.length] * buildupSemitone;
    if (leadFreq > 0) {
      const lead = this.ctx.createOscillator();
      const lGain = this.ctx.createGain();
      lead.type = track.leadWave;
      lead.frequency.setValueAtTime(leadFreq, now);
      lGain.gain.setValueAtTime((track.hasHorns ? 0.065 : 0.048) * intensityBoost, now);
      lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      lead.connect(lGain);
      this.routeMusic(lGain);
      lead.start(now);
      lead.stop(now + 0.18);

      if (track.hasHorns && step % 4 === 0) {
        const hornFifth = this.ctx.createOscillator();
        const hGain = this.ctx.createGain();
        hornFifth.type = 'sawtooth';
        hornFifth.frequency.setValueAtTime(leadFreq * 0.749, now);
        hGain.gain.setValueAtTime(0.04 * intensityBoost, now);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        hornFifth.connect(hGain);
        this.routeMusic(hGain);
        hornFifth.start(now);
        hornFifth.stop(now + 0.24);
      }
    }

    // 6. Optional Phonk Cowbell
    if (track.hasCowbell && (step === 0 || step === 3 || step === 4 || step === 6)) {
      [540, 800].forEach((cf) => {
        const cb = this.ctx!.createOscillator();
        const cg = this.ctx!.createGain();
        cb.type = 'square';
        cb.frequency.setValueAtTime(cf, now);
        cg.gain.setValueAtTime(0.032 * intensityBoost, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        cb.connect(cg);
        this.routeMusic(cg);
        cb.start(now);
        cb.stop(now + 0.09);
      });
    }

    // 7. Optional Chiptune / Viral Arpeggio
    if (track.arpNotes && track.arpNotes.length > 0) {
      const arpF = track.arpNotes[this.musicStep % track.arpNotes.length] * buildupSemitone;
      const arp = this.ctx.createOscillator();
      const ag = this.ctx.createGain();
      arp.type = 'square';
      arp.frequency.setValueAtTime(arpF, now);
      ag.gain.setValueAtTime(0.025 * intensityBoost, now);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      arp.connect(ag);
      this.routeMusic(ag);
      arp.start(now);
      arp.stop(now + 0.1);
    }

    this.musicStep++;
  }

  private stopScheduler(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private restartScheduler(): void {
    this.stopScheduler();
    const ctx = this.ensureContext();
    const track = this.getActiveTrack();
    if (!ctx || !track) return;

    const eighthMs = Math.max(130, Math.round(60000 / track.bpm / 2));
    this.musicStep = 0;
    this.scheduleMusicStep();
    this.musicTimer = window.setInterval(() => {
      if (!this.musicPlaying && !this.previewTrackId) return;
      this.scheduleMusicStep();
    }, eighthMs);
  }

  public startMusic(): void {
    this.previewTrackId = null;
    this.musicPlaying = true;
    this.syncGains();
    if (!this.settings.musicEnabled || this.settings.selectedTrackId === 'none') {
      this.stopScheduler();
      return;
    }
    this.restartScheduler();
  }

  public stopMusic(keepIntent = false): void {
    if (!keepIntent) {
      this.musicPlaying = false;
      this.finishBoostActive = false;
    }
    if (!this.previewTrackId) {
      this.stopScheduler();
    }
    this.syncGains();
  }
}

export const audioEngine = new RaceAudioEngine();
