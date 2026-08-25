# Golfin

A browser-based golf game prototype.

Golfin is being built around two golf modes and four ways to play:

- **Kids**: 9-hole crazy golf, always putter, obstacles, timing-based power.
- **Snobs**: traditional 9/18-hole golf, club selection, swing direction, timing-based power.
- **Solo**: desktop or mobile browser play.
- **Phone Controller**: browser window as the screen, phone as the controller.
- **Local Co-op**: shared game screen with player phones as controllers.
- **Tabletop**: players place phones together as board tiles, with the largest phone at the bottom as the tee and turn controller.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Current Prototype

The current version is a single-hole physics prototype:

- Goodwood The Park hole 1 geometry
- club selection and fixed-power swing testing
- ball flight, bounce, roll, cup capture, and out-of-bounds handling
- baked terrain assets generated from course geometry
- lightweight WebGL terrain layer with a Canvas2D ball/HUD overlay

## Project Shape

- edit site code under `app/`
- compile player-facing course assets with `scripts/compile-hole.mjs`
- generated hole assets live under `public/courses/goodwood-park-1/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `drizzle.config.ts` supports local migration generation when needed

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build
- `npm test`: build and smoke test the rendered page
- `npm run compile:hole`: regenerate the baked Goodwood hole assets
- `npm run db:generate`: generate Drizzle migrations after schema changes
