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
public/courses/goodwood-park-1/package/
```

This is a transitional input adapter. The browser game should consume compiler outputs; the compiler should eventually consume raw OSM snapshots and elevation sources.
