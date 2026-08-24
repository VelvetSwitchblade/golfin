"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BallState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
};

type Surface = {
  name: "fairway" | "rough" | "heavy" | "green";
  color: string;
  drag: number;
  bounce: number;
  rollDrag: number;
};

const fairway: Surface = {
  name: "fairway",
  color: "#4fa85d",
  drag: 0.26,
  bounce: 0.48,
  rollDrag: 0.78,
};

const rough: Surface = {
  name: "rough",
  color: "#2f7f44",
  drag: 0.54,
  bounce: 0.34,
  rollDrag: 1.45,
};

const heavy: Surface = {
  name: "heavy",
  color: "#226536",
  drag: 0.82,
  bounce: 0.2,
  rollDrag: 2.15,
};

const green: Surface = {
  name: "green",
  color: "#6fcf73",
  drag: 0.18,
  bounce: 0.42,
  rollDrag: 0.52,
};

const startBall: BallState = {
  x: 140,
  y: 470,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
};

const fixedShot = {
  angle: -0.62,
  speed: 620,
  loft: 520,
  spin: 1.8,
};

const gravity = 1450;
const worldWidth = 1000;
const worldHeight = 620;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function speed(ball: BallState) {
  return Math.hypot(ball.vx, ball.vy);
}

function surfaceAt(x: number, y: number): Surface {
  const greenDistance = Math.hypot(x - 790, y - 178);
  const heavyDistance = Math.hypot(x - 505, y - 355);
  const fairwayCenter =
    470 + Math.sin((x - 120) / 170) * 74 - Math.max(0, x - 520) * 0.38;

  if (greenDistance < 155) {
    return green;
  }

  if (heavyDistance < 112) {
    return heavy;
  }

  if (Math.abs(y - fairwayCenter) < 92) {
    return fairway;
  }

  return rough;
}

