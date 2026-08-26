"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import downsHoleSource from "./course-data/goodwood-downs-1-hole.json";

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

type WaterHazard = {
  id: number;
  points: Array<[number, number]>;
};

type WaterEdgeDetail = {
  id: number;
  kind: "rock" | "shrub" | "flower";
  x: number;
  y: number;
  r: number;
  seed: number;
};

type GrassTextureSpec = {
  albedoSrc: string;
  heightSrc: string;
  fallback: [number, number, number];
  tint: [number, number, number];
  tintStrength: number;
  brightness: number;
  contrast: number;
  bumpStrength: number;
  tileSize: number;
  tileWorldSize: number;
};

type RenderRules = {
  drawWater: boolean;
  drawScenery: boolean;
  drawGrassEdges: boolean;
  drawWindSheen: boolean;
  useWaterPenalties: boolean;
  windDirection: number;
  windStrength: number;
};

type SurfaceEmbossRule = {
  width: number;
  offset: number;
  blur: number;
  light: number;
  shade: number;
};

type TerrainTextureSet = {
  masks: WebGLTexture;
  shadow: WebGLTexture;
  heavyGrass: WebGLTexture;
  roughGrass: WebGLTexture;
  fairwayGrass: WebGLTexture;
  greenGrass: WebGLTexture;
};

type CompiledTerrainTriangle = {
  indices: [number, number, number];
  surface: "out_of_bounds" | "rough" | "fairway" | "green" | "tee" | "bunker" | "water";
};

type CompiledTerrainMesh = {
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  stats: {
    vertices: number;
    triangles: number;
    baseCellsX: number;
    baseCellsY: number;
    adaptive: number;
  };
  vertices: Array<[number, number, number]>;
  normals: Array<[number, number, number]>;
  triangles: CompiledTerrainTriangle[];
};

type TerrainGpuMesh = {
  buffer: WebGLBuffer;
  vertexCount: number;
  source: CompiledTerrainMesh;
  heightMin: number;
  heightMax: number;
};

type TerrainWebGlState = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  mesh: TerrainGpuMesh;
  textures: TerrainTextureSet;
  attributes: {
    world: number;
    elevation: number;
    normal: number;
    surface: number;
  };
  uniforms: {
    masks: WebGLUniformLocation | null;
    shadow: WebGLUniformLocation | null;
    heavyGrass: WebGLUniformLocation | null;
    roughGrass: WebGLUniformLocation | null;
    fairwayGrass: WebGLUniformLocation | null;
    greenGrass: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    camera: WebGLUniformLocation | null;
    worldSize: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    wind: WebGLUniformLocation | null;
    metresToWorld: WebGLUniformLocation | null;
    heightRange: WebGLUniformLocation | null;
    meshBounds: WebGLUniformLocation | null;
  };
};

type CourseData = {
  id: string;
  courseId: string;
  courseName: string;
  name: string;
  ref: string;
  par: number;
  yards: number;
  holeLine: Array<[number, number]>;
  tee: [number, number];
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

type SwingSpeed = 80 | 90 | 100 | 110 | 120;

type ClubDefinition = {
  id: string;
  name: string;
  code: string;
  distances: Partial<Record<SwingSpeed, number>>;
  flightSeconds: number;
  spin: number;
  isPutter?: boolean;
};

type HoleState = "playing" | "sinking" | "celebrating" | "complete" | "outOfBounds";

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

const grassTextureSpecs: Record<Exclude<Surface["name"], "bunker">, GrassTextureSpec> = {
  fairway: {
    albedoSrc: "/textures/grass/Grass005_1K-JPG_Color.jpg",
    heightSrc: "/textures/grass/Grass005_1K-JPG_Displacement.jpg",
    fallback: [66, 146, 72],
    tint: [92, 176, 72],
    tintStrength: 0.46,
    brightness: 1.08,
    contrast: 1.1,
    bumpStrength: 1.16,
    tileSize: 192,
    tileWorldSize: 150,
  },
  green: {
    albedoSrc: "/textures/grass/Grass006_1K-JPG_Color.jpg",
    heightSrc: "/textures/grass/Grass006_1K-JPG_Displacement.jpg",
    fallback: [94, 181, 91],
    tint: [126, 214, 99],
    tintStrength: 0.58,
    brightness: 1.18,
    contrast: 0.82,
    bumpStrength: 0.42,
    tileSize: 192,
    tileWorldSize: 120,
  },
  heavy: {
    albedoSrc: "/textures/grass/Grass001_1K-JPG_Color.jpg",
    heightSrc: "/textures/grass/Grass001_1K-JPG_Displacement.jpg",
    fallback: [31, 91, 50],
    tint: [40, 104, 49],
    tintStrength: 0.34,
    brightness: 0.84,
    contrast: 1.28,
    bumpStrength: 1.44,
    tileSize: 224,
    tileWorldSize: 190,
  },
  rough: {
    albedoSrc: "/textures/grass/Grass008_1K-JPG_Color.jpg",
    heightSrc: "/textures/grass/Grass008_1K-JPG_Displacement.jpg",
    fallback: [42, 116, 59],
    tint: [54, 132, 61],
    tintStrength: 0.4,
    brightness: 0.95,
    contrast: 1.22,
    bumpStrength: 1.32,
    tileSize: 224,
    tileWorldSize: 170,
  },
  tee: {
    albedoSrc: "/textures/grass/Grass005_1K-JPG_Color.jpg",
    heightSrc: "/textures/grass/Grass005_1K-JPG_Displacement.jpg",
    fallback: [87, 166, 86],
    tint: [105, 190, 85],
    tintStrength: 0.5,
    brightness: 1.12,
    contrast: 0.96,
    bumpStrength: 0.72,
    tileSize: 192,
    tileWorldSize: 125,
  },
};

const goodwoodDownsHole1 = downsHoleSource as unknown as CourseData;

const gravity = 170;
const worldWidth = 900;
const worldHeight = 1250;
const roughCollarWidth = 58;
const treeSetback = 46;
const bunkerScale = 1.5;
const cupRadius = 9;
const cupCaptureSpeed = 36;
const sinkDurationMs = 950;
const celebrationDurationMs = 2600;
const outOfBoundsDurationMs = 1450;
const scorecardHoleYards = goodwoodDownsHole1.yards;
const fixedSwingMph: SwingSpeed = 100;
const renderRules: RenderRules = {
  drawWater: false,
  drawScenery: false,
  drawGrassEdges: false,
  drawWindSheen: false,
  useWaterPenalties: false,
  windDirection: -0.55,
  windStrength: 0.38,
};
const sunVector = { x: -0.62, y: 0.78 };
const surfaceEmbossRules: Partial<Record<Surface["name"], SurfaceEmbossRule>> = {
  rough: { width: 2.6, offset: 0.85, blur: 0.9, light: 0.045, shade: 0.065 },
  fairway: { width: 3.2, offset: 1, blur: 1, light: 0.06, shade: 0.085 },
  tee: { width: 2.8, offset: 0.95, blur: 0.95, light: 0.055, shade: 0.075 },
  green: { width: 2.6, offset: 0.85, blur: 0.9, light: 0.05, shade: 0.07 },
};
const clubDefinitions: ClubDefinition[] = [
  {
    id: "driver",
    name: "Driver",
    code: "DR",
    distances: { 80: 185, 90: 215, 100: 240, 110: 265, 120: 290 },
    flightSeconds: 4.5,
    spin: 1.8,
  },
  {
    id: "3-wood",
    name: "3 Wood",
    code: "3W",
    distances: { 80: 165, 90: 190, 100: 215, 110: 235, 120: 255 },
    flightSeconds: 4.25,
    spin: 1.65,
  },
  {
    id: "4-iron",
    name: "4 Iron",
    code: "4I",
    distances: { 80: 135, 90: 155, 100: 175, 110: 195, 120: 215 },
    flightSeconds: 3.8,
    spin: 1.5,
  },
  {
    id: "6-iron",
    name: "6 Iron",
    code: "6I",
    distances: { 80: 115, 90: 135, 100: 155, 110: 175, 120: 195 },
    flightSeconds: 3.55,
    spin: 1.38,
  },
  {
    id: "8-iron",
    name: "8 Iron",
    code: "8I",
    distances: { 80: 95, 90: 115, 100: 135, 110: 155, 120: 175 },
    flightSeconds: 3.25,
    spin: 1.24,
  },
  {
    id: "pitching-wedge",
    name: "Pitching Wedge",
    code: "PW",
    distances: { 80: 75, 90: 95, 100: 115, 110: 135, 120: 150 },
    flightSeconds: 2.95,
    spin: 1.12,
  },
  {
    id: "sand-wedge",
    name: "Sand Wedge",
    code: "SW",
    distances: { 80: 55, 90: 75, 100: 90, 110: 105, 120: 120 },
    flightSeconds: 2.7,
    spin: 0.95,
  },
  {
    id: "putter",
    name: "Putter",
    code: "PT",
    distances: { 100: 35 },
    flightSeconds: 0,
    spin: 0.45,
    isPutter: true,
  },
];
const defaultClub = clubDefinitions[0];
const holeSparks = [
  { angle: -96, color: "#f8fff2", delay: 20, length: 230, curve: -84, width: 2.2 },
  { angle: -79, color: "#f8d766", delay: 90, length: 288, curve: 72, width: 1.65 },
  { angle: -61, color: "#ff8f70", delay: 145, length: 202, curve: -58, width: 1.8 },
  { angle: -42, color: "#7fd6ff", delay: 35, length: 316, curve: 92, width: 1.55 },
  { angle: -25, color: "#7ee28d", delay: 118, length: 248, curve: -76, width: 1.9 },
  { angle: -8, color: "#f8fff2", delay: 172, length: 342, curve: 54, width: 1.45 },
  { angle: 11, color: "#f8d766", delay: 64, length: 214, curve: -68, width: 1.75 },
  { angle: 29, color: "#ff8f70", delay: 214, length: 306, curve: 88, width: 1.5 },
  { angle: 48, color: "#7ee28d", delay: 130, length: 262, curve: -96, width: 1.85 },
  { angle: 67, color: "#7fd6ff", delay: 46, length: 348, curve: 70, width: 1.4 },
  { angle: 86, color: "#f8fff2", delay: 188, length: 238, curve: -54, width: 2 },
  { angle: 104, color: "#f8d766", delay: 78, length: 292, curve: 86, width: 1.55 },
  { angle: 123, color: "#ff8f70", delay: 224, length: 220, curve: -72, width: 1.7 },
  { angle: 142, color: "#7fd6ff", delay: 150, length: 328, curve: 62, width: 1.45 },
  { angle: 160, color: "#7ee28d", delay: 28, length: 256, curve: -90, width: 1.9 },
  { angle: 178, color: "#f8fff2", delay: 108, length: 300, curve: 76, width: 1.6 },
  { angle: 198, color: "#f8d766", delay: 196, length: 236, curve: -64, width: 1.85 },
  { angle: 216, color: "#ff8f70", delay: 58, length: 338, curve: 98, width: 1.4 },
  { angle: 235, color: "#7fd6ff", delay: 138, length: 268, curve: -78, width: 1.7 },
  { angle: 253, color: "#7ee28d", delay: 238, length: 312, curve: 56, width: 1.55 },
  { angle: 272, color: "#f8fff2", delay: 82, length: 226, curve: -86, width: 2.1 },
  { angle: 291, color: "#f8d766", delay: 166, length: 354, curve: 74, width: 1.45 },
  { angle: 310, color: "#ff8f70", delay: 42, length: 244, curve: -60, width: 1.8 },
  { angle: 329, color: "#7fd6ff", delay: 252, length: 318, curve: 94, width: 1.5 },
  { angle: 347, color: "#7ee28d", delay: 126, length: 282, curve: -82, width: 1.65 },
  { angle: 365, color: "#f8fff2", delay: 206, length: 334, curve: 58, width: 1.45 },
];

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

  const surfaces = source.surfaces.map((surface) => {
    const points = surface.points.map(transform);

    return {
      ...surface,
      points: surface.type === "bunker" ? scalePolygon(points, bunkerScale) : points,
    };
  });

  return {
    ...source,
    holeLine: source.holeLine.map(transform),
    pin: transform(source.pin),
    surfaces,
  };
}

