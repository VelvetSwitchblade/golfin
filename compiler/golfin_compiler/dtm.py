from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DTMGrid:
    source: str
    source_id: str
    width: int
    height: int
    x_origin: float
    y_origin: float
    cell_size: float
    nodata: float
    values: list[float]

    @property
    def fidelity(self) -> int:
        if self.cell_size <= 1:
            return 94
        if self.cell_size <= 2:
            return 82
        if self.cell_size <= 5:
            return 66
        if self.cell_size <= 10:
            return 50
        if self.cell_size <= 25:
            return 34
        return 18

    def sample(self, x: float, y: float) -> float:
        grid_x = (x - self.x_origin) / self.cell_size
        grid_y_from_bottom = (y - self.y_origin) / self.cell_size
        grid_y = (self.height - 1) - grid_y_from_bottom
        x0 = clamp_int(int(grid_x), 0, self.width - 1)
        y0 = clamp_int(int(grid_y), 0, self.height - 1)
        x1 = clamp_int(x0 + 1, 0, self.width - 1)
        y1 = clamp_int(y0 + 1, 0, self.height - 1)
        tx = max(0.0, min(1.0, grid_x - x0))
        ty = max(0.0, min(1.0, grid_y - y0))
        a = self.value_at(x0, y0)
        b = self.value_at(x1, y0)
        c = self.value_at(x0, y1)
        d = self.value_at(x1, y1)
        return mix(mix(a, b, tx), mix(c, d, tx), ty)

    def value_at(self, x: int, y: int) -> float:
        value = self.values[y * self.width + x]
        if value == self.nodata:
            return 0.0
        return value

    def metadata(self) -> dict[str, object]:
        return {
            "source": self.source,
            "sourceId": self.source_id,
            "format": "esri-ascii-grid",
            "width": self.width,
            "height": self.height,
            "cellSizeMetres": self.cell_size,
            "fidelity": self.fidelity,
        }


def read_ascii_grid(path: Path) -> DTMGrid:
    lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    header: dict[str, float] = {}
    row_start = 0
    for index, line in enumerate(lines):
        parts = line.split()
        if len(parts) < 2 or not parts[0][0].isalpha():
            row_start = index
            break
        header[parts[0].lower()] = float(parts[1])
    else:
        raise ValueError(f"No raster rows found in {path}")

    width = int(header["ncols"])
    height = int(header["nrows"])
    x_origin = header.get("xllcorner", header.get("xllcenter", 0.0))
    y_origin = header.get("yllcorner", header.get("yllcenter", 0.0))
    cell_size = header["cellsize"]
    nodata = header.get("nodata_value", -9999.0)
    values = [float(value) for line in lines[row_start:] for value in line.split()]
    if len(values) != width * height:
        raise ValueError(f"{path} contains {len(values)} cells, expected {width * height}")

    fingerprint = file_fingerprint(path)
    source = "dtm"
    source_id = fingerprint
    metadata_path = path.with_suffix(".metadata.json")
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())
        source = metadata.get("source", source)
        source_id = metadata.get("sourceId", source_id).replace("{sha256}", fingerprint)

    return DTMGrid(
        source=source,
        source_id=source_id,
        width=width,
        height=height,
        x_origin=x_origin,
        y_origin=y_origin,
        cell_size=cell_size,
        nodata=nodata,
        values=values,
    )


def file_fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def mix(start: float, end: float, amount: float) -> float:
    return start + (end - start) * amount
