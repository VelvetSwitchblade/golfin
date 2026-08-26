from __future__ import annotations

import hashlib
import json
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_LIBRARY_ROOT = Path("compiler/material-library/local")


@dataclass(frozen=True)
class PngTexture:
    width: int
    height: int
    pixels: bytes

    def sample_rgba(self, x: float, y: float, scale_metres: float) -> tuple[int, int, int, int]:
        scale = max(scale_metres, 0.001)
        u = (x / scale) % 1.0
        v = (y / scale) % 1.0
        px = int(u * self.width) % self.width
        py = int(v * self.height) % self.height
        index = (py * self.width + px) * 4
        return (
            self.pixels[index],
            self.pixels[index + 1],
            self.pixels[index + 2],
            self.pixels[index + 3],
        )


@dataclass(frozen=True)
class Material:
    material_id: str
    scale_metres: float
    normal_strength: float
    height_strength: float
    channels: dict[str, PngTexture]

    def sample_color(self, x: float, y: float) -> tuple[int, int, int] | None:
        texture = self.channels.get("albedo")
        if not texture:
            return None
        r, g, b, _ = texture.sample_rgba(x, y, self.scale_metres)
        return (r, g, b)

    def sample_scalar(self, channel: str, x: float, y: float) -> float | None:
        texture = self.channels.get(channel)
        if not texture:
            return None
        r, g, b, _ = texture.sample_rgba(x, y, self.scale_metres)
        return (r + g + b) / (255.0 * 3.0)

    def sample_normal_xy(self, x: float, y: float) -> tuple[float, float] | None:
        texture = self.channels.get("normal")
        if not texture:
            return None
        r, g, _b, _a = texture.sample_rgba(x, y, self.scale_metres)
        return ((r / 127.5 - 1.0) * self.normal_strength, (g / 127.5 - 1.0) * self.normal_strength)


class MaterialLibrary:
    def __init__(self, root: Path, manifest: dict[str, Any], materials: dict[str, Material]) -> None:
        self.root = root
        self.manifest = manifest
        self.materials = materials

    def material_for_surface(self, surface: str) -> Material | None:
        key = "out_of_bounds" if surface == "heavy" else surface
        return self.materials.get(key)

    def sample_color(self, surface: str, x: float, y: float) -> tuple[int, int, int] | None:
        material = self.material_for_surface(surface)
        if not material:
            return None
        return material.sample_color(x, y)

    def sample_ao(self, surface: str, x: float, y: float) -> float | None:
        material = self.material_for_surface(surface)
        if not material:
            return None
        return material.sample_scalar("ao", x, y)

    def sample_height(self, surface: str, x: float, y: float) -> float | None:
        material = self.material_for_surface(surface)
        if not material:
            return None
        value = material.sample_scalar("height", x, y)
        if value is None:
            return None
        return (value - 0.5) * material.height_strength

    def sample_normal_xy(self, surface: str, x: float, y: float) -> tuple[float, float] | None:
        material = self.material_for_surface(surface)
        if not material:
            return None
        return material.sample_normal_xy(x, y)


_loaded_library: MaterialLibrary | None | bool = False


def load_material_library(root: Path = DEFAULT_LIBRARY_ROOT) -> MaterialLibrary | None:
    global _loaded_library
    if _loaded_library is not False:
        return _loaded_library if isinstance(_loaded_library, MaterialLibrary) else None

    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        _loaded_library = None
        return None

    manifest = json.loads(manifest_path.read_text())
    materials: dict[str, Material] = {}
    for material_id, material_data in manifest.get("materials", {}).items():
        channels = {}
        for channel, relative_path in material_data.get("channels", {}).items():
            channel_path = root / relative_path
            if channel_path.exists():
                channels[channel] = read_png_rgba(channel_path)
        materials[material_id] = Material(
            material_id=material_id,
            scale_metres=float(material_data.get("scaleMetres", 10.0)),
            normal_strength=float(material_data.get("normalStrength", 0.05)),
            height_strength=float(material_data.get("heightStrength", 0.1)),
            channels=channels,
        )

    _loaded_library = MaterialLibrary(root, manifest, materials)
    return _loaded_library


def material_library_fingerprint(root: Path = DEFAULT_LIBRARY_ROOT) -> str:
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        return "procedural-materials"

    manifest = json.loads(manifest_path.read_text())
    digest = hashlib.sha256(manifest_path.read_bytes())
    for material in manifest.get("materials", {}).values():
        for relative_path in sorted(material.get("channels", {}).values()):
            channel_path = root / relative_path
            if channel_path.exists():
                digest.update(relative_path.encode("utf-8"))
                digest.update(channel_path.read_bytes())
    return digest.hexdigest()[:16]


def read_png_rgba(path: Path) -> PngTexture:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")

    offset = 8
    width = 0
    height = 0
    color_type = 0
    compressed = bytearray()

    while offset < len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        chunk_type = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        offset += length + 12

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", payload[:10])
            if bit_depth != 8 or color_type not in {0, 2, 6}:
                raise ValueError(f"{path} must be 8-bit grayscale, RGB, or RGBA PNG")
        elif chunk_type == b"IDAT":
            compressed.extend(payload)
        elif chunk_type == b"IEND":
            break

    channels = {0: 1, 2: 3, 6: 4}[color_type]
    row_bytes = width * channels
    raw = zlib.decompress(bytes(compressed))
    rows: list[bytearray] = []
    source = 0
    previous = bytearray(row_bytes)

    for _row in range(height):
        filter_type = raw[source]
        source += 1
        current = bytearray(raw[source : source + row_bytes])
        source += row_bytes
        unfilter_row(current, previous, channels, filter_type)
        rows.append(current)
        previous = current

    rgba = bytearray(width * height * 4)
    for y, row in enumerate(rows):
        for x in range(width):
            target = (y * width + x) * 4
            source_pixel = x * channels
            if color_type == 0:
                value = row[source_pixel]
                rgba[target : target + 4] = bytes((value, value, value, 255))
            elif color_type == 2:
                rgba[target : target + 4] = bytes((row[source_pixel], row[source_pixel + 1], row[source_pixel + 2], 255))
            else:
                rgba[target : target + 4] = bytes(row[source_pixel : source_pixel + 4])

    return PngTexture(width=width, height=height, pixels=bytes(rgba))


def unfilter_row(current: bytearray, previous: bytearray, bpp: int, filter_type: int) -> None:
    for index, value in enumerate(current):
        left = current[index - bpp] if index >= bpp else 0
        up = previous[index]
        upper_left = previous[index - bpp] if index >= bpp else 0

        if filter_type == 0:
            restored = value
        elif filter_type == 1:
            restored = value + left
        elif filter_type == 2:
            restored = value + up
        elif filter_type == 3:
            restored = value + ((left + up) // 2)
        elif filter_type == 4:
            restored = value + paeth(left, up, upper_left)
        else:
            raise ValueError(f"Unsupported PNG filter type: {filter_type}")
        current[index] = restored & 255


def paeth(left: int, up: int, upper_left: int) -> int:
    p = left + up - upper_left
    pa = abs(p - left)
    pb = abs(p - up)
    pc = abs(p - upper_left)
    if pa <= pb and pa <= pc:
        return left
    if pb <= pc:
        return up
    return upper_left
