"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type SurfaceName =
  | "out_of_bounds"
  | "rough"
  | "fairway"
  | "green"
  | "tee"
  | "bunker"
  | "water";

type InspectorMode =
  | "render"
  | "semantic"
  | "material"
  | "terrain"
  | "collision"
  | "gameplay"
  | "validation";

type CoursePackage = {
  courseId: string;
  name: string;
  projection: string;
  units: string;
  biome: string;
  holes: Array<{
    id: string;
    number: number;
    par: number;
    yards: number;
  }>;
  elevation: {
    source: string;
    sourceId: string;
    format: string;
    width: number;
    height: number;
    cellSizeMetres: number;
    fidelity: number;
  };
  sourceVersions: Record<string, string>;
  build: string;
};

type Manifest = {
  schema: string;
  compiler: string;
  build: string;
  sourcePolicy: string;
  bounds: Bounds;
  assets: Record<string, string>;
  budgets: Record<string, number>;
};

type RenderManifest = {
  schema: string;
  bounds: Bounds;
  width: number;
  height: number;
  assets: Record<string, string>;
  context?: {
    island?: {
      source: string;
      gameplaySurface: boolean;
    };
    water?: {
      source: string;
      gameplaySurface: boolean;
      mask: string;
    };
  };
};

type SurfaceMap = {
  width: number;
  height: number;
  bounds: Bounds;
  surfaceIds: Record<SurfaceName, number>;
  data: string;
};

type GameplayFeature = {
  id: string;
  surface: SurfaceName;
  geometry: Array<[number, number]>;
  provenance: {
    source: string;
    source_id: string | number;
    confidence: number;
    note: string;
  };
  properties: Record<string, unknown>;
};

type Gameplay = {
  hole: {
    id: string;
    number: number;
    par: number;
    yards: number;
    tee: [number, number];
    pin: [number, number];
    centreline: Array<[number, number]>;
  };
  surfaceIds: Record<SurfaceName, number>;
  surfacePhysics: Record<
    SurfaceName,
    {
      rollingResistance: number;
      restitution: number;
      spinRetention: number;
      clubPenalty: number;
    }
  >;
  features: GameplayFeature[];
};

type TerrainDebug = {
  bounds: Bounds;
  stats: {
    vertices: number;
    triangles: number;
    baseCellsX: number;
    baseCellsY: number;
    adaptive: number;
  };
  vertices: Array<[number, number, number]>;
  normals: Array<[number, number, number]>;
  triangles: Array<{
    indices: [number, number, number];
    surface: SurfaceName;
  }>;
};

type Collision = {
  terrain: {
    kind: string;
    mesh: string;
    elevationSource: CoursePackage["elevation"];
  };
  surfaceBounds: Array<{
    id: string;
    surface: SurfaceName;
    collision: string;
    points: Array<[number, number]>;
  }>;
};

type ValidationCheck = {
  name: string;
  status: "pass" | "fail";
  mandatory: boolean;
  weight: number;
};

type Validation = {
  approved: boolean;
  premiumReady: boolean;
  mappingFidelity: number;
  elevationFidelity: number;
  elevationStatus: string;
  terrainMesh: TerrainDebug["stats"];
  checks: ValidationCheck[];
  failures: ValidationCheck[];
};

type InspectorData = {
  course: CoursePackage;
  manifest: Manifest;
  renderManifest: RenderManifest;
  surfaceMap: SurfaceMap;
  gameplay: Gameplay;
  terrain: TerrainDebug;
  collision: Collision;
  validation: Validation;
  cells: Uint8Array;
  surfaceById: Map<number, SurfaceName>;
};

type HoverState = {
  world: [number, number];
  surface: SurfaceName;
  feature: GameplayFeature | null;
};

type ViewTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  bounds: Bounds;
};

const packageRoot = "/courses/goodwood-downs-1/package";
const holeRoot = `${packageRoot}/holes/01`;

const inspectorModes: Array<{ id: InspectorMode; label: string }> = [
  { id: "render", label: "Render" },
  { id: "semantic", label: "Semantic" },
  { id: "material", label: "Material" },
  { id: "terrain", label: "Terrain" },
  { id: "collision", label: "Collision" },
  { id: "gameplay", label: "Gameplay" },
  { id: "validation", label: "Validation" },
];

