import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "public", "courses", "goodwood-park-1");

const worldWidth = 900;
const worldHeight = 1250;
const scorecardHoleYards = 389;
const roughCollarWidth = 58;
const bunkerScale = 1.5;
const assetScale = 1.35;
const width = Math.ceil(worldWidth * assetScale);
const height = Math.ceil(worldHeight * assetScale);
const sun = normalize([-0.62, 0.78, 0.68]);

const sourceHole = {
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
    { id: 845710620, type: "tee", points: [[930, 329.8], [881.1, 329.5], [881, 305.1], [929.6, 305.1], [930, 329.8]] },
    { id: 845710621, type: "tee", points: [[744.9, 284], [749.4, 290.1], [747.8, 299.9], [741, 302.6], [734.9, 299.1], [734, 290.6], [736.9, 283.8], [744.9, 284]] },
    { id: 845710622, type: "fairway", points: [[631.8, 281.9], [655.5, 310.5], [646.6, 332.4], [614.6, 341.1], [574.2, 335], [520.1, 327.5], [416.4, 330.6], [313, 363], [239, 365.8], [144.6, 370.1], [97.4, 370.1], [70.2, 345.2], [82.2, 321.6], [106.9, 310.5], [126.9, 308.5], [164.7, 323.3], [221.4, 324.1], [301.8, 300.4], [362, 295.1], [425.7, 275.9], [465.8, 261.9], [520.3, 267.1], [549.3, 268.1], [566.5, 266.5], [631.8, 281.9]] },
    { id: 845710623, type: "bunker", points: [[513.9, 247.3], [520.9, 247.3], [526.1, 249], [532, 254.6], [535.6, 256.8], [542.1, 257.1], [545, 260.9], [544.1, 264.2], [541.7, 266.4], [538.6, 267.4], [534.2, 267], [530.7, 265], [527.8, 261.9], [524.5, 260.8], [520, 261.6], [516.5, 262.2], [511.8, 260.5], [508.6, 257.4], [507.3, 253.4], [508.9, 249.6], [511.9, 247.6], [513.9, 247.3]] },
    { id: 845710624, type: "bunker", points: [[115.2, 317.9], [117.8, 318.2], [120.6, 319.4], [124.2, 319], [127.3, 319.2], [129.5, 321.6], [128.7, 325.2], [126.2, 328.4], [122.6, 330], [118.6, 330.5], [114.5, 329.3], [110.9, 326.6], [109.7, 323.2], [111, 319.4], [113.9, 317.9], [115.2, 317.9]] },
    { id: 845710625, type: "green", points: [[94.6, 324.1], [101.1, 327], [106.4, 333.1], [111.5, 337.1], [121.4, 342.2], [124.8, 347.4], [125.7, 354.6], [122.8, 359.1], [117.9, 362], [110.2, 363.6], [102.2, 364.1], [90.1, 365.4], [83, 360.5], [78.5, 354.6], [75, 346.9], [73.8, 340.8], [75.7, 334.2], [79, 329.1], [85.4, 325], [94.6, 324.1]] },
    { id: 845710626, type: "rough", points: [[115.7, 334.4], [124.4, 337.2], [132.6, 332.7], [134.9, 322.8], [129.9, 314.2], [118, 311.6], [108.7, 313.9], [103.6, 318.4], [103.4, 324.9], [111.1, 331.4], [115.7, 334.4]] },
  ],
};

const waterHazards = [
  { id: 1, points: [[520, 34], [584, 22], [650, 42], [700, 88], [720, 148], [704, 204], [660, 246], [604, 258], [560, 236], [546, 190], [536, 154], [506, 120], [492, 82], [500, 50], [520, 34]] },
  { id: 2, points: [[202, 418], [262, 404], [304, 448], [306, 526], [330, 600], [312, 686], [318, 764], [274, 826], [216, 812], [196, 740], [196, 660], [174, 594], [176, 508], [184, 446], [202, 418]] },
];

