# Golfin Course Compiler

This is the backend side of Golfin. It is separate from the browser game.

The compiler owns:

- source provenance
- normalized course and hole models
- topology/fidelity scoring
- surface classification maps
- gameplay physics maps
- collision packages
- asset manifests
- immutable build outputs

The first implementation is dependency-free Python so the pipeline can run immediately. The intended production stack is Python with Shapely, GeoPandas, pyproj, Rasterio/GDAL, NumPy, PostGIS, trimesh, glTF/GLB, KTX2/Basis, and Meshopt.

## Current Command

```bash
npm run compile:course
```

That reads the current Goodwood OSM-derived hole package and exports a compiler package under:

```text
public/courses/goodwood-downs-1/package/
```

This is a transitional input adapter. The browser game should consume compiler outputs; the compiler should eventually consume raw OSM snapshots and elevation sources.

## Outputs Covered

The current compiler exports:

- `terrain.glb`: adaptive terrain mesh generated from the semantic surface map and DTM adapter
- `collision.glb`: collision mesh generated from the same DTM and semantic classification
- `terrain-debug.json`: readable terrain mesh payload for compiler inspection tooling
- `surface-map.json`: compact base64 `uint8` semantic surface map
- `surface-id.png`: visual/debug surface texture
- `surface.r8`: raw one-byte-per-pixel surface ID texture data
- `materials.json`: biome material metadata and KTX2 compression status
- `render/manifest.json`: player-facing baked terrain render package
- `render/terrain-albedo.png`: baked colour plate from semantic surfaces, deterministic texture rules, and exact geometry
- `render/terrain-normal.png`: normal map derived from real DTM gradients plus material micro-detail
- `render/terrain-light.png`: global-light hillshade/ambient plate for lightweight runtime compositing
- `render/terrain-height.png`: normalized height plate from the DTM
- `render/material-mask.png`: high-resolution blend masks for rough, fairway, green/tee, and bunker materials
- `render/surface-id.r8`: high-resolution exact surface ID map for inspector/runtime lookup
- `validation.json`: mapping/elevation/mesh QA checks

The checked-in Goodwood Downs DTM fixture is generated from the Environment Agency LIDAR Composite DTM 1m WCS. It gives the compiler a real elevation source while the wider ingestion pipeline is still being built out.

The render package is deliberately compiler-owned. It is the bridge between real course data and a lightweight game renderer: gameplay boundaries remain exact, while visual transitions use signed-distance masks and deterministic edge noise. Future scanned textures, KTX2 compression, vegetation sprites, water banks, and tree shadows should plug into this package rather than being hand-painted in the runtime.

## Real Elevation Fixture

```bash
npm run fetch:dtm:goodwood-downs
npm run compile:course
```

The fetch step requests the Environment Agency LIDAR Composite DTM 1m WCS for the current Goodwood Downs hole footprint, resamples it into the compiler's local metre coordinate space, and writes `compiler/fixtures/goodwood-downs-1-dtm.asc`.