const surfaceColors: Record<SurfaceName, string> = {
  out_of_bounds: "#183f22",
  rough: "#327447",
  fairway: "#8fba36",
  green: "#b6db58",
  tee: "#91c852",
  bunker: "#d3b475",
  water: "#2490ad",
};

const materialColors: Record<SurfaceName, string> = {
  out_of_bounds: "#193d20",
  rough: "#2b6536",
  fairway: "#82ad36",
  green: "#abd45a",
  tee: "#83bd4f",
  bunker: "#caa66d",
  water: "#1785a6",
};

const modeDescriptions: Record<InspectorMode, string> = {
  render: "Baked compiler render plate, including visual-only island context.",
  semantic: "Raw compiler surface IDs. Hard edges are expected here.",
  material: "Surface map using production material colours.",
  terrain: "Adaptive mesh triangles shaded by elevation and surface.",
  collision: "Collision polygons and trigger/depression types.",
  gameplay: "Tee, pin, centreline, feature provenance, and physics surfaces.",
  validation: "Compiler QA state over the compiled hole.",
};

export function CourseInspector() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<InspectorMode>("render");
  const [data, setData] = useState<InspectorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [assetTick, setAssetTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPackage() {
      try {
        const [course, manifest, renderManifest, surfaceMap, gameplay, terrain, collision, validation] =
          await Promise.all([
            fetchJson<CoursePackage>(`${packageRoot}/course.json`),
            fetchJson<Manifest>(`${holeRoot}/manifest.json`),
            fetchJson<RenderManifest>(`${holeRoot}/render/manifest.json`),
            fetchJson<SurfaceMap>(`${holeRoot}/surface-map.json`),
            fetchJson<Gameplay>(`${holeRoot}/gameplay.json`),
            fetchJson<TerrainDebug>(`${holeRoot}/terrain-debug.json`),
            fetchJson<Collision>(`${holeRoot}/collision.json`),
            fetchJson<Validation>(`${holeRoot}/validation.json`),
          ]);
        const surfaceById = new Map<number, SurfaceName>();
        for (const [surface, id] of Object.entries(surfaceMap.surfaceIds)) {
          surfaceById.set(id, surface as SurfaceName);
        }
        if (!cancelled) {
          setData({
            course,
            manifest,
            renderManifest,
            surfaceMap,
            gameplay,
            terrain,
            collision,
            validation,
            cells: decodeBase64Bytes(surfaceMap.data),
            surfaceById,
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load course package.");
        }
      }
    }

    loadPackage();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) {
      return undefined;
    }
    const previewAsset = data.renderManifest.assets.landPreview ?? data.renderManifest.assets.preview;
    const preview = inspectorImage(`${holeRoot}/render/${previewAsset}`);
    const contextWater = inspectorImage(`${holeRoot}/render/${data.renderManifest.assets.contextWaterMask}`);
    const waterFill = data.renderManifest.assets.contextWaterFill
      ? inspectorImage(`${holeRoot}/render/${data.renderManifest.assets.contextWaterFill}`)
      : null;
    const redraw = () => setAssetTick((tick) => tick + 1);
    preview.addEventListener("load", redraw);
    contextWater.addEventListener("load", redraw);
    waterFill?.addEventListener("load", redraw);
    return () => {
      preview.removeEventListener("load", redraw);
      contextWater.removeEventListener("load", redraw);
      waterFill?.removeEventListener("load", redraw);
    };
  }, [data]);

  const elevationRange = useMemo(() => {
    if (!data) {
      return { min: 0, max: 1 };
    }
    const heights = data.terrain.vertices.map((vertex) => vertex[1]);
    return { min: Math.min(...heights), max: Math.max(...heights) };
  }, [data]);

  const draw = useCallback(() => {
    void assetTick;
    const canvas = canvasRef.current;
    if (!canvas || !data) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const viewportWidth = rect.width;
    const viewportHeight = rect.height;
    const transform = fitBounds(data.surfaceMap.bounds, viewportWidth, viewportHeight);
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = "#102316";
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    if (mode === "render") {
      drawCompiledRender(context, data, transform);
      drawGameplay(context, data.gameplay, transform);
    }

    if (mode === "semantic") {
      drawSurfaceRaster(context, data, transform, surfaceColors, false, 1);
      drawFeatureOutlines(context, data.gameplay.features, transform, 0.52);
    }

    if (mode === "material") {
      drawSurfaceRaster(context, data, transform, materialColors, true, 1);
      drawFeatureOutlines(context, data.gameplay.features, transform, 0.2);
    }

    if (mode === "terrain") {
      drawTerrainMesh(context, data, transform, elevationRange);
    }

    if (mode === "collision") {
      drawSurfaceRaster(context, data, transform, materialColors, true, 0.42);
      drawCollision(context, data, transform);
    }

    if (mode === "gameplay") {
      drawSurfaceRaster(context, data, transform, materialColors, true, 0.62);
      drawFeatureOutlines(context, data.gameplay.features, transform, 0.34);
      drawGameplay(context, data.gameplay, transform);
    }

    if (mode === "validation") {
      drawSurfaceRaster(context, data, transform, materialColors, true, 0.42);
      drawValidationOverlay(context, data.validation, transform);
      drawGameplay(context, data.gameplay, transform);
    }

    if (hover) {
      drawHover(context, hover, transform);
    }
  }, [assetTick, data, elevationRange, hover, mode]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const updateHover = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!data) {
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const transform = fitBounds(data.surfaceMap.bounds, rect.width, rect.height);
      const world = canvasToWorld(event.clientX - rect.left, event.clientY - rect.top, transform);
      const surface = sampleSurface(data, world[0], world[1]);
      const feature = findFeature(data.gameplay.features, world[0], world[1]);
      setHover({ world, surface, feature });
    },
    [data],
  );

  if (error) {
    return (
      <main className="inspector-shell">
        <section className="inspector-load-state">{error}</section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="inspector-shell">
        <section className="inspector-load-state">Loading compiled hole package</section>
      </main>
    );
  }

  const failedChecks = data.validation.checks.filter((check) => check.status === "fail");
  const activeFeature = hover?.feature ?? null;

  return (
    <main className="inspector-shell">
      <header className="inspector-topbar">
        <div>
          <p>Course Inspector</p>
          <h1>
            {data.course.name} - Hole {data.gameplay.hole.number}
          </h1>
        </div>
        <div className="inspector-build">
          <span>{data.manifest.schema}</span>
          <strong>{data.manifest.build}</strong>
        </div>
      </header>

      <section className="inspector-body">
        <div className="inspector-workbench">
          <nav className="inspector-modes" aria-label="Inspector modes">
            {inspectorModes.map((item) => (
              <button
                aria-pressed={mode === item.id}
                className={mode === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => setMode(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="inspector-canvas-frame">
            <canvas
              aria-label="Compiled golf hole inspector canvas"
              className="inspector-canvas"
              onPointerLeave={() => setHover(null)}
              onPointerMove={updateHover}
              ref={canvasRef}
            />
            <div className="inspector-caption">
              <strong>{inspectorModes.find((item) => item.id === mode)?.label}</strong>
              <span>{modeDescriptions[mode]}</span>
            </div>
          </div>
        </div>

        <aside className="inspector-panel">
          <section className="inspector-card">
            <h2>Package</h2>
            <dl className="inspector-facts">
              <div>
                <dt>Approved</dt>
                <dd>{data.validation.approved ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt>Premium ready</dt>
                <dd>{data.validation.premiumReady ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt>Mapping</dt>
                <dd>{data.validation.mappingFidelity}</dd>
              </div>
              <div>
                <dt>Elevation</dt>
                <dd>{data.validation.elevationFidelity}</dd>
              </div>
              <div>
                <dt>Projection</dt>
                <dd>{data.course.projection}</dd>
              </div>
              <div>
                <dt>Units</dt>
                <dd>{data.course.units}</dd>
              </div>
            </dl>
          </section>

          <section className="inspector-card">
            <h2>Terrain Mesh</h2>
            <dl className="inspector-facts">
              <div>
                <dt>Vertices</dt>
                <dd>{data.terrain.stats.vertices.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Triangles</dt>
                <dd>{data.terrain.stats.triangles.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Base cells</dt>
                <dd>
                  {data.terrain.stats.baseCellsX} x {data.terrain.stats.baseCellsY}
                </dd>
              </div>
              <div>
                <dt>Height range</dt>
                <dd>
                  {elevationRange.min.toFixed(2)}m to {elevationRange.max.toFixed(2)}m
                </dd>
              </div>
            </dl>
          </section>

          <section className="inspector-card">
            <h2>Cursor</h2>
            {hover ? (
              <dl className="inspector-facts">
                <div>
                  <dt>Surface</dt>
                  <dd>{formatSurface(hover.surface)}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {hover.world[0].toFixed(1)}, {hover.world[1].toFixed(1)}
                  </dd>
                </div>
                <div>
                  <dt>Feature</dt>
                  <dd>{activeFeature ? activeFeature.id : "none"}</dd>
                </div>
                {activeFeature ? (
                  <div>
                    <dt>Source</dt>
                    <dd>{activeFeature.provenance.source}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="inspector-muted">Move over the canvas to inspect the compiled surface.</p>
            )}
          </section>

          <section className="inspector-card">
            <h2>Validation</h2>
            <div className="inspector-status-strip">
              <span className={data.validation.approved ? "is-pass" : "is-fail"}>
                {data.validation.approved ? "Approved" : "Blocked"}
              </span>
              <span className={data.validation.premiumReady ? "is-pass" : "is-warn"}>
                {data.validation.premiumReady ? "Premium" : "Not premium"}
              </span>
            </div>
            {failedChecks.length ? (
              <ul className="inspector-check-list">
                {failedChecks.map((check) => (
                  <li key={check.name}>
                    <strong>{check.name}</strong>
                    <span>{check.mandatory ? "mandatory" : "advisory"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inspector-muted">No validation failures.</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json() as Promise<T>;
}

const inspectorImageCache = new Map<string, HTMLImageElement>();

function inspectorImage(src: string) {
  const cached = inspectorImageCache.get(src);
  if (cached) {
    return cached;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = src;
  inspectorImageCache.set(src, image);
  return image;
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fitBounds(bounds: Bounds, width: number, height: number): ViewTransform {
  const padding = Math.max(18, Math.min(width, height) * 0.04);
  const scale = Math.min(
    (width - padding * 2) / (bounds.maxX - bounds.minX),
    (height - padding * 2) / (bounds.maxY - bounds.minY),
  );
  const drawWidth = (bounds.maxX - bounds.minX) * scale;
  const drawHeight = (bounds.maxY - bounds.minY) * scale;
  return {
    bounds,
    scale,
    offsetX: (width - drawWidth) / 2 - bounds.minX * scale,
    offsetY: (height - drawHeight) / 2 - bounds.minY * scale,
  };
}

function worldToCanvas(point: [number, number], transform: ViewTransform): [number, number] {
  return [point[0] * transform.scale + transform.offsetX, point[1] * transform.scale + transform.offsetY];
}

function canvasToWorld(x: number, y: number, transform: ViewTransform): [number, number] {
  return [(x - transform.offsetX) / transform.scale, (y - transform.offsetY) / transform.scale];
}

function drawSurfaceRaster(
  context: CanvasRenderingContext2D,
  data: InspectorData,
  transform: ViewTransform,
  palette: Record<SurfaceName, string>,
  smoothing: boolean,
  alpha: number,
) {
  const { width, height } = data.surfaceMap;
  const image = context.createImageData(width, height);
  for (let index = 0; index < data.cells.length; index += 1) {
    const surface = data.surfaceById.get(data.cells[index]) ?? "out_of_bounds";
    const color = hexToRgb(palette[surface]);
    image.data[index * 4] = color[0];
    image.data[index * 4 + 1] = color[1];
    image.data[index * 4 + 2] = color[2];
    image.data[index * 4 + 3] = 255;
  }

  const bitmap = document.createElement("canvas");
  bitmap.width = width;
  bitmap.height = height;
  bitmap.getContext("2d")?.putImageData(image, 0, 0);

  const topLeft = worldToCanvas([data.surfaceMap.bounds.minX, data.surfaceMap.bounds.minY], transform);
  const bottomRight = worldToCanvas([data.surfaceMap.bounds.maxX, data.surfaceMap.bounds.maxY], transform);
  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = smoothing;
  context.drawImage(bitmap, topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
  context.restore();
}

function drawCompiledRender(
  context: CanvasRenderingContext2D,
  data: InspectorData,
  transform: ViewTransform,
) {
  const previewAsset = data.renderManifest.assets.landPreview ?? data.renderManifest.assets.preview;
  const image = inspectorImage(`${holeRoot}/render/${previewAsset}`);
  const waterFillSrc = data.renderManifest.assets.contextWaterFill;
  const waterFill = waterFillSrc ? inspectorImage(`${holeRoot}/render/${waterFillSrc}`) : null;
  const topLeft = worldToCanvas([data.renderManifest.bounds.minX, data.renderManifest.bounds.minY], transform);
  const bottomRight = worldToCanvas([data.renderManifest.bounds.maxX, data.renderManifest.bounds.maxY], transform);

  context.save();
  const pattern = waterFill && waterFill.complete && waterFill.naturalWidth > 0
    ? context.createPattern(waterFill, "repeat")
    : null;
  context.fillStyle = pattern ?? "#16718f";
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  if (image.complete && image.naturalWidth > 0) {
    context.imageSmoothingEnabled = true;
    context.drawImage(image, topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
  } else {
    context.fillStyle = "#eef9e8";
    context.font = "13px monospace";
    context.fillText("Loading baked render plate", topLeft[0] + 12, topLeft[1] + 22);
  }
  context.restore();
}

function drawTerrainMesh(
  context: CanvasRenderingContext2D,
  data: InspectorData,
  transform: ViewTransform,
  elevationRange: { min: number; max: number },
) {
  drawSurfaceRaster(context, data, transform, materialColors, true, 0.2);
  const range = elevationRange.max - elevationRange.min || 1;

  context.save();
  for (const triangle of data.terrain.triangles) {
    const points = triangle.indices.map((index) => {
      const vertex = data.terrain.vertices[index];
      return {
        x: vertex[0],
        y: -vertex[2],
        elevation: vertex[1],
      };
    });
    const averageElevation = (points[0].elevation + points[1].elevation + points[2].elevation) / 3;
    const lift = (averageElevation - elevationRange.min) / range;
    const base = hexToRgb(materialColors[triangle.surface]);
    const shade = 0.72 + lift * 0.5;
    context.fillStyle = `rgb(${Math.round(base[0] * shade)}, ${Math.round(base[1] * shade)}, ${Math.round(base[2] * shade)})`;
    context.beginPath();
    points.forEach((point, index) => {
      const canvasPoint = worldToCanvas([point.x, point.y], transform);
      if (index === 0) {
        context.moveTo(canvasPoint[0], canvasPoint[1]);
      } else {
        context.lineTo(canvasPoint[0], canvasPoint[1]);
      }
    });
    context.closePath();
    context.fill();
  }
  context.globalAlpha = 0.18;
  context.strokeStyle = "#f4ffe8";
  context.lineWidth = 0.5;
  for (const triangle of data.terrain.triangles) {
    context.beginPath();
    triangle.indices.forEach((index, pointIndex) => {
      const vertex = data.terrain.vertices[index];
      const canvasPoint = worldToCanvas([vertex[0], -vertex[2]], transform);
      if (pointIndex === 0) {
        context.moveTo(canvasPoint[0], canvasPoint[1]);
      } else {
        context.lineTo(canvasPoint[0], canvasPoint[1]);
      }
    });
    context.closePath();
    context.stroke();
  }
  context.restore();
}

function drawFeatureOutlines(
  context: CanvasRenderingContext2D,
  features: GameplayFeature[],
  transform: ViewTransform,
  alpha: number,
) {
  context.save();
  context.globalAlpha = alpha;
  context.lineWidth = 1.2;
  for (const feature of features) {
    context.strokeStyle = surfaceColors[feature.surface];
    strokePolygon(context, feature.geometry, transform);
  }
  context.restore();
}

function drawCollision(context: CanvasRenderingContext2D, data: InspectorData, transform: ViewTransform) {
  context.save();
  context.lineWidth = 2;
  context.font = "12px monospace";
  context.textBaseline = "middle";
  for (const item of data.collision.surfaceBounds) {
    context.strokeStyle = item.collision === "trigger" ? "#75dcff" : item.collision.includes("depression") ? "#ffd78b" : "#f4ffe8";
    strokePolygon(context, item.points, transform);
    const anchor = worldToCanvas(item.points[0], transform);
    context.fillStyle = "rgba(11, 24, 15, 0.78)";
    context.fillRect(anchor[0] + 5, anchor[1] - 10, context.measureText(item.collision).width + 10, 20);
    context.fillStyle = "#f4ffe8";
    context.fillText(item.collision, anchor[0] + 10, anchor[1]);
  }
  context.restore();
}

function drawGameplay(context: CanvasRenderingContext2D, gameplay: Gameplay, transform: ViewTransform) {
  context.save();
  context.strokeStyle = "rgba(245, 255, 236, 0.62)";
  context.setLineDash([8, 7]);
  context.lineWidth = 2;
  context.beginPath();
  gameplay.hole.centreline.forEach((point, index) => {
    const canvasPoint = worldToCanvas(point, transform);
    if (index === 0) {
      context.moveTo(canvasPoint[0], canvasPoint[1]);
    } else {
      context.lineTo(canvasPoint[0], canvasPoint[1]);
    }
  });
  context.stroke();
  context.setLineDash([]);

  drawMarker(context, gameplay.hole.tee, transform, "#f4ffe8", "T");
  drawMarker(context, gameplay.hole.pin, transform, "#ff3b43", "P");
  context.restore();
}

function drawValidationOverlay(context: CanvasRenderingContext2D, validation: Validation, transform: ViewTransform) {
  const bounds = transform.bounds;
  const topLeft = worldToCanvas([bounds.minX, bounds.minY], transform);
  context.save();
  context.fillStyle = validation.approved ? "rgba(91, 220, 116, 0.16)" : "rgba(255, 88, 88, 0.18)";
  context.fillRect(topLeft[0], topLeft[1], (bounds.maxX - bounds.minX) * transform.scale, (bounds.maxY - bounds.minY) * transform.scale);

  const checks = validation.checks.slice(0, 14);
  context.font = "12px monospace";
  checks.forEach((check, index) => {
    const x = topLeft[0] + 14;
    const y = topLeft[1] + 18 + index * 23;
    context.fillStyle = check.status === "pass" ? "rgba(31, 125, 55, 0.82)" : "rgba(170, 46, 42, 0.86)";
    context.fillRect(x, y, 15, 15);
    context.fillStyle = "#f4ffe8";
    context.fillText(check.name, x + 23, y + 12);
  });
  context.restore();
}

function drawHover(context: CanvasRenderingContext2D, hover: HoverState, transform: ViewTransform) {
  const canvasPoint = worldToCanvas(hover.world, transform);
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.58)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(canvasPoint[0] - 7, canvasPoint[1]);
  context.lineTo(canvasPoint[0] + 7, canvasPoint[1]);
  context.moveTo(canvasPoint[0], canvasPoint[1] - 7);
  context.lineTo(canvasPoint[0], canvasPoint[1] + 7);
  context.stroke();
  context.fillStyle = "rgba(10, 22, 14, 0.86)";
  const label = `${formatSurface(hover.surface)} ${hover.feature ? hover.feature.id : ""}`.trim();
  context.fillRect(canvasPoint[0] + 10, canvasPoint[1] - 15, context.measureText(label).width + 14, 24);
  context.fillStyle = "#f4ffe8";
  context.font = "12px monospace";
  context.fillText(label, canvasPoint[0] + 17, canvasPoint[1] + 1);
  context.restore();
}

function drawMarker(
  context: CanvasRenderingContext2D,
  point: [number, number],
  transform: ViewTransform,
  color: string,
  label: string,
) {
  const canvasPoint = worldToCanvas(point, transform);
  context.fillStyle = color;
  context.beginPath();
  context.arc(canvasPoint[0], canvasPoint[1], 7, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#102316";
  context.font = "bold 10px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, canvasPoint[0], canvasPoint[1] + 0.5);
}

function strokePolygon(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  transform: ViewTransform,
) {
  context.beginPath();
  points.forEach((point, index) => {
    const canvasPoint = worldToCanvas(point, transform);
    if (index === 0) {
      context.moveTo(canvasPoint[0], canvasPoint[1]);
    } else {
      context.lineTo(canvasPoint[0], canvasPoint[1]);
    }
  });
  context.closePath();
  context.stroke();
}

function sampleSurface(data: InspectorData, x: number, y: number): SurfaceName {
  const { bounds, width, height } = data.surfaceMap;
  const px = Math.floor(((x - bounds.minX) / (bounds.maxX - bounds.minX)) * width);
  const py = Math.floor(((y - bounds.minY) / (bounds.maxY - bounds.minY)) * height);
  if (px < 0 || py < 0 || px >= width || py >= height) {
    return "out_of_bounds";
  }
  return data.surfaceById.get(data.cells[py * width + px]) ?? "out_of_bounds";
}

function findFeature(features: GameplayFeature[], x: number, y: number): GameplayFeature | null {
  return features.find((feature) => pointInPolygon(x, y, feature.geometry)) ?? null;
}

function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const xi = polygon[index][0];
    const yi = polygon[index][1];
    const xj = polygon[previous][0];
    const yj = polygon[previous][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function formatSurface(surface: SurfaceName) {
  return surface.replaceAll("_", " ");
}
