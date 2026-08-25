import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const osmFixturePath = join(root, "compiler", "fixtures", "goodwood-downs-osm.json");
const outputPath = join(root, "compiler", "fixtures", "goodwood-downs-1-dtm.asc");
const metadataPath = join(root, "compiler", "fixtures", "goodwood-downs-1-dtm.metadata.json");

const courseSlug = "goodwood-downs-1";
const coverageId = "13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m";
const endpoint = "https://environment.data.gov.uk/geoservices/datasets/13787b9a-26a4-4775-8523-806d13af58fc/wcs";
const downsOsmWays = {
  hole: 846023205,
  tee: [846023206],
  green: [846023207],
  bunker: [846023208, 846023209],
  fairway: [846023210],
};

const worldWidth = 900;
const worldHeight = 1250;
const bunkerScale = 1.5;
const teeAnchor = [worldWidth / 2, worldHeight - 150];
const localCellSize = 1;
const boundsPaddingMetres = 16;
const requestPaddingMetres = 8;
const nodata = -9999;

const osmFixture = readFileSync(osmFixturePath, "utf8");
const transform = buildHoleTransform(JSON.parse(osmFixture));
const localBounds = localFeatureBounds(transform);
const grid = buildLocalGrid(localBounds);
const requestBounds = bngRequestBounds(transform, grid);
const coverage = await fetchCoverage(requestBounds);
const rows = resampleCoverage(transform, grid, coverage);
writeAsciiGrid(outputPath, grid, rows);
writeMetadata(metadataPath, grid, requestBounds);

console.log(`Fetched ${coverageId}`);
console.log(`Wrote ${grid.ncols}x${grid.nrows} ${localCellSize}m DTM to ${outputPath}`);

function buildHoleTransform(osm) {
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
  const holeWay = wayOrThrow(ways, downsOsmWays.hole);
  const origin = nodeOrThrow(nodes, holeWay.nodes[0]);
  const holeLine = wayPoints(holeWay, nodes, origin);
  const teePoint = holeLine[0];
  const pinPoint = holeLine[holeLine.length - 1];
  const vector = [pinPoint[0] - teePoint[0], pinPoint[1] - teePoint[1]];
  const length = Math.hypot(vector[0], vector[1]);
  const forward = [vector[0] / length, vector[1] / length];
  const lateral = [-forward[1], forward[0]];
  const visualScale = 950 / length;
  const scorecardHoleYards = Math.round(lineLength(holeLine) / 0.9144);
  const worldUnitsPerYard = 950 / scorecardHoleYards;
  const gameUnitsPerMetre = worldUnitsPerYard / 0.9144;
  const surfaceIds = [
    ...downsOsmWays.tee,
    ...downsOsmWays.fairway,
    ...downsOsmWays.green,
    ...downsOsmWays.bunker,
  ];
  const sourceSurfaces = surfaceIds.map((id) => {
    const way = wayOrThrow(ways, id);
    const type = surfaceTypeForWay(id);
    const points = wayPoints(way, nodes, origin).map(rawToWorld);
    return {
      id,
      type,
      points: type === "bunker" ? scalePolygon(points, bunkerScale) : points,
    };
  });

  return {
    origin,
    teePoint,
    forward,
    lateral,
    visualScale,
    gameUnitsPerMetre,
    metresPerDegreeLat: 111_132,
    metresPerDegreeLon: Math.cos((origin.lat * Math.PI) / 180) * 111_320,
    sourceSurfaces,
  };

  function rawToWorld([x, y]) {
    const relative = [x - teePoint[0], y - teePoint[1]];
    const along = relative[0] * forward[0] + relative[1] * forward[1];
    const across = relative[0] * lateral[0] + relative[1] * lateral[1];
    return [teeAnchor[0] + across * visualScale, teeAnchor[1] - along * visualScale];
  }
}

function localFeatureBounds(transform) {
  const points = transform.sourceSurfaces.flatMap((surface) =>
    surface.points.map(([x, y]) => [x / transform.gameUnitsPerMetre, y / transform.gameUnitsPerMetre]),
  );
  return {
    minX: Math.min(...points.map(([x]) => x)) - boundsPaddingMetres,
    minY: Math.min(...points.map(([, y]) => y)) - boundsPaddingMetres,
    maxX: Math.max(...points.map(([x]) => x)) + boundsPaddingMetres,
    maxY: Math.max(...points.map(([, y]) => y)) + boundsPaddingMetres,
  };
}

