"use client";

import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SurfaceTool = "tee" | "fairway" | "green" | "bunker" | "water";
type CreatorTool = SurfaceTool | "erase" | "teePoint" | "pinPoint";
type SurfaceId = SurfaceTool | "out_of_bounds";

type Point = {
  x: number;
  y: number;
};

type CreatorStroke = {
  id: string;
  surface: SurfaceTool;
  points: Point[];
  width: number;
};

type CreatorDraft = {
  schema: "golfin.creator-draft.v0";
  id: string;
  name: string;
  courseName: string;
  holeRef: string;
  par: number;
  yards: number;
  world: {
    width: number;
    height: number;
  };
  teePoint: Point | null;
  pinPoint: Point | null;
  strokes: CreatorStroke[];
  updatedAt: string;
};

type SubmittedCourse = ReturnType<typeof exportDraft>;

const draftStorageKey = "golfin:creator-drafts:v0";
const activeDraftStorageKey = "golfin:creator-active-draft:v0";
const submittedStorageKey = "golfin:course-options:v0";
const creatorWorld = { width: 900, height: 1250 };

const surfaceStyles: Record<SurfaceId, { label: string; color: string; stroke: string }> = {
  out_of_bounds: { label: "OOB", color: "#1f5631", stroke: "#173f25" },
  fairway: { label: "Fairway", color: "#82bf58", stroke: "#5e9d40" },
  tee: { label: "Tee", color: "#8dcc63", stroke: "#669f45" },
  green: { label: "Green", color: "#b8dd75", stroke: "#83b957" },
  bunker: { label: "Bunker", color: "#dbc076", stroke: "#9f7d3d" },
  water: { label: "Water", color: "#6eb1c2", stroke: "#43899b" },
};

const toolGroups: Array<{ id: CreatorTool; label: string; width?: number }> = [
  { id: "fairway", label: "Fairway", width: 88 },
  { id: "green", label: "Green", width: 72 },
  { id: "tee", label: "Tee", width: 58 },
  { id: "bunker", label: "Bunker", width: 34 },
  { id: "water", label: "Water", width: 74 },
  { id: "erase", label: "Erase" },
  { id: "teePoint", label: "Tee point" },
  { id: "pinPoint", label: "Pin" },
];

function createEmptyDraft(): CreatorDraft {
  return {
    schema: "golfin.creator-draft.v0",
    id: `draft-${Date.now().toString(36)}`,
    name: "New Hole",
    courseName: "Custom Course",
    holeRef: "1",
    par: 4,
    yards: 360,
    world: creatorWorld,
    teePoint: null,
    pinPoint: null,
    strokes: [],
    updatedAt: new Date().toISOString(),
  };
}

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lineLength(points: Point[]) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += distance(points[index], points[index + 1]);
  }
  return length;
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return distance(point, start);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function isNearStroke(point: Point, stroke: CreatorStroke) {
  if (stroke.points.length === 1) {
    return distance(point, stroke.points[0]) <= stroke.width * 0.62;
  }

  for (let index = 0; index < stroke.points.length - 1; index += 1) {
    if (pointToSegmentDistance(point, stroke.points[index], stroke.points[index + 1]) <= stroke.width * 0.62) {
      return true;
    }
  }
  return false;
}

function strokeToPolygon(stroke: CreatorStroke) {
  const points = stroke.points;
  const radius = stroke.width * 0.5;
  if (points.length === 1) {
    return Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return [
        Number((points[0].x + Math.cos(angle) * radius).toFixed(1)),
        Number((points[0].y + Math.sin(angle) * radius).toFixed(1)),
      ];
    });
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    left.push({ x: points[index].x + nx * radius, y: points[index].y + ny * radius });
    right.push({ x: points[index].x - nx * radius, y: points[index].y - ny * radius });
  }

  return [...left, ...right.reverse()].map((point) => [Number(point.x.toFixed(1)), Number(point.y.toFixed(1))]);
}

