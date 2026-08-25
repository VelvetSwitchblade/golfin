from __future__ import annotations

from math import hypot
from typing import Iterable

Point = tuple[float, float]


def polygon_area(points: Iterable[Point]) -> float:
    polygon = list(points)
    if len(polygon) < 3:
        return 0.0

    area = 0.0
    for index, point in enumerate(polygon):
      previous = polygon[index - 1]
      area += previous[0] * point[1] - point[0] * previous[1]
    return abs(area) / 2.0


def point_in_polygon(x: float, y: float, polygon: list[Point]) -> bool:
    inside = False
    if len(polygon) < 3:
        return inside

    previous_x, previous_y = polygon[-1]
    for current_x, current_y in polygon:
        intersects = (current_y > y) != (previous_y > y) and x < (
            (previous_x - current_x) * (y - current_y) / ((previous_y - current_y) or 1e-9)
            + current_x
        )
        if intersects:
            inside = not inside
        previous_x, previous_y = current_x, current_y

    return inside


def distance_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx = bx - ax
    dy = by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return hypot(px - ax, py - ay)

    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return hypot(px - (ax + dx * t), py - (ay + dy * t))


def distance_to_polygon(x: float, y: float, polygon: list[Point]) -> float:
    if point_in_polygon(x, y, polygon):
        return 0.0

    return min(
        distance_to_segment(x, y, start[0], start[1], end[0], end[1])
        for start, end in zip(polygon, polygon[1:] + polygon[:1])
    )


def line_length(points: Iterable[Point]) -> float:
    line = list(points)
    return sum(hypot(point[0] - line[index - 1][0], point[1] - line[index - 1][1]) for index, point in enumerate(line) if index)


def bounds(polygons: Iterable[list[Point]]) -> dict[str, float]:
    points = [point for polygon in polygons for point in polygon]
    return {
        "minX": min(point[0] for point in points),
        "minY": min(point[1] for point in points),
        "maxX": max(point[0] for point in points),
        "maxY": max(point[1] for point in points),
    }
