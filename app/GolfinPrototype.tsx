"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GolfMode = "snobs" | "kids";
type PlayMode = "solo" | "controller" | "coop" | "tabletop";
type Club = "Driver" | "Iron" | "Wedge" | "Putter";

type Vec = {
  x: number;
  y: number;
};

const clubs: Record<Club, { range: number; loft: string }> = {
  Driver: { range: 1.35, loft: "long" },
  Iron: { range: 1.05, loft: "steady" },
  Wedge: { range: 0.72, loft: "soft" },
  Putter: { range: 0.48, loft: "flat" },
};

const playModes: Array<{ id: PlayMode; label: string; detail: string }> = [
  { id: "solo", label: "Solo", detail: "one screen" },
  { id: "controller", label: "Phone Controller", detail: "QR joined input" },
  { id: "coop", label: "Local Co-op", detail: "shared screen" },
  { id: "tabletop", label: "Tabletop", detail: "phones as board tiles" },
];

const devices = [
  { id: "host", label: "Host tee", width: 393, height: 852, role: "tee + controls" },
  { id: "p2", label: "Player 2", width: 390, height: 844, role: "left fairway" },
  { id: "p3", label: "Player 3", width: 428, height: 926, role: "green" },
  { id: "p4", label: "Player 4", width: 360, height: 800, role: "hazards" },
];