function exportDraft(draft: CreatorDraft) {
  const tee = draft.teePoint ?? { x: draft.world.width / 2, y: draft.world.height - 140 };
  const pin = draft.pinPoint ?? { x: draft.world.width / 2, y: 140 };
  const holeLine = [tee, pin];
  const worldUnitsPerYard = lineLength(holeLine) / Math.max(1, draft.yards);

  return {
    schema: "golfin.creator-course.v0",
    id: `custom-${draft.id}`,
    courseId: `custom-${draft.courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course"}`,
    courseName: draft.courseName,
    name: draft.name,
    ref: draft.holeRef,
    par: draft.par,
    yards: draft.yards,
    world: draft.world,
    worldUnitsPerYard,
    holeLine: holeLine.map((point) => [Number(point.x.toFixed(1)), Number(point.y.toFixed(1))]),
    tee: [Number(tee.x.toFixed(1)), Number(tee.y.toFixed(1))],
    pin: [Number(pin.x.toFixed(1)), Number(pin.y.toFixed(1))],
    surfaces: draft.strokes.map((stroke, index) => ({
      id: index + 1,
      type: stroke.surface,
      points: strokeToPolygon(stroke),
      source: "creator",
      brushWidth: stroke.width,
    })),
    createdAt: new Date().toISOString(),
  };
}

function drawStroke(context: CanvasRenderingContext2D, stroke: CreatorStroke, scale: number) {
  const style = surfaceStyles[stroke.surface];
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.width * scale;
  context.strokeStyle = style.color;
  context.fillStyle = style.color;

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.beginPath();
    context.arc(point.x * scale, point.y * scale, stroke.width * scale * 0.5, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    stroke.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x * scale, point.y * scale);
      } else {
        context.lineTo(point.x * scale, point.y * scale);
      }
    });
    context.stroke();
  }

  context.lineWidth = Math.max(1, 1.5 * scale);
  context.strokeStyle = style.stroke;
  context.globalAlpha = stroke.surface === "water" ? 0.42 : 0.26;
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.beginPath();
    context.arc(point.x * scale, point.y * scale, stroke.width * scale * 0.5, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.beginPath();
    stroke.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x * scale, point.y * scale);
      } else {
        context.lineTo(point.x * scale, point.y * scale);
      }
    });
    context.stroke();
  }
  context.restore();
}

function drawFairwayLines(context: CanvasRenderingContext2D, stroke: CreatorStroke, scale: number) {
  context.save();
  const polygon = strokeToPolygon(stroke);
  context.beginPath();
  polygon.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x * scale, y * scale);
    } else {
      context.lineTo(x * scale, y * scale);
    }
  });
  context.closePath();
  context.clip();
  context.strokeStyle = "rgba(235, 255, 196, 0.2)";
  context.lineWidth = Math.max(4, 7 * scale);
  for (let y = -80; y < creatorWorld.height + 120; y += 42) {
    context.beginPath();
    context.moveTo(-80 * scale, y * scale);
    context.lineTo((creatorWorld.width + 80) * scale, (y - 128) * scale);
    context.stroke();
  }
  context.restore();
}

