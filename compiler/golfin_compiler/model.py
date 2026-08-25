from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

SurfaceId = Literal["out_of_bounds", "rough", "fairway", "green", "tee", "bunker", "water"]
SourceKind = Literal["osm", "elevation", "procedural", "legacy-osm-derived"]


@dataclass(frozen=True)
class Provenance:
    source: SourceKind
    source_id: str | int | None
    confidence: float
    note: str | None = None


@dataclass(frozen=True)
class Feature:
    id: str
    surface: SurfaceId
    geometry: list[tuple[float, float]]
    provenance: Provenance
    properties: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class HoleModel:
    id: str
    number: int
    par: int
    yards: int
    tee: tuple[float, float]
    pin: tuple[float, float]
    centreline: list[tuple[float, float]]
    features: list[Feature]


@dataclass(frozen=True)
class CourseModel:
    course_id: str
    name: str
    projection: str
    units: Literal["metres"]
    origin: dict[str, float | None]
    biome: str
    holes: list[HoleModel]
    source_versions: dict[str, str]
    attributions: list[str]


def to_plain_json(value: Any) -> Any:
    return asdict(value)