function drawGrass(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  width: number,
  height: number,
) {
  ctx.fillStyle = rough.color;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = fairway.color;
  ctx.lineCap = "round";
  ctx.lineWidth = sx(190) - sx(0);
  ctx.beginPath();
  ctx.moveTo(sx(90), sy(478));
  ctx.bezierCurveTo(sx(250), sy(422), sx(340), sy(550), sx(500), sy(366));
  ctx.bezierCurveTo(sx(615), sy(230), sx(700), sy(215), sx(825), sy(170));
  ctx.stroke();

  ctx.fillStyle = heavy.color;
  ctx.beginPath();
  ctx.ellipse(sx(508), sy(356), sx(120) - sx(0), sy(76) - sy(0), -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = green.color;
  ctx.beginPath();
  ctx.ellipse(sx(790), sy(178), sx(160) - sx(0), sy(126) - sy(0), -0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = -2; i < 18; i += 1) {
    ctx.fillRect(sx(i * 76), 0, sx(18) - sx(0), height);
  }
}

function drawAimGhost(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  ball: BallState,
) {
  const endX = ball.x + Math.cos(fixedShot.angle) * 112;
  const endY = ball.y + Math.sin(fixedShot.angle) * 112;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 3 * scale;
  ctx.setLineDash([10 * scale, 10 * scale]);
  ctx.beginPath();
  ctx.moveTo(sx(ball.x), sy(ball.y));
  ctx.lineTo(sx(endX), sy(endY));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  trail: Array<{ x: number; y: number; z: number }>,
) {
  trail.forEach((point, index) => {
    const alpha = index / Math.max(1, trail.length);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.2})`;
    ctx.beginPath();
    ctx.arc(sx(point.x), sy(point.y - point.z * 0.32), 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  ball: BallState,
) {
  const lift = ball.z * 0.34;
  const radius = (16 + Math.min(12, ball.z * 0.018)) * scale;
  const shadowScale = clamp(1 - ball.z / 520, 0.28, 1);
  const surface = surfaceAt(ball.x, ball.y);

  ctx.fillStyle = surface.color;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(sx(ball.x), sy(ball.y), 34 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = `rgba(0, 0, 0, ${0.32 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(
    sx(ball.x),
    sy(ball.y) + 8 * scale,
    radius * 1.25 * shadowScale,
    radius * 0.48 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const ballX = sx(ball.x);
  const ballY = sy(ball.y - lift);
  const gradient = ctx.createRadialGradient(
    ballX - radius * 0.35,
    ballY - radius * 0.42,
    radius * 0.2,
    ballX,
    ballY,
    radius,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.66, "#f4f4ef");
  gradient.addColorStop(1, "#c9cec9");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ballX, ballY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(74, 84, 76, 0.34)";
  ctx.lineWidth = 1.4 * scale;
  ctx.beginPath();
  ctx.arc(ballX, ballY, radius * 0.62, ball.spin, ball.spin + Math.PI * 1.2);
  ctx.stroke();
}

export function GolfinPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const ballRef = useRef<BallState>({ ...startBall });
  const trailRef = useRef<Array<{ x: number; y: number; z: number }>>([]);

  const [moving, setMoving] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    const scale = Math.min(width / worldWidth, height / worldHeight);
    const offsetX = (width - worldWidth * scale) / 2;
    const offsetY = (height - worldHeight * scale) / 2;
    const sx = (value: number) => offsetX + value * scale;
    const sy = (value: number) => offsetY + value * scale;
    const ball = ballRef.current;

    drawGrass(ctx, sx, sy, width, height);
    drawTrail(ctx, sx, sy, scale, trailRef.current);
    drawAimGhost(ctx, sx, sy, scale, ball);
    drawBall(ctx, sx, sy, scale, ball);
  }, []);

  useEffect(() => {
    draw();

    const resize = () => draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [draw]);

  function step(timestamp: number) {
    const last = lastTimeRef.current ?? timestamp;
    const dt = clamp((timestamp - last) / 1000, 0.001, 0.026);
    lastTimeRef.current = timestamp;

    const ball = ballRef.current;
    const surface = surfaceAt(ball.x, ball.y);
    const airborne = ball.z > 0.5 || ball.vz > 0.5;

    if (airborne) {
      ball.vz -= gravity * dt;
      ball.vx *= 1 - 0.045 * dt;
      ball.vy *= 1 - 0.045 * dt;
    } else {
      const groundDrag = surface.drag + surface.rollDrag * 0.38;
      const dragFactor = Math.max(0, 1 - groundDrag * dt);
      ball.vx *= dragFactor;
      ball.vy *= dragFactor;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    ball.spin += speed(ball) * dt * 0.018;

    if (ball.x < 28 || ball.x > worldWidth - 28) {
      ball.x = clamp(ball.x, 28, worldWidth - 28);
      ball.vx *= -0.48;
    }

    if (ball.y < 34 || ball.y > worldHeight - 34) {
      ball.y = clamp(ball.y, 34, worldHeight - 34);
      ball.vy *= -0.48;
    }

    if (ball.z <= 0) {
      ball.z = 0;
      if (Math.abs(ball.vz) > 74) {
        ball.vz = -ball.vz * surface.bounce;
        ball.vx *= 1 - surface.rollDrag * 0.05;
        ball.vy *= 1 - surface.rollDrag * 0.05;
      } else {
        ball.vz = 0;
      }
    }

    trailRef.current.push({ x: ball.x, y: ball.y, z: ball.z });
    if (trailRef.current.length > 56) {
      trailRef.current.shift();
    }

    draw();

    const settled = speed(ball) < 9 && ball.z === 0 && Math.abs(ball.vz) < 1;
    if (settled) {
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
      setMoving(false);
      frameRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    frameRef.current = requestAnimationFrame(step);
  }

  function swing() {
    if (moving) {
      return;
    }

    const ball = ballRef.current;
    if (ball.x > worldWidth - 90 || ball.y < 80) {
      ballRef.current = { ...startBall };
    }

    trailRef.current = [];
    ballRef.current.vx = Math.cos(fixedShot.angle) * fixedShot.speed;
    ballRef.current.vy = Math.sin(fixedShot.angle) * fixedShot.speed;
    ballRef.current.vz = fixedShot.loft;
    ballRef.current.spin = fixedShot.spin;
    setMoving(true);
    lastTimeRef.current = null;
    frameRef.current = requestAnimationFrame(step);
  }

  return (
    <main className="physics-stage" aria-label="Golfin physics prototype">
      <canvas className="physics-canvas" ref={canvasRef} />
      <button className="physics-swing" disabled={moving} onClick={swing} type="button">
        {moving ? "Rolling" : "Swing"}
      </button>
    </main>
  );
}
