import { CountryBall, DefaultFlagKey } from '../types/race';

export interface DefaultCountrySpec {
  id: string;
  name: string;
  code: string;
  emoji: string;
  defaultKey: DefaultFlagKey;
  primaryColor: string;
  secondaryColor: string;
}

export const DEFAULT_COUNTRIES: DefaultCountrySpec[] = [
  { id: 'pk', name: 'Pakistan', code: 'PAK', emoji: '🇵🇰', defaultKey: 'pakistan', primaryColor: '#01411C', secondaryColor: '#FFFFFF' },
  { id: 'in', name: 'India', code: 'IND', emoji: '🇮🇳', defaultKey: 'india', primaryColor: '#FF9933', secondaryColor: '#138808' },
  { id: 'us', name: 'USA', code: 'USA', emoji: '🇺🇸', defaultKey: 'usa', primaryColor: '#B22234', secondaryColor: '#3C3B6E' },
  { id: 'br', name: 'Brazil', code: 'BRA', emoji: '🇧🇷', defaultKey: 'brazil', primaryColor: '#009C3B', secondaryColor: '#FFDF00' },
  { id: 'jp', name: 'Japan', code: 'JPN', emoji: '🇯🇵', defaultKey: 'japan', primaryColor: '#FFFFFF', secondaryColor: '#BC002D' },
  { id: 'uk', name: 'UK', code: 'GBR', emoji: '🇬🇧', defaultKey: 'uk', primaryColor: '#012169', secondaryColor: '#C8102E' },
  { id: 'fr', name: 'France', code: 'FRA', emoji: '🇫🇷', defaultKey: 'france', primaryColor: '#0055A4', secondaryColor: '#EF4135' },
  { id: 'de', name: 'Germany', code: 'DEU', emoji: '🇩🇪', defaultKey: 'germany', primaryColor: '#000000', secondaryColor: '#FFCE00' },
  { id: 'tr', name: 'Turkey', code: 'TUR', emoji: '🇹🇷', defaultKey: 'turkey', primaryColor: '#E30A17', secondaryColor: '#FFFFFF' },
  { id: 'cn', name: 'China', code: 'CHN', emoji: '🇨🇳', defaultKey: 'china', primaryColor: '#DE2910', secondaryColor: '#FFDE00' },
];

export function createDefaultCountryBalls(): CountryBall[] {
  return DEFAULT_COUNTRIES.map((c) => ({
    id: `default-${c.id}`,
    name: c.name,
    code: c.code,
    emoji: c.emoji,
    flagType: 'default',
    defaultKey: c.defaultKey,
    primaryColor: c.primaryColor,
    secondaryColor: c.secondaryColor,
  }));
}

export function deriveCountryCode(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  if (cleaned.length > 0) return cleaned.padEnd(3, 'X');
  return 'FLG';
}

export function deriveNameFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  const spaced = withoutExt.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return 'Custom Flag';
  return spaced
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function drawFivePointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  rotationRad = -Math.PI / 2
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotationRad + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws crisp vector national flags inside a bounding square (0..size, 0..size).
 */
export function drawDefaultFlagArt(
  ctx: CanvasRenderingContext2D,
  key: DefaultFlagKey,
  size: number
): void {
  ctx.save();
  switch (key) {
    case 'pakistan': {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size * 0.28, size);
      ctx.fillStyle = '#01411C';
      ctx.fillRect(size * 0.28, 0, size * 0.72, size);
      ctx.fillStyle = '#FFFFFF';
      const cx = size * 0.64;
      const cy = size * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#01411C';
      ctx.beginPath();
      ctx.arc(cx + size * 0.065, cy - size * 0.035, size * 0.185, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      drawFivePointStar(ctx, cx + size * 0.11, cy - size * 0.08, size * 0.07, size * 0.028, -0.35);
      break;
    }
    case 'india': {
      ctx.fillStyle = '#FF9933';
      ctx.fillRect(0, 0, size, size / 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, size / 3, size, size / 3);
      ctx.fillStyle = '#138808';
      ctx.fillRect(0, (size * 2) / 3, size, size / 3);
      const cx = size * 0.5;
      const cy = size * 0.5;
      const r = size * 0.135;
      ctx.strokeStyle = '#000080';
      ctx.lineWidth = Math.max(1.5, size * 0.022);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, size * 0.01);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.lineTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
        ctx.stroke();
      }
      break;
    }
    case 'usa': {
      const stripes = 13;
      const stripeH = size / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#B22234' : '#FFFFFF';
        ctx.fillRect(0, i * stripeH, size, stripeH + 0.5);
      }
      ctx.fillStyle = '#3C3B6E';
      ctx.fillRect(0, 0, size * 0.5, stripeH * 7);
      ctx.fillStyle = '#FFFFFF';
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const sx = size * (0.06 + col * 0.092);
          const sy = size * (0.08 + row * 0.12);
          drawFivePointStar(ctx, sx, sy, size * 0.025, size * 0.01);
        }
      }
      break;
    }
    case 'brazil': {
      ctx.fillStyle = '#009C3B';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#FFDF00';
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.12);
      ctx.lineTo(size * 0.9, size * 0.5);
      ctx.lineTo(size * 0.5, size * 0.88);
      ctx.lineTo(size * 0.1, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#002776';
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = size * 0.036;
      ctx.beginPath();
      ctx.arc(size * 0.45, size * 0.72, size * 0.34, -Math.PI * 0.68, -Math.PI * 0.25);
      ctx.stroke();
      break;
    }
    case 'japan': {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#BC002D';
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.26, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'uk': {
      ctx.fillStyle = '#012169';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = size * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(size, 0);
      ctx.lineTo(0, size);
      ctx.stroke();
      ctx.strokeStyle = '#C8102E';
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(size, 0);
      ctx.lineTo(0, size);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(size * 0.39, 0, size * 0.22, size);
      ctx.fillRect(0, size * 0.39, size, size * 0.22);
      ctx.fillStyle = '#C8102E';
      ctx.fillRect(size * 0.43, 0, size * 0.14, size);
      ctx.fillRect(0, size * 0.43, size, size * 0.14);
      break;
    }
    case 'france': {
      ctx.fillStyle = '#0055A4';
      ctx.fillRect(0, 0, size / 3, size);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(size / 3, 0, size / 3, size);
      ctx.fillStyle = '#EF4135';
      ctx.fillRect((size * 2) / 3, 0, size / 3, size);
      break;
    }
    case 'germany': {
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, size, size / 3);
      ctx.fillStyle = '#DD0000';
      ctx.fillRect(0, size / 3, size, size / 3);
      ctx.fillStyle = '#FFCE00';
      ctx.fillRect(0, (size * 2) / 3, size, size / 3);
      break;
    }
    case 'turkey': {
      ctx.fillStyle = '#E30A17';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(size * 0.42, size * 0.5, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#E30A17';
      ctx.beginPath();
      ctx.arc(size * 0.48, size * 0.5, size * 0.175, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      drawFivePointStar(ctx, size * 0.65, size * 0.5, size * 0.085, size * 0.034, -0.32);
      break;
    }
    case 'china': {
      ctx.fillStyle = '#DE2910';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#FFDE00';
      drawFivePointStar(ctx, size * 0.28, size * 0.34, size * 0.13, size * 0.05);
      drawFivePointStar(ctx, size * 0.46, size * 0.2, size * 0.045, size * 0.018, 0.3);
      drawFivePointStar(ctx, size * 0.52, size * 0.31, size * 0.045, size * 0.018, 0.7);
      drawFivePointStar(ctx, size * 0.5, size * 0.45, size * 0.045, size * 0.018, 0.1);
      drawFivePointStar(ctx, size * 0.42, size * 0.54, size * 0.045, size * 0.018, -0.3);
      break;
    }
  }
  ctx.restore();
}

