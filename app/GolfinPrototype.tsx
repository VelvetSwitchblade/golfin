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

type CameraState = {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
};

const fairway: Surface = {
  name: "fairway",
  color: "#4fa85d",
  drag: 0.32,
  bounce: 0.48,
  rollDrag: 6.3,
};

const rough: Surface = {
  name: "rough",
  color: "#2f7f44",
  drag: 0.95,
  bounce: 0.26,
  rollDrag: 8.4,
};

const heavy: Surface = {
  name: "heavy",
  color: "#226536",
  drag: 1.2,
  bounce: 0.16,
  rollDrag: 10.5,
};

const green: Surface = {
  name: "green",
  color: "#6fcf73",
  drag: 0.2,
  bounce: 0.42,
  rollDrag: 3.2,
};

const bunker: Surface = {
  name: "bunker",
  color: "#d8c27a",
  drag: 1.8,
  bounce: 0.08,
  rollDrag: 13.5,
};

const tee: Surface = {
  name: "tee",
  color: "#72be72",
  drag: 0.26,
  bounce: 0.44,
  rollDrag: 5.6,
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

const gravity = 170;
const worldWidth = 900;
const worldHeight = 1250;
const roughCollarWidth = 58;
const treeSetback = 46;
const scorecardHoleYards = 389;
const driverPreset = {
  clubheadMph: 100,
  carryYards: 238,
  totalYards: 258,
  flightSeconds: 4.5,
};

function orientCourse(source: CourseData): CourseData {
  const teePoint = source.holeLine[0];
  const pinPoint = source.pin;
  const vector = {
    x: pinPoint[0] - teePoint[0],
    y: pinPoint[1] - teePoint[1],
  };
  const length = Math.hypot(vector.x, vector.y);
  const forward = { x: vector.x / length, y: vector.y / length };
  const lateral = { x: -forward.y, y: forward.x };
  const teeAnchor = { x: worldWidth / 2, y: worldHeight - 150 };
  const scale = 950 / length;

  const transform = ([x, y]: [number, number]): [number, number] => {
    const relative = { x: x - teePoint[0], y: y - teePoint[1] };
    const along = relative.x * forward.x + relative.y * forward.y;
    const across = relative.x * lateral.x + relative.y * lateral.y;

    return [
      Number((teeAnchor.x + across * scale).toFixed(1)),
      Number((teeAnchor.y - along * scale).toFixed(1)),
    ];
  };

  return {
    ...source,
    holeLine: source.holeLine.map(transform),
    pin: transform(source.pin),
    surfaces: source.surfaces.map((surface) => ({
      ...surface,
      points: surface.points.map(transform),
    })),
  };
}

const course = orientCourse(goodwoodParkHole1);
const teePoint = course.holeLine[0];
const worldUnitsPerYard = lineLength(course.holeLine) / scorecardHoleYards;

const startBall: BallState = {
  x: teePoint[0],
  y: teePoint[1],
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
};

const fixedShot = {
  angle: Math.atan2(course.pin[1] - teePoint[1], course.pin[0] - teePoint[0]),
  speed: (driverPreset.carryYards * worldUnitsPerYard) / driverPreset.flightSeconds,
  loft: (gravity * driverPreset.flightSeconds) / 2,
  spin: 1.8,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lineLength(points: Array<[number, number]>) {
  return points.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    const previous = points[index - 1];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function seededNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function speed(ball: BallState) {
  return Math.hypot(ball.vx, ball.vy);
}

function polygonCentroid(points: Array<[number, number]>) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [x0, y0] = points[j];
    const [x1, y1] = points[i];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  if (Math.abs(twiceArea) < 0.001) {
    const total = points.reduce(
      (sum, point) => ({ x: sum.x + point[0], y: sum.y + point[1] }),
      { x: 0, y: 0 },
    );
    return { x: total.x / points.length, y: total.y / points.length };
  }

  return {
    x: x / (3 * twiceArea),
    y: y / (3 * twiceArea),
  };
}

function distanceToSegment(
  x: number,
  y: number,
  start: [number, number],
  end: [number, number],
) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(x - start[0], y - start[1]);
  }

  const t = clamp(((x - start[0]) * dx + (y - start[1]) * dy) / lengthSq, 0, 1);
  const closestX = start[0] + dx * t;
  const closestY = start[1] + dy * t;

  return Math.hypot(x - closestX, y - closestY);
}

function distanceToPolygon(x: number, y: number, points: Array<[number, number]>) {
  if (pointInPolygon(x, y, points)) {
    return 0;
  }

  let closest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    closest = Math.min(closest, distanceToSegment(x, y, points[i], points[(i + 1) % points.length]));
  }

  return closest;
}

