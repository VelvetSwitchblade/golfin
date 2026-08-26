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
  -> imported geometry preparation
  -> topology validation
  -> elevation evaluation
  -> master terrain
  -> semantic surface map
  -> baked render package
  -> visual enrichment instances
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

The compiler may generate non-gameplay visual context around a hole, such as an island-style terrain envelope, so long as it is clearly labelled as render context and not exported as mapped course geometry.

## Runtime Contract

Every compiled hole should expose one shared semantic classification. The same surface ID drives:

- visual material selection
- ball friction and bounce
- lie and club penalties
- sound and particles
- collision interpretation

Visual transitions may be softened with distance fields, edge noise, and material blending, but gameplay boundaries remain exact and inspectable.

## Geometry Preparation

OSM golf polygons are a source of truth, but they are not always game-ready outlines. The compiler should produce a deterministic prepared geometry layer before terrain/collision/render export.

The current preparation stage:

- densifies long polygon segments
- applies light Chaikin smoothing to fairways, greens, tees, and bunkers
- slightly inflates those surfaces to compensate for corner cutting
- records the operation under `properties.compilerGeometry` for inspection

Prepared geometry is still derived from the imported course data. It should not create new bunkers, greens, water, or other gameplay-significant features.

## Terrain Shaping

The terrain mesh should represent the playable lie, not just a flat visual overlay. The current terrain shaping rules are:

- bunkers are signed-distance depressions, shallow near the border and deeper toward the interior
- greens and tees get subtle elevation treatment for clean lie surfaces
- out-of-bounds terrain falls away into an expanded island-style envelope
- the envelope is render context only and must not bypass the no-synthetic-water rule

## Baked Render Package

The compiler should emit a player-facing render package before the runtime tries to make the hole look polished. This package is generated from normalized geometry, real elevation, and deterministic material rules.

The current package shape is:

- `render/terrain-albedo.png`: baked base colour from OOB, rough, fairway, green, tee, bunker, and water materials
- `render/terrain-normal.png`: terrain/material normal map derived from DTM gradients
- `render/terrain-light.png`: baked global-light hillshade and edge ambient occlusion
- `render/terrain-height.png`: normalized DTM height plate
- `render/material-mask.png`: high-resolution RGBA masks for material blending
- `render/surface-id.r8`: exact high-resolution semantic lookup map
- `render/manifest.json`: provenance, dimensions, lighting, inputs, and asset references

This is the backend direction for realism: improve the compiler's source data, masks, materials, lighting, and bake quality first; then make the game viewer a thin consumer of those assets.

## First Milestone

The current milestone is intentionally small:

- normalize the existing Goodwood OSM-derived hole geometry into a compiler-owned model
- emit a deterministic manifest and validation report
- export a compact surface classification map
- export gameplay/collision metadata from the same surface IDs
- ingest a DTM raster adapter and generate adaptive `terrain.glb` / `collision.glb`
- export material maps and a KTX2 compressor hook
- export a baked render package for the runtime to display
- leave the existing browser prototype loading compiled assets from `public/courses/goodwood-downs-1/`

The next milestone should replace the transitional legacy source with a real OSM ingestion stage, add real texture-source ingestion/compression, and add an inspector view with `RAW OSM`, `SEMANTIC`, `TERRAIN`, `MATERIAL`, `VEGETATION`, `COLLISION`, and `FINAL` modes.