function drawMarker(context: CanvasRenderingContext2D, point: Point, color: string, label: string, scale: number) {
  const x = point.x * scale;
  const y = point.y * scale;
  context.save();
  context.fillStyle = "#fffdf0";
  context.strokeStyle = "#173f25";
  context.lineWidth = Math.max(2, 2 * scale);
  context.beginPath();
  context.arc(x, y, 8 * scale, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = `${Math.max(10, 12 * scale)}px Arial, Helvetica, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillText(label, x, y - 13 * scale);
  context.restore();
}

export function CourseCreator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<CreatorStroke | null>(null);
  const [draft, setDraft] = useState<CreatorDraft>(() => createEmptyDraft());
  const [tool, setTool] = useState<CreatorTool>("fairway");
  const [brushWidth, setBrushWidth] = useState(88);
  const [drafts, setDrafts] = useState<CreatorDraft[]>([]);
  const [status, setStatus] = useState("Draft not saved");

  const exported = useMemo(() => exportDraft(draft), [draft]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const scale = Math.min(canvas.width / draft.world.width, canvas.height / draft.world.height);
    const offsetX = (canvas.width - draft.world.width * scale) * 0.5;
    const offsetY = (canvas.height - draft.world.height * scale) * 0.5;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#173f25";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.translate(offsetX, offsetY);
    context.fillStyle = surfaceStyles.out_of_bounds.color;
    context.fillRect(0, 0, draft.world.width * scale, draft.world.height * scale);

    for (const stroke of draft.strokes) {
      drawStroke(context, stroke, scale);
      if (stroke.surface === "fairway") {
        drawFairwayLines(context, stroke, scale);
      }
    }

    if (draft.teePoint) {
      drawMarker(context, draft.teePoint, "#163a24", "TEE", scale);
    }
    if (draft.pinPoint) {
      drawMarker(context, draft.pinPoint, "#e94b42", "PIN", scale);
    }

    context.strokeStyle = "rgba(255, 253, 240, 0.22)";
    context.lineWidth = Math.max(2, 2 * scale);
    context.strokeRect(0, 0, draft.world.width * scale, draft.world.height * scale);
    context.restore();
  }, [draft]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedDrafts = safeJson<CreatorDraft[]>(window.localStorage.getItem(draftStorageKey), []);
      const activeId = window.localStorage.getItem(activeDraftStorageKey);
      setDrafts(storedDrafts);
      setDraft(storedDrafts.find((item) => item.id === activeId) ?? storedDrafts[0] ?? createEmptyDraft());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    draw();
    const resize = () => draw();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / draft.world.width, rect.height / draft.world.height);
    const offsetX = (rect.width - draft.world.width * scale) * 0.5;
    const offsetY = (rect.height - draft.world.height * scale) * 0.5;
    return {
      x: Math.max(0, Math.min(draft.world.width, (event.clientX - rect.left - offsetX) / scale)),
      y: Math.max(0, Math.min(draft.world.height, (event.clientY - rect.top - offsetY) / scale)),
    };
  }

  function updateDraft(nextDraft: CreatorDraft) {
    setDraft({ ...nextDraft, updatedAt: new Date().toISOString() });
  }

  function beginPaint(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);

    if (tool === "teePoint") {
      updateDraft({ ...draft, teePoint: point });
      return;
    }
    if (tool === "pinPoint") {
      updateDraft({ ...draft, pinPoint: point });
      return;
    }
    if (tool === "erase") {
      updateDraft({ ...draft, strokes: draft.strokes.filter((stroke) => !isNearStroke(point, stroke)) });
      return;
    }

    const stroke: CreatorStroke = {
      id: `stroke-${Date.now().toString(36)}-${Math.round(point.x)}-${Math.round(point.y)}`,
      surface: tool,
      points: [point],
      width: brushWidth,
    };
    activeStrokeRef.current = stroke;
    updateDraft({ ...draft, strokes: [...draft.strokes, stroke] });
  }

  function continuePaint(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = activeStrokeRef.current;
    if (!stroke || tool === "erase" || tool === "teePoint" || tool === "pinPoint") {
      return;
    }

    const point = canvasPoint(event);
    const last = stroke.points[stroke.points.length - 1];
    if (distance(point, last) < 4) {
      return;
    }

    const nextStroke = { ...stroke, points: [...stroke.points, point] };
    activeStrokeRef.current = nextStroke;
    updateDraft({
      ...draft,
      strokes: draft.strokes.map((item) => (item.id === stroke.id ? nextStroke : item)),
    });
  }

  function endPaint(event: React.PointerEvent<HTMLCanvasElement>) {
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function persistDraft(nextDraft = draft) {
    const saved = { ...nextDraft, updatedAt: new Date().toISOString() };
    const others = drafts.filter((item) => item.id !== saved.id);
    const nextDrafts = [saved, ...others];
    setDraft(saved);
    setDrafts(nextDrafts);
    window.localStorage.setItem(draftStorageKey, JSON.stringify(nextDrafts));
    window.localStorage.setItem(activeDraftStorageKey, saved.id);
    setStatus("Draft saved");
  }

  function createDraft() {
    const next = createEmptyDraft();
    activeStrokeRef.current = null;
    setDraft(next);
    window.localStorage.setItem(activeDraftStorageKey, next.id);
    setStatus("New draft ready");
  }

  function loadDraft(id: string) {
    const next = drafts.find((item) => item.id === id);
    if (!next) {
      return;
    }
    activeStrokeRef.current = null;
    setDraft(next);
    window.localStorage.setItem(activeDraftStorageKey, next.id);
    setStatus("Draft loaded");
  }

  function submitCourse() {
    if (!draft.teePoint || !draft.pinPoint) {
      setStatus("Place tee and pin before submitting");
      return;
    }
    if (!draft.strokes.some((stroke) => stroke.surface === "green")) {
      setStatus("Paint a green before submitting");
      return;
    }

    persistDraft();
    const existing = safeJson<SubmittedCourse[]>(window.localStorage.getItem(submittedStorageKey), []);
    const next = [exported, ...existing.filter((item) => item.id !== exported.id)];
    window.localStorage.setItem(submittedStorageKey, JSON.stringify(next));
    setStatus("Submitted as local course option");
  }

  function previewDraft() {
    persistDraft();
    window.location.href = "/";
  }

  function downloadExport() {
    const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exported.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Export downloaded");
  }

  return (
    <main className="creator-shell">
      <aside className="creator-sidebar" aria-label="Course creator controls">
        <div>
          <p className="creator-kicker">Golfin</p>
          <h1>Course Creator</h1>
        </div>

        <section className="creator-panel" aria-label="Hole details">
          <label>
            Course
            <input value={draft.courseName} onChange={(event) => updateDraft({ ...draft, courseName: event.target.value })} />
          </label>
          <label>
            Hole name
            <input value={draft.name} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} />
          </label>
          <div className="creator-field-row">
            <label>
              Hole
              <input value={draft.holeRef} onChange={(event) => updateDraft({ ...draft, holeRef: event.target.value })} />
            </label>
            <label>
              Par
              <input
                max={6}
                min={3}
                type="number"
                value={draft.par}
                onChange={(event) => updateDraft({ ...draft, par: Number(event.target.value) })}
              />
            </label>
            <label>
              Yards
              <input
                min={30}
                type="number"
                value={draft.yards}
                onChange={(event) => updateDraft({ ...draft, yards: Number(event.target.value) })}
              />
            </label>
          </div>
        </section>

        <section className="creator-panel" aria-label="Surface tools">
          <div className="creator-tool-grid">
            {toolGroups.map((item) => (
              <button
                className={`creator-tool ${tool === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => {
                  setTool(item.id);
                  if (item.width) {
                    setBrushWidth(item.width);
                  }
                }}
                type="button"
              >
                <span className={`creator-swatch creator-swatch-${item.id}`} />
                {item.label}
              </button>
            ))}
          </div>
          {tool !== "erase" && tool !== "teePoint" && tool !== "pinPoint" && (
            <label>
              Brush width
              <input
                max={150}
                min={14}
                type="range"
                value={brushWidth}
                onChange={(event) => setBrushWidth(Number(event.target.value))}
              />
            </label>
          )}
        </section>

        <section className="creator-panel" aria-label="Draft actions">
          <div className="creator-actions">
            <button type="button" onClick={() => persistDraft()}>
              Save Draft
            </button>
            <button type="button" onClick={createDraft}>
              New
            </button>
            <button type="button" onClick={downloadExport}>
              Export JSON
            </button>
            <button type="button" onClick={previewDraft}>
              Preview
            </button>
            <button className="creator-submit" type="button" onClick={submitCourse}>
              Submit
            </button>
          </div>
          <p className="creator-status">{status}</p>
        </section>

        {drafts.length > 0 && (
          <section className="creator-panel" aria-label="Saved drafts">
            <h2>Drafts</h2>
            <div className="creator-draft-list">
              {drafts.map((item) => (
                <button className={item.id === draft.id ? "is-active" : ""} key={item.id} onClick={() => loadDraft(item.id)} type="button">
                  <strong>{item.name}</strong>
                  <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      <section className="creator-canvas-wrap" aria-label="Hole painting canvas">
        <canvas
          className="creator-canvas"
          onPointerCancel={endPaint}
          onPointerDown={beginPaint}
          onPointerMove={continuePaint}
          onPointerUp={endPaint}
          ref={canvasRef}
        />
      </section>
    </main>
  );
}