function buildLocalGrid(bounds) {
  const xllcorner = Math.floor(bounds.minX);
  const yllcorner = Math.floor(bounds.minY);
  const xMax = Math.ceil(bounds.maxX);
  const yMax = Math.ceil(bounds.maxY);
  return {
    xllcorner,
    yllcorner,
    ncols: Math.floor((xMax - xllcorner) / localCellSize) + 1,
    nrows: Math.floor((yMax - yllcorner) / localCellSize) + 1,
    cellsize: localCellSize,
  };
}

function bngRequestBounds(transform, grid) {
  const corners = [
    [grid.xllcorner, grid.yllcorner],
    [grid.xllcorner + (grid.ncols - 1) * grid.cellsize, grid.yllcorner],
    [grid.xllcorner, grid.yllcorner + (grid.nrows - 1) * grid.cellsize],
    [grid.xllcorner + (grid.ncols - 1) * grid.cellsize, grid.yllcorner + (grid.nrows - 1) * grid.cellsize],
  ].map((point) => localMetresToBng(transform, point[0], point[1]));
  return {
    minE: Math.floor(Math.min(...corners.map((point) => point.easting)) - requestPaddingMetres),
    minN: Math.floor(Math.min(...corners.map((point) => point.northing)) - requestPaddingMetres),
    maxE: Math.ceil(Math.max(...corners.map((point) => point.easting)) + requestPaddingMetres),
    maxN: Math.ceil(Math.max(...corners.map((point) => point.northing)) + requestPaddingMetres),
  };
}

