from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path

from golfin_compiler.dtm import read_ascii_grid
from golfin_compiler.dtm import DTMGrid
from golfin_compiler.mesh import TerrainMesh, terrain_height
from golfin_compiler.model import CourseModel, Feature, HoleModel, Provenance
from golfin_compiler.pipeline import build_surface_map, compile_legacy_goodwood, normalize_legacy_hole, validate_course


class CompilerPipelineTest(unittest.TestCase):
    def test_goodwood_legacy_compile_exports_package(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = compile_legacy_goodwood(
                Path("public/courses/goodwood-downs-1/hole.json"),
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
            self.assertTrue((Path(tmp) / "holes" / "01" / "render" / "manifest.json").exists())

            validation = json.loads((Path(tmp) / "holes" / "01" / "validation.json").read_text())
            self.assertEqual(validation["elevationStatus"], "connected")
            self.assertTrue(validation["premiumReady"])
            self.assertGreaterEqual(validation["elevationFidelity"], 85)
            self.assertGreater(validation["terrainMesh"]["triangles"], 0)
            self.assertEqual(validation["terrainMesh"]["envelopePaddingMetres"], 42.0)
            course = json.loads((Path(tmp) / "course.json").read_text())
            self.assertEqual(course["elevation"]["source"], "Environment Agency LIDAR Composite DTM 1m")
            self.assertEqual(course["elevation"]["cellSizeMetres"], 1.0)
            self.assertTrue(any("Environment Agency" in attribution for attribution in course["attributions"]))
            gameplay = json.loads((Path(tmp) / "holes" / "01" / "gameplay.json").read_text())
            self.assertEqual(gameplay["hole"]["id"], "goodwood-downs-1")
            self.assertEqual(gameplay["hole"]["par"], 3)
            self.assertEqual(gameplay["hole"]["yards"], 182)
            self.assertFalse(any(feature["id"].startswith("synthetic-water:") for feature in gameplay["features"]))
            self.assertIn("no-procedural-course-features", {check["name"] for check in validation["checks"]})
            self.assertIn("no-procedural-water", {check["name"] for check in validation["checks"]})
            manifest = json.loads((Path(tmp) / "holes" / "01" / "manifest.json").read_text())
            self.assertEqual(manifest["assets"]["renderPackage"], "render/manifest.json")
            self.assertEqual(manifest["terrainEnvelope"]["kind"], "expanded-island-skirt")
            self.assertEqual(manifest["terrainEnvelope"]["courseFeaturePolicy"], "does-not-create-gameplay-water")
            render_manifest = json.loads((Path(tmp) / "holes" / "01" / "render" / "manifest.json").read_text())
            self.assertEqual(render_manifest["schema"], "golfin.render-package.v0")
            self.assertEqual(render_manifest["sourcePolicy"], "compiled-geometry-dtm-material-bake")
            self.assertEqual(render_manifest["inputs"]["elevation"]["source"], "Environment Agency LIDAR Composite DTM 1m")
            self.assertGreater(render_manifest["height"], render_manifest["width"])
            for asset in render_manifest["assets"].values():
                self.assertTrue((Path(tmp) / "holes" / "01" / "render" / asset).exists())
            self.assertEqual(
                png_size(Path(tmp) / "holes" / "01" / "render" / "terrain-albedo.png"),
                (render_manifest["width"], render_manifest["height"]),
            )
            self.assertEqual(
                png_size(Path(tmp) / "holes" / "01" / "render" / "terrain-normal.png"),
                (render_manifest["width"], render_manifest["height"]),
            )
            self.assertEqual(
                len((Path(tmp) / "holes" / "01" / "render" / "surface-id.r8").read_bytes()),
                render_manifest["width"] * render_manifest["height"],
            )

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
        source = Path("public/courses/goodwood-downs-1/hole.json")
        course = normalize_legacy_hole(__import__("json").loads(source.read_text()))
        surface_map = build_surface_map(course.holes[0], width=32, height=48)
        cells = base64.b64decode(surface_map["data"])

        self.assertEqual(len(cells), 32 * 48)
        self.assertEqual(surface_map["paddingMetres"], 42.0)
        self.assertIn(2, cells)
        self.assertIn(3, cells)
        self.assertIn(5, cells)

    def test_imported_geometry_is_prepared_for_mesh_generation(self) -> None:
        source = Path("public/courses/goodwood-downs-1/hole.json")
        course = normalize_legacy_hole(json.loads(source.read_text()))
        prepared = [
            feature
            for feature in course.holes[0].features
            if feature.surface in {"fairway", "green", "tee", "bunker"}
        ]

        self.assertTrue(prepared)
        for feature in prepared:
            compiler_geometry = feature.properties["compilerGeometry"]
            self.assertEqual(compiler_geometry["source"], "deterministic-import-preparation")
            self.assertGreater(compiler_geometry["verticesAfter"], compiler_geometry["verticesBefore"])
            self.assertGreater(compiler_geometry["areaAfterSquareMetres"], 2.0)

    def test_bunker_mesh_height_deepens_away_from_border(self) -> None:
        hole = HoleModel(
            id="bunker-depth",
            number=1,
            par=3,
            yards=120,
            tee=(0, 0),
            pin=(0, 100),
            centreline=[(0, 0), (0, 100)],
            features=[
                Feature(
                    id="osm:bunker",
                    surface="bunker",
                    geometry=[(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)],
                    provenance=Provenance(source="osm", source_id="bunker", confidence=1),
                )
            ],
        )
        dtm = DTMGrid(
            source="dtm",
            source_id="test-dtm",
            width=2,
            height=2,
            x_origin=-20,
            y_origin=-20,
            cell_size=80,
            nodata=-9999,
            values=[10, 10, 10, 10],
        )
        classify = lambda _hole, x, y: "bunker" if 0 <= x <= 10 and 0 <= y <= 10 else "out_of_bounds"

        edge_height = terrain_height(hole, classify, dtm, 0.1, 5)
        centre_height = terrain_height(hole, classify, dtm, 5, 5)

        self.assertLess(centre_height, edge_height - 0.45)

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


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path} is not a PNG")
    return (int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big"))


if __name__ == "__main__":
    unittest.main()
