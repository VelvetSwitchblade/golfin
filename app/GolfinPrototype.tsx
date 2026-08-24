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
  name: "fairway" | "rough" | "heavy" | "green" | "bunker" | "tee";
  color: string;
  drag: number;
  bounce: number;
  rollDrag: number;
};

type CourseSurface = {
  id: number;
  type: Surface["name"];
  points: Array<[number, number]>;
};

type CourseData = {
  name: string;
  ref: string;
  par: number;
  holeLine: Array<[number, number]>;
  pin: [number, number];
  surfaces: CourseSurface[];
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

const bunker: Surface = {
  name: "bunker",
  color: "#d8c27a",
  drag: 1.35,
  bounce: 0.12,
  rollDrag: 3.4,
};

const tee: Surface = {
  name: "tee",
  color: "#72be72",
  drag: 0.22,
  bounce: 0.44,
  rollDrag: 0.62,
};

const materials: Record<Surface["name"], Surface> = {
  fairway,
  rough,
  heavy,
  green,
  bunker,
  tee,
};

const goodwoodParkHole1: CourseData = {
  name: "Goodwood The Park - Hole 1",
  ref: "1",
  par: 4,
  holeLine: [
    [902.8, 318.2],
    [347, 321.6],
    [96, 347.2],
  ],
  pin: [96, 347.2],
  surfaces: [
    {
      id: 845710620,
      type: "tee",
      points: [
        [930, 329.8],
        [881.1, 329.5],
        [881, 305.1],
        [929.6, 305.1],
        [930, 329.8],
      ],
    },
    {
      id: 845710621,
      type: "tee",
      points: [
        [744.9, 284],
        [749.4, 290.1],
        [747.8, 299.9],
        [741, 302.6],
        [734.9, 299.1],
        [734, 290.6],
        [736.9, 283.8],
        [744.9, 284],
      ],
    },
    {
      id: 845710622,
      type: "fairway",
      points: [
        [631.8, 281.9],
        [655.5, 310.5],
        [646.6, 332.4],
        [614.6, 341.1],
        [574.2, 335],
        [520.1, 327.5],
        [416.4, 330.6],
        [313, 363],
        [239, 365.8],
        [144.6, 370.1],
        [97.4, 370.1],
        [70.2, 345.2],
        [82.2, 321.6],
        [106.9, 310.5],
        [126.9, 308.5],
        [164.7, 323.3],
        [221.4, 324.1],
        [301.8, 300.4],
        [362, 295.1],
        [425.7, 275.9],
        [465.8, 261.9],
        [520.3, 267.1],
        [549.3, 268.1],
        [566.5, 266.5],
        [631.8, 281.9],
      ],
    },
    {
      id: 845710623,
      type: "bunker",
      points: [
        [513.9, 247.3],
        [520.9, 247.3],
        [526.1, 249],
        [532, 254.6],
        [535.6, 256.8],
        [542.1, 257.1],
        [545, 260.9],
        [544.1, 264.2],
        [541.7, 266.4],
        [538.6, 267.4],
        [534.2, 267],
        [530.7, 265],
        [527.8, 261.9],
        [524.5, 260.8],
        [520, 261.6],
        [516.5, 262.2],
        [511.8, 260.5],
        [508.6, 257.4],
        [507.3, 253.4],
        [508.9, 249.6],
        [511.9, 247.6],
        [513.9, 247.3],
      ],
    },
    {
      id: 845710624,
      type: "bunker",
      points: [
        [115.2, 317.9],
        [117.8, 318.2],
        [120.6, 319.4],
        [124.2, 319],
        [127.3, 319.2],
        [129.5, 321.6],
        [128.7, 325.2],
        [126.2, 328.4],
        [122.6, 330],
        [118.6, 330.5],
        [114.5, 329.3],
        [110.9, 326.6],
        [109.7, 323.2],
        [111, 319.4],
        [113.9, 317.9],
        [115.2, 317.9],
      ],
    },
    {
      id: 845710625,
      type: "green",
      points: [
        [94.6, 324.1],
        [101.1, 327],
        [106.4, 333.1],
        [111.5, 337.1],
        [121.4, 342.2],
        [124.8, 347.4],
        [125.7, 354.6],
        [122.8, 359.1],
        [117.9, 362],
        [110.2, 363.6],
        [102.2, 364.1],
        [90.1, 365.4],
        [83, 360.5],
        [78.5, 354.6],
        [75, 346.9],
        [73.8, 340.8],
        [75.7, 334.2],
        [79, 329.1],
        [85.4, 325],
        [94.6, 324.1],
      ],
    },
    {
      id: 845710626,
      type: "rough",
      points: [
        [115.7, 334.4],
        [124.4, 337.2],
        [132.6, 332.7],
        [134.9, 322.8],
        [129.9, 314.2],
        [118, 311.6],
        [108.7, 313.9],
        [103.6, 318.4],
        [103.4, 324.9],
        [111.1, 331.4],
        [115.7, 334.4],
      ],
    },
  ],
};

const startBall: BallState = {
  x: 902.8,
  y: 318.2,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
};

const fixedShot = {
  angle: Math.atan2(347.2 - 318.2, 96 - 902.8),
  speed: 620,
  loft: 360,
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

function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function surfaceAt(x: number, y: number): Surface {
  const priority: Surface["name"][] = ["bunker", "green", "tee", "rough", "fairway"];
  for (const type of priority) {
    const match = goodwoodParkHole1.surfaces.find(
      (surface) => surface.type === type && pointInPolygon(x, y, surface.points),
    );
    if (match) {
      return materials[match.type];
    }
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

  const drawOrder: Surface["name"][] = ["rough", "fairway", "tee", "green", "bunker"];
  for (const type of drawOrder) {
    for (const surface of goodwoodParkHole1.surfaces.filter((item) => item.type === type)) {
      ctx.fillStyle = materials[surface.type].color;
      ctx.beginPath();
      surface.points.forEach(([x, y], index) => {
        if (index === 0) {
          ctx.moveTo(sx(x), sy(y));
        } else {
          ctx.lineTo(sx(x), sy(y));
        }
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineCap = "round";
  ctx.lineWidth = sx(3) - sx(0);
  ctx.setLineDash([sx(14) - sx(0), sx(12) - sx(0)]);
  ctx.beginPath();
  goodwoodParkHole1.holeLine.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(sx(x), sy(y));
    } else {
      ctx.lineTo(sx(x), sy(y));
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);

  const [pinX, pinY] = goodwoodParkHole1.pin;
  ctx.fillStyle = "#111711";
  ctx.beginPath();
  ctx.arc(sx(pinX), sy(pinY), sx(5) - sx(0), 0, Math.PI * 2);
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
