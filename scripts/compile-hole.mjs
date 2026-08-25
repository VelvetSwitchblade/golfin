import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const courseSlug = "goodwood-downs-1";
const outDir = join(root, "public", "courses", courseSlug);
const osmFixturePath = join(root, "compiler", "fixtures", "goodwood-downs-osm.json");
const downsOsmWays = {
  course: 166937233,
  hole: 846023205,
  tee: [846023206],
  green: [846023207],
  bunker: [846023208, 846023209],
  fairway: [846023210],
};

const worldWidth = 900;
const worldHeight = 1250;
const roughCollarWidth = 58;
const bunkerScale = 1.5;
const assetScale = 2.4;
const width = Math.ceil(worldWidth * assetScale);
const height = Math.ceil(worldHeight * assetScale);
const sun = normalize([-0.62, 0.78, 0.68]);

const osmFixture = readFileSync(osmFixturePath, "utf8");
const sourceHole = buildSourceHoleFromOsm(JSON.parse(osmFixture), hashText(osmFixture));
const scorecardHoleYards = sourceHole.yards;

const waterHazards = [];

function buildSourceHoleFromOsm(osm, extractHash) {
  const nodes = new Map(
    osm.elements
      .filter((element) => element.type === "node")
      .map((node) => [node.id, { lat: node.lat, lon: node.lon }]),
  );
  const ways = new Map(
    osm.elements
      .filter((element) => element.type === "way")
      .map((way) => [way.id, way]),
  );
  const courseWay = wayOrThrow(ways, downsOsmWays.course);
  const holeWay = wayOrThrow(ways, downsOsmWays.hole);
  const origin = nodeOrThrow(nodes, holeWay.nodes[0]);
  const holeLine = wayPoints(holeWay, nodes, origin);
  const surfaceGroups = [
    ["tee", downsOsmWays.tee],
    ["fairway", downsOsmWays.fairway],
    ["green", downsOsmWays.green],
    ["bunker", downsOsmWays.bunker],
  ];

  return {
    id: courseSlug,
    courseId: "goodwood-downs",
    courseName: "Goodwood The Downs",
    sourceKind: "osm",
    source: {
      provider: "openstreetmap",
      extract: "compiler/fixtures/goodwood-downs-osm.json",
      extractHash,
      courseWay: downsOsmWays.course,
      holeWay: downsOsmWays.hole,
    },
    name: `${courseWay.tags.name} - Hole ${holeWay.tags.ref}`,
    ref: holeWay.tags.ref,
    par: Number(holeWay.tags.par),
    yards: Math.round(lineLength(holeLine) / 0.9144),
    holeLine,
    pin: holeLine[holeLine.length - 1],
    surfaces: surfaceGroups.flatMap(([type, ids]) =>
      ids.map((id) => ({
        id,
        type,
        points: wayPoints(wayOrThrow(ways, id), nodes, origin),
        source: "osm",
      })),
    ),
  };
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function wayOrThrow(ways, id) {
  const way = ways.get(id);
  if (!way) {
    throw new Error(`Missing OSM way ${id}`);
  }
  return way;
}

function nodeOrThrow(nodes, id) {
  const node = nodes.get(id);
  if (!node) {
    throw new Error(`Missing OSM node ${id}`);
  }
  return node;
}

function wayPoints(way, nodes, origin) {
  const nodePoints = way.nodes.map((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node) {
      throw new Error(`Missing OSM node ${nodeId} for way ${way.id}`);
    }
    return node;
  });
  const lat0 = (origin.lat * Math.PI) / 180;
  const metresPerDegreeLat = 111_132;
  const metresPerDegreeLon = Math.cos(lat0) * 111_320;

  return nodePoints.map((node) => [
    round((node.lon - origin.lon) * metresPerDegreeLon),
    round((node.lat - origin.lat) * metresPerDegreeLat),
  ]);
}

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
  const waterSd = waterHazards.length
    ? Math.min(...waterHazards.map((hazard) => signedDistanceToSurface(x, y, hazard)))
    : Infinity;
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
  const objects = new Uint8Array(width * height * 4);
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

  renderObjects(objects);

  return { terrain, normal, masks, shadow, objects };
}