const materials = {
  heavy: { color: [33, 91, 44], grain: 1.42, stripe: 0, detail: 1.36 },
  rough: { color: [48, 124, 52], grain: 1.18, stripe: 0.02, detail: 1.1 },
  fairway: { color: [112, 170, 54], grain: 0.7, stripe: 0.14, detail: 0.76 },
  green: { color: [140, 204, 78], grain: 0.42, stripe: 0.03, detail: 0.42 },
  tee: { color: [118, 184, 72], grain: 0.55, stripe: 0.02, detail: 0.52 },
  bunker: { color: [211, 184, 118], grain: 0.34, stripe: 0, detail: 0.65 },
  water: { color: [28, 132, 158], grain: 0.2, stripe: 0.18, detail: 0.3 },
};

function orientCourse(source) {
  const teePoint = source.holeLine[0];
  const pinPoint = source.pin;
  const vector = [pinPoint[0] - teePoint[0], pinPoint[1] - teePoint[1]];
  const length = Math.hypot(vector[0], vector[1]);
  const forward = [vector[0] / length, vector[1] / length];
  const lateral = [-forward[1], forward[0]];
  const teeAnchor = [worldWidth / 2, worldHeight - 150];
  const scale = 950 / length;

  const transform = ([x, y]) => {
    const relative = [x - teePoint[0], y - teePoint[1]];
    const along = relative[0] * forward[0] + relative[1] * forward[1];
    const across = relative[0] * lateral[0] + relative[1] * lateral[1];
    return [round(teeAnchor[0] + across * scale), round(teeAnchor[1] - along * scale)];
  };

  return {
    ...source,
    holeLine: source.holeLine.map(transform),
    pin: transform(source.pin),
    surfaces: source.surfaces.map((surface) => {
      const points = surface.points.map(transform);
      return {
        ...surface,
        points: surface.type === "bunker" ? scalePolygon(points, bunkerScale) : points,
      };
    }),
  };
}

