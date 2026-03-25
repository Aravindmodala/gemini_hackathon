import * as THREE from 'three';

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());

  const totalH = lines.length * lineHeight;
  let y = centerY - totalH / 2 + lineHeight * 0.7;
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lineHeight;
  }
}

function drawOrnamentalLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  inset: number,
  W: number,
) {
  ctx.strokeStyle = '#c8a96e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(inset, y);
  ctx.lineTo(W - inset, y);
  ctx.stroke();
  ctx.fillStyle = '#c8a96e';
  ctx.font = '9px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('◆', W / 2, y + 4);
}

export function createCoverTexture(title: string): THREE.CanvasTexture {
  const W = 512, H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Background: deep leather gradient ──────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W * 0.7, H);
  bg.addColorStop(0, '#0e0620');
  bg.addColorStop(0.3, '#180a38');
  bg.addColorStop(0.6, '#1e0d42');
  bg.addColorStop(1, '#0a0318');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Leather horizontal grain ────────────────────────────────────
  ctx.globalAlpha = 0.025;
  for (let i = 0; i < H; i += 2) {
    const brightness = 30 + Math.random() * 28;
    ctx.fillStyle = `hsl(270, 22%, ${brightness}%)`;
    ctx.fillRect(0, i, W, 1 + (Math.random() > 0.85 ? 1 : 0));
  }
  ctx.globalAlpha = 1;

  // ── Radial vignette ─────────────────────────────────────────────
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ── Outer gold border ───────────────────────────────────────────
  const INSET = 15;
  ctx.strokeStyle = '#c8a96e';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(INSET, INSET, W - INSET * 2, H - INSET * 2);

  // Inner fine line
  ctx.strokeStyle = '#a8895a';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(INSET + 7, INSET + 7, W - (INSET + 7) * 2, H - (INSET + 7) * 2);

  // ── Corner flourishes ───────────────────────────────────────────
  const corners: [number, number][] = [
    [INSET + 1, INSET + 1],
    [W - INSET - 1, INSET + 1],
    [INSET + 1, H - INSET - 1],
    [W - INSET - 1, H - INSET - 1],
  ];
  ctx.fillStyle = '#c8a96e';
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Small diamond
    const s = 8;
    const d = 5;
    const signX = cx < W / 2 ? 1 : -1;
    const signY = cy < H / 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx + signX * d, cy);
    ctx.lineTo(cx + signX * (d + s), cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + signY * d);
    ctx.lineTo(cx, cy + signY * (d + s));
    ctx.stroke();
  }

  // ── Top star ornament ───────────────────────────────────────────
  ctx.fillStyle = '#d4b87a';
  ctx.shadowColor = 'rgba(212,184,122,0.9)';
  ctx.shadowBlur = 14;
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('✦', W / 2, INSET + 46);
  ctx.shadowBlur = 0;

  // ── Ornamental line above title ─────────────────────────────────
  drawOrnamentalLine(ctx, 252, 68, W);

  // ── Main title ─────────────────────────────────────────────────
  ctx.fillStyle = '#e8c97e';
  ctx.shadowBlur = 0;
  ctx.font = 'bold 35px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  wrapText(ctx, title || 'Your Story', W / 2, 380, 368, 50);

  // ── Ornamental line below title ─────────────────────────────────
  drawOrnamentalLine(ctx, 500, 68, W);

  // ── App name ───────────────────────────────────────────────────
  ctx.fillStyle = '#a78bfa';
  ctx.shadowBlur = 0;
  ctx.font = '12px "Inter", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE EMOTIONAL CHRONICLER', W / 2, 645);

  // ── Bottom star ────────────────────────────────────────────────
  ctx.fillStyle = '#c8a96e';
  ctx.shadowColor = 'rgba(200,169,110,0.7)';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 18px Georgia, serif';
  ctx.fillText('✦', W / 2, H - INSET - 24);
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
