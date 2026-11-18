import { CountryBall, Difficulty, RaceStanding } from '../types/race';
import { applyGlossy3DBallOverlay, getFlagTextureCanvas } from './flags';
import { formatRaceTime } from './raceLogic';

export function downloadWinnerPodiumImage(
  standings: RaceStanding[],
  balls: CountryBall[],
  difficulty: Difficulty
): void {
  const width = 1200;
  const height = 675;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // World Stadium Night Backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#050819');
  bg.addColorStop(0.5, '#0A0F2B');
  bg.addColorStop(1, '#070B22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Volumetric spotlight cones
  const cone = ctx.createRadialGradient(width / 2, 100, 30, width / 2, 260, 560);
  cone.addColorStop(0, 'rgba(255, 215, 0, 0.32)');
  cone.addColorStop(0.5, 'rgba(0, 212, 255, 0.12)');
  cone.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = cone;
  ctx.fillRect(0, 0, width, height);

  const first = standings[0];

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00D4FF';
  ctx.font = '700 20px "Poppins", sans-serif';
  ctx.fillText(`WORLD STADIUM · ${difficulty.toUpperCase()} TRACK`, width / 2, 50);

  ctx.fillStyle = '#FFD700';
  ctx.font = '700 50px "Bungee", sans-serif';
  ctx.fillText(
    first ? `${first.name.toUpperCase()} WINS!` : 'FLAG BALL RACE CHAMPION',
    width / 2,
    108
  );

  const ballMap = new Map(balls.map((b) => [b.id, b]));
  const podiumSlots = [
    { standing: standings[1], x: 310, baseTop: 345, h: 185, medal: '2ND', color: '#E2E8F0', r: 48 },
    { standing: standings[0], x: 600, baseTop: 280, h: 250, medal: '1ST', color: '#FFD700', r: 66 },
    { standing: standings[2], x: 890, baseTop: 375, h: 155, medal: '3RD', color: '#F59E0B', r: 44 },
  ];

  podiumSlots.forEach((slot) => {
    if (!slot.standing) return;
    const ball = ballMap.get(slot.standing.id);

    const blockW = 220;
    const grad = ctx.createLinearGradient(0, slot.baseTop, 0, slot.baseTop + slot.h);
    grad.addColorStop(0, '#1B2554');
    grad.addColorStop(1, '#070B22');
    ctx.fillStyle = grad;
    ctx.fillRect(slot.x - blockW / 2, slot.baseTop, blockW, slot.h);

    ctx.fillStyle = slot.color;
    ctx.fillRect(slot.x - blockW / 2, slot.baseTop, blockW, 7);

    const by = slot.baseTop - slot.r - 18;
    ctx.save();
    ctx.shadowColor = slot.medal === '1ST' ? 'rgba(255, 215, 0, 0.7)' : 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(slot.x, by, slot.r, 0, Math.PI * 2);
    ctx.fillStyle = '#0A0F2B';
    ctx.fill();
    ctx.restore();

    if (ball) {
      const tex = getFlagTextureCanvas(ball, 256);
      if (tex) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(slot.x, by, slot.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(tex, slot.x - slot.r, by - slot.r, slot.r * 2, slot.r * 2);
        ctx.restore();
      }
    }
    applyGlossy3DBallOverlay(ctx, slot.x, by, slot.r);

    ctx.fillStyle = slot.color;
    ctx.font = '700 34px "Bungee", sans-serif';
    ctx.fillText(slot.medal, slot.x, slot.baseTop + 50);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px "Poppins", sans-serif';
    ctx.fillText(slot.standing.name, slot.x, slot.baseTop + 88);

    ctx.fillStyle = '#00D4FF';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.fillText(formatRaceTime(slot.standing.finishTimeMs), slot.x, slot.baseTop + 120);
  });

  // Bottom bar
  ctx.fillStyle = 'rgba(16, 25, 64, 0.9)';
  ctx.fillRect(60, 560, width - 120, 76);
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 560, width - 120, 76);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 15px "Poppins", sans-serif';
  const summaryLine = standings
    .slice(0, 6)
    .map((s) => `#${s.rank} ${s.name} (${formatRaceTime(s.finishTimeMs)})`)
    .join('   •   ');
  ctx.fillText(summaryLine, 86, 604);

  const link = document.createElement('a');
  link.download = `flag-ball-race-winner-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
