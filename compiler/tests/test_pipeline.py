from __future__ import annotations

import base64
import tempfile
import unittest
from pathlib import Path

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
            self.assertEqual(result["elevationFidelity"], 0)
            self.assertTrue((Path(tmp) / "course.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "gameplay.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "surface-map.json").exists())
            self.assertTrue((Path(tmp) / "holes" / "01" / "collision.json").exists())

    def test_surface_map_is_compact_and_semantic(self) -> None:
        source = Path("public/courses/goodwood-park-1/hole.json")
        course = normalize_legacy_hole(__import__("json").loads(source.read_text()))
        surface_map = build_surface_map(course.holes[0], width=32, height=48)
        cells = base64.b64decode(surface_map["data"])

        self.assertEqual(len(cells), 32 * 48)
        self.assertIn(2, cells)
        self.assertIn(3, cells)
        self.assertIn(5, cells)


if __name__ == "__main__":
    unittest.main()