function blendPixel(buffer, px, py, color, alpha) {
  if (px < 0 || px >= width || py < 0 || py >= height || alpha <= 0) {
    return;
  }

  const out = (py * width + px) * 4;
  const existingAlpha = buffer[out + 3] / 255;
  const finalAlpha = alpha + existingAlpha * (1 - alpha);
  if (finalAlpha <= 0) {
    return;
  }

  buffer[out] = Math.round((color[0] * alpha + buffer[out] * existingAlpha * (1 - alpha)) / finalAlpha);
  buffer[out + 1] = Math.round((color[1] * alpha + buffer[out + 1] * existingAlpha * (1 - alpha)) / finalAlpha);
  buffer[out + 2] = Math.round((color[2] * alpha + buffer[out + 2] * existingAlpha * (1 - alpha)) / finalAlpha);
  buffer[out + 3] = Math.round(finalAlpha * 255);
}

function drawSoftDisc(buffer, cx, cy, rx, ry, color, alpha, seed = 0) {
  const minX = Math.floor((cx - rx) * assetScale);
  const maxX = Math.ceil((cx + rx) * assetScale);
  const minY = Math.floor((cy - ry) * assetScale);
  const maxY = Math.ceil((cy + ry) * assetScale);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const x = px / assetScale;
      const y = py / assetScale;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1) {
        continue;
      }

      const grain = 0.72 + fbm(x * 0.08, y * 0.08, seed, 4) * 0.42;
      const edge = 1 - smoothstep(0.62, 1, distance);
      blendPixel(buffer, px, py, color.map((value) => clamp(value * grain, 0, 255)), alpha * edge);
    }
  }
}

function renderObjects(buffer) {
  const { trees, rocks } = createObjects();
  for (const tree of trees) {
    const shadowColor = [4, 18, 8];
    drawSoftDisc(buffer, tree.x + sun[0] * tree.r * 2.1, tree.y + sun[1] * tree.r * 2.35, tree.r * 1.6, tree.r * 0.58, shadowColor, 0.34, tree.x);
  }

  for (const rock of rocks) {
    drawSoftDisc(buffer, rock.x + sun[0] * rock.r * 0.8, rock.y + sun[1] * rock.r * 0.9, rock.r * 1.2, rock.r * 0.56, [6, 20, 12], 0.22, rock.x);
    drawSoftDisc(buffer, rock.x, rock.y, rock.r * 0.95, rock.r * 0.62, [130, 132, 102], 0.88, rock.y);
    drawSoftDisc(buffer, rock.x - rock.r * 0.28, rock.y - rock.r * 0.24, rock.r * 0.42, rock.r * 0.2, [208, 202, 154], 0.56, rock.x + rock.y);
  }

  for (const tree of trees) {
    const lobes = 5;
    for (let i = 0; i < lobes; i += 1) {
      const angle = (Math.PI * 2 * i) / lobes + hash(tree.x, tree.y, i) * 0.9;
      const spread = tree.r * (0.08 + hash(tree.x, i, tree.y) * 0.34);
      const color = i % 3 === 0 ? [42, 116, 39] : i % 3 === 1 ? [25, 82, 34] : [70, 142, 45];
      drawSoftDisc(
        buffer,
        tree.x + Math.cos(angle) * spread,
        tree.y + Math.sin(angle) * spread,
        tree.r * (0.58 + hash(i, tree.x, 8) * 0.32),
        tree.r * (0.52 + hash(i, tree.y, 12) * 0.24),
        color,
        0.94,
        tree.x * 0.2 + i,
      );
    }
    drawSoftDisc(buffer, tree.x - tree.r * 0.24, tree.y - tree.r * 0.32, tree.r * 0.28, tree.r * 0.18, [186, 220, 95], 0.34, tree.x);
  }
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
writePng(join(outDir, "objects.png"), assets.objects, width, height);
writeFileSync(join(outDir, "hole.json"), `${JSON.stringify({
  id: course.id,
  courseId: course.courseId,
  courseName: course.courseName,
  sourceKind: course.sourceKind,
  source: course.source,
  name: course.name,
  ref: course.ref,
  par: course.par,
  yards: scorecardHoleYards,
  world: { width: worldWidth, height: worldHeight },
  worldUnitsPerYard,
  assets: { width, height, scale: assetScale, layers: ["terrain-base", "normal", "masks", "shadow", "objects"] },
  holeLine: course.holeLine,
  tee: course.holeLine[0],
  pin: course.pin,
  surfaces: course.surfaces,
  objects: createObjects(),
  attribution: "Map geometry derived from OpenStreetMap contributors where available.",
}, null, 2)}\n`);
console.log(`Compiled ${course.name} to ${outDir}`);