function distanceToSurfaces(x: number, y: number, surfaces = course.surfaces) {
  return surfaces.reduce(
    (closest, surface) => Math.min(closest, distanceToPolygon(x, y, surface.points)),
    Number.POSITIVE_INFINITY,
  );
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

function isInMaintainedRough(x: number, y: number) {
  return distanceToSurfaces(x, y) <= roughCollarWidth;
}

function createTreeLine() {
  const trees: Array<{ x: number; y: number; r: number }> = [];
  const treeSourceTypes: Surface["name"][] = ["fairway", "green", "tee", "rough"];
  const sourceSurfaces = course.surfaces.filter((surface) => treeSourceTypes.includes(surface.type));

  for (const surface of sourceSurfaces) {
    const centroid = polygonCentroid(surface.points);

    for (let edgeIndex = 0; edgeIndex < surface.points.length; edgeIndex += 1) {
      const start = surface.points[edgeIndex];
      const end = surface.points[(edgeIndex + 1) % surface.points.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const edgeLength = Math.hypot(dx, dy);
      if (edgeLength < 12) {
        continue;
      }

      const count = Math.max(1, Math.floor(edgeLength / 54));

      for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
        const t = (sampleIndex + 0.5) / count;
        const baseX = start[0] + dx * t;
        const baseY = start[1] + dy * t;
        const awayX = baseX - centroid.x;
        const awayY = baseY - centroid.y;
        const awayLength = Math.hypot(awayX, awayY) || 1;
        const seed = surface.id * 0.013 + edgeIndex * 8.7 + sampleIndex * 2.31;
        const stagger = (seededNoise(seed) - 0.5) * 30;
        const setback = roughCollarWidth + treeSetback + stagger;
        const lateral = (seededNoise(seed + 4.17) - 0.5) * 28;
        const tangentX = dx / (edgeLength || 1);
        const tangentY = dy / (edgeLength || 1);
        const x = baseX + (awayX / awayLength) * setback + tangentX * lateral;
        const y = baseY + (awayY / awayLength) * setback + tangentY * lateral;

        if (x < 34 || x > worldWidth - 34 || y < 34 || y > worldHeight - 34) {
          continue;
        }

        if (distanceToSurfaces(x, y) < roughCollarWidth + treeSetback * 0.62) {
          continue;
        }

        if (trees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < 44)) {
          continue;
        }

        trees.push({
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          r: Number((22 + seededNoise(seed + 9.4) * 13).toFixed(1)),
        });
      }
    }
  }

  return trees;
}

const trees = createTreeLine();

function surfaceAt(x: number, y: number): Surface {
  const priority: Surface["name"][] = ["bunker", "green", "tee", "rough", "fairway"];
  for (const type of priority) {
    const match = course.surfaces.find(
      (surface) => surface.type === type && pointInPolygon(x, y, surface.points),
    );
    if (match) {
      return materials[match.type];
    }
  }

  if (isInMaintainedRough(x, y)) {
    return rough;
  }

  return heavy;
}

function drawMaintainedRough(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const surface of course.surfaces) {
    traceSurface(ctx, surface, sx, sy);
    ctx.strokeStyle = rough.color;
    ctx.lineWidth = roughCollarWidth * 2 * scale;
    ctx.stroke();
  }

  ctx.restore();
}

function drawSurfacePolygons(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
) {
  const drawOrder: Surface["name"][] = ["rough", "fairway", "tee", "green", "bunker"];
  for (const type of drawOrder) {
    for (const surface of course.surfaces.filter((item) => item.type === type)) {
      paintSurfaceBase(ctx, surface, sx, sy);

      if (surface.type !== "rough") {
        ctx.strokeStyle =
          surface.type === "bunker" ? "rgba(91, 70, 34, 0.28)" : "rgba(18, 55, 28, 0.18)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }
  }
}

function paintSurfaceBase(
  ctx: CanvasRenderingContext2D,
  surface: CourseSurface,
  sx: (value: number) => number,
  sy: (value: number) => number,
) {
  ctx.fillStyle = materials[surface.type].color;
  traceSurface(ctx, surface, sx, sy);
  ctx.fill();
}

function clipSurface(ctx: CanvasRenderingContext2D, surface: CourseSurface, sx: (value: number) => number, sy: (value: number) => number) {
  ctx.beginPath();
  surface.points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(sx(x), sy(y));
    } else {
      ctx.lineTo(sx(x), sy(y));
    }
  });
  ctx.closePath();
  ctx.clip();
}

