from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path

from golfin_compiler.dtm import read_ascii_grid
from golfin_compiler.dtm import DTMGrid
from golfin_compiler.mesh import TerrainMesh
from golfin_compiler.model import CourseModel, Feature, HoleModel, Provenance
from golfin_compiler.pipeline import build_surface_map, compile_legacy_goodwood, normalize_legacy_hole, validate_course


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
            self.assertIn("no-procedural-course-features", {check["name"] for check in validation["checks"]})
            self.assertIn("no-procedural-water", {check["name"] for check in validation["checks"]})

    def test_validation_rejects_procedural_water_as_course_geometry(self) -> None:
        course = CourseModel(
            course_id="test-course",
            name="Test Course",
            projection="local",
            units="metres",
            origin={"lat": None, "lon": None, "elevation": None},
            biome="temperate_parkland",
            holes=[
                HoleModel(
                    id="test-1",
                    number=1,
                    par=4,
                    yards=360,
                    tee=(0, 0),
                    pin=(0, 329.184),
                    centreline=[(0, 0), (0, 329.184)],
                    features=[
                        Feature(
                            id="osm:tee",
                            surface="tee",
                            geometry=[(-5, -5), (5, -5), (5, 5), (-5, 5), (-5, -5)],
                            provenance=Provenance(source="osm", source_id="tee", confidence=1),
                        ),
                        Feature(
                            id="osm:fairway",
                            surface="fairway",
                            geometry=[(-15, 0), (15, 0), (15, 329.184), (-15, 329.184), (-15, 0)],
                            provenance=Provenance(source="osm", source_id="fairway", confidence=1),
                        ),
                        Feature(
                            id="osm:green",
                            surface="green",
                            geometry=[(-12, 317), (12, 317), (12, 341), (-12, 341), (-12, 317)],
                            provenance=Provenance(source="osm", source_id="green", confidence=1),
                        ),
                        Feature(
                            id="procedural-water:bad",
                            surface="water",
                            geometry=[(20, 20), (35, 20), (35, 35), (20, 35), (20, 20)],
                            provenance=Provenance(source="procedural", source_id="bad", confidence=0.2),
                        ),
                    ],
                )
            ],
            source_versions={"test": "1"},
            attributions=[],
        )
        dtm = DTMGrid(
            source="dtm",
            source_id="test-dtm",
            width=2,
            height=2,
            x_origin=-20,
            y_origin=-10,
            cell_size=400,
            nodata=-9999,
            values=[10, 10, 10, 10],
        )
        mesh = TerrainMesh(
            vertices=[(0, 0, 0), (1, 0, 0), (0, 0, 1)],
            normals=[(0, 1, 0), (0, 1, 0), (0, 1, 0)],
            triangles=[(0, 1, 2, "fairway")],
            bounds={"minX": -20, "minY": -10, "maxX": 40, "maxY": 340},
            stats={"vertices": 3, "triangles": 1, "baseCellsX": 1, "baseCellsY": 1, "adaptive": 1},
        )

        report = validate_course(course, dtm=dtm, mesh=mesh)
        failed_checks = {check["name"] for check in report["failures"]}

        self.assertFalse(report["approved"])
        self.assertIn("no-procedural-course-features", failed_checks)
        self.assertIn("no-procedural-water", failed_checks)

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
