from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from . import __version__
from .dtm import DTMGrid, read_ascii_grid
from .geometry import bounds, distance_to_polygon, line_length, point_in_polygon, polygon_area
from .geometry_enrichment import prepare_imported_geometry
from .glb import write_terrain_glb
from .materials import export_material_maps
from .mesh import ISLAND_LAND_RADIUS_METRES, ISLAND_SHORE_BLEND_METRES, ISLAND_WATER_DROP_METRES, TerrainMesh, build_adaptive_mesh
from .model import CourseModel, Feature, HoleModel, Provenance, SurfaceId, to_plain_json
from .render_package import export_render_package
from .surfaces import SURFACE_IDS, SURFACE_PHYSICS
from .texture_library import material_library_fingerprint

ROUGH_COLLAR_METRES = 21.6
TERRAIN_ENVELOPE_PADDING_METRES = 42.0
SURFACE_PRIORITY: list[SurfaceId] = ["water", "bunker", "green", "tee", "fairway"]
DEFAULT_DTM_PATH = Path("compiler/fixtures/goodwood-downs-1-dtm.asc")
GAMEPLAY_SIGNIFICANT_SURFACES: set[SurfaceId] = {"water", "bunker", "green", "tee", "fairway"}


def compile_legacy_goodwood(source_path: Path, output_dir: Path, dtm_path: Path | None = DEFAULT_DTM_PATH) -> dict[str, Any]:
    source = json.loads(source_path.read_text())
    course = normalize_legacy_hole(source)
    dtm = load_dtm(dtm_path)
    build_id = deterministic_build_id(course, dtm)
    output = build_hole_package(course, build_id, dtm)
    write_package(output_dir, output, course.holes[0], dtm)
    report = output["hole"]["validation"]
    return {
        "course": course.course_id,
        "hole": course.holes[0].number,
        "approved": report["approved"],
        "mappingFidelity": report["mappingFidelity"],
        "elevationFidelity": report["elevationFidelity"],
        "build": build_id,
        "output": str(output_dir),
    }


def load_dtm(path: Path | None) -> DTMGrid:
    if path is None:
        raise ValueError("A DTM path is required until real elevation provider discovery is implemented.")
    return read_ascii_grid(path)


def normalize_legacy_hole(source: dict[str, Any]) -> CourseModel:
    game_units_per_metre = source["worldUnitsPerYard"] / 0.9144

    def metres(point: list[float]) -> tuple[float, float]:
        return (round(point[0] / game_units_per_metre, 3), round(point[1] / game_units_per_metre, 3))

    feature_source: str = "osm" if source.get("sourceKind") == "osm" else "legacy-osm-derived"
    provenance_note = (
        "Imported from an OpenStreetMap extract pinned in the compiler fixtures."
        if feature_source == "osm"
        else "Imported from the existing Goodwood OSM-derived prototype geometry."
    )
    features: list[Feature] = []
    for surface in source["surfaces"]:
        surface_type = normalize_surface(surface["type"])
        features.append(
            Feature(
                id=f"osm:{surface['id']}",
                surface=surface_type,
                geometry=[metres(point) for point in surface["points"]],
                provenance=Provenance(
                    source=feature_source,  # type: ignore[arg-type]
                    source_id=surface["id"],
                    confidence=0.92 if feature_source == "osm" else 0.78,
                    note=provenance_note,
                ),
            )
        )

    hole = HoleModel(
        id=source.get("id", "goodwood-legacy-1"),
        number=int(source["ref"]),
        par=int(source["par"]),
        yards=int(source["yards"]),
        tee=metres(source["tee"]),
        pin=metres(source["pin"]),
        centreline=[metres(point) for point in source["holeLine"]],
        features=features,
    )
    prepared_hole = prepare_imported_geometry(hole)

    return CourseModel(
        course_id=source.get("courseId", "goodwood"),
        name=source.get("courseName", source["name"].replace(" - Hole 1", "")),
        projection="legacy-local-cartesian",
        units="metres",
        origin={"lat": None, "lon": None, "elevation": None},
        biome="temperate_parkland",
        holes=[prepared_hole],
        source_versions={
            "sourceHole": source_path_fingerprint(source),
            **({"osmExtract": source["source"]["extractHash"]} if source.get("source", {}).get("extractHash") else {}),
            "compiler": __version__,
        },
        attributions=[source.get("attribution", "Map geometry derived from OpenStreetMap contributors where available.")],
    )