function round(value) {
  return Number(value.toFixed(1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function polygonCentroid(points) {
  const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function scalePolygon(points, scale) {
  const center = polygonCentroid(points);
  return points.map(([x, y]) => [round(center[0] + (x - center[0]) * scale), round(center[1] + (y - center[1]) * scale)]);
}

function lineLength(points) {
  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = points[index - 1];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function distanceToPolygon(x, y, points) {
  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    min = Math.min(min, distanceToSegment(x, y, start[0], start[1], end[0], end[1]));
  }
  return min;
}

function signedDistanceToSurface(x, y, surface) {
  const distance = distanceToPolygon(x, y, surface.points);
  return pointInPolygon(x, y, surface.points) ? -distance : distance;
}

function surfacesOf(type) {
  return course.surfaces.filter((surface) => surface.type === type);
}

function minSignedDistance(x, y, type) {
  const surfaces = surfacesOf(type);
  if (surfaces.length === 0) return Infinity;
  return Math.min(...surfaces.map((surface) => signedDistanceToSurface(x, y, surface)));
}

function distanceToPlaySurfaces(x, y) {
  return Math.min(
    ...course.surfaces
      .filter((surface) => surface.type !== "bunker")
      .map((surface) => Math.max(0, signedDistanceToSurface(x, y, surface))),
  );
}

function hash(x, y, seed = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function noise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return mix(mix(a, b, u), mix(c, d, u), v);
}

function fbm(x, y, seed = 0, octaves = 5) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += noise(x * frequency, y * frequency, seed + i * 17.1) * amplitude;
    total += amplitude;
    amplitude *= 0.52;
    frequency *= 2.03;
  }
  return value / total;
}

function materialColor(type, x, y, masks) {
  const material = materials[type];
  const base = material.color;
  const large = fbm(x * 0.012, y * 0.012, type.length, 4) - 0.5;
  const fine = fbm(x * 0.062, y * 0.062, type.length + 3, 5) - 0.5;
  const blade = Math.sin((x * 0.6 - y * 0.22) * (type === "green" ? 0.28 : 0.58) + fine * 2.4);
  const stripe = Math.sin((x * 0.028 + y * 0.004) + fbm(x * 0.004, y * 0.004, 10, 3) * 0.8);
  const detail = large * 30 * material.grain + fine * 18 * material.detail + blade * 1.6 * material.grain + stripe * 22 * material.stripe;
  const waterSparkle = type === "water" ? Math.max(0, Math.sin(x * 0.06 + y * 0.022) * 0.5 + fine) * 30 : 0;
  const bunkerConcave = type === "bunker" ? (1 - masks.bunker) * -26 + masks.bunkerEdge * 28 : 0;

  return [
    clamp(base[0] + detail + waterSparkle + bunkerConcave, 0, 255),
    clamp(base[1] + detail * 0.92 + waterSparkle + bunkerConcave * 0.86, 0, 255),
    clamp(base[2] + detail * 0.68 + waterSparkle * 1.3 + bunkerConcave * 0.58, 0, 255),
  ];
}

function blendColor(base, next, alpha) {
  return [
    mix(base[0], next[0], alpha),
    mix(base[1], next[1], alpha),
    mix(base[2], next[2], alpha),
  ];
}

function masksAt(x, y) {
  const fairwaySd = minSignedDistance(x, y, "fairway");
  const greenSd = minSignedDistance(x, y, "green");
  const teeSd = minSignedDistance(x, y, "tee");
  const bunkerSd = minSignedDistance(x, y, "bunker");
  const waterSd = Math.min(...waterHazards.map((hazard) => signedDistanceToSurface(x, y, hazard)));
  const roughDistance = distanceToPlaySurfaces(x, y);

  return {
    rough: 1 - smoothstep(roughCollarWidth - 12, roughCollarWidth + 18, roughDistance),
    fairway: 1 - smoothstep(-4, 8, fairwaySd),
    green: 1 - smoothstep(-3, 7, greenSd),
    tee: 1 - smoothstep(-3, 7, teeSd),
    bunker: 1 - smoothstep(-4, 7, bunkerSd),
    bunkerEdge: 1 - smoothstep(0, 18, Math.abs(bunkerSd)),
    water: 1 - smoothstep(-7, 8, waterSd),
    waterEdge: 1 - smoothstep(0, 20, Math.abs(waterSd)),
  };
}

function renderAssets() {
  const terrain = new Uint8Array(width * height * 4);
  const normal = new Uint8Array(width * height * 4);
  const masks = new Uint8Array(width * height * 4);
  const shadow = new Uint8Array(width * height * 4);
  const heightField = new Float32Array(width * height);

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = px / assetScale;
      const y = py / assetScale;
      const index = py * width + px;
      const mask = masksAt(x, y);
      let color = materialColor("heavy", x, y, mask);
      color = blendColor(color, materialColor("rough", x, y, mask), mask.rough);
      color = blendColor(color, materialColor("fairway", x, y, mask), mask.fairway);
      color = blendColor(color, materialColor("tee", x, y, mask), mask.tee);
      color = blendColor(color, materialColor("green", x, y, mask), mask.green);
      color = blendColor(color, materialColor("bunker", x, y, mask), mask.bunker);
      color = blendColor(color, materialColor("water", x, y, mask), mask.water);

      const courseShadow = clamp(1 - mask.rough * 0.08 - mask.fairway * 0.03 + mask.bunkerEdge * 0.1 - mask.water * 0.08, 0.72, 1.12);
      const dapple = 1 + (fbm((x + y * 0.4) * 0.018, (y - x * 0.16) * 0.018, 66, 4) - 0.5) * 0.14;
      const lit = courseShadow * dapple;
      const out = index * 4;
      terrain[out] = clamp(color[0] * lit, 0, 255);
      terrain[out + 1] = clamp(color[1] * lit, 0, 255);
      terrain[out + 2] = clamp(color[2] * lit, 0, 255);
      terrain[out + 3] = 255;

      const elevation =
        mask.fairway * 0.18 +
        mask.green * 0.32 +
        mask.tee * 0.22 -
        mask.bunker * 0.28 +
        mask.bunkerEdge * 0.36 +
        mask.water * -0.42 +
        fbm(x * 0.045, y * 0.045, 90, 5) * 0.12;
      heightField[index] = elevation;

      masks[out] = Math.round(mask.rough * 255);
      masks[out + 1] = Math.round(mask.fairway * 255);
      masks[out + 2] = Math.round(mask.green * 255);
      masks[out + 3] = Math.round(mask.bunker * 255);

      const shade = clamp(225 + mask.bunkerEdge * 22 + mask.waterEdge * 18 - mask.water * 12, 0, 255);
      shadow[out] = shade;
      shadow[out + 1] = Math.round(mask.water * 255);
      shadow[out + 2] = Math.round(mask.tee * 255);
      shadow[out + 3] = Math.round(Math.max(mask.waterEdge, mask.bunkerEdge) * 255);
    }
  }

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const index = py * width + px;
      const left = heightField[py * width + clamp(px - 1, 0, width - 1)];
      const right = heightField[py * width + clamp(px + 1, 0, width - 1)];
      const up = heightField[clamp(py - 1, 0, height - 1) * width + px];
      const down = heightField[clamp(py + 1, 0, height - 1) * width + px];
      const n = normalize([(left - right) * 1.8, (up - down) * 1.8, 1]);
      const light = clamp(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2], 0, 1);
      const out = index * 4;
      normal[out] = Math.round((n[0] * 0.5 + 0.5) * 255);
      normal[out + 1] = Math.round((n[1] * 0.5 + 0.5) * 255);
      normal[out + 2] = Math.round((n[2] * 0.5 + 0.5) * 255);
      normal[out + 3] = 255;
      terrain[out] = clamp(terrain[out] * (0.78 + light * 0.28), 0, 255);
      terrain[out + 1] = clamp(terrain[out + 1] * (0.78 + light * 0.28), 0, 255);
      terrain[out + 2] = clamp(terrain[out + 2] * (0.78 + light * 0.28), 0, 255);
    }
  }

  return { terrain, normal, masks, shadow };
}