async function fetchCoverage(bounds) {
  const url = new URL(endpoint);
  url.searchParams.set("service", "WCS");
  url.searchParams.set("version", "2.0.1");
  url.searchParams.set("request", "GetCoverage");
  url.searchParams.set("coverageId", coverageId);
  url.searchParams.set("format", "text/plain");
  url.searchParams.append("subset", `E(${bounds.minE},${bounds.maxE})`);
  url.searchParams.append("subset", `N(${bounds.minN},${bounds.maxN})`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`EA DTM WCS returned ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (text.includes("ExceptionReport") || text.includes("ServiceException")) {
    throw new Error(`EA DTM WCS returned an exception:\n${text.slice(0, 900)}`);
  }
  return parsePlainCoverage(text);
}

function parsePlainCoverage(text) {
  const boundsMatch = text.match(/Grid bounds: GeneralBounds\[\(([-\d.]+), ([-\d.]+)\), \(([-\d.]+), ([-\d.]+)\)\]/);
  const rangeMatch = text.match(/Grid range: GridEnvelope2D\[0\.\.(\d+), 0\.\.(\d+)\]/);
  const contentsIndex = text.indexOf("Contents:");
  if (!boundsMatch || !rangeMatch || contentsIndex === -1) {
    throw new Error("Unsupported EA text coverage format.");
  }

  const minE = Number(boundsMatch[1]);
  const minN = Number(boundsMatch[2]);
  const maxE = Number(boundsMatch[3]);
  const maxN = Number(boundsMatch[4]);
  const ncols = Number(rangeMatch[1]) + 1;
  const nrows = Number(rangeMatch[2]) + 1;
  const rawRows = text
    .slice(contentsIndex + "Contents:".length)
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).map(Number));
  const dataRows = rawRows.filter((row) => row.length === ncols);
  const values = dataRows.flat();

  if (values.length !== ncols * nrows) {
    const rows = rawRows.map((row) => row.length);
    throw new Error(
      `EA text coverage had ${values.length} usable cells; expected ${ncols * nrows}; rows=${rows.length}; row widths=${rows.slice(0, 12).join(",")}.`,
    );
  }

  return {
    minE,
    minN,
    maxE,
    maxN,
    ncols,
    nrows,
    cellsize: (maxE - minE) / ncols,
    values,
  };
}

function resampleCoverage(transform, grid, coverage) {
  const rows = [];
  for (let row = 0; row < grid.nrows; row += 1) {
    const y = grid.yllcorner + (grid.nrows - 1 - row) * grid.cellsize;
    const values = [];
    for (let col = 0; col < grid.ncols; col += 1) {
      const x = grid.xllcorner + col * grid.cellsize;
      const { easting, northing } = localMetresToBng(transform, x, y);
      values.push(sampleCoverage(coverage, easting, northing));
    }
    rows.push(values);
  }
  return rows;
}

function sampleCoverage(coverage, easting, northing) {
  const x = (easting - (coverage.minE + coverage.cellsize * 0.5)) / coverage.cellsize;
  const y = ((coverage.maxN - coverage.cellsize * 0.5) - northing) / coverage.cellsize;
  const x0 = clamp(Math.floor(x), 0, coverage.ncols - 1);
  const y0 = clamp(Math.floor(y), 0, coverage.nrows - 1);
  const x1 = clamp(x0 + 1, 0, coverage.ncols - 1);
  const y1 = clamp(y0 + 1, 0, coverage.nrows - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const a = coverage.values[y0 * coverage.ncols + x0];
  const b = coverage.values[y0 * coverage.ncols + x1];
  const c = coverage.values[y1 * coverage.ncols + x0];
  const d = coverage.values[y1 * coverage.ncols + x1];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

function writeAsciiGrid(path, grid, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const body = rows
    .map((row) => row.map((value) => (Number.isFinite(value) ? value.toFixed(3) : String(nodata))).join(" "))
    .join("\n");
  writeFileSync(
    path,
    [
      `ncols ${grid.ncols}`,
      `nrows ${grid.nrows}`,
      `xllcorner ${grid.xllcorner}`,
      `yllcorner ${grid.yllcorner}`,
      `cellsize ${grid.cellsize}`,
      `NODATA_value ${nodata}`,
      body,
      "",
    ].join("\n"),
  );
}

function writeMetadata(path, grid, requestBounds) {
  const sha256 = createHash("sha256").update(readFileSync(outputPath)).digest("hex").slice(0, 16);
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        source: "Environment Agency LIDAR Composite DTM 1m",
        provider: "Environment Agency",
        sourceId: `${coverageId}:${sha256}`,
        course: courseSlug,
        format: "WCS text/plain resampled to local ESRI ASCII grid",
        crs: "EPSG:27700",
        sourceCellSizeMetres: 1,
        localCellSizeMetres: grid.cellsize,
        requestBounds,
        endpoint,
        coverageId,
        licence: "Open Government Licence",
      },
      null,
      2,
    )}\n`,
  );
}

function localMetresToBng(transform, x, y) {
  const worldX = x * transform.gameUnitsPerMetre;
  const worldY = y * transform.gameUnitsPerMetre;
  const across = (worldX - teeAnchor[0]) / transform.visualScale;
  const along = (teeAnchor[1] - worldY) / transform.visualScale;
  const rawX = transform.teePoint[0] + transform.forward[0] * along + transform.lateral[0] * across;
  const rawY = transform.teePoint[1] + transform.forward[1] * along + transform.lateral[1] * across;
  const lat = transform.origin.lat + rawY / transform.metresPerDegreeLat;
  const lon = transform.origin.lon + rawX / transform.metresPerDegreeLon;
  return wgs84ToBritishNationalGrid(lat, lon);
}

function wgs84ToBritishNationalGrid(lat, lon) {
  const wgs84 = ellipsoidalToCartesian(lat, lon, 0, 6378137, 6356752.3141);
  const osgb36 = helmertTransform(wgs84, {
    tx: -446.448,
    ty: 125.157,
    tz: -542.06,
    rx: -0.1502,
    ry: -0.247,
    rz: -0.8421,
    scale: 20.4894,
  });
  const ll = cartesianToEllipsoidal(osgb36, 6377563.396, 6356256.909);
  return osgb36LatLonToGrid(ll.lat, ll.lon);
}

function ellipsoidalToCartesian(lat, lon, height, a, b) {
  const phi = toRadians(lat);
  const lambda = toRadians(lon);
  const e2 = 1 - (b * b) / (a * a);
  const nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return {
    x: (nu + height) * Math.cos(phi) * Math.cos(lambda),
    y: (nu + height) * Math.cos(phi) * Math.sin(lambda),
    z: ((1 - e2) * nu + height) * Math.sin(phi),
  };
}