def normalize_surface(surface: str) -> SurfaceId:
    if surface in SURFACE_IDS:
        return surface  # type: ignore[return-value]
    if surface == "heavy":
        return "out_of_bounds"
    raise ValueError(f"Unsupported surface: {surface}")


def validate_course(course: CourseModel, dtm: DTMGrid | None = None, mesh: TerrainMesh | None = None) -> dict[str, Any]:
    checks = []
    for hole in course.holes:
        surfaces = {feature.surface for feature in hole.features}
        known_physical_water = any(
            feature.surface == "water" and feature.provenance.source != "procedural"
            for feature in hole.features
        )
        procedural_gameplay_features = [
            feature
            for feature in hole.features
            if feature.surface in GAMEPLAY_SIGNIFICANT_SURFACES and feature.provenance.source == "procedural"
        ]
        procedural_water = [
            feature
            for feature in hole.features
            if feature.surface == "water" and feature.provenance.source == "procedural"
        ]
        checks.extend(
            [
                check("hole-centreline", len(hole.centreline) >= 2, True),
                check("hole-numbered", hole.number > 0, True),
                check("hole-has-green", "green" in surfaces, True),
                check("hole-has-tee", "tee" in surfaces, True),
                check("hole-has-fairway", "fairway" in surfaces, True),
                check("bunkers-known", "bunker" in surfaces, False),
                check("physical-water-known", known_physical_water, False),
                check("no-procedural-course-features", not procedural_gameplay_features, True),
                check("no-procedural-water", not procedural_water, True),
                check("sensible-yardage", abs((line_length(hole.centreline) / 0.9144) - hole.yards) < 18, True),
                check("dtm-connected", dtm is not None, True),
                check("terrain-mesh-generated", mesh is not None and mesh.stats["triangles"] > 0, True),
                check("adaptive-mesh-generated", mesh is not None and mesh.stats["adaptive"] == 1, True),
                check("terrain-envelope-expanded", mesh is not None and mesh.stats.get("envelopePaddingMetres", 0) >= TERRAIN_ENVELOPE_PADDING_METRES, True),
                check("visual-context-island-generated", mesh is not None and mesh.stats.get("visualContextIsland", 0) == 1, True),
            ]
        )

        for feature in hole.features:
            checks.append(check(f"{feature.id}-area", polygon_area(feature.geometry) > 2.0, feature.surface in {"green", "tee", "fairway"}))
            if feature.surface == "green":
                checks.append(check(f"{feature.id}-contains-pin", point_in_polygon(hole.pin[0], hole.pin[1], feature.geometry), True))

    mandatory_failed = [item for item in checks if item["mandatory"] and item["status"] != "pass"]
    score = round(sum(item["weight"] for item in checks if item["status"] == "pass") / sum(item["weight"] for item in checks) * 100)

    return {
        "approved": not mandatory_failed and score >= 85,
        "premiumReady": not mandatory_failed and score >= 85 and bool(dtm and dtm.fidelity >= 85),
        "mappingFidelity": score,
        "elevationFidelity": dtm.fidelity if dtm else 0,
        "elevationStatus": "connected" if dtm else "not-connected",
        "terrainMesh": mesh.stats if mesh else None,
        "checks": checks,
        "failures": mandatory_failed,
    }


def check(name: str, passed: bool, mandatory: bool) -> dict[str, Any]:
    return {
        "name": name,
        "status": "pass" if passed else "fail",
        "mandatory": mandatory,
        "weight": 4 if mandatory else 1,
    }


