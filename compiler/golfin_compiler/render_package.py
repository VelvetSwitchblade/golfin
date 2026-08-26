from __future__ import annotations

import json
import math
from pathlib import Path

from .dtm import DTMGrid
from .geometry import distance_to_segment, point_in_polygon
from .materials import write_png
from .mesh import island_land_alpha, point_in_feature_bbox, surface_terrain_height
from .model import Feature, HoleModel, SurfaceId
from .pipeline_types import SurfaceClassifier
from .surfaces import SURFACE_IDS

ROUGH_COLLAR_METRES = 21.6
RENDER_TARGET_HEIGHT = 512

Point = tuple[float, float]


def export_render_package(
    render_dir: Path,
    hole: HoleModel,
    surface_map: dict[str, object],
    dtm: DTMGrid,
    classify: SurfaceClassifier,
) -> dict[str, object]:
    render_dir.mkdir(parents=True, exist_ok=True)
    bounds = surface_map["bounds"]
    assert isinstance(bounds, dict)
    min_x = float(bounds["minX"])
    min_y = float(bounds["minY"])
    max_x = float(bounds["maxX"])
    max_y = float(bounds["maxY"])
    metres_width = max_x - min_x
    metres_height = max_y - min_y
    height = RENDER_TARGET_HEIGHT
    width = max(256, round(height * metres_width / metres_height))
    metres_per_pixel_x = metres_width / width
    metres_per_pixel_y = metres_height / height

    albedo = bytearray(width * height * 4)
    normal = bytearray(width * height * 4)
    light = bytearray(width * height * 4)
    material_mask = bytearray(width * height * 4)
    context_water_mask = bytearray(width * height * 4)
    height_map = bytearray(width * height * 4)
    surface_raw = bytearray(width * height)
    surface_preview = bytearray(width * height * 4)

    height_min, height_max = height_range(dtm)
    light_dir = normalize3((-0.38, 0.72, -0.58))

    features_by_surface = {
        surface: [feature for feature in hole.features if feature.surface == surface]
        for surface in SURFACE_IDS
    }

    for py in range(height):
        y = min_y + (py + 0.5) * metres_per_pixel_y
        for px in range(width):
            x = min_x + (px + 0.5) * metres_per_pixel_x
            index = py * width + px
            surface = classify(hole, x, y)
            surface_raw[index] = SURFACE_IDS[surface]

            masks = material_masks(features_by_surface, x, y, surface)
            land_alpha = island_land_alpha(hole, x, y)
            context_water = 1.0 - land_alpha
            h = surface_terrain_height(hole, dtm, x, y, surface)
            n = terrain_normal(hole, classify, dtm, x, y, max(metres_per_pixel_x, metres_per_pixel_y), surface)
            hillshade = clamp(0.48 + 0.52 * dot3(n, light_dir), 0.0, 1.0)
            ambient_edge = edge_ambient_occlusion(features_by_surface, x, y)
            shade = clamp(hillshade * ambient_edge, 0.2, 1.18)
            color = terrain_color(surface, masks, x, y, h)
            if context_water > 0.01:
                water = water_color(x, y)
                color = tuple(clamp_int(mix(water[channel], color[channel], land_alpha)) for channel in range(3))
            shaded = tuple(clamp_int(channel * shade) for channel in color)

            albedo[index * 4 : index * 4 + 4] = bytes((*color, 255))
            light_value = clamp_int(shade * 255)
            light[index * 4 : index * 4 + 4] = bytes((light_value, light_value, light_value, 255))
            normal[index * 4 : index * 4 + 4] = encode_normal(n)
            material_mask[index * 4 : index * 4 + 4] = bytes(
                (
                    clamp_int(masks["rough"] * 255),
                    clamp_int(masks["fairway"] * 255),
                    clamp_int(max(masks["green"], masks["tee"]) * 255),
                    clamp_int(masks["bunker"] * 255),
                )
            )
            water_mask_value = clamp_int(context_water * 255)
            context_water_mask[index * 4 : index * 4 + 4] = bytes((water_mask_value, water_mask_value, water_mask_value, 255))
            h_value = clamp_int(((h - height_min) / max(0.01, height_max - height_min)) * 255)
            height_map[index * 4 : index * 4 + 4] = bytes((h_value, h_value, h_value, 255))
            surface_preview[index * 4 : index * 4 + 4] = bytes((*shaded, 255))

    (render_dir / "surface-id.r8").write_bytes(surface_raw)
    write_png(render_dir / "terrain-albedo.png", albedo, width, height)
    write_png(render_dir / "terrain-normal.png", normal, width, height)
    write_png(render_dir / "terrain-light.png", light, width, height)
    write_png(render_dir / "terrain-height.png", height_map, width, height)
    write_png(render_dir / "material-mask.png", material_mask, width, height)
    write_png(render_dir / "context-water-mask.png", context_water_mask, width, height)
    write_png(render_dir / "terrain-preview.png", surface_preview, width, height)

    manifest: dict[str, object] = {
        "schema": "golfin.render-package.v0",
        "sourcePolicy": "compiled-geometry-dtm-material-bake",
        "units": "metres",
        "bounds": bounds,
        "width": width,
        "height": height,
        "metresPerPixel": {
            "x": metres_per_pixel_x,
            "y": metres_per_pixel_y,
        },
        "inputs": {
            "surfaceMap": "../surface-map.json",
            "terrainMesh": "../terrain.glb",
            "elevation": dtm.metadata(),
        },
        "assets": {
            "albedo": "terrain-albedo.png",
            "normal": "terrain-normal.png",
            "light": "terrain-light.png",
            "height": "terrain-height.png",
            "materialMask": "material-mask.png",
            "contextWaterMask": "context-water-mask.png",
            "surfaceId": "surface-id.r8",
            "preview": "terrain-preview.png",
        },
        "context": {
            "island": {
                "source": "deterministic-visual-context",
                "gameplaySurface": False,
                "landAlpha": "1 means generated island land; 0 means visual-only surrounding water",
            },
            "water": {
                "source": "deterministic-visual-context",
                "gameplaySurface": False,
                "mask": "context-water-mask.png",
            },
        },
        "lighting": {
            "azimuthDegrees": 305,
            "elevationDegrees": 46,
            "space": "local-hole",
        },
        "materialChannels": {
            "materialMask": {
                "r": "rough",
                "g": "fairway",
                "b": "green_or_tee",
                "a": "bunker",
            }
        },
        "notes": [
            "Gameplay classification is exact; render masks use signed-distance and deterministic edge noise for visual blending.",
            "This is a backend render plate for the runtime to consume, not live canvas decoration.",
        ],
    }
    (render_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def material_masks(
    features_by_surface: dict[str, list[Feature]],
    x: float,
    y: float,
    surface: SurfaceId,
) -> dict[str, float]:
    edge_noise = fbm(x * 0.55, y * 0.55, 3) - 0.5
    fairway = soft_feature_mask(features_by_surface["fairway"], x, y, 1.2, edge_noise)
    green = soft_feature_mask(features_by_surface["green"], x, y, 0.9, edge_noise)
    tee = soft_feature_mask(features_by_surface["tee"], x, y, 0.8, edge_noise)
    bunker = soft_feature_mask(features_by_surface["bunker"], x, y, 0.75, edge_noise)
    water = soft_feature_mask(features_by_surface["water"], x, y, 0.8, edge_noise)
    rough = 1.0 if surface == "rough" else 0.0
    rough *= 1.0 - max(fairway, green, tee, bunker, water) * 0.82
    return {
        "out_of_bounds": clamp(1.0 - rough, 0.0, 1.0),
        "rough": rough,
        "fairway": fairway,
        "green": green,
        "tee": tee,
        "bunker": bunker,
        "water": water,
    }


def terrain_color(
    _surface: SurfaceId,
    masks: dict[str, float],
    x: float,
    y: float,
    elevation: float,
) -> tuple[int, int, int]:
    base = list(material_grass((28, 73, 33), x, y, elevation, 1.35, 0.2))
    for key in ("rough", "fairway", "tee", "green", "bunker", "water"):
        amount = masks[key]
        if amount <= 0.01:
            continue
        color = material_color(key, x, y, elevation)
        base = [mix(base[channel], color[channel], amount) for channel in range(3)]
    return tuple(clamp_int(channel) for channel in base)


def material_color(surface: str, x: float, y: float, elevation: float) -> tuple[int, int, int]:
    if surface == "rough":
        return material_grass((59, 112, 44), x, y, elevation, 1.0, 0.15)
    if surface == "fairway":
        return fairway_grass(x, y, elevation)
    if surface == "green":
        return material_grass((134, 191, 73), x, y, elevation, 0.42, 0.08)
    if surface == "tee":
        return material_grass((119, 177, 66), x, y, elevation, 0.5, 0.08)
    if surface == "bunker":
        return bunker_sand(x, y)
    if surface == "water":
        return water_color(x, y)
    return material_grass((28, 73, 33), x, y, elevation, 1.35, 0.2)


def material_grass(
    base: tuple[int, int, int],
    x: float,
    y: float,
    elevation: float,
    blade_scale: float,
    tonal_shift: float,
) -> tuple[int, int, int]:
    fine = fbm(x * 1.9 * blade_scale, y * 1.9 * blade_scale, 4)
    clump = fbm(x * 0.19, y * 0.19, 5)
    elevation_tone = math.sin(elevation * 0.9) * 0.035
    amount = (fine - 0.5) * 0.16 + (clump - 0.5) * tonal_shift + elevation_tone
    return tuple(clamp_int(channel * (1.0 + amount)) for channel in base)


def fairway_grass(x: float, y: float, elevation: float) -> tuple[int, int, int]:
    base = material_grass((113, 170, 56), x, y, elevation, 0.62, 0.1)
    stripe = math.sin((x * 0.22 + y * 0.04) * math.pi)
    stripe_amount = 0.06 if stripe > 0 else -0.035
    return tuple(clamp_int(channel * (1.0 + stripe_amount)) for channel in base)


def bunker_sand(x: float, y: float) -> tuple[int, int, int]:
    ripple = math.sin(x * 1.45 + fbm(x * 0.2, y * 0.2, 3) * 2.5) * 0.08
    grain = (value_noise(x * 4.4, y * 4.4) - 0.5) * 0.12
    return tuple(clamp_int(channel * (1.0 + ripple + grain)) for channel in (198, 166, 99))


def water_color(x: float, y: float) -> tuple[int, int, int]:
    ripple = math.sin(x * 0.8 + y * 1.35) * 0.08 + math.sin(x * 2.1 - y * 0.5) * 0.04
    return (
        clamp_int(24 * (1.0 + ripple)),
        clamp_int(112 * (1.0 + ripple)),
        clamp_int(144 * (1.0 + ripple * 1.2)),
    )


def terrain_normal(
    hole: HoleModel,
    classify: SurfaceClassifier,
    dtm: DTMGrid,
    x: float,
    y: float,
    step: float,
    surface: SurfaceId,
) -> tuple[float, float, float]:
    _ = (hole, classify)
    left = dtm.sample(x - step, y)
    right = dtm.sample(x + step, y)
    down = dtm.sample(x, y - step)
    up = dtm.sample(x, y + step)
    base = normalize3((-(right - left), 2.0 * step, -(up - down)))
    detail_strength = {
        "out_of_bounds": 0.11,
        "rough": 0.08,
        "fairway": 0.045,
        "green": 0.018,
        "tee": 0.025,
        "bunker": 0.06,
        "water": 0.02,
    }[surface]
    detail_x = (value_noise(x * 2.8 + 13.1, y * 2.8) - 0.5) * detail_strength
    detail_z = (value_noise(x * 2.8, y * 2.8 - 11.7) - 0.5) * detail_strength
    return normalize3((base[0] + detail_x, base[1], base[2] + detail_z))


def soft_feature_mask(features: list[Feature], x: float, y: float, edge_width: float, edge_noise: float) -> float:
    if not features:
        return 0.0
    nearby = [feature for feature in features if point_in_feature_bbox(x, y, feature, edge_width * 3.0)]
    if not nearby:
        return 0.0
    signed = min(signed_distance_to_polygon(x, y, feature.geometry) for feature in nearby)
    return 1.0 - smoothstep(-edge_width, edge_width, signed + edge_noise * edge_width * 0.65)


def edge_ambient_occlusion(features_by_surface: dict[str, list[Feature]], x: float, y: float) -> float:
    occlusion = 1.0
    for surface, strength in (("green", 0.07), ("tee", 0.06), ("bunker", 0.18)):
        for feature in features_by_surface[surface]:
            if not point_in_feature_bbox(x, y, feature, 3.0):
                continue
            signed = signed_distance_to_polygon(x, y, feature.geometry)
            edge = 1.0 - smoothstep(0.1, 2.6, abs(signed))
            if surface == "bunker" and signed < 0:
                edge = max(edge, smoothstep(0.2, 4.0, -signed) * 0.6)
            occlusion -= edge * strength
    return clamp(occlusion, 0.72, 1.06)


def signed_distance_to_polygon(x: float, y: float, polygon: list[Point]) -> float:
    distance = distance_to_polygon_exact(x, y, polygon)
    return -distance if point_in_polygon(x, y, polygon) else distance


def distance_to_polygon_exact(x: float, y: float, polygon: list[Point]) -> float:
    return min(
        distance_to_segment(x, y, start[0], start[1], end[0], end[1])
        for start, end in zip(polygon, polygon[1:] + polygon[:1])
    )


def height_range(dtm: DTMGrid) -> tuple[float, float]:
    values = [value for value in dtm.values if value != dtm.nodata]
    return (min(values), max(values))


def fbm(x: float, y: float, octaves: int) -> float:
    value = 0.0
    amplitude = 0.5
    frequency = 1.0
    total = 0.0
    for _ in range(octaves):
        value += value_noise(x * frequency, y * frequency) * amplitude
        total += amplitude
        amplitude *= 0.5
        frequency *= 2.0
    return value / total


def value_noise(x: float, y: float) -> float:
    xi = math.floor(x)
    yi = math.floor(y)
    tx = x - xi
    ty = y - yi
    sx = tx * tx * (3 - 2 * tx)
    sy = ty * ty * (3 - 2 * ty)
    a = hash_noise(xi, yi)
    b = hash_noise(xi + 1, yi)
    c = hash_noise(xi, yi + 1)
    d = hash_noise(xi + 1, yi + 1)
    return mix(mix(a, b, sx), mix(c, d, sx), sy)


def hash_noise(x: int, y: int) -> float:
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 1.0 if value >= edge1 else 0.0
    t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(start: float, end: float, amount: float) -> float:
    return start + (end - start) * amount


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def clamp_int(value: float) -> int:
    return int(round(clamp(value, 0, 255)))


def dot3(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def normalize3(value: tuple[float, float, float]) -> tuple[float, float, float]:
    length = math.sqrt(dot3(value, value)) or 1.0
    return (value[0] / length, value[1] / length, value[2] / length)


def encode_normal(normal: tuple[float, float, float]) -> bytes:
    return bytes(
        (
            clamp_int((normal[0] * 0.5 + 0.5) * 255),
            clamp_int((normal[2] * 0.5 + 0.5) * 255),
            clamp_int((normal[1] * 0.5 + 0.5) * 255),
            255,
        )
    )
