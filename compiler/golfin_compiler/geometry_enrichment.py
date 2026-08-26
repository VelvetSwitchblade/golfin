from __future__ import annotations

from dataclasses import replace
from math import hypot

from .geometry import polygon_area
from .model import Feature, HoleModel, SurfaceId

Point = tuple[float, float]

SMOOTHABLE_SURFACES: set[SurfaceId] = {"fairway", "green", "tee", "bunker"}
MAX_SEGMENT_LENGTH_METRES = 2.0
SMOOTHING_ITERATIONS = {
    "fairway": 1,
    "green": 2,
    "tee": 1,
    "bunker": 2,
}
INFLATION_METRES = {
    "fairway": 0.45,
    "green": 0.28,
    "tee": 0.2,
    "bunker": 0.35,
}


def prepare_imported_geometry(hole: HoleModel) -> HoleModel:
    features = [prepare_feature(feature) for feature in hole.features]
    return replace(hole, features=features)


def prepare_feature(feature: Feature) -> Feature:
    if feature.surface not in SMOOTHABLE_SURFACES:
        return feature

    original_geometry = close_polygon(feature.geometry)
    densified = densify_polygon(original_geometry, MAX_SEGMENT_LENGTH_METRES)
    smoothed = densified
    for _ in range(SMOOTHING_ITERATIONS[feature.surface]):
        smoothed = chaikin(smoothed)
    inflated = inflate_from_centroid(smoothed, INFLATION_METRES[feature.surface])

    return replace(
        feature,
        geometry=inflated,
        properties={
            **feature.properties,
            "compilerGeometry": {
                "source": "deterministic-import-preparation",
                "maxSegmentLengthMetres": MAX_SEGMENT_LENGTH_METRES,
                "smoothing": "chaikin",
                "smoothingIterations": SMOOTHING_ITERATIONS[feature.surface],
                "inflationMetres": INFLATION_METRES[feature.surface],
                "verticesBefore": len(original_geometry),
                "verticesAfter": len(inflated),
                "areaBeforeSquareMetres": round(polygon_area(original_geometry), 3),
                "areaAfterSquareMetres": round(polygon_area(inflated), 3),
                "bounds": polygon_bounds(inflated),
            },
        },
    )


def close_polygon(points: list[Point]) -> list[Point]:
    if not points:
        return []
    if points[0] == points[-1]:
        return list(points)
    return [*points, points[0]]


def densify_polygon(points: list[Point], max_segment_length: float) -> list[Point]:
    polygon = close_polygon(points)
    if len(polygon) < 4:
        return polygon

    densified: list[Point] = []
    for start, end in zip(polygon, polygon[1:]):
        densified.append(start)
        length = hypot(end[0] - start[0], end[1] - start[1])
        steps = int(length // max_segment_length)
        for step in range(1, steps + 1):
            amount = step / (steps + 1)
            densified.append((mix(start[0], end[0], amount), mix(start[1], end[1], amount)))
    return close_polygon(densified)


def chaikin(points: list[Point]) -> list[Point]:
    polygon = close_polygon(points)
    if len(polygon) < 4:
        return polygon

    smoothed: list[Point] = []
    for start, end in zip(polygon, polygon[1:]):
        smoothed.append((mix(start[0], end[0], 0.25), mix(start[1], end[1], 0.25)))
        smoothed.append((mix(start[0], end[0], 0.75), mix(start[1], end[1], 0.75)))
    return close_polygon(smoothed)


def inflate_from_centroid(points: list[Point], metres: float) -> list[Point]:
    polygon = close_polygon(points)
    if len(polygon) < 4 or metres == 0:
        return polygon

    open_points = polygon[:-1]
    centroid_x = sum(point[0] for point in open_points) / len(open_points)
    centroid_y = sum(point[1] for point in open_points) / len(open_points)
    inflated = []
    for x, y in open_points:
        dx = x - centroid_x
        dy = y - centroid_y
        length = hypot(dx, dy) or 1.0
        inflated.append((round(x + dx / length * metres, 3), round(y + dy / length * metres, 3)))
    return close_polygon(inflated)


def polygon_bounds(points: list[Point]) -> dict[str, float]:
    return {
        "minX": min(point[0] for point in points),
        "minY": min(point[1] for point in points),
        "maxX": max(point[0] for point in points),
        "maxY": max(point[1] for point in points),
    }


def mix(start: float, end: float, amount: float) -> float:
    return start + (end - start) * amount