/**
 * Applies a 3D spherical glossy finish, crisp ring border, and subtle internal rim shading
 * to any circular flag canvas.
 */
export function applyGlossy3DBallOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
): void {
  // Inner edge spherical shadow for 3D depth
  const shadeGrad = ctx.createRadialGradient(
    cx - radius * 0.3,
    cy - radius * 0.3,
    radius * 0.15,
    cx,
    cy,
    radius
  );
  shadeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  shadeGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
  shadeGrad.addColorStop(0.88, 'rgba(0, 0, 0, 0.28)');
  shadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
  ctx.fillStyle = shadeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Top-left glossy specular crescent highlight
  ctx.save();
  ctx.translate(cx - radius * 0.28, cy - radius * 0.32);
  ctx.rotate(-Math.PI / 5);
  const specGrad = ctx.createLinearGradient(0, -radius * 0.35, 0, radius * 0.28);
  specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
  specGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.14)');
  specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.48, radius * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Crisp outer rim border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = Math.max(1.5, radius * 0.09);
  ctx.beginPath();
  ctx.arc(cx, cy, radius - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Converts an uploaded PNG/JPG File into a circular cropped 256x256 PNG data URL
 * with 3D glossy border and shadow ready for both lobby cards and physics canvas.
 */
export function processUploadedFlagImage(file: File): Promise<{
  imageDataUrl: string;
  primaryColor: string;
  secondaryColor: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        // Center-crop to square before circular mask
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        // Draw flat clipped circular texture for rotating physics ball
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        ctx.restore();

        // Sample two colors for trail/particles
        let primaryColor = '#38BDF8';
        let secondaryColor = '#F59E0B';
        try {
          const p1 = ctx.getImageData(Math.floor(size * 0.35), Math.floor(size * 0.35), 1, 1).data;
          const p2 = ctx.getImageData(Math.floor(size * 0.65), Math.floor(size * 0.65), 1, 1).data;
          primaryColor = `rgb(${p1[0]}, ${p1[1]}, ${p1[2]})`;
          secondaryColor = `rgb(${p2[0]}, ${p2[1]}, ${p2[2]})`;
        } catch {
          // Ignore pixel sampling errors
        }

        resolve({
          imageDataUrl: canvas.toDataURL('image/png'),
          primaryColor,
          secondaryColor,
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const spriteCache = new Map<string, HTMLCanvasElement>();

/**
 * Returns a cached offscreen circular flag texture (without fixed-angle glare so it can spin cleanly).
 */
export function getFlagTextureCanvas(ball: CountryBall, size = 128): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `${ball.id}:${ball.flagType}:${ball.defaultKey ?? ''}:${ball.imageDataUrl?.slice(-24) ?? ''}:${size}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.clip();

  if (ball.flagType === 'default' && ball.defaultKey) {
    drawDefaultFlagArt(ctx, ball.defaultKey, size);
  } else if (ball.imageDataUrl) {
    ctx.fillStyle = ball.primaryColor || '#1E293B';
    ctx.fillRect(0, 0, size, size);
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();
    };
    img.src = ball.imageDataUrl;
  } else {
    ctx.fillStyle = ball.primaryColor || '#38BDF8';
    ctx.fillRect(0, 0, size, size);
  }
  ctx.restore();

  spriteCache.set(cacheKey, canvas);
  return canvas;
}