function helmertTransform(point, params) {
  const rx = toRadians(params.rx / 3600);
  const ry = toRadians(params.ry / 3600);
  const rz = toRadians(params.rz / 3600);
  const s = params.scale * 1e-6;
  return {
    x: params.tx + (1 + s) * point.x - rz * point.y + ry * point.z,
    y: params.ty + rz * point.x + (1 + s) * point.y - rx * point.z,
    z: params.tz - ry * point.x + rx * point.y + (1 + s) * point.z,
  };
}

function cartesianToEllipsoidal(point, a, b) {
  const e2 = 1 - (b * b) / (a * a);
  const p = Math.hypot(point.x, point.y);
  let phi = Math.atan2(point.z, p * (1 - e2));
  let previous = 0;
  while (Math.abs(phi - previous) > 1e-12) {
    previous = phi;
    const nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    phi = Math.atan2(point.z + e2 * nu * Math.sin(phi), p);
  }
  return { lat: toDegrees(phi), lon: toDegrees(Math.atan2(point.y, point.x)) };
}

function osgb36LatLonToGrid(lat, lon) {
  const phi = toRadians(lat);
  const lambda = toRadians(lon);
  const a = 6377563.396;
  const b = 6356256.909;
  const f0 = 0.9996012717;
  const phi0 = toRadians(49);
  const lambda0 = toRadians(-2);
  const n0 = -100000;
  const e0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const nu = (a * f0) / Math.sqrt(1 - e2 * sinPhi ** 2);
  const rho = (a * f0 * (1 - e2)) / (1 - e2 * sinPhi ** 2) ** 1.5;
  const eta2 = nu / rho - 1;
  const m =
    b *
    f0 *
    ((1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * (phi - phi0) -
      (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(phi - phi0) * Math.cos(phi + phi0) +
      ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * (phi - phi0)) * Math.cos(2 * (phi + phi0)) -
      (35 / 24) * n ** 3 * Math.sin(3 * (phi - phi0)) * Math.cos(3 * (phi + phi0)));
  const i = m + n0;
  const ii = (nu / 2) * sinPhi * cosPhi;
  const iii = (nu / 24) * sinPhi * cosPhi ** 3 * (5 - tanPhi ** 2 + 9 * eta2);
  const iiia = (nu / 720) * sinPhi * cosPhi ** 5 * (61 - 58 * tanPhi ** 2 + tanPhi ** 4);
  const iv = nu * cosPhi;
  const v = (nu / 6) * cosPhi ** 3 * (nu / rho - tanPhi ** 2);
  const vi = (nu / 120) * cosPhi ** 5 * (5 - 18 * tanPhi ** 2 + tanPhi ** 4 + 14 * eta2 - 58 * tanPhi ** 2 * eta2);
  const deltaLambda = lambda - lambda0;
  return {
    easting: e0 + iv * deltaLambda + v * deltaLambda ** 3 + vi * deltaLambda ** 5,
    northing: i + ii * deltaLambda ** 2 + iii * deltaLambda ** 4 + iiia * deltaLambda ** 6,
  };
}

function wayPoints(way, nodes, origin) {
  return way.nodes.map((nodeId) => {
    const node = nodeOrThrow(nodes, nodeId);
    const lat0 = (origin.lat * Math.PI) / 180;
    return [
      (node.lon - origin.lon) * Math.cos(lat0) * 111_320,
      (node.lat - origin.lat) * 111_132,
    ];
  });
}

function surfaceTypeForWay(id) {
  if (downsOsmWays.tee.includes(id)) return "tee";
  if (downsOsmWays.green.includes(id)) return "green";
  if (downsOsmWays.bunker.includes(id)) return "bunker";
  if (downsOsmWays.fairway.includes(id)) return "fairway";
  throw new Error(`No known surface type for way ${id}`);
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

function polygonCentroid(points) {
  const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function scalePolygon(points, scale) {
  const center = polygonCentroid(points);
  return points.map(([x, y]) => [center[0] + (x - center[0]) * scale, center[1] + (y - center[1]) * scale]);
}

function lineLength(points) {
  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = points[index - 1];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(start, end, amount) {
  return start + (end - start) * amount;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}
