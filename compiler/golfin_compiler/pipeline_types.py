from __future__ import annotations

from typing import Protocol

from .model import HoleModel, SurfaceId


class SurfaceClassifier(Protocol):
    def __call__(self, hole: HoleModel, x: float, y: float) -> SurfaceId:
        ...
