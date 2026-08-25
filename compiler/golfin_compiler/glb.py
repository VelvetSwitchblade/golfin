from __future__ import annotations

import json
import struct
from pathlib import Path

from .mesh import TerrainMesh, triangle_groups
from .surfaces import SURFACE_IDS

MATERIAL_COLORS = {
    "out_of_bounds": [0.10, 0.28, 0.12, 1.0],
    "rough": [0.20, 0.44, 0.18, 1.0],
    "fairway": [0.48, 0.68, 0.22, 1.0],
    "green": [0.55, 0.78, 0.30, 1.0],
    "tee": [0.48, 0.72, 0.28, 1.0],
    "bunker": [0.78, 0.67, 0.42, 1.0],
    "water": [0.08, 0.42, 0.55, 1.0],
}


def write_terrain_glb(path: Path, mesh: TerrainMesh) -> None:
    chunks = BinaryChunks()
    positions_view = chunks.add_floats([component for vertex in mesh.vertices for component in vertex])
    normals_view = chunks.add_floats([component for normal in mesh.normals for component in normal])

    accessors = [
        {
            "bufferView": positions_view,
            "componentType": 5126,
            "count": len(mesh.vertices),
            "type": "VEC3",
            "min": [min(vertex[index] for vertex in mesh.vertices) for index in range(3)],
            "max": [max(vertex[index] for vertex in mesh.vertices) for index in range(3)],
        },
        {
            "bufferView": normals_view,
            "componentType": 5126,
            "count": len(mesh.normals),
            "type": "VEC3",
        },
    ]

    primitives = []
    groups = triangle_groups(mesh)
    for surface, triangles in groups.items():
        indices = [index for triangle in triangles for index in triangle]
        accessor_index = len(accessors)
        indices_view = chunks.add_uint32(indices)
        accessors.append(
            {
                "bufferView": indices_view,
                "componentType": 5125,
                "count": len(indices),
                "type": "SCALAR",
            }
        )
        primitives.append(
            {
                "attributes": {"POSITION": 0, "NORMAL": 1},
                "indices": accessor_index,
                "material": list(SURFACE_IDS).index(surface),
                "mode": 4,
            }
        )

    gltf = {
        "asset": {"version": "2.0", "generator": "Golfin Course Compiler"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "terrain"}],
        "meshes": [{"name": "adaptive-terrain", "primitives": primitives}],
        "materials": [
            {
                "name": surface,
                "pbrMetallicRoughness": {
                    "baseColorFactor": MATERIAL_COLORS[surface],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 1.0,
                },
            }
            for surface in SURFACE_IDS
        ],
        "buffers": [{"byteLength": len(chunks.data)}],
        "bufferViews": chunks.views,
        "accessors": accessors,
    }

    write_glb(path, gltf, bytes(chunks.data))


class BinaryChunks:
    def __init__(self) -> None:
        self.data = bytearray()
        self.views: list[dict[str, int]] = []

    def add_floats(self, values: list[float]) -> int:
        return self.add_bytes(struct.pack(f"<{len(values)}f", *values), target=34962)

    def add_uint32(self, values: list[int]) -> int:
        return self.add_bytes(struct.pack(f"<{len(values)}I", *values), target=34963)

    def add_bytes(self, payload: bytes, target: int) -> int:
        while len(self.data) % 4:
            self.data.append(0)
        offset = len(self.data)
        self.data.extend(payload)
        while len(self.data) % 4:
            self.data.append(0)
        self.views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target})
        return len(self.views) - 1


def write_glb(path: Path, gltf: dict[str, object], binary: bytes) -> None:
    json_chunk = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_chunk) % 4:
        json_chunk += b" "
    while len(binary) % 4:
        binary += b"\x00"

    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    with path.open("wb") as file:
        file.write(struct.pack("<III", 0x46546C67, 2, total_length))
        file.write(struct.pack("<I4s", len(json_chunk), b"JSON"))
        file.write(json_chunk)
        file.write(struct.pack("<I4s", len(binary), b"BIN\x00"))
        file.write(binary)