const initialBall = { x: 120, y: 420 };
const cup = { x: 875, y: 164 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function GolfinPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const ballRef = useRef<Vec>({ ...initialBall });
  const velocityRef = useRef<Vec>({ x: 0, y: 0 });
  const powerTimerRef = useRef<number | null>(null);

  const [golfMode, setGolfMode] = useState<GolfMode>("kids");
  const [playMode, setPlayMode] = useState<PlayMode>("tabletop");
  const [club, setClub] = useState<Club>("Putter");
  const [aim, setAim] = useState(-24);
  const [power, setPower] = useState(36);
  const [charging, setCharging] = useState(false);
  const [shots, setShots] = useState(0);
  const [turn, setTurn] = useState(1);
  const [status, setStatus] = useState("Aim across the course, then hold swing for power.");
  const [ball, setBall] = useState<Vec>({ ...initialBall });
  const [calibrated, setCalibrated] = useState(false);

  const activeClub = golfMode === "kids" ? "Putter" : club;
  const sessionCode = useMemo(() => "GLFN-2419", []);

  useEffect(() => {
    if (golfMode === "kids") {
      setClub("Putter");
    }
    resetHole(golfMode);
  }, [golfMode]);

  useEffect(() => {
    drawCourse();
  }, [aim, ball, golfMode, playMode, power, calibrated]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (powerTimerRef.current) {
        window.clearInterval(powerTimerRef.current);
      }
    };
  }, []);

  function resetHole(nextMode = golfMode) {
    const start = nextMode === "kids" ? { x: 104, y: 424 } : { x: 98, y: 456 };
    ballRef.current = start;
    velocityRef.current = { x: 0, y: 0 };
    setBall(start);
    setShots(0);
    setPower(nextMode === "kids" ? 34 : 44);
    setAim(nextMode === "kids" ? -22 : -28);
    setStatus(nextMode === "kids" ? "Crazy golf loaded. The putter is locked in." : "Classic golf loaded. Choose your club and shape the shot.");
  }

  function drawCourse() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    const scaleX = width / 1000;
    const scaleY = height / 560;
    const sx = (value: number) => value * scaleX;
    const sy = (value: number) => value * scaleY;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = golfMode === "kids" ? "#30c6a5" : "#7ab85b";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = golfMode === "kids" ? "#0f6f67" : "#386f3d";
    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      ctx.arc(sx(80 + i * 132), sy(72 + (i % 3) * 42), sx(52), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = golfMode === "kids" ? "#f7d36b" : "#d7efb5";
    ctx.lineWidth = sx(golfMode === "kids" ? 118 : 154);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx(105), sy(golfMode === "kids" ? 424 : 456));
    ctx.bezierCurveTo(sx(268), sy(392), sx(340), sy(210), sx(492), sy(284));
    ctx.bezierCurveTo(sx(638), sy(355), sx(712), sy(120), sx(884), sy(164));
    ctx.stroke();

    ctx.strokeStyle = golfMode === "kids" ? "#0f7a71" : "#579353";
    ctx.lineWidth = sx(38);
    ctx.beginPath();
    ctx.moveTo(sx(126), sy(golfMode === "kids" ? 424 : 456));
    ctx.bezierCurveTo(sx(274), sy(395), sx(348), sy(246), sx(500), sy(300));
    ctx.bezierCurveTo(sx(646), sy(352), sx(724), sy(150), sx(852), sy(170));
    ctx.stroke();

    if (golfMode === "kids") {
      drawKidsObstacles(ctx, sx, sy);
    } else {
      drawSnobsCourse(ctx, sx, sy);
    }

    drawTabletopSlices(ctx, sx, sy);
    drawAimGuide(ctx, sx, sy);
    drawCup(ctx, sx, sy);
    drawBall(ctx, sx, sy);
  }

  function drawKidsObstacles(
    ctx: CanvasRenderingContext2D,
    sx: (value: number) => number,
    sy: (value: number) => number,
  ) {
    ctx.fillStyle = "#ef5b5b";
    ctx.fillRect(sx(342), sy(228), sx(34), sy(150));
    ctx.fillRect(sx(610), sy(96), sx(40), sy(180));
    ctx.fillStyle = "#f4f0db";
    ctx.fillRect(sx(205), sy(292), sx(112), sy(20));
    ctx.fillRect(sx(724), sy(238), sx(118), sy(20));
    ctx.fillStyle = "#3756a6";
    ctx.beginPath();
    ctx.arc(sx(516), sy(334), sx(40), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnobsCourse(
    ctx: CanvasRenderingContext2D,
    sx: (value: number) => number,
    sy: (value: number) => number,
  ) {
    ctx.fillStyle = "#e9d17b";
    ctx.beginPath();
    ctx.ellipse(sx(356), sy(188), sx(82), sy(34), -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sx(688), sy(336), sx(88), sy(36), 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4b9bd6";
    ctx.beginPath();
    ctx.ellipse(sx(512), sy(404), sx(104), sy(48), 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTabletopSlices(
    ctx: CanvasRenderingContext2D,
    sx: (value: number) => number,
    sy: (value: number) => number,
  ) {
    if (playMode !== "tabletop") {
      return;
    }

    ctx.strokeStyle = calibrated ? "rgba(255,255,255,0.7)" : "rgba(22,36,45,0.42)";
    ctx.lineWidth = sx(3);
    ctx.setLineDash([sx(12), sx(12)]);
    ctx.strokeRect(sx(28), sy(318), sx(326), sy(206));
    ctx.strokeRect(sx(304), sy(74), sx(286), sy(266));
    ctx.strokeRect(sx(570), sy(58), sx(390), sy(246));
    ctx.setLineDash([]);
  }

  function drawAimGuide(
    ctx: CanvasRenderingContext2D,
    sx: (value: number) => number,
    sy: (value: number) => number,
  ) {
    const radians = (aim * Math.PI) / 180;
    const length = 138 + power * 1.4;
    const start = ballRef.current;
    const end = {
      x: start.x + Math.cos(radians) * length,
      y: start.y + Math.sin(radians) * length,
    };

    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = sx(4);
    ctx.setLineDash([sx(10), sx(10)]);
    ctx.beginPath();
    ctx.moveTo(sx(start.x), sy(start.y));
    ctx.lineTo(sx(end.x), sy(end.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCup(
    ctx: CanvasRenderingContext2D,
    sx: (value: number) => number,
    sy: (value: number) => number,
  ) {
    ctx.fillStyle = "#151515";
    ctx.beginPath();
    ctx.arc(sx(cup.x), sy(cup.y), sx(18), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f9faf7";
    ctx.fillRect(sx(cup.x + 12), sy(cup.y - 74), sx(7), sy(76));
    ctx.fillStyle = "#ff5d5d";
    ctx.beginPath();
    ctx.moveTo(sx(cup.x + 20), sy(cup.y - 72));
    ctx.lineTo(sx(cup.x + 82), sy(cup.y - 54));
    ctx.lineTo(sx(cup.x + 20), sy(cup.y - 36));
    ctx.closePath();
    ctx.fill();
  }

  function drawBall(
    ctx: CanvasRenderingContext2D,
    sx: (value: number) => number,
    sy: (value: number) => number,
  ) {
    const current = ballRef.current;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(sx(current.x + 7), sy(current.y + 9), sx(17), sy(8), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx(current.x), sy(current.y), sx(16), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a6b0ba";
    ctx.lineWidth = sx(2);
    ctx.stroke();
  }

  function aimFromPointer(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 1000;
    const y = ((clientY - rect.top) / rect.height) * 560;
    const current = ballRef.current;
    const next = (Math.atan2(y - current.y, x - current.x) * 180) / Math.PI;
    setAim(Math.round(next));
  }

  function startCharge() {
    if (charging || distance(velocityRef.current, { x: 0, y: 0 }) > 0.18) {
      return;
    }

    setCharging(true);
    setStatus("Release on the bright part of the meter.");
    let direction = 1;
    powerTimerRef.current = window.setInterval(() => {
      setPower((current) => {
        if (current >= 98) {
          direction = -1;
        }
        if (current <= 8) {
          direction = 1;
        }
        return clamp(current + direction * 4, 6, 100);
      });
    }, 28);
  }

  function releaseSwing() {
    if (!charging) {
      return;
    }

    setCharging(false);
    if (powerTimerRef.current) {
      window.clearInterval(powerTimerRef.current);
      powerTimerRef.current = null;
    }

    const radians = (aim * Math.PI) / 180;
    const clubBoost = clubs[activeClub].range;
    const force = (power / 100) * clubBoost * (golfMode === "kids" ? 18 : 22);
    velocityRef.current = {
      x: Math.cos(radians) * force,
      y: Math.sin(radians) * force,
    };
    setShots((current) => current + 1);
    setTurn((current) => (current % 4) + 1);
    setStatus(`${activeClub} away. Tracking the roll across the shared world.`);
    runPhysics();
  }

  function runPhysics() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const tick = () => {
      const current = ballRef.current;
      const velocity = velocityRef.current;
      const next = {
        x: clamp(current.x + velocity.x, 36, 964),
        y: clamp(current.y + velocity.y, 42, 520),
      };

      if (next.x === 36 || next.x === 964) {
        velocity.x *= -0.42;
      }
      if (next.y === 42 || next.y === 520) {
        velocity.y *= -0.42;
      }

      const friction = golfMode === "kids" ? 0.966 : 0.976;
      velocityRef.current = {
        x: velocity.x * friction,
        y: velocity.y * friction,
      };
      ballRef.current = next;
      setBall(next);

      if (distance(next, cup) < 24 && Math.hypot(velocity.x, velocity.y) < 5.2) {
        ballRef.current = { ...cup };
        velocityRef.current = { x: 0, y: 0 };
        setBall({ ...cup });
        setStatus(`Holed in ${shots + 1}. Reset or switch mode for the next layout.`);
        return;
      }

      if (Math.hypot(velocityRef.current.x, velocityRef.current.y) < 0.18) {
        velocityRef.current = { x: 0, y: 0 };
        setStatus("Ball settled. Adjust aim for the next shot.");
        return;
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }

  return (
    <main className="game-shell">
      <section className="hero-band" aria-label="Golfin prototype">
        <div className="hero-copy">
          <p className="eyebrow">Browser golf prototype</p>
          <h1>Golfin</h1>
          <p>
            Classic golf, crazy golf, phone controllers, and a tabletop mode
            where every phone becomes part of the course.
          </p>
        </div>
        <div className="session-card" aria-label="Current session">
          <span>Session</span>
          <strong>{sessionCode}</strong>
          <small>{playMode === "tabletop" ? "tabletop board" : playModes.find((mode) => mode.id === playMode)?.detail}</small>
        </div>
      </section>

      <section className="control-band" aria-label="Game setup">
        <div className="segmented-control" aria-label="Golf mode">
          <button
            className={golfMode === "kids" ? "active" : ""}
            type="button"
            onClick={() => setGolfMode("kids")}
          >
            Kids
            <span>crazy 9</span>
          </button>
          <button
            className={golfMode === "snobs" ? "active" : ""}
            type="button"
            onClick={() => setGolfMode("snobs")}
          >
            Snobs
            <span>9 or 18</span>
          </button>
        </div>

        <div className="mode-grid" aria-label="Ways to play">
          {playModes.map((mode) => (
            <button
              className={playMode === mode.id ? "mode-pill active" : "mode-pill"}
              key={mode.id}
              type="button"
              onClick={() => setPlayMode(mode.id)}
            >
              {mode.label}
              <span>{mode.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="play-layout">
        <div className="course-panel">
          <div className="course-toolbar">
            <div>
              <span>Hole 1</span>
              <strong>{golfMode === "kids" ? "Windmill Bend" : "Old Club Par 4"}</strong>
            </div>
            <div>
              <span>Player</span>
              <strong>{turn}</strong>
            </div>
            <div>
              <span>Shots</span>
              <strong>{shots}</strong>
            </div>
          </div>
          <canvas
            aria-label="Playable golf course"
            className="course-canvas"
            onPointerDown={(event) => aimFromPointer(event.clientX, event.clientY)}
            onPointerMove={(event) => {
              if (event.buttons === 1) {
                aimFromPointer(event.clientX, event.clientY);
              }
            }}
            ref={canvasRef}
          />
        </div>

        <aside className="shot-panel" aria-label="Shot controls">
          <div className="panel-section">
            <span className="label">Club</span>
            <div className="club-grid">
              {(Object.keys(clubs) as Club[]).map((item) => (
                <button
                  className={activeClub === item ? "club active" : "club"}
                  disabled={golfMode === "kids" && item !== "Putter"}
                  key={item}
                  type="button"
                  onClick={() => setClub(item)}
                >
                  {item}
                  <span>{clubs[item].loft}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <label className="label" htmlFor="aim">Aim</label>
            <input
              id="aim"
              max="40"
              min="-80"
              onChange={(event) => setAim(Number(event.target.value))}
              type="range"
              value={aim}
            />
            <div className="readout">{aim} degrees</div>
          </div>

          <div className="panel-section">
            <span className="label">Power</span>
            <div className="power-track">
              <div className="sweet-spot" />
              <div className="power-fill" style={{ width: `${power}%` }} />
            </div>
            <button
              className="swing-button"
              onPointerDown={startCharge}
              onPointerLeave={releaseSwing}
              onPointerUp={releaseSwing}
              type="button"
            >
              {charging ? "Release to swing" : "Hold swing"}
            </button>
            <p className="status">{status}</p>
          </div>

          <button className="reset-button" onClick={() => resetHole()} type="button">
            Reset hole
          </button>
        </aside>
      </section>

      <section className="tabletop-band" aria-label="Tabletop session design">
        <div className="tabletop-copy">
          <span className="eyebrow">Tabletop board model</span>
          <h2>Phones become a single shared course.</h2>
          <p>
            Each device reports its screen size, then the game assigns a viewport
            in one shared course coordinate system. The largest phone anchors the
            tee at the bottom in landscape.
          </p>
          <button
            className={calibrated ? "calibrate calibrated" : "calibrate"}
            type="button"
            onClick={() => setCalibrated((value) => !value)}
          >
            {calibrated ? "Board calibrated" : "Calibrate edges"}
          </button>
        </div>

        <div className="device-board" aria-label="Example phone layout">
          {devices.map((device) => (
            <div className={`device-tile ${device.id}`} key={device.id}>
              <strong>{device.label}</strong>
              <span>{device.width} x {device.height}</span>
              <small>{device.role}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
