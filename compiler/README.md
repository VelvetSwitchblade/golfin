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
- `validation.json`: mapping/elevation/mesh QA checks

The checked-in Goodwood Downs DTM fixture is generated from the Environment Agency LIDAR Composite DTM 1m WCS. It gives the compiler a real elevation source while the wider ingestion pipeline is still being built out.

## Real Elevation Fixture

```bash
npm run fetch:dtm:goodwood-downs
npm run compile:course
```

The fetch step requests the Environment Agency LIDAR Composite DTM 1m WCS for the current Goodwood Downs hole footprint, resamples it into the compiler's local metre coordinate space, and writes `compiler/fixtures/goodwood-downs-1-dtm.asc`.
