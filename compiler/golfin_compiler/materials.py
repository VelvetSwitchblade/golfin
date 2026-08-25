from __future__ import annotations

import base64
import json
import shutil
import subprocess
import zlib
from pathlib import Path

from .surfaces import SURFACE_IDS

SURFACE_COLORS = {
    "out_of_bounds": (26, 72, 31, 255),
    "rough": (52, 112, 45, 255),
    "fairway": (122, 174, 56, 255),
    "green": (142, 205, 77, 255),
    "tee": (122, 184, 70, 255),
    "bunker": (200, 170, 104, 255),
    "water": (26, 119, 150, 255),
}


def export_material_maps(hole_dir: Path, surface_map: dict[str, object]) -> dict[str, object]:
    width = int(surface_map["width"])
    height = int(surface_map["height"])
    cells = base64.b64decode(str(surface_map["data"]))
    surface_by_id = {value: key for key, value in SURFACE_IDS.items()}

    rgba = bytearray(width * height * 4)
    raw = bytearray(width * height)
    for index, surface_id in enumerate(cells):
        surface = surface_by_id[surface_id]
        color = SURFACE_COLORS[surface]
        raw[index] = surface_id
        rgba[index * 4 : index * 4 + 4] = bytes(color)

    raw_path = hole_dir / "surface.r8"
    png_path = hole_dir / "surface-id.png"
    raw_path.write_bytes(raw)
    write_png(png_path, rgba, width, height)
    ktx2 = maybe_write_ktx2(hole_dir, png_path)

    manifest = {
        "schema": "golfin.materials.v0",
        "surfaceTexture": "surface-id.png",
        "surfaceTextureRaw": "surface.r8",
        "ktx2": ktx2,
        "materials": {
            surface: {
                "id": surface_id,
                "albedo": list(SURFACE_COLORS[surface]),
                "normal": "procedural",
                "roughness": 1.0 if surface != "water" else 0.18,
                "source": "biome-rule",
            }
            for surface, surface_id in SURFACE_IDS.items()
        },
    }
    (hole_dir / "materials.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def maybe_write_ktx2(hole_dir: Path, png_path: Path) -> dict[str, object]:
    toktx = shutil.which("toktx")
    if not toktx:
        return {
            "status": "pending-compressor",
            "tool": "toktx",
            "note": "Install KTX-Software to emit .ktx2 files from the exported material maps.",
        }

    output = hole_dir / "surface-id.ktx2"
    subprocess.run([toktx, "--t2", str(output), str(png_path)], check=True)
    return {"status": "exported", "tool": "toktx", "surfaceTexture": "surface-id.ktx2"}


def write_png(path: Path, rgba: bytes | bytearray, width: int, height: int) -> None:
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes([8, 6, 0, 0, 0])
    rows = bytearray()
    stride = width * 4
    for y in range(height):
        rows.append(0)
        rows.extend(rgba[y * stride : (y + 1) * stride])
    payload = b"".join(
        [
            signature,
            png_chunk(b"IHDR", ihdr),
            png_chunk(b"IDAT", zlib.compress(bytes(rows), level=9)),
            png_chunk(b"IEND", b""),
        ]
    )
    path.write_bytes(payload)


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    length = len(payload).to_bytes(4, "big")
    crc = zlib.crc32(kind + payload).to_bytes(4, "big")
    return length + kind + payload + crc
