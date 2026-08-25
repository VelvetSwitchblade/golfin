from __future__ import annotations

from dataclasses import dataclass
from math import sqrt

from .dtm import DTMGrid
from .model import HoleModel, SurfaceId
from .pipeline_types import SurfaceClassifier
from .surfaces import SURFACE_IDS


@dataclass(frozen=True)
class TerrainMesh:
    vertices: list[tuple[float, float, float]]
    normals: list[tuple[float, float, float]]
    triangles: list[tuple[int, int, int, SurfaceId]]
    bounds: dict[str, float]
    stats: dict[str, int | float]


def build_adaptive_mesh(
    hole: HoleModel,
    bounds: dict[str, float],
    dtm: DTMGrid,
    classify: SurfaceClassifier,
    base_cells_x: int = 96,
    base_cells_y: int = 144,
) -> TerrainMesh:
    vertices: list[tuple[float, float, float]] = []
    normals: list[tuple[float, float, float]] = []
    vertex_index: dict[tuple[int, int], int] = {}
    triangles: list[tuple[int, int, int, SurfaceId]] = []

    def sample_point(ix: int, iy: int) -> int:
        key = (ix, iy)
        if key in vertex_index:
            return vertex_index[key]

        x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * ix / base_cells_x
        z = bounds["minY"] + (bounds["maxY"] - bounds["minY"]) * iy / base_cells_y
        y = terrain_height(hole, classify, dtm, x, z)
        vertex_index[key] = len(vertices)
        vertices.append((round(x, 4), round(y, 4), round(-z, 4)))
        normals.append((0.0, 1.0, 0.0))
        return vertex_index[key]

    def add_rect(x0: int, y0: int, x1: int, y1: int) -> None:
        cx = (x0 + x1) // 2
        cy = (y0 + y1) // 2
        world_x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * (x0 + x1) / (2 * base_cells_x)
        world_y = bounds["minY"] + (bounds["maxY"] - bounds["minY"]) * (y0 + y1) / (2 * base_cells_y)
        surface = classify(hole, world_x, world_y)
        v00 = sample_point(x0, y0)
        v10 = sample_point(x1, y0)
        v01 = sample_point(x0, y1)
        v11 = sample_point(x1, y1)
        if (cx + cy) % 2 == 0:
            triangles.append((v00, v10, v11, surface))
            triangles.append((v00, v11, v01, surface))
        else:
            triangles.append((v00, v10, v01, surface))
            triangles.append((v10, v11, v01, surface))

    def subdivide(x0: int, y0: int, x1: int, y1: int) -> None:
        width = x1 - x0
        height = y1 - y0
        cx = (x0 + x1) // 2
        cy = (y0 + y1) // 2
        world_x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * (x0 + x1) / (2 * base_cells_x)
        world_y = bounds["minY"] + (bounds["maxY"] - bounds["minY"]) * (y0 + y1) / (2 * base_cells_y)
        surface = classify(hole, world_x, world_y)
        target = target_cell_size(surface)
        variation = height_variation(bounds, dtm, x0, y0, x1, y1, base_cells_x, base_cells_y)
        should_split = (
            width > target
            or height > target
            or (variation > 0.18 and width > 1 and height > 1)
        )
        if not should_split or width <= 1 or height <= 1:
            add_rect(x0, y0, x1, y1)
            return

        mx = max(x0 + 1, min(x1 - 1, cx))
        my = max(y0 + 1, min(y1 - 1, cy))
        subdivide(x0, y0, mx, my)
        subdivide(mx, y0, x1, my)
        subdivide(x0, my, mx, y1)
        subdivide(mx, my, x1, y1)

    subdivide(0, 0, base_cells_x, base_cells_y)
    normals = calculate_normals(vertices, triangles)
    return TerrainMesh(
        vertices=vertices,
        normals=normals,
        triangles=triangles,
        bounds=bounds,
        stats={
            "vertices": len(vertices),
            "triangles": len(triangles),
            "baseCellsX": base_cells_x,
            "baseCellsY": base_cells_y,
            "adaptive": 1,
        },
    )


def terrain_height(hole: HoleModel, classify: SurfaceClassifier, dtm: DTMGrid, x: float, y: float) -> float:
    surface = classify(hole, x, y)
    height = dtm.sample(x, y)
    if surface == "bunker":
        height -= 0.45
    elif surface == "green":
        height += 0.08
    elif surface == "tee":
        height += 0.12
    elif surface == "water":
        height -= 0.25
    return height


def target_cell_size(surface: SurfaceId) -> int:
    if surface in {"green", "bunker", "tee"}:
        return 1
    if surface in {"fairway", "water"}:
        return 2
    if surface == "rough":
        return 3
    return 6


def height_variation(
    bounds: dict[str, float],
    dtm: DTMGrid,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    base_cells_x: int,
    base_cells_y: int,
) -> float:
    samples = []
    for ix, iy in [(x0, y0), (x1, y0), (x0, y1), (x1, y1), ((x0 + x1) // 2, (y0 + y1) // 2)]:
        x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * ix / base_cells_x
        y = bounds["minY"] + (bounds["maxY"] - bounds["minY"]) * iy / base_cells_y
        samples.append(dtm.sample(x, y))
    return max(samples) - min(samples)


def calculate_normals(
    vertices: list[tuple[float, float, float]],
    triangles: list[tuple[int, int, int, SurfaceId]],
) -> list[tuple[float, float, float]]:
    accum = [[0.0, 0.0, 0.0] for _ in vertices]
    for a, b, c, _surface in triangles:
        normal = triangle_normal(vertices[a], vertices[b], vertices[c])
        for index in (a, b, c):
            accum[index][0] += normal[0]
            accum[index][1] += normal[1]
            accum[index][2] += normal[2]
    return [normalize(tuple(normal)) for normal in accum]


def triangle_normal(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
) -> tuple[float, float, float]:
    ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    return normalize(
        (
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        )
    )


def normalize(value: tuple[float, float, float]) -> tuple[float, float, float]:
    length = sqrt(value[0] * value[0] + value[1] * value[1] + value[2] * value[2]) or 1.0
    return (round(value[0] / length, 5), round(value[1] / length, 5), round(value[2] / length, 5))


def triangle_groups(mesh: TerrainMesh) -> dict[SurfaceId, list[tuple[int, int, int]]]:
    groups: dict[SurfaceId, list[tuple[int, int, int]]] = {surface: [] for surface in SURFACE_IDS}
    for a, b, c, surface in mesh.triangles:
        groups[surface].append((a, b, c))
    return {surface: triangles for surface, triangles in groups.items() if triangles}