function traceSurface(ctx: CanvasRenderingContext2D, surface: CourseSurface, sx: (value: number) => number, sy: (value: number) => number) {
  ctx.beginPath();
  surface.points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(sx(x), sy(y));
    } else {
      ctx.lineTo(sx(x), sy(y));
    }
  });
  ctx.closePath();
}

function drawSurfaceTextures(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const textureOrder: Surface["name"][] = ["rough", "fairway", "tee", "green", "bunker"];

  for (const type of textureOrder) {
    for (const surface of course.surfaces.filter((item) => item.type === type)) {
      ctx.save();
      paintSurfaceBase(ctx, surface, sx, sy);
      clipSurface(ctx, surface, sx, sy);

      if (surface.type === "bunker") {
        ctx.strokeStyle = "rgba(111, 85, 39, 0.2)";
        ctx.lineWidth = Math.max(0.55, 0.8 * scale);
        for (let y = 34; y < worldHeight; y += 16) {
          const curve = Math.sin(y * 0.045) * 6;
          ctx.beginPath();
          ctx.moveTo(sx(0), sy(y));
          ctx.quadraticCurveTo(sx(worldWidth * 0.52), sy(y + curve), sx(worldWidth), sy(y - curve * 0.25));
          ctx.stroke();
        }

        ctx.restore();
        ctx.save();
        ctx.strokeStyle = "rgba(83, 64, 31, 0.26)";
        ctx.lineWidth = Math.max(1.2, 2.1 * scale);
        traceSurface(ctx, surface, sx, sy);
        ctx.stroke();
      } else if (surface.type === "green") {
        ctx.strokeStyle = "rgba(236, 255, 225, 0.2)";
        ctx.lineWidth = Math.max(0.7, 1 * scale);
        for (let y = 0; y < worldHeight; y += 16) {
          const lean = Math.sin(y * 0.024) * 4;
          ctx.beginPath();
          ctx.moveTo(sx(0), sy(y));
          ctx.lineTo(sx(worldWidth), sy(y + lean));
          ctx.stroke();
        }

        ctx.strokeStyle = "rgba(21, 84, 39, 0.24)";
        ctx.lineWidth = Math.max(4, 8 * scale);
        traceSurface(ctx, surface, sx, sy);
        ctx.stroke();
      } else if (surface.type === "fairway" || surface.type === "tee") {
        const bandStep = surface.type === "tee" ? 22 : 36;
        for (let y = 0; y < worldHeight; y += bandStep) {
          const alternate = Math.floor(y / bandStep) % 2 === 0;
          ctx.fillStyle = alternate ? "rgba(255,255,255,0.055)" : "rgba(20,75,34,0.055)";
          ctx.fillRect(sx(0), sy(y), worldWidth * scale, bandStep * 0.52 * scale);
        }

        ctx.strokeStyle = "rgba(244,255,236,0.12)";
        ctx.lineWidth = Math.max(0.6, 1 * scale);
        for (let y = 0; y < worldHeight; y += 72) {
          ctx.beginPath();
          ctx.moveTo(sx(0), sy(y));
          ctx.lineTo(sx(worldWidth), sy(y + Math.sin(y * 0.02) * 4));
          ctx.stroke();
        }
      } else if (surface.type === "rough") {
        ctx.strokeStyle = "rgba(16, 66, 31, 0.28)";
        ctx.lineWidth = Math.max(0.8, 1.4 * scale);
        for (let i = 0; i < surface.points.length * 8; i += 1) {
          const base = surface.points[i % surface.points.length];
          const x = base[0] + Math.sin(i * 4.891) * 26;
          const y = base[1] + Math.cos(i * 7.123) * 26;
          ctx.beginPath();
          ctx.moveTo(sx(x), sy(y));
          ctx.lineTo(sx(x + Math.sin(i) * 9), sy(y - 8));
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }
}

function drawTrees(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  detail: "full" | "mini" = "full",
) {
  for (const tree of trees) {
    const x = sx(tree.x);
    const y = sy(tree.y);
    const radius = Math.max(2.5, tree.r * scale);
    const canopy = [
      { x: 0, y: 0, r: 0.86, c: "#1f5f32" },
      { x: -0.34, y: -0.18, r: 0.52, c: "#2f7c3f" },
      { x: 0.3, y: -0.22, r: 0.46, c: "#276f38" },
      { x: 0.12, y: 0.32, r: 0.48, c: "#245f34" },
    ];

    ctx.fillStyle = detail === "full" ? "rgba(0, 0, 0, 0.18)" : "rgba(0, 0, 0, 0.12)";
    ctx.beginPath();
    ctx.ellipse(x + radius * 0.18, y + radius * 0.18, radius * 0.86, radius * 0.58, 0.4, 0, Math.PI * 2);
    ctx.fill();

    for (const lobe of detail === "full" ? canopy : canopy.slice(0, 1)) {
      ctx.fillStyle = lobe.c;
      ctx.beginPath();
      ctx.arc(x + radius * lobe.x, y + radius * lobe.y, radius * lobe.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (detail === "full") {
      ctx.fillStyle = "rgba(238, 255, 217, 0.16)";
      ctx.beginPath();
      ctx.arc(x - radius * 0.22, y - radius * 0.3, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(50, 33, 20, 0.28)";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, radius * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const [pinX, pinY] = course.pin;
  ctx.fillStyle = "#111711";
  ctx.beginPath();
  ctx.arc(sx(pinX), sy(pinY), 5 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f8fff2";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(sx(pinX), sy(pinY));
  ctx.lineTo(sx(pinX), sy(pinY - 44));
  ctx.stroke();

  ctx.fillStyle = "#e84f42";
  ctx.beginPath();
  ctx.moveTo(sx(pinX), sy(pinY - 44));
  ctx.lineTo(sx(pinX + 30), sy(pinY - 34));
  ctx.lineTo(sx(pinX), sy(pinY - 24));
  ctx.closePath();
  ctx.fill();
}

function drawGrass(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  width: number,
  height: number,
  scale: number,
) {
  ctx.fillStyle = heavy.color;
  ctx.fillRect(0, 0, width, height);

  drawMaintainedRough(ctx, sx, sy, scale);
  drawSurfacePolygons(ctx, sx, sy);
  drawSurfaceTextures(ctx, sx, sy, scale);
  drawTrees(ctx, sx, sy, scale);
  drawPin(ctx, sx, sy, scale);

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
  const lift = ball.z * 0.2;
  const radius = (3.6 + Math.min(2.1, ball.z * 0.004)) * scale;
  const shadowScale = clamp(1 - ball.z / 460, 0.28, 1);
  const surface = surfaceAt(ball.x, ball.y);

  ctx.fillStyle = surface.color;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(sx(ball.x), sy(ball.y), 8.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = `rgba(0, 0, 0, ${0.32 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(
    sx(ball.x),
    sy(ball.y) + 2 * scale,
    radius * 0.86 * shadowScale,
    radius * 0.32 * shadowScale,
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

function drawOverviewMarker(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  ball: BallState,
) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(sx(ball.x), sy(ball.y), 34 * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.moveTo(sx(ball.x), sy(ball.y - 54));
  ctx.lineTo(sx(ball.x + 12), sy(ball.y - 30));
  ctx.lineTo(sx(ball.x - 12), sy(ball.y - 30));
  ctx.closePath();
  ctx.fill();
}

function drawMiniMap(ctx: CanvasRenderingContext2D, width: number, height: number, ball: BallState) {
  const mapWidth = Math.min(210, width * 0.3);
  const mapHeight = Math.min(292, height * 0.36);
  const margin = Math.max(14, Math.min(width, height) * 0.025);
  const left = width - mapWidth - margin;
  const top = height - mapHeight - margin;
  const padding = 14;
  const scale = Math.min(
    (mapWidth - padding * 2) / worldWidth,
    (mapHeight - padding * 2) / worldHeight,
  );
  const offsetX = left + (mapWidth - worldWidth * scale) / 2;
  const offsetY = top + (mapHeight - worldHeight * scale) / 2;
  const sx = (value: number) => offsetX + value * scale;
  const sy = (value: number) => offsetY + value * scale;

  ctx.save();
  ctx.fillStyle = "rgba(12, 30, 18, 0.78)";
  ctx.beginPath();
  ctx.roundRect(left, top, mapWidth, mapHeight, 8);
  ctx.fill();
  ctx.clip();

  ctx.fillStyle = heavy.color;
  ctx.fillRect(left, top, mapWidth, mapHeight);
  drawMaintainedRough(ctx, sx, sy, scale);
  drawSurfacePolygons(ctx, sx, sy);
  drawTrees(ctx, sx, sy, scale, "mini");
  drawPin(ctx, sx, sy, scale);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(sx(ball.x), sy(ball.y), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#183520";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, width: number, ball: BallState) {
  const remainingYards = Math.max(
    0,
    Math.hypot(ball.x - course.pin[0], ball.y - course.pin[1]) / worldUnitsPerYard,
  );
  const panelWidth = Math.min(360, width - 28);
  const left = 14;
  const top = 14;

  ctx.save();
  ctx.fillStyle = "rgba(12, 30, 18, 0.74)";
  ctx.beginPath();
  ctx.roundRect(left, top, panelWidth, 74, 8);
  ctx.fill();

  ctx.fillStyle = "#f8fff2";
  ctx.font = "700 15px Arial, Helvetica, sans-serif";
  ctx.fillText(`${course.name}  |  ${scorecardHoleYards} yd  |  Par ${course.par}`, left + 14, top + 26);

  ctx.fillStyle = "rgba(248, 255, 242, 0.76)";
  ctx.font = "700 13px Arial, Helvetica, sans-serif";
  ctx.fillText(
    `Driver ${driverPreset.clubheadMph} mph: ${driverPreset.carryYards} yd carry / ${driverPreset.totalYards} yd total`,
    left + 14,
    top + 48,
  );
  ctx.fillText(`${remainingYards.toFixed(0)} yd to pin`, left + 14, top + 66);
  ctx.restore();
}

export function GolfinPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const cameraFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const movingRef = useRef(false);
  const overviewUntilRef = useRef<number>(0);
  const ballRef = useRef<BallState>({ ...startBall });
  const cameraRef = useRef<CameraState>({
    x: worldWidth / 2,
    y: worldHeight / 2,
    zoom: 0.6,
    targetX: worldWidth / 2,
    targetY: worldHeight / 2,
    targetZoom: 0.6,
  });
  const trailRef = useRef<Array<{ x: number; y: number; z: number }>>([]);

  const [moving, setMoving] = useState(false);

  const draw = useCallback((timestamp = performance.now()) => {
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
    const ball = ballRef.current;
    const camera = cameraRef.current;
    const overviewZoom = Math.min(width / worldWidth, height / worldHeight) * 0.9;
    const detailZoom = clamp(Math.min(width, height) / 250, 1.45, 2.8);
    const currentSpeed = speed(ball);
    const shotZoomAmount = clamp((currentSpeed - 80) / 460, 0, 1);

    if (movingRef.current) {
      camera.targetX = clamp(ball.x + ball.vx * 0.1, 80, worldWidth - 80);
      camera.targetY = clamp(ball.y + ball.vy * 0.1, 80, worldHeight - 80);
      camera.targetZoom = lerp(detailZoom, overviewZoom * 1.08, shotZoomAmount);
    } else if (timestamp < overviewUntilRef.current) {
      camera.targetX = worldWidth / 2;
      camera.targetY = worldHeight / 2;
      camera.targetZoom = overviewZoom;
    } else {
      camera.targetX = ball.x;
      camera.targetY = ball.y;
      camera.targetZoom = detailZoom;
    }

    camera.x = lerp(camera.x, camera.targetX, 0.08);
    camera.y = lerp(camera.y, camera.targetY, 0.08);
    camera.zoom = lerp(camera.zoom, camera.targetZoom, 0.08);

    const sx = (value: number) => width / 2 + (value - camera.x) * camera.zoom;
    const sy = (value: number) => height / 2 + (value - camera.y) * camera.zoom;
    const showingOverview = camera.zoom < detailZoom * 0.62;

    drawGrass(ctx, sx, sy, width, height, camera.zoom);
    drawTrail(ctx, sx, sy, camera.zoom, trailRef.current);
    drawAimGhost(ctx, sx, sy, camera.zoom, ball);
    drawBall(ctx, sx, sy, camera.zoom, ball);
    if (showingOverview) {
      drawOverviewMarker(ctx, sx, sy, camera.zoom, ball);
    }
    drawMiniMap(ctx, width, height, ball);
    drawHud(ctx, width, ball);
  }, []);

  useEffect(() => {
    overviewUntilRef.current = performance.now() + 1500;

    const tick = (timestamp: number) => {
      if (!movingRef.current) {
        draw(timestamp);
      }
      cameraFrameRef.current = requestAnimationFrame(tick);
    };
    cameraFrameRef.current = requestAnimationFrame(tick);

    const resize = () => draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      if (cameraFrameRef.current) {
        cancelAnimationFrame(cameraFrameRef.current);
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
      movingRef.current = false;
      setMoving(false);
      overviewUntilRef.current = timestamp + 1600;
      frameRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    frameRef.current = requestAnimationFrame(step);
  }

  function swing() {
    if (movingRef.current) {
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
    movingRef.current = true;
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
