import React, { useEffect, useRef } from 'react';
import { CountryBall } from '../types/race';
import { applyGlossy3DBallOverlay, drawDefaultFlagArt } from '../game/flags';

interface FlagAvatarProps {
  ball: CountryBall;
  size?: number;
  className?: string;
}

export const FlagAvatar: React.FC<FlagAvatarProps> = ({ ball, size = 44, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    const renderBall = (img?: HTMLImageElement) => {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      if (img) {
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      } else if (ball.flagType === 'default' && ball.defaultKey) {
        ctx.translate(cx - r, cy - r);
        drawDefaultFlagArt(ctx, ball.defaultKey, r * 2);
      } else {
        ctx.fillStyle = ball.primaryColor || '#38BDF8';
        ctx.fillRect(0, 0, size, size);
      }
      ctx.restore();

      applyGlossy3DBallOverlay(ctx, cx, cy, r);
    };

    if (ball.flagType === 'custom' && ball.imageDataUrl) {
      const img = new Image();
      img.onload = () => renderBall(img);
      img.src = ball.imageDataUrl;
    } else {
      renderBall();
    }
  }, [ball, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)] ${className}`}
      aria-label={`${ball.name} flag ball`}
    />
  );
};
