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

The first version is a single-screen playable prototype:

- switch between Kids and Snobs modes
- choose ways to play
- aim with the course or range input
- hold and release the swing button for timing-based power
- simulate ball roll toward the cup
- preview the tabletop device layout and calibration state

## Project Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `drizzle.config.ts` supports local migration generation when needed

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build
- `npm test`: build and smoke test the rendered page
- `npm run db:generate`: generate Drizzle migrations after schema changes