const course = orientCourse(goodwoodDownsHole1);
const teePoint = course.holeLine[0];
const worldUnitsPerYard = lineLength(course.holeLine) / scorecardHoleYards;
const waterHazards: WaterHazard[] = [];

const startBall: BallState = {
  x: teePoint[0],
  y: teePoint[1],
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
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

function scalePolygon(points: Array<[number, number]>, scale: number) {
  const center = polygonCentroid(points);

  return points.map(([x, y]) => [
    Number((center.x + (x - center.x) * scale).toFixed(1)),
    Number((center.y + (y - center.y) * scale).toFixed(1)),
  ] as [number, number]);
}

function seededNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function mixChannel(start: number, end: number, amount: number) {
  return Math.round(lerp(start, end, amount));
}

function mixColor(
  start: [number, number, number],
  end: [number, number, number],
  amount: number,
) {
  return [
    mixChannel(start[0], end[0], amount),
    mixChannel(start[1], end[1], amount),
    mixChannel(start[2], end[2], amount),
  ] as [number, number, number];
}

function colorString(color: [number, number, number], alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

const grassPatternCache = new Map<string, CanvasPattern>();
const textureImageCache = new Map<string, HTMLImageElement>();
const courseAssetBase = "/courses/goodwood-downs-1";
const terrainDebugSrc = `${courseAssetBase}/package/holes/01/terrain-debug.json`;
const compiledTerrainPreviewSrc = `${courseAssetBase}/package/holes/01/render/terrain-preview.png`;
const terrainAssetSources = {
  masks: `${courseAssetBase}/masks.png`,
  shadow: `${courseAssetBase}/shadow.png`,
  heavyGrass: grassTextureSpecs.heavy.albedoSrc,
  roughGrass: grassTextureSpecs.rough.albedoSrc,
  fairwayGrass: grassTextureSpecs.fairway.albedoSrc,
  greenGrass: grassTextureSpecs.green.albedoSrc,
};
const terrainImageCache = new Map<string, HTMLImageElement>();
let terrainWebGlState: TerrainWebGlState | null = null;

function textureImage(src: string) {
  const cached = textureImageCache.get(src);
  if (cached) {
    return cached;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = src;
  textureImageCache.set(src, image);
  return image;
}

function terrainImage(src: string) {
  const cached = terrainImageCache.get(src);
  if (cached) {
    return cached;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = src;
  terrainImageCache.set(src, image);
  return image;
}

function imageReady(image: HTMLImageElement) {
  return image.complete && image.naturalWidth > 0;
}

function createFallbackGrassPattern(
  ctx: CanvasRenderingContext2D,
  spec: GrassTextureSpec,
  type: Exclude<Surface["name"], "bunker">,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;

  const textureCtx = canvas.getContext("2d");
  if (!textureCtx) {
    return null;
  }

  textureCtx.fillStyle = colorString(spec.fallback);
  textureCtx.fillRect(0, 0, canvas.width, canvas.height);
  textureCtx.strokeStyle = colorString(mixColor(spec.fallback, spec.tint, 0.45), 0.14);
  textureCtx.lineWidth = 1;

  for (let i = 0; i < 96; i += type === "green" ? 14 : 9) {
    textureCtx.beginPath();
    textureCtx.moveTo((i * 17) % canvas.width, 0);
    textureCtx.lineTo(((i * 17) % canvas.width) - 38, canvas.height);
    textureCtx.stroke();
  }

  return ctx.createPattern(canvas, "repeat");
}

function createGrassPattern(ctx: CanvasRenderingContext2D, type: Exclude<Surface["name"], "bunker">) {
  const cached = grassPatternCache.get(type);
  if (cached) {
    return cached;
  }

  const spec = grassTextureSpecs[type];
  const albedo = textureImage(spec.albedoSrc);
  const heightMap = textureImage(spec.heightSrc);

  if (!imageReady(albedo) || !imageReady(heightMap)) {
    return createFallbackGrassPattern(ctx, spec, type);
  }

  const canvas = document.createElement("canvas");
  canvas.width = spec.tileSize;
  canvas.height = spec.tileSize;

  const textureCtx = canvas.getContext("2d");
  if (!textureCtx) {
    return null;
  }

  const albedoCanvas = document.createElement("canvas");
  const heightCanvas = document.createElement("canvas");
  albedoCanvas.width = canvas.width;
  albedoCanvas.height = canvas.height;
  heightCanvas.width = canvas.width;
  heightCanvas.height = canvas.height;

  const albedoCtx = albedoCanvas.getContext("2d");
  const heightCtx = heightCanvas.getContext("2d");
  if (!albedoCtx || !heightCtx) {
    return createFallbackGrassPattern(ctx, spec, type);
  }

  albedoCtx.drawImage(albedo, 0, 0, canvas.width, canvas.height);
  heightCtx.drawImage(heightMap, 0, 0, canvas.width, canvas.height);

  const albedoData = albedoCtx.getImageData(0, 0, canvas.width, canvas.height);
  const heightData = heightCtx.getImageData(0, 0, canvas.width, canvas.height);
  const shaded = textureCtx.createImageData(canvas.width, canvas.height);
  const height = new Float32Array(canvas.width * canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = y * canvas.width + x;
      const pixelIndex = index * 4;
      const displacement =
        (heightData.data[pixelIndex] * 0.2126 +
          heightData.data[pixelIndex + 1] * 0.7152 +
          heightData.data[pixelIndex + 2] * 0.0722) /
        255;
      height[index] = displacement;
    }
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = y * canvas.width + x;
      const pixelIndex = index * 4;
      const left = height[y * canvas.width + ((x - 1 + canvas.width) % canvas.width)];
      const right = height[y * canvas.width + ((x + 1) % canvas.width)];
      const up = height[((y - 1 + canvas.height) % canvas.height) * canvas.width + x];
      const down = height[((y + 1) % canvas.height) * canvas.width + x];
      const dx = (right - left) * spec.bumpStrength;
      const dy = (down - up) * spec.bumpStrength;
      const bumpLight = clamp(0.96 - dx * 0.86 - dy * 1.04 + (height[index] - 0.5) * 0.1, 0.58, 1.34);
      const lightAdjusted = [
        albedoData.data[pixelIndex],
        albedoData.data[pixelIndex + 1],
        albedoData.data[pixelIndex + 2],
      ].map((channel, channelIndex) => {
        const contrasted = (channel - 128) * spec.contrast + 128;
        const brightened = clamp(contrasted * spec.brightness * bumpLight, 0, 255);
        return mixChannel(brightened, spec.tint[channelIndex], spec.tintStrength);
      });

      shaded.data[pixelIndex] = lightAdjusted[0];
      shaded.data[pixelIndex + 1] = lightAdjusted[1];
      shaded.data[pixelIndex + 2] = lightAdjusted[2];
      shaded.data[pixelIndex + 3] = 255;
    }
  }

  textureCtx.putImageData(shaded, 0, 0);

  const pattern = ctx.createPattern(canvas, "repeat");
  if (pattern) {
    grassPatternCache.set(type, pattern);
  }

  return pattern;
}

function setPatternWorldTransform(
  pattern: CanvasPattern,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  tileScale: number,
  offsetX = 0,
  offsetY = 0,
) {
  if (typeof pattern.setTransform !== "function") {
    return;
  }

  pattern.setTransform(
    new DOMMatrix([
      scale * tileScale,
      0,
      0,
      scale * tileScale,
      sx(0) + offsetX * scale,
      sy(0) + offsetY * scale,
    ]),
  );
}

function worldGrassPattern(
  ctx: CanvasRenderingContext2D,
  type: Exclude<Surface["name"], "bunker">,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  offsetX = 0,
  offsetY = 0,
) {
  const pattern = createGrassPattern(ctx, type);
  if (!pattern) {
    return null;
  }

  const spec = grassTextureSpecs[type];
  setPatternWorldTransform(pattern, sx, sy, scale, spec.tileWorldSize / spec.tileSize, offsetX, offsetY);
  return pattern;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function createTerrainTexture(gl: WebGLRenderingContext, image: HTMLImageElement, repeat = false) {
  const texture = gl.createTexture();
  if (!texture) {
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, repeat ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  if (repeat) {
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  return texture;
}

function terrainAssetsReady() {
  return Object.values(terrainAssetSources).every((src) => imageReady(terrainImage(src)));
}

function clearTerrainCanvas(canvas: HTMLCanvasElement | null, width: number, height: number, dpr: number) {
  if (!canvas) {
    return;
  }
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

function drawCompiledTerrainPreview(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  mesh: CompiledTerrainMesh | null,
) {
  const image = terrainImage(compiledTerrainPreviewSrc);
  if (!mesh || !imageReady(image)) {
    return false;
  }

  const metresToWorld = worldUnitsPerYard / 0.9144;
  const minX = mesh.bounds.minX * metresToWorld;
  const minY = mesh.bounds.minY * metresToWorld;
  const maxX = mesh.bounds.maxX * metresToWorld;
  const maxY = mesh.bounds.maxY * metresToWorld;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, sx(minX), sy(minY), sx(maxX) - sx(minX), sy(maxY) - sy(minY));
  ctx.restore();
  return true;
}

function createTerrainWebGlState(canvas: HTMLCanvasElement, mesh: CompiledTerrainMesh) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl || !terrainAssetsReady()) {
    return null;
  }

  const vertexSource = `
    attribute vec2 a_world;
    attribute float a_elevation;
    attribute vec3 a_normal;
    attribute float a_surface;
    uniform vec2 u_viewport;
    uniform vec2 u_camera;
    uniform float u_zoom;
    uniform float u_metresToWorld;
    varying vec2 v_world;
    varying float v_elevation;
    varying vec3 v_normal;
    varying float v_surface;

    void main() {
      vec2 world = a_world * u_metresToWorld;
      vec2 pixel = (world - u_camera) * u_zoom + u_viewport * 0.5;
      vec2 clip = vec2(pixel.x / u_viewport.x * 2.0 - 1.0, 1.0 - pixel.y / u_viewport.y * 2.0);
      v_world = world;
      v_elevation = a_elevation;
      v_normal = normalize(a_normal);
      v_surface = a_surface;
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;

    uniform sampler2D u_masks;
    uniform sampler2D u_shadow;
    uniform sampler2D u_heavyGrass;
    uniform sampler2D u_roughGrass;
    uniform sampler2D u_fairwayGrass;
    uniform sampler2D u_greenGrass;
    uniform vec2 u_worldSize;
    uniform float u_time;
    uniform vec2 u_wind;
    uniform vec2 u_heightRange;
    uniform vec4 u_meshBounds;
    varying vec2 v_world;
    varying float v_elevation;
    varying vec3 v_normal;
    varying float v_surface;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 4; i++) {
        value += noise(p) * amplitude;
        p *= 2.04;
        amplitude *= 0.52;
      }
      return value;
    }

    vec3 textureGrass(sampler2D source, vec2 world, vec3 tint, float tile, float strength, float stripeStrength) {
      vec2 uv = vec2(world.x / tile, world.y / tile);
      vec3 texel = texture2D(source, uv).rgb;
      float luminance = dot(texel, vec3(0.299, 0.587, 0.114));
      vec3 normalizedTexel = mix(vec3(luminance), texel, 0.62);
      float broad = fbm(world * 0.012);
      float fine = fbm(world * 0.11 + 31.0);
      float stripe = sin(dot(world, vec2(0.031, 0.006)) + fbm(world * 0.004 + 9.0) * 1.2);
      return mix(tint, normalizedTexel, strength) + (broad - 0.5) * 0.075 + (fine - 0.5) * 0.032 + stripe * stripeStrength;
    }

    vec3 waterMaterial(vec2 world, float time, vec2 wind) {
      float rippleA = sin(dot(world, normalize(vec2(-wind.y, wind.x))) * 0.2 + time * 2.4);
      float rippleB = sin(dot(world, normalize(wind + vec2(0.18, -0.12))) * 0.13 + time * 1.7);
      float noiseValue = fbm(world * 0.04 + time * 0.04);
      return vec3(0.04, 0.38, 0.5) + rippleA * 0.035 + rippleB * 0.022 + noiseValue * 0.045;
    }

    vec3 bunkerMaterial(vec2 world, float edge) {
      float sand = fbm(world * 0.065 + 23.0);
      float rake = sin(dot(world, vec2(0.48, 0.18)) + sand * 1.6);
      vec3 base = vec3(0.76, 0.63, 0.38);
      return base + (sand - 0.5) * 0.08 + rake * 0.018 + edge * 0.08;
    }

    float surfaceIs(float id) {
      return 1.0 - step(0.5, abs(v_surface - id));
    }

    void main() {
      vec2 world = v_world;
      vec2 uv = vec2(world.x / u_worldSize.x, world.y / u_worldSize.y);
      vec4 masks = texture2D(u_masks, uv);
      vec4 aux = texture2D(u_shadow, uv);
      float rough = masks.r;
      float fairway = masks.g;
      float green = masks.b;
      float bunker = masks.a;
      float tee = aux.b;
      float water = max(aux.g, surfaceIs(6.0));
      float edge = aux.a;
      float feature = clamp(rough + fairway + green + bunker + tee + water, 0.0, 1.0);
      float normalizedHeight = clamp((v_elevation - u_heightRange.x) / max(0.001, u_heightRange.y - u_heightRange.x), 0.0, 1.0);
      float boundsDistance = min(min(world.x - u_meshBounds.x, u_meshBounds.z - world.x), min(world.y - u_meshBounds.y, u_meshBounds.w - world.y));
      float meshInfluence = smoothstep(0.0, 90.0, boundsDistance);
      vec3 normal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(v_normal.x, v_normal.y, -v_normal.z), 0.62 * meshInfluence));
      vec3 lightDir = normalize(vec3(-0.52, 0.84, 0.36));
      float terrainLight = clamp(dot(normal, lightDir), 0.0, 1.0);
      float slopeShade = clamp(normal.y, 0.0, 1.0);
      float bakedShadow = mix(0.88, aux.r, feature);
      float grassMotion = sin(dot(world, normalize(u_wind)) * 0.09 + u_time * 1.15) * 0.008;
      vec3 color = textureGrass(u_heavyGrass, world, vec3(0.12, 0.34, 0.15), 82.0, 0.44, 0.0);
      color = mix(color, textureGrass(u_roughGrass, world, vec3(0.18, 0.46, 0.19), 70.0, 0.52, 0.004), rough);
      color = mix(color, textureGrass(u_fairwayGrass, world, vec3(0.43, 0.65, 0.22), 58.0, 0.45, 0.03), fairway);
      color = mix(color, textureGrass(u_fairwayGrass, world, vec3(0.46, 0.69, 0.28), 48.0, 0.4, 0.008), tee);
      color = mix(color, textureGrass(u_greenGrass, world, vec3(0.53, 0.76, 0.34), 42.0, 0.34, 0.004), green);
      color = mix(color, bunkerMaterial(world, 0.35 + (1.0 - slopeShade) * 0.65), bunker);
      color = mix(color, waterMaterial(world, u_time, u_wind), water);
      color *= 0.62 + terrainLight * 0.35 + slopeShade * 0.13;
      color *= 0.75 + bakedShadow * 0.25;
      color *= 0.9 + normalizedHeight * 0.1 * meshInfluence;
      color += grassMotion * (1.0 - water);
      color += edge * vec3(0.014, 0.012, 0.006);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  const gpuMesh = createTerrainGpuMesh(gl, mesh);
  if (!program || !gpuMesh) {
    return null;
  }

  const masks = createTerrainTexture(gl, terrainImage(terrainAssetSources.masks));
  const shadow = createTerrainTexture(gl, terrainImage(terrainAssetSources.shadow));
  const heavyGrass = createTerrainTexture(gl, terrainImage(terrainAssetSources.heavyGrass), true);
  const roughGrass = createTerrainTexture(gl, terrainImage(terrainAssetSources.roughGrass), true);
  const fairwayGrass = createTerrainTexture(gl, terrainImage(terrainAssetSources.fairwayGrass), true);
  const greenGrass = createTerrainTexture(gl, terrainImage(terrainAssetSources.greenGrass), true);
  if (!masks || !shadow || !heavyGrass || !roughGrass || !fairwayGrass || !greenGrass) {
    return null;
  }

  return {
    canvas,
    gl,
    program,
    mesh: gpuMesh,
    textures: { masks, shadow, heavyGrass, roughGrass, fairwayGrass, greenGrass },
    attributes: {
      world: gl.getAttribLocation(program, "a_world"),
      elevation: gl.getAttribLocation(program, "a_elevation"),
      normal: gl.getAttribLocation(program, "a_normal"),
      surface: gl.getAttribLocation(program, "a_surface"),
    },
    uniforms: {
      masks: gl.getUniformLocation(program, "u_masks"),
      shadow: gl.getUniformLocation(program, "u_shadow"),
      heavyGrass: gl.getUniformLocation(program, "u_heavyGrass"),
      roughGrass: gl.getUniformLocation(program, "u_roughGrass"),
      fairwayGrass: gl.getUniformLocation(program, "u_fairwayGrass"),
      greenGrass: gl.getUniformLocation(program, "u_greenGrass"),
      viewport: gl.getUniformLocation(program, "u_viewport"),
      camera: gl.getUniformLocation(program, "u_camera"),
      worldSize: gl.getUniformLocation(program, "u_worldSize"),
      zoom: gl.getUniformLocation(program, "u_zoom"),
      time: gl.getUniformLocation(program, "u_time"),
      wind: gl.getUniformLocation(program, "u_wind"),
      metresToWorld: gl.getUniformLocation(program, "u_metresToWorld"),
      heightRange: gl.getUniformLocation(program, "u_heightRange"),
      meshBounds: gl.getUniformLocation(program, "u_meshBounds"),
    },
  };
}

function createTerrainGpuMesh(gl: WebGLRenderingContext, mesh: CompiledTerrainMesh) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    return null;
  }

  const floatsPerVertex = 7;
  const data = new Float32Array((mesh.triangles.length * 3 + 6) * floatsPerVertex);
  const heights = mesh.vertices.map((vertex) => vertex[1]);
  const heightMin = Math.min(...heights);
  const heightMax = Math.max(...heights);
  let cursor = 0;
  const metresToWorld = worldUnitsPerYard / 0.9144;

  for (const vertex of [
    [0, 0],
    [worldWidth / metresToWorld, 0],
    [0, worldHeight / metresToWorld],
    [worldWidth / metresToWorld, 0],
    [worldWidth / metresToWorld, worldHeight / metresToWorld],
    [0, worldHeight / metresToWorld],
  ]) {
    data[cursor] = vertex[0];
    data[cursor + 1] = vertex[1];
    data[cursor + 2] = heightMin;
    data[cursor + 3] = 0;
    data[cursor + 4] = 1;
    data[cursor + 5] = 0;
    data[cursor + 6] = 0;
    cursor += floatsPerVertex;
  }

  for (const triangle of mesh.triangles) {
    const surfaceId = compiledSurfaceId(triangle.surface);
    for (const index of triangle.indices) {
      const vertex = mesh.vertices[index];
      const normal = mesh.normals[index] ?? [0, 1, 0];
      data[cursor] = vertex[0];
      data[cursor + 1] = -vertex[2];
      data[cursor + 2] = vertex[1];
      data[cursor + 3] = normal[0];
      data[cursor + 4] = normal[1];
      data[cursor + 5] = normal[2];
      data[cursor + 6] = surfaceId;
      cursor += floatsPerVertex;
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  return {
    buffer,
    vertexCount: data.length / floatsPerVertex,
    source: mesh,
    heightMin,
    heightMax,
  };
}

function compiledSurfaceId(surface: CompiledTerrainTriangle["surface"]) {
  switch (surface) {
    case "rough":
      return 1;
    case "fairway":
      return 2;
    case "green":
      return 3;
    case "tee":
      return 4;
    case "bunker":
      return 5;
    case "water":
      return 6;
    case "out_of_bounds":
    default:
      return 0;
  }
}

function renderTerrainWebGl(
  canvas: HTMLCanvasElement | null,
  mesh: CompiledTerrainMesh | null,
  camera: CameraState,
  width: number,
  height: number,
  dpr: number,
  timestamp: number,
) {
  if (!canvas) {
    return false;
  }
  if (!mesh) {
    return false;
  }

  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));

  if (!terrainWebGlState || terrainWebGlState.canvas !== canvas || terrainWebGlState.mesh.source !== mesh) {
    terrainWebGlState = createTerrainWebGlState(canvas, mesh);
  }

  const state = terrainWebGlState;
  if (!state) {
    return false;
  }

  const { gl, program, mesh: gpuMesh, textures, uniforms, attributes } = state;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.08, 0.24, 0.11, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  const stride = 7 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, gpuMesh.buffer);
  gl.enableVertexAttribArray(attributes.world);
  gl.vertexAttribPointer(attributes.world, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(attributes.elevation);
  gl.vertexAttribPointer(attributes.elevation, 1, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(attributes.normal);
  gl.vertexAttribPointer(attributes.normal, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(attributes.surface);
  gl.vertexAttribPointer(attributes.surface, 1, gl.FLOAT, false, stride, 6 * 4);

  const textureEntries: Array<[WebGLTexture, WebGLUniformLocation | null]> = [
    [textures.masks, uniforms.masks],
    [textures.shadow, uniforms.shadow],
    [textures.heavyGrass, uniforms.heavyGrass],
    [textures.roughGrass, uniforms.roughGrass],
    [textures.fairwayGrass, uniforms.fairwayGrass],
    [textures.greenGrass, uniforms.greenGrass],
  ];

  textureEntries.forEach(([texture, uniform], index) => {
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniform, index);
  });

  gl.uniform2f(uniforms.viewport, width, height);
  gl.uniform2f(uniforms.camera, camera.x, camera.y);
  gl.uniform2f(uniforms.worldSize, worldWidth, worldHeight);
  gl.uniform1f(uniforms.zoom, camera.zoom);
  gl.uniform1f(uniforms.time, timestamp * 0.001);
  gl.uniform2f(uniforms.wind, Math.cos(renderRules.windDirection), Math.sin(renderRules.windDirection));
  gl.uniform1f(uniforms.metresToWorld, worldUnitsPerYard / 0.9144);
  gl.uniform2f(uniforms.heightRange, gpuMesh.heightMin, gpuMesh.heightMax);
  gl.uniform4f(
    uniforms.meshBounds,
    gpuMesh.source.bounds.minX * (worldUnitsPerYard / 0.9144),
    gpuMesh.source.bounds.minY * (worldUnitsPerYard / 0.9144),
    gpuMesh.source.bounds.maxX * (worldUnitsPerYard / 0.9144),
    gpuMesh.source.bounds.maxY * (worldUnitsPerYard / 0.9144),
  );
  gl.drawArrays(gl.TRIANGLES, 0, gpuMesh.vertexCount);

  return true;
}

function speed(ball: BallState) {
  return Math.hypot(ball.vx, ball.vy);
}

function distanceToPin(ball: BallState) {
  return Math.hypot(ball.x - course.pin[0], ball.y - course.pin[1]);
}

function isOutOfBounds(ball: BallState) {
  return (
    ball.x < 28 ||
    ball.x > worldWidth - 28 ||
    ball.y < 34 ||
    ball.y > worldHeight - 34 ||
    (renderRules.useWaterPenalties && isInWater(ball))
  );
}

function isInWater(ball: BallState) {
  return ball.z < 18 && waterHazards.some((hazard) => pointInPolygon(ball.x, ball.y, hazard.points));
}

function clubDistance(club: ClubDefinition) {
  return club.distances[fixedSwingMph] ?? 35;
}

function aimAngle(ball: BallState) {
  return Math.atan2(course.pin[1] - ball.y, course.pin[0] - ball.x);
}

function createShot(ball: BallState, club: ClubDefinition) {
  const yards = clubDistance(club);
  const angle = aimAngle(ball);

  if (club.isPutter) {
    return {
      angle,
      speed: yards * worldUnitsPerYard * 2.2,
      loft: 0,
      spin: club.spin,
    };
  }

  return {
    angle,
    speed: (yards * worldUnitsPerYard) / club.flightSeconds,
    loft: (gravity * club.flightSeconds) / 2,
    spin: club.spin,
  };
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

      const count = Math.max(1, Math.floor(edgeLength / 38));

      for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
        const t = (sampleIndex + 0.5) / count;
        const baseX = start[0] + dx * t;
        const baseY = start[1] + dy * t;
        const awayX = baseX - centroid.x;
        const awayY = baseY - centroid.y;
        const awayLength = Math.hypot(awayX, awayY) || 1;
        const seed = surface.id * 0.013 + edgeIndex * 8.7 + sampleIndex * 2.31;
        const stagger = (seededNoise(seed) - 0.5) * 42;
        const setback = roughCollarWidth + treeSetback + stagger;
        const lateral = (seededNoise(seed + 4.17) - 0.5) * 36;
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

        if (waterHazards.some((hazard) => pointInPolygon(x, y, hazard.points))) {
          continue;
        }

        if (trees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < 36)) {
          continue;
        }

        trees.push({
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          r: Number((18 + seededNoise(seed + 9.4) * 18).toFixed(1)),
        });
      }
    }
  }

  return trees;
}

function createWaterEdgeDetails() {
  const details: WaterEdgeDetail[] = [];

  for (const hazard of waterHazards) {
    for (let edgeIndex = 0; edgeIndex < hazard.points.length - 1; edgeIndex += 1) {
      const start = hazard.points[edgeIndex];
      const end = hazard.points[edgeIndex + 1];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const edgeLength = Math.hypot(dx, dy);
      if (edgeLength < 16) {
        continue;
      }

      const count = Math.max(1, Math.floor(edgeLength / 34));

      for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
        const seed = hazard.id * 1000 + edgeIndex * 77 + sampleIndex * 13.31;
        if (seededNoise(seed) < 0.28) {
          continue;
        }

        const t = (sampleIndex + 0.35 + seededNoise(seed + 1.8) * 0.3) / count;
        const tangentX = dx / edgeLength;
        const tangentY = dy / edgeLength;
        const normalX = -tangentY;
        const normalY = tangentX;
        const side = seededNoise(seed + 2.4) > 0.5 ? 1 : -1;
        const offset = 8 + seededNoise(seed + 3.2) * 20;
        const x = start[0] + dx * t + normalX * side * offset + tangentX * (seededNoise(seed + 4.1) - 0.5) * 18;
        const y = start[1] + dy * t + normalY * side * offset + tangentY * (seededNoise(seed + 5.7) - 0.5) * 18;

        if (x < 18 || x > worldWidth - 18 || y < 18 || y > worldHeight - 18) {
          continue;
        }

        if (waterHazards.some((otherHazard) => pointInPolygon(x, y, otherHazard.points))) {
          continue;
        }

        if (distanceToSurfaces(x, y) < roughCollarWidth * 0.45) {
          continue;
        }

        const roll = seededNoise(seed + 8.8);
        const kind: WaterEdgeDetail["kind"] = roll > 0.72 ? "shrub" : roll > 0.56 ? "flower" : "rock";

        details.push({
          id: details.length,
          kind,
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          r: Number((kind === "rock" ? 5 + seededNoise(seed + 9.2) * 12 : 8 + seededNoise(seed + 9.2) * 14).toFixed(1)),
          seed,
        });
      }
    }
  }

  return details;
}

const trees = createTreeLine();
const waterEdgeDetails = createWaterEdgeDetails();

function surfaceAt(x: number, y: number): Surface {
  const priority: Surface["name"][] = ["green", "tee", "rough", "fairway"];
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
    ctx.globalAlpha = 1;
    ctx.strokeStyle = worldGrassPattern(ctx, "rough", sx, sy, scale) ?? rough.color;
    ctx.lineWidth = roughCollarWidth * 1.9 * scale;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSurfacePolygons(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const drawOrder: Surface["name"][] = ["rough", "fairway", "tee", "green"];
  for (const type of drawOrder) {
    for (const surface of course.surfaces.filter((item) => item.type === type)) {
      paintSurfaceBase(ctx, surface, sx, sy, scale);
    }
  }
}

function paintSurfaceBase(
  ctx: CanvasRenderingContext2D,
  surface: CourseSurface,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const surfaceType = surface.type === "bunker" ? "rough" : surface.type;
  ctx.fillStyle = worldGrassPattern(ctx, surfaceType, sx, sy, scale) ?? materials[surfaceType].color;
  traceSurface(ctx, surface, sx, sy);
  ctx.fill();
}

function clipSurface(ctx: CanvasRenderingContext2D, surface: CourseSurface, sx: (value: number) => number, sy: (value: number) => number) {
  traceSurface(ctx, surface, sx, sy);
  ctx.clip();
}

function traceSurface(ctx: CanvasRenderingContext2D, surface: CourseSurface, sx: (value: number) => number, sy: (value: number) => number) {
  tracePolygon(ctx, surface.points, sx, sy);
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  sourcePoints: Array<[number, number]>,
  sx: (value: number) => number,
  sy: (value: number) => number,
) {
  const points = normalizedPolygon(sourcePoints);

  ctx.beginPath();

  if (points.length < 3) {
    points.forEach(([x, y], index) => {
      if (index === 0) {
        ctx.moveTo(sx(x), sy(y));
      } else {
        ctx.lineTo(sx(x), sy(y));
      }
    });
    ctx.closePath();
    return;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const start: [number, number] = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
  ctx.moveTo(sx(start[0]), sy(start[1]));

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const midpoint: [number, number] = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
    ctx.quadraticCurveTo(sx(point[0]), sy(point[1]), sx(midpoint[0]), sy(midpoint[1]));
  });

  ctx.closePath();
}

function normalizedPolygon(points: Array<[number, number]>) {
  const normalized = [...points];
  const first = normalized[0];
  const last = normalized[normalized.length - 1];

  if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.1) {
    normalized.pop();
  }

  return normalized;
}

function drawTerrainBase(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  width: number,
  height: number,
  scale: number,
) {
  ctx.fillStyle = worldGrassPattern(ctx, "heavy", sx, sy, scale) ?? "#1f5c32";
  ctx.fillRect(0, 0, width, height);

  const sunWash = ctx.createLinearGradient(width * 0.82, 0, width * 0.08, height);
  sunWash.addColorStop(0, "rgba(218, 238, 130, 0.18)");
  sunWash.addColorStop(0.36, "rgba(62, 117, 45, 0.04)");
  sunWash.addColorStop(1, "rgba(2, 18, 12, 0.24)");
  ctx.fillStyle = sunWash;
  ctx.fillRect(0, 0, width, height);
}

function drawSurfaceLight(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  strength = 1,
) {
  const light = ctx.createLinearGradient(sx(worldWidth), sy(0), sx(0), sy(worldHeight));
  light.addColorStop(0, `rgba(249, 255, 194, ${0.16 * strength})`);
  light.addColorStop(0.5, "rgba(255, 255, 255, 0)");
  light.addColorStop(1, `rgba(5, 29, 17, ${0.2 * strength})`);
  ctx.fillStyle = light;
  ctx.fillRect(sx(0), sy(0), worldWidth * scale, worldHeight * scale);
}

function drawSurfaceEmboss(
  ctx: CanvasRenderingContext2D,
  surface: CourseSurface,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const rule = surfaceEmbossRules[surface.type];

  if (!rule) {
    return;
  }

  const lightX = -sunVector.x * rule.offset * scale;
  const lightY = -sunVector.y * rule.offset * scale;
  const shadeX = sunVector.x * rule.offset * scale;
  const shadeY = sunVector.y * rule.offset * scale;
  const lineWidth = Math.max(0.9, rule.width * scale);
  const edgeBlur = Math.max(0.25, rule.blur * scale);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.filter = `blur(${edgeBlur}px)`;
  ctx.globalCompositeOperation = "screen";
  ctx.translate(lightX, lightY);
  traceSurface(ctx, surface, sx, sy);
  ctx.strokeStyle = `rgba(245, 255, 188, ${rule.light})`;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.filter = `blur(${edgeBlur}px)`;
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(shadeX, shadeY);
  traceSurface(ctx, surface, sx, sy);
  ctx.strokeStyle = `rgba(4, 24, 12, ${rule.shade})`;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawSurfaceEmbosses(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const embossedTypes: Surface["name"][] = ["rough", "fairway", "tee", "green"];

  for (const type of embossedTypes) {
    for (const surface of course.surfaces.filter((item) => item.type === type)) {
      drawSurfaceEmboss(ctx, surface, sx, sy, scale);
    }
  }
}

function drawLiveGrassEdges(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  timestamp: number,
) {
  const edgeTypes: Surface["name"][] = ["fairway", "green", "tee"];
  const windLean = Math.sin(timestamp * 0.0014) * renderRules.windStrength;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const surface of course.surfaces.filter((item) => edgeTypes.includes(item.type))) {
    traceSurface(ctx, surface, sx, sy);
    ctx.strokeStyle = "rgba(22, 73, 34, 0.2)";
    ctx.lineWidth = Math.max(1, 3.4 * scale);
    ctx.stroke();

    const points = normalizedPolygon(surface.points);
    for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
      const start = points[edgeIndex];
      const end = points[(edgeIndex + 1) % points.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const edgeLength = Math.hypot(dx, dy);
      if (edgeLength < 16) {
        continue;
      }

      const count = Math.floor(edgeLength / 14);
      const tangentX = dx / edgeLength;
      const tangentY = dy / edgeLength;
      const normalX = -tangentY;
      const normalY = tangentX;

      for (let i = 0; i < count; i += 1) {
        const seed = surface.id * 0.031 + edgeIndex * 17.3 + i * 4.7;
        if (seededNoise(seed) < 0.38) {
          continue;
        }

        const t = (i + seededNoise(seed + 2.2)) / count;
        const side = seededNoise(seed + 4.9) > 0.5 ? 1 : -1;
        const length = 5 + seededNoise(seed + 7.1) * 13;
        const baseX = start[0] + dx * t + normalX * side * (2 + seededNoise(seed + 9.1) * 4);
        const baseY = start[1] + dy * t + normalY * side * (2 + seededNoise(seed + 9.1) * 4);
        const leanX = normalX * side * length + tangentX * windLean * 9;
        const leanY = normalY * side * length + tangentY * windLean * 9;

        ctx.strokeStyle = seededNoise(seed + 11.4) > 0.55
          ? "rgba(181, 220, 110, 0.2)"
          : "rgba(13, 53, 27, 0.18)";
        ctx.lineWidth = Math.max(0.45, 0.9 * scale);
        ctx.beginPath();
        ctx.moveTo(sx(baseX), sy(baseY));
        ctx.lineTo(sx(baseX + leanX), sy(baseY + leanY));
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function drawWindGrassSheen(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  timestamp: number,
) {
  const offset = (timestamp * 0.014 * renderRules.windStrength) % 220;
  const sheenSurfaces = course.surfaces.filter((surface) => surface.type !== "bunker");

  ctx.save();
  for (const surface of sheenSurfaces) {
    ctx.save();
    traceSurface(ctx, surface, sx, sy);
    ctx.clip();

    ctx.strokeStyle = "rgba(235, 255, 178, 0.055)";
    ctx.lineWidth = Math.max(8, 15 * scale);
    for (let y = -220; y < worldHeight + 260; y += 220) {
      const sweep = y + offset;
      ctx.beginPath();
      ctx.moveTo(sx(-80), sy(sweep));
      ctx.lineTo(sx(worldWidth + 80), sy(sweep - 142));
      ctx.stroke();
    }

    ctx.restore();
  }
  ctx.restore();
}

function drawWater(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  detail: "full" | "mini" = "full",
) {
  for (const hazard of waterHazards) {
    const points = normalizedPolygon(hazard.points);
    const center = polygonCentroid(points);

    ctx.save();
    tracePolygon(ctx, hazard.points, sx, sy);
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.translate(14 * scale, 18 * scale);
    ctx.fill();
    ctx.restore();

    ctx.save();
    tracePolygon(ctx, hazard.points, sx, sy);
    ctx.fillStyle = "#176d89";
    ctx.fill();

    ctx.strokeStyle = "rgba(6, 31, 35, 0.38)";
    ctx.lineWidth = Math.max(1.2, 3.2 * scale);
    ctx.stroke();

    ctx.clip();

    const gradient = ctx.createRadialGradient(
      sx(center.x - 28),
      sy(center.y - 54),
      8 * scale,
      sx(center.x + 18),
      sy(center.y + 18),
      180 * scale,
    );
    gradient.addColorStop(0, "rgba(183, 250, 255, 0.7)");
    gradient.addColorStop(0.22, "rgba(75, 190, 213, 0.34)");
    gradient.addColorStop(0.72, "rgba(9, 88, 122, 0.22)");
    gradient.addColorStop(1, "rgba(3, 37, 58, 0.48)");
    ctx.fillStyle = gradient;
    ctx.fillRect(sx(0), sy(0), worldWidth * scale, worldHeight * scale);

    if (detail === "full") {
      ctx.strokeStyle = "rgba(214, 255, 246, 0.2)";
      ctx.lineWidth = Math.max(0.45, 0.9 * scale);
      for (let y = 0; y < worldHeight; y += 22) {
        const wave = Math.sin((y + hazard.id * 31) * 0.034) * 9;
        ctx.beginPath();
        ctx.moveTo(sx(-20), sy(y));
        ctx.quadraticCurveTo(sx(worldWidth * 0.42), sy(y + wave), sx(worldWidth + 20), sy(y - wave * 0.35));
        ctx.stroke();
      }

      for (let i = 0; i < 28; i += 1) {
        const seed = hazard.id * 34.7 + i * 7.31;
        const sparkleX = center.x + (seededNoise(seed) - 0.5) * 190;
        const sparkleY = center.y + (seededNoise(seed + 4.2) - 0.5) * 190;
        if (!pointInPolygon(sparkleX, sparkleY, hazard.points)) {
          continue;
        }

        const sparkle = (2.8 + seededNoise(seed + 8.1) * 5) * scale;
        ctx.fillStyle = `rgba(235, 255, 240, ${0.18 + seededNoise(seed + 1.6) * 0.34})`;
        ctx.beginPath();
        ctx.ellipse(sx(sparkleX), sy(sparkleY), sparkle * 1.8, sparkle * 0.32, -0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    ctx.save();
    tracePolygon(ctx, hazard.points, sx, sy);
    ctx.strokeStyle = "rgba(222, 205, 144, 0.28)";
    ctx.lineWidth = Math.max(1, 2.8 * scale);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.44, y + radius * 0.54, radius * 1.04, radius * 0.58, 0.42, 0, Math.PI * 2);
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    x - radius * 0.4,
    y - radius * 0.45,
    radius * 0.12,
    x,
    y,
    radius * 1.1,
  );
  gradient.addColorStop(0, "#b8b98d");
  gradient.addColorStop(0.52, "#777c5f");
  gradient.addColorStop(1, "#3f493a");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius * (0.75 + seededNoise(seed) * 0.42), radius * (0.5 + seededNoise(seed + 2) * 0.32), seed, 0, Math.PI * 2);
  ctx.fill();
}

function drawShrub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
  flower = false,
) {
  const lobes = flower ? 5 : 4;

  ctx.fillStyle = "rgba(0, 0, 0, 0.17)";
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.26, y + radius * 0.34, radius * 0.94, radius * 0.5, 0.55, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < lobes; i += 1) {
    const angle = (Math.PI * 2 * i) / lobes + seededNoise(seed + i) * 0.45;
    const spread = radius * (0.25 + seededNoise(seed + i * 3.3) * 0.32);
    ctx.fillStyle = i % 2 === 0 ? "#2f823d" : "#256c37";
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(angle) * spread,
      y + Math.sin(angle) * spread,
      radius * (0.34 + seededNoise(seed + i * 4.7) * 0.24),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  if (flower) {
    ctx.fillStyle = seededNoise(seed + 11) > 0.5 ? "rgba(206, 126, 196, 0.72)" : "rgba(238, 228, 134, 0.72)";
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(
        x + (seededNoise(seed + i * 2.2) - 0.5) * radius,
        y + (seededNoise(seed + i * 4.1) - 0.5) * radius,
        Math.max(1, radius * 0.1),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function drawWaterEdgeDetails(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  detail: "full" | "mini" = "full",
) {
  if (detail === "mini") {
    return;
  }

  for (const item of waterEdgeDetails) {
    const x = sx(item.x);
    const y = sy(item.y);
    const radius = item.r * scale;

    if (item.kind === "rock") {
      drawRock(ctx, x, y, radius, item.seed);
    } else {
      drawShrub(ctx, x, y, radius, item.seed, item.kind === "flower");
    }
  }
}

function drawSurfaceTextures(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
) {
  const textureOrder: Surface["name"][] = ["rough", "fairway", "tee", "green"];

  for (const type of textureOrder) {
    for (const surface of course.surfaces.filter((item) => item.type === type)) {
      ctx.save();
      paintSurfaceBase(ctx, surface, sx, sy, scale);
      clipSurface(ctx, surface, sx, sy);
      drawSurfaceLight(ctx, sx, sy, scale, 0.7);

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
    const shadowX = x + sunVector.x * radius * 1.15;
    const shadowY = y + sunVector.y * radius * 1.35;
    const canopy = [
      { x: 0, y: 0, r: 0.86, c: "#1f5f32" },
      { x: -0.34, y: -0.18, r: 0.52, c: "#2f7c3f" },
      { x: 0.3, y: -0.22, r: 0.46, c: "#276f38" },
      { x: 0.12, y: 0.32, r: 0.48, c: "#245f34" },
    ];

    ctx.fillStyle = detail === "full" ? "rgba(0, 0, 0, 0.28)" : "rgba(0, 0, 0, 0.12)";
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, radius * 1.22, radius * 0.48, 0.75, 0, Math.PI * 2);
    ctx.fill();

    if (detail === "full") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
      ctx.beginPath();
      ctx.ellipse(x + sunVector.x * radius * 2.05, y + sunVector.y * radius * 2.35, radius * 1.48, radius * 0.42, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const lobe of detail === "full" ? canopy : canopy.slice(0, 1)) {
      ctx.fillStyle = lobe.c;
      ctx.beginPath();
      ctx.arc(x + radius * lobe.x, y + radius * lobe.y, radius * lobe.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (detail === "full") {
      ctx.fillStyle = "rgba(238, 255, 217, 0.24)";
      ctx.beginPath();
      ctx.arc(x - radius * 0.28, y - radius * 0.36, radius * 0.22, 0, Math.PI * 2);
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

function drawAtmosphere(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sun = ctx.createRadialGradient(width * 0.78, height * 0.04, 0, width * 0.78, height * 0.04, height * 0.72);
  sun.addColorStop(0, "rgba(255, 244, 164, 0.24)");
  sun.addColorStop(0.32, "rgba(255, 230, 128, 0.07)");
  sun.addColorStop(1, "rgba(255, 230, 128, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width * 0.52, height * 0.45, height * 0.22, width * 0.52, height * 0.45, height * 0.78);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.62, "rgba(0, 0, 0, 0.05)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawGrass(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  width: number,
  height: number,
  scale: number,
  timestamp: number,
) {
  drawTerrainBase(ctx, sx, sy, width, height, scale);

  if (renderRules.drawWater) {
    drawWater(ctx, sx, sy, scale);
  }
  drawMaintainedRough(ctx, sx, sy, scale);
  drawSurfacePolygons(ctx, sx, sy, scale);
  drawSurfaceTextures(ctx, sx, sy, scale);
  drawSurfaceEmbosses(ctx, sx, sy, scale);
  if (renderRules.drawGrassEdges) {
    drawLiveGrassEdges(ctx, sx, sy, scale, timestamp);
  }
  if (renderRules.drawWindSheen) {
    drawWindGrassSheen(ctx, sx, sy, scale, timestamp);
  }
  if (renderRules.drawScenery) {
    drawWaterEdgeDetails(ctx, sx, sy, scale);
    drawTrees(ctx, sx, sy, scale);
  }
  drawAtmosphere(ctx, width, height);
  drawPin(ctx, sx, sy, scale);

}

function drawAimGhost(
  ctx: CanvasRenderingContext2D,
  sx: (value: number) => number,
  sy: (value: number) => number,
  scale: number,
  ball: BallState,
  club: ClubDefinition,
) {
  const angle = aimAngle(ball);
  const aimLength = clamp(clubDistance(club) * worldUnitsPerYard * 0.35, 56, 170);
  const endX = ball.x + Math.cos(angle) * aimLength;
  const endY = ball.y + Math.sin(angle) * aimLength;

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
  sinkProgress = 0,
) {
  const lift = ball.z * 0.2;
  const sinkScale = 1 - sinkProgress * 0.82;
  const radius = (3.6 + Math.min(2.1, ball.z * 0.004)) * scale * sinkScale;
  const shadowScale = clamp(1 - ball.z / 460, 0.28, 1);
  const surface = surfaceAt(ball.x, ball.y);

  if (sinkProgress > 0) {
    ctx.fillStyle = `rgba(12, 22, 14, ${0.52 + sinkProgress * 0.26})`;
    ctx.beginPath();
    ctx.ellipse(sx(ball.x), sy(ball.y), 5.4 * scale, 3.8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = surface.color;
  ctx.globalAlpha = 0.2 * (1 - sinkProgress);
  ctx.beginPath();
  ctx.arc(sx(ball.x), sy(ball.y), 8.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = `rgba(0, 0, 0, ${0.32 * shadowScale * (1 - sinkProgress)})`;
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
  const ballY = sy(ball.y - lift + sinkProgress * 3.6);
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

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ball: BallState,
  mesh: CompiledTerrainMesh | null,
) {
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

  const compilerPreviewRendered = drawCompiledTerrainPreview(ctx, sx, sy, mesh);
  if (!compilerPreviewRendered) {
    ctx.fillStyle = worldGrassPattern(ctx, "heavy", sx, sy, scale) ?? heavy.color;
    ctx.fillRect(left, top, mapWidth, mapHeight);
    if (renderRules.drawWater) {
      drawWater(ctx, sx, sy, scale, "mini");
    }
    drawMaintainedRough(ctx, sx, sy, scale);
    drawSurfacePolygons(ctx, sx, sy, scale);
    if (renderRules.drawScenery) {
      drawTrees(ctx, sx, sy, scale, "mini");
    }
  }
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

function drawHud(ctx: CanvasRenderingContext2D, width: number, ball: BallState, club: ClubDefinition) {
  const remainingYards = Math.max(0, distanceToPin(ball) / worldUnitsPerYard);
  const panelWidth = Math.min(390, width - 28);
  const left = 14;
  const top = 14;
  const distanceLabel = club.isPutter
    ? `${clubDistance(club)} yd roll`
    : `${clubDistance(club)} yd carry`;
  const compact = width < 420;
  const courseLabel = compact
    ? `Hole ${course.ref}  |  ${scorecardHoleYards} yd  |  Par ${course.par}`
    : `${course.name}  |  ${scorecardHoleYards} yd  |  Par ${course.par}`;
  const clubLabel = compact
    ? `${club.code}  |  ${distanceLabel}`
    : `${club.name}  |  ${fixedSwingMph} mph  |  ${distanceLabel}`;

  ctx.save();
  ctx.fillStyle = "rgba(12, 30, 18, 0.74)";
  ctx.beginPath();
  ctx.roundRect(left, top, panelWidth, 74, 8);
  ctx.fill();

  ctx.fillStyle = "#f8fff2";
  ctx.font = "700 15px Arial, Helvetica, sans-serif";
  ctx.fillText(courseLabel, left + 14, top + 26);

  ctx.fillStyle = "rgba(248, 255, 242, 0.76)";
  ctx.font = "700 13px Arial, Helvetica, sans-serif";
  ctx.fillText(clubLabel, left + 14, top + 48);
  ctx.fillText(`${remainingYards.toFixed(0)} yd to pin`, left + 14, top + 66);
  ctx.restore();
}

export function GolfinPrototype() {
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const cameraFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const movingRef = useRef(false);
  const overviewUntilRef = useRef<number>(0);
  const celebrationTimeoutRef = useRef<number | null>(null);
  const sinkStartedAtRef = useRef<number>(0);
  const ballRef = useRef<BallState>({ ...startBall });
  const holedRef = useRef(false);
  const holeStateRef = useRef<HoleState>("playing");
  const selectedClubRef = useRef<ClubDefinition>(defaultClub);
  const terrainMeshRef = useRef<CompiledTerrainMesh | null>(null);
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
  const [holeState, setHoleState] = useState<HoleState>("playing");
  const [selectedClubId, setSelectedClubId] = useState(defaultClub.id);

  function changeHoleState(nextState: HoleState) {
    holeStateRef.current = nextState;
    setHoleState(nextState);
  }

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
    const currentHoleState = holeStateRef.current;
    const overviewZoom = Math.min(width / worldWidth, height / worldHeight) * 0.9;
    const detailZoom = clamp(Math.min(width, height) / 250, 1.45, 2.8);
    const currentSpeed = speed(ball);
    const shotZoomAmount = clamp((currentSpeed - 80) / 460, 0, 1);

    if (currentHoleState === "sinking") {
      camera.targetX = course.pin[0];
      camera.targetY = course.pin[1];
      camera.targetZoom = Math.max(detailZoom * 1.1, 2.15);
    } else if (currentHoleState === "celebrating" || currentHoleState === "complete") {
      camera.targetX = worldWidth / 2;
      camera.targetY = worldHeight / 2;
      camera.targetZoom = overviewZoom;
    } else if (movingRef.current) {
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
    const sinkProgress =
      currentHoleState === "sinking"
        ? clamp((timestamp - sinkStartedAtRef.current) / sinkDurationMs, 0, 1)
        : 0;

    ctx.clearRect(0, 0, width, height);
    const compilerPreviewRendered = drawCompiledTerrainPreview(ctx, sx, sy, terrainMeshRef.current);
    const terrainRendered = compilerPreviewRendered
      ? false
      : renderTerrainWebGl(terrainCanvasRef.current, terrainMeshRef.current, camera, width, height, dpr, timestamp);

    if (compilerPreviewRendered) {
      clearTerrainCanvas(terrainCanvasRef.current, width, height, dpr);
      drawAtmosphere(ctx, width, height);
      drawPin(ctx, sx, sy, camera.zoom);
    } else if (terrainRendered) {
      drawAtmosphere(ctx, width, height);
      drawPin(ctx, sx, sy, camera.zoom);
    } else {
      drawGrass(ctx, sx, sy, width, height, camera.zoom, timestamp);
    }
    if (currentHoleState === "playing") {
      drawTrail(ctx, sx, sy, camera.zoom, trailRef.current);
      drawAimGhost(ctx, sx, sy, camera.zoom, ball, selectedClubRef.current);
    }
    if (currentHoleState === "playing" || currentHoleState === "sinking") {
      drawBall(ctx, sx, sy, camera.zoom, ball, sinkProgress);
    }
    if (currentHoleState === "playing" && showingOverview) {
      drawOverviewMarker(ctx, sx, sy, camera.zoom, ball);
    }
    if (currentHoleState === "playing") {
      drawMiniMap(ctx, width, height, ball, terrainMeshRef.current);
      drawHud(ctx, width, ball, selectedClubRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTerrainMesh() {
      try {
        const response = await fetch(terrainDebugSrc);
        if (!response.ok) {
          throw new Error(`Failed to load ${terrainDebugSrc}`);
        }
        const mesh = (await response.json()) as CompiledTerrainMesh;
        if (!cancelled) {
          terrainMeshRef.current = mesh;
          draw();
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadTerrainMesh();

    return () => {
      cancelled = true;
    };
  }, [draw]);

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
      if (celebrationTimeoutRef.current) {
        window.clearTimeout(celebrationTimeoutRef.current);
      }
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
      ball.vx += Math.cos(renderRules.windDirection) * renderRules.windStrength * 12 * dt;
      ball.vy += Math.sin(renderRules.windDirection) * renderRules.windStrength * 12 * dt;
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

    if (isOutOfBounds(ball)) {
      beginOutOfBounds(timestamp);
      return;
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

    const canDrop = ball.z === 0 && Math.abs(ball.vz) < 1 && speed(ball) < cupCaptureSpeed && distanceToPin(ball) <= cupRadius;
    if (canDrop) {
      beginHoleCapture(timestamp);
      return;
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

  function beginHoleCapture(timestamp: number) {
    const ball = ballRef.current;
    ball.x = course.pin[0];
    ball.y = course.pin[1];
    ball.z = 0;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    movingRef.current = false;
    holedRef.current = true;
    sinkStartedAtRef.current = timestamp;
    setMoving(false);
    changeHoleState("sinking");
    overviewUntilRef.current = timestamp + 1600;
    frameRef.current = null;
    lastTimeRef.current = null;
    trailRef.current.push({ x: ball.x, y: ball.y, z: ball.z });
    celebrationTimeoutRef.current = window.setTimeout(() => {
      changeHoleState("celebrating");
      celebrationTimeoutRef.current = window.setTimeout(() => {
        celebrationTimeoutRef.current = null;
        changeHoleState("complete");
      }, celebrationDurationMs);
    }, sinkDurationMs);
  }

  function beginOutOfBounds(timestamp: number) {
    const ball = ballRef.current;
    ball.x = clamp(ball.x, 28, worldWidth - 28);
    ball.y = clamp(ball.y, 34, worldHeight - 34);
    ball.z = Math.max(0, ball.z);
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    movingRef.current = false;
    setMoving(false);
    changeHoleState("outOfBounds");
    frameRef.current = null;
    lastTimeRef.current = null;
    overviewUntilRef.current = timestamp + outOfBoundsDurationMs;
    celebrationTimeoutRef.current = window.setTimeout(() => {
      celebrationTimeoutRef.current = null;
      resetBall();
    }, outOfBoundsDurationMs);
  }

  function resetBall() {
    if (celebrationTimeoutRef.current) {
      window.clearTimeout(celebrationTimeoutRef.current);
      celebrationTimeoutRef.current = null;
    }

    ballRef.current = { ...startBall };
    trailRef.current = [];
    holedRef.current = false;
    changeHoleState("playing");
    overviewUntilRef.current = performance.now() + 1500;
    draw();
  }

  function swing() {
    if (movingRef.current) {
      return;
    }

    if (holedRef.current) {
      resetBall();
      return;
    }

    trailRef.current = [];
    const shot = createShot(ballRef.current, selectedClubRef.current);
    ballRef.current.vx = Math.cos(shot.angle) * shot.speed;
    ballRef.current.vy = Math.sin(shot.angle) * shot.speed;
    ballRef.current.vz = shot.loft;
    ballRef.current.spin = shot.spin;
    movingRef.current = true;
    setMoving(true);
    lastTimeRef.current = null;
    frameRef.current = requestAnimationFrame(step);
  }

  function selectClub(club: ClubDefinition) {
    if (movingRef.current) {
      return;
    }

    selectedClubRef.current = club;
    setSelectedClubId(club.id);
    draw();
  }

  return (
    <main className="physics-stage" aria-label="Golfin physics prototype">
      <canvas className="terrain-canvas" ref={terrainCanvasRef} aria-hidden="true" />
      <canvas className="physics-canvas" ref={canvasRef} />
      {holeState === "celebrating" && (
        <div className="hole-celebration" aria-live="polite">
          <svg
            aria-hidden="true"
            className="hole-sparks"
            preserveAspectRatio="xMidYMid meet"
            viewBox="-420 -420 840 840"
          >
            <defs>
              {holeSparks.map((spark, index) => {
                const radians = (spark.angle * Math.PI) / 180;
                const endX = Math.cos(radians) * spark.length;
                const endY = Math.sin(radians) * spark.length;

                return (
                  <linearGradient
                    gradientUnits="userSpaceOnUse"
                    id={`hole-spark-gradient-${index}`}
                    key={`gradient-${spark.angle}-${index}`}
                    x1="0"
                    x2={endX}
                    y1="0"
                    y2={endY}
                  >
                    <stop offset="0%" stopColor={spark.color} stopOpacity="0" />
                    <stop offset="42%" stopColor={spark.color} stopOpacity="0.12" />
                    <stop offset="78%" stopColor={spark.color} stopOpacity="0.54" />
                    <stop offset="100%" stopColor={spark.color} stopOpacity="1" />
                  </linearGradient>
                );
              })}
            </defs>
            {holeSparks.map((spark, index) => {
              const radians = (spark.angle * Math.PI) / 180;
              const alongX = Math.cos(radians);
              const alongY = Math.sin(radians);
              const normalX = -alongY;
              const normalY = alongX;
              const endX = alongX * spark.length;
              const endY = alongY * spark.length;
              const c1X = alongX * spark.length * 0.24 + normalX * spark.curve * 0.18;
              const c1Y = alongY * spark.length * 0.24 + normalY * spark.curve * 0.18;
              const c2X = alongX * spark.length * 0.68 + normalX * spark.curve;
              const c2Y = alongY * spark.length * 0.68 + normalY * spark.curve;

              return (
                <path
                  className="hole-spark-path"
                  d={`M 0 0 C ${c1X.toFixed(1)} ${c1Y.toFixed(1)}, ${c2X.toFixed(1)} ${c2Y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`}
                  key={`spark-${spark.angle}-${index}`}
                  pathLength="1"
                  stroke={`url(#hole-spark-gradient-${index})`}
                  strokeWidth={spark.width}
                  style={{ animationDelay: `${spark.delay}ms` }}
                />
              );
            })}
          </svg>
          <strong>HOLE!</strong>
        </div>
      )}
      {holeState === "outOfBounds" && (
        <div className="bounds-warning" aria-live="polite">
          <strong>OUT OF BOUNDS</strong>
        </div>
      )}
      {holeState === "complete" && (
        <div className="hole-complete">
          <button className="hole-reset" onClick={resetBall} type="button">
            Reset
          </button>
        </div>
      )}
      {holeState === "playing" && (
        <div className="club-selector" role="group" aria-label="Club selection">
          {clubDefinitions.map((club) => {
            const active = club.id === selectedClubId;
            const distance = club.isPutter ? `${clubDistance(club)}r` : `${clubDistance(club)}`;

            return (
              <button
                aria-label={`${club.name}, ${club.isPutter ? `${clubDistance(club)} yard roll` : `${clubDistance(club)} yards at ${fixedSwingMph} miles per hour`}`}
                aria-pressed={active}
                className={`club-option${active ? " is-active" : ""}`}
                disabled={moving}
                key={club.id}
                onClick={() => selectClub(club)}
                title={`${club.name} - ${club.isPutter ? `${clubDistance(club)} yd roll` : `${clubDistance(club)} yd at ${fixedSwingMph} mph`}`}
                type="button"
              >
                <span className="club-code">{club.code}</span>
                <span className="club-distance">{distance}</span>
              </button>
            );
          })}
        </div>
      )}
      {holeState === "playing" && (
        <button className="physics-swing" disabled={moving} onClick={swing} type="button">
          {moving ? "Rolling" : "Swing"}
        </button>
      )}
    </main>
  );
}