def deterministic_build_id(course: CourseModel, dtm: DTMGrid | None = None) -> str:
    payload = json.dumps(
        {
            "course": to_plain_json(course),
            "dtm": dtm.metadata() if dtm else None,
            "materialLibrary": material_library_fingerprint(),
            "compiler": __version__,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def build_hole_package(course: CourseModel, build_id: str, dtm: DTMGrid) -> dict[str, Any]:
    hole = course.holes[0]
    surface_map = build_surface_map(hole)
    feature_bounds = bounds([feature.geometry for feature in hole.features])
    padded_bounds = surface_map["bounds"]
    terrain_mesh = build_adaptive_mesh(hole, padded_bounds, dtm, classify_surface, envelope_padding=TERRAIN_ENVELOPE_PADDING_METRES)
    report = validate_course(course, dtm, terrain_mesh)

    return {
        "course": {
            "courseId": course.course_id,
            "name": course.name,
            "projection": course.projection,
            "units": course.units,
            "origin": course.origin,
            "biome": course.biome,
            "holes": [{"id": hole.id, "number": hole.number, "par": hole.par, "yards": hole.yards}],
            "sourceVersions": course.source_versions,
            "elevation": dtm.metadata(),
            "attributions": package_attributions(course, dtm),
            "build": build_id,
        },
        "hole": {
            "manifest": {
                "schema": "golfin.hole-package.v0",
                "compiler": __version__,
                "build": build_id,
                "immutable": True,
                "sourcePolicy": "authoritative-geometry-procedural-rendering",
                "bounds": feature_bounds,
                "terrainEnvelope": terrain_envelope_metadata(),
                "assets": {
                    "terrainMesh": "terrain.glb",
                    "collisionMesh": "collision.glb",
                    "terrainDebug": "terrain-debug.json",
                    "surfaceMap": "surface-map.json",
                    "surfaceTexture": "surface-id.png",
                    "surfaceTextureRaw": "surface.r8",
                    "materials": "materials.json",
                    "renderPackage": "render/manifest.json",
                    "gameplay": "gameplay.json",
                    "collision": "collision.json",
                    "validation": "validation.json",
                },
                "budgets": {
                    "terrainTriangles": 300000,
                    "initialCriticalDownloadMB": 10,
                    "completeHoleMB": 30,
                },
            },
            "gameplay": {
                "hole": {
                    "id": hole.id,
                    "number": hole.number,
                    "par": hole.par,
                    "yards": hole.yards,
                    "tee": hole.tee,
                    "pin": hole.pin,
                    "centreline": hole.centreline,
                },
                "surfaceIds": SURFACE_IDS,
                "surfacePhysics": SURFACE_PHYSICS,
                "features": [asdict(feature) for feature in hole.features],
            },
            "surfaceMap": surface_map,
            "terrainMesh": terrain_mesh,
            "collision": {
                "schema": "golfin.collision.v0",
                "units": "metres",
                "terrain": {
                    "kind": "adaptive-heightfield-mesh",
                    "mesh": "collision.glb",
                    "elevationSource": dtm.metadata(),
                    "envelope": terrain_envelope_metadata(),
                    "note": "Terrain/collision mesh is generated from the DTM adapter and semantic surface map. Imported polygons are prepared deterministically before mesh generation.",
                },
                "surfaceBounds": [
                    {
                        "id": feature.id,
                        "surface": feature.surface,
                        "collision": collision_kind(feature.surface),
                        "points": feature.geometry,
                    }
                    for feature in hole.features
                ],
            },
            "validation": report,
        },
    }


def build_surface_map(hole: HoleModel, width: int = 128, height: int = 178) -> dict[str, Any]:
    all_bounds = bounds([feature.geometry for feature in hole.features])
    padding = TERRAIN_ENVELOPE_PADDING_METRES
    min_x = all_bounds["minX"] - padding
    min_y = all_bounds["minY"] - padding
    max_x = all_bounds["maxX"] + padding
    max_y = all_bounds["maxY"] + padding
    metres_per_pixel_x = (max_x - min_x) / width
    metres_per_pixel_y = (max_y - min_y) / height
    cells = bytearray(width * height)

    for py in range(height):
        y = min_y + (py + 0.5) * metres_per_pixel_y
        for px in range(width):
            x = min_x + (px + 0.5) * metres_per_pixel_x
            surface = classify_surface(hole, x, y)
            cells[py * width + px] = SURFACE_IDS[surface]

    return {
        "schema": "golfin.surface-map.v0",
        "width": width,
        "height": height,
        "bounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        "paddingMetres": padding,
        "encoding": "uint8-base64-row-major",
        "surfaceIds": SURFACE_IDS,
        "data": base64.b64encode(bytes(cells)).decode("ascii"),
    }


def classify_surface(hole: HoleModel, x: float, y: float) -> SurfaceId:
    by_surface = {surface: [feature for feature in hole.features if feature.surface == surface] for surface in SURFACE_IDS}

    for surface in SURFACE_PRIORITY:
        if any(point_in_feature_bounds(x, y, feature, 0.0) and point_in_polygon(x, y, feature.geometry) for feature in by_surface[surface]):
            return surface

    playable = by_surface["fairway"] + by_surface["green"] + by_surface["tee"]
    nearby_playable = [feature for feature in playable if point_in_feature_bounds(x, y, feature, ROUGH_COLLAR_METRES)]
    if nearby_playable and min(distance_to_polygon(x, y, feature.geometry) for feature in nearby_playable) <= ROUGH_COLLAR_METRES:
        return "rough"

    return "out_of_bounds"


def point_in_feature_bounds(x: float, y: float, feature: Feature, padding: float) -> bool:
    stored_bounds = feature.properties.get("compilerGeometry", {}).get("bounds")
    if isinstance(stored_bounds, dict):
        min_x = float(stored_bounds["minX"]) - padding
        max_x = float(stored_bounds["maxX"]) + padding
        min_y = float(stored_bounds["minY"]) - padding
        max_y = float(stored_bounds["maxY"]) + padding
        return min_x <= x <= max_x and min_y <= y <= max_y

    min_x = min(point[0] for point in feature.geometry) - padding
    max_x = max(point[0] for point in feature.geometry) + padding
    min_y = min(point[1] for point in feature.geometry) - padding
    max_y = max(point[1] for point in feature.geometry) + padding
    return min_x <= x <= max_x and min_y <= y <= max_y


def collision_kind(surface: SurfaceId) -> str:
    if surface == "water":
        return "trigger"
    if surface == "bunker":
        return "signed-distance-terrain-depression"
    return "surface-polygon"


def package_attributions(course: CourseModel, dtm: DTMGrid) -> list[str]:
    attributions = list(course.attributions)
    if "Environment Agency" in dtm.source:
        attributions.append(
            "Elevation data: \u00a9 Environment Agency copyright and/or database right 2022. Licensed under the Open Government Licence."
        )
    return list(dict.fromkeys(attributions))


def terrain_envelope_metadata() -> dict[str, Any]:
    return {
        "kind": "generated-island-context",
        "paddingMetres": TERRAIN_ENVELOPE_PADDING_METRES,
        "landRadiusMetres": ISLAND_LAND_RADIUS_METRES,
        "shoreBlendMetres": ISLAND_SHORE_BLEND_METRES,
        "waterDropMetres": ISLAND_WATER_DROP_METRES,
        "waterline": "generated-visual-context-only",
        "courseFeaturePolicy": "does-not-create-gameplay-water",
    }


def write_package(output_dir: Path, output: dict[str, Any], hole: HoleModel | None = None, dtm: DTMGrid | None = None) -> None:
    hole_dir = output_dir / "holes" / "01"
    hole_dir.mkdir(parents=True, exist_ok=True)
    terrain_mesh = output["hole"]["terrainMesh"]
    (output_dir / "course.json").write_text(json.dumps(output["course"], indent=2) + "\n")
    (hole_dir / "manifest.json").write_text(json.dumps(output["hole"]["manifest"], indent=2) + "\n")
    (hole_dir / "gameplay.json").write_text(json.dumps(output["hole"]["gameplay"], indent=2) + "\n")
    (hole_dir / "surface-map.json").write_text(json.dumps(output["hole"]["surfaceMap"], indent=2) + "\n")
    (hole_dir / "terrain-debug.json").write_text(json.dumps(terrain_debug_payload(terrain_mesh), separators=(",", ":")) + "\n")
    (hole_dir / "collision.json").write_text(json.dumps(output["hole"]["collision"], indent=2) + "\n")
    (hole_dir / "validation.json").write_text(json.dumps(output["hole"]["validation"], indent=2) + "\n")
    write_terrain_glb(hole_dir / "terrain.glb", terrain_mesh)
    write_terrain_glb(hole_dir / "collision.glb", terrain_mesh)
    export_material_maps(hole_dir, output["hole"]["surfaceMap"])
    if hole and dtm:
        export_render_package(hole_dir / "render", hole, output["hole"]["surfaceMap"], dtm, classify_surface)


def source_path_fingerprint(source: dict[str, Any]) -> str:
    payload = json.dumps(source, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def terrain_debug_payload(mesh: TerrainMesh) -> dict[str, Any]:
    return {
        "schema": "golfin.terrain-debug.v0",
        "units": "metres",
        "bounds": mesh.bounds,
        "stats": mesh.stats,
        "vertices": mesh.vertices,
        "normals": mesh.normals,
        "triangles": [
            {
                "indices": [a, b, c],
                "surface": surface,
            }
            for a, b, c, surface in mesh.triangles
        ],
    }