function writePng(path, data, imageWidth, imageHeight) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(imageWidth, 0);
  ihdr.writeUInt32BE(imageHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc((imageWidth * 4 + 1) * imageHeight);
  for (let y = 0; y < imageHeight; y += 1) {
    const scanline = y * (imageWidth * 4 + 1);
    scanlines[scanline] = 0;
    Buffer.from(data.buffer, y * imageWidth * 4, imageWidth * 4).copy(scanlines, scanline + 1);
  }

  writeFileSync(path, Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]));
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function createObjects() {
  const trees = [];
  const rocks = [];

  for (let i = 0; trees.length < 90 && i < 1200; i += 1) {
    const x = 35 + hash(i, 11) * (worldWidth - 70);
    const y = 35 + hash(i, 29) * (worldHeight - 70);
    const distance = distanceToPlaySurfaces(x, y);
    const inWater = waterHazards.some((hazard) => pointInPolygon(x, y, hazard.points));
    if (distance > roughCollarWidth + 34 && !inWater) {
      trees.push({ x: round(x), y: round(y), r: round(13 + hash(i, 71) * 23), sway: round(0.6 + hash(i, 101) * 0.9) });
    }
  }

  for (const hazard of waterHazards) {
    for (let i = 0; i < hazard.points.length; i += 1) {
      const start = hazard.points[i];
      const end = hazard.points[(i + 1) % hazard.points.length];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const count = Math.max(1, Math.floor(length / 42));
      for (let step = 0; step < count; step += 1) {
        if (hash(hazard.id * 17 + i, step) < 0.46) continue;
        const t = (step + 0.5) / count;
        rocks.push({
          x: round(mix(start[0], end[0], t) + (hash(i, step, 2) - 0.5) * 10),
          y: round(mix(start[1], end[1], t) + (hash(i, step, 3) - 0.5) * 10),
          r: round(4 + hash(i, step, 4) * 10),
        });
      }
    }
  }

  return { trees, rocks };
}

const course = orientCourse(sourceHole);
const worldUnitsPerYard = lineLength(course.holeLine) / scorecardHoleYards;
const assets = renderAssets();
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, "terrain-base.png"), assets.terrain, width, height);
writePng(join(outDir, "normal.png"), assets.normal, width, height);
writePng(join(outDir, "masks.png"), assets.masks, width, height);
writePng(join(outDir, "shadow.png"), assets.shadow, width, height);
writeFileSync(join(outDir, "hole.json"), `${JSON.stringify({
  name: course.name,
  ref: course.ref,
  par: course.par,
  yards: scorecardHoleYards,
  world: { width: worldWidth, height: worldHeight },
  worldUnitsPerYard,
  assets: { width, height, scale: assetScale },
  holeLine: course.holeLine,
  tee: course.holeLine[0],
  pin: course.pin,
  surfaces: course.surfaces,
  waterHazards,
  objects: createObjects(),
  attribution: "Map geometry derived from OpenStreetMap contributors where available.",
}, null, 2)}\n`);
console.log(`Compiled ${course.name} to ${outDir}`);
