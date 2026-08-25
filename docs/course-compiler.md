# Golf Course Compiler

Golfin has two separate products:

- **Golf Course Compiler**: backend tooling that turns authoritative course data into immutable, validated, game-ready hole packages.
- **Game**: the browser/runtime client that loads compiled hole packages and runs rendering, physics, input, multiplayer, and UI.

The core rule is:

> Never procedurally invent the golf course. Procedurally render the golf course.

OpenStreetMap and elevation data decide what exists and where it is. The compiler decides how those facts become playable geometry, visual materials, collision, and optimized assets.

## Pipeline

```text
real-world data
  -> source ingestion
  -> normalized course model
  -> topology validation
  -> elevation evaluation
  -> master terrain
  -> semantic surface map
  -> visual enrichment
  -> collision generation
  -> optimization and budgets
  -> automated QA
  -> human review
  -> immutable published package
```

The browser should never need to understand GIS formats. It should load:

- terrain/render assets
- surface map
- collision data
- gameplay physics data
- semantic object instances
- provenance and attribution

## Source Priority

1. High-resolution LiDAR/DTM: physical ground elevation.
2. OSM golf geometry: holes, tees, fairways, greens, bunkers, rough, pins.
3. OSM natural features: water, woods, trees, hedges.
4. OSM infrastructure: paths, roads, buildings, walls.
5. Deterministic procedural generation: visual detail only.
6. Artistic rules: material appearance, lighting, density, biome.

Generated scenery can enhance mapped features, but must not create gameplay-significant bunkers, water, walls, buildings, or landmark trees that are not present in source data. If a hole has no mapped water, the compiled package must have no water.

## Runtime Contract

Every compiled hole should expose one shared semantic classification. The same surface ID drives:

- visual material selection
- ball friction and bounce
- lie and club penalties
- sound and particles
- collision interpretation

Visual transitions may be softened with distance fields, edge noise, and material blending, but gameplay boundaries remain exact and inspectable.

## First Milestone

The current milestone is intentionally small:

- normalize the existing Goodwood OSM-derived hole geometry into a compiler-owned model
- emit a deterministic manifest and validation report
- export a compact surface classification map
- export gameplay/collision metadata from the same surface IDs
- ingest a DTM raster adapter and generate adaptive `terrain.glb` / `collision.glb`
- export material maps and a KTX2 compressor hook
- leave the existing browser prototype loading compiled assets from `public/courses/goodwood-park-1/`

The next milestone should replace the transitional legacy source with a real OSM ingestion stage and add an inspector view with `RAW OSM`, `SEMANTIC`, `TERRAIN`, `MATERIAL`, `VEGETATION`, `COLLISION`, and `FINAL` modes.
