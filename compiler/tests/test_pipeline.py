from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path

from golfin_compiler.dtm import read_ascii_grid
from golfin_compiler.pipeline import build_surface_map, compile_legacy_goodwood, normalize_legacy_hole


class CompilerPipelineTest(unittest.TestCase):
    def test_goodwood_legacy_compile_exports_package(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = compile_legacy_goodwood(
                Path("public/courses/goodwood-park-1/hole.json"),
                Path(tmp),
            )

            self.assertTrue(result["approved"])
            self.assertGreaterEqual(result["mappingFidelity"], 85)
            self.assertGreater(result["elevationFidelity"], 0)
            self.assertTrue((Path(tmp) / "course.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "gameplay.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "surface-map.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "collision.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "terrain.glb").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "collision.glb").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "materials.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "surface-id.png").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "surface.r8").exists())

            validation = json.loads((Path(tmp) / "holes" / "01" / "validation.json").read_text())
            self.assertEqual(validation["elevationStatus"], "connected")
            self.assertFalse(validation["premiumReady"])
            self.assertGreater(validation["terrainMesh"]["triangles"], 0)
            gameplay = json.loads((Path(tmp) / "holes" / "01" / "gameplay.json").read_text())
            self.assertFalse(any(feature["id"].startswith("synthetic-water:") for feature in gameplay["features"]))

    def test_surface_map_is_compact_and_semantic(self) -> None:
        source = Path("public/courses/goodwood-park-1/hole.json")
        course = normalize_legacy_hole(__import__("json").loads(source.read_text()))
        surface_map = build_surface_map(course.holes[0], width=32, height=48)
        cells = base64.b64decode(surface_map["data"])

        self.assertEqual(len(cells), 32 * 48)
        self.assertIn(2, cells)
        self.assertIn(3, cells)
        self.assertIn(5, cells)

    def test_ascii_dtm_reader_samples_height(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dtm_path = Path(tmp) / "tiny.asc"
            dtm_path.write_text(
                "\n".join(
                    [
                        "ncols 2",
                        "nrows 2",
                        "xllcorner 0",
                        "yllcorner 0",
                        "cellsize 10",
                        "NODATA_value -9999",
                        "12 14",
                        "10 12",
                    ]
                )
                + "\n"
            )
            dtm = read_ascii_grid(dtm_path)

            self.assertEqual(dtm.width, 2)
            self.assertEqual(dtm.height, 2)
            self.assertAlmostEqual(dtm.sample(0, 0), 10)
            self.assertGreater(dtm.sample(5, 5), 10)


if __name__ == "__main__":
    unittest.main()
