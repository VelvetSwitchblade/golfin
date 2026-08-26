import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Golfin shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Golfin<\/title>/i);
  assert.match(html, /Golfin physics prototype/);
  assert.match(html, /Swing/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
  assert.doesNotMatch(html, /Tabletop|Phone Controller|Local Co-op/);
});

test("compiled Goodwood hole assets are present", async () => {
  const holeJson = JSON.parse(await readFile("public/courses/goodwood-downs-1/hole.json", "utf8"));
  assert.equal(holeJson.name, "The Downs Course - Hole 1");
  assert.equal(holeJson.par, 3);
  assert.equal(holeJson.yards, 182);
  assert.deepEqual(holeJson.world, { width: 900, height: 1250 });
  assert.ok(holeJson.worldUnitsPerYard > 0);
  assert.equal(holeJson.waterHazards, undefined);

  await Promise.all([
    access("public/courses/goodwood-downs-1/terrain-base.png"),
    access("public/courses/goodwood-downs-1/normal.png"),
    access("public/courses/goodwood-downs-1/masks.png"),
    access("public/courses/goodwood-downs-1/shadow.png"),
    access("public/courses/goodwood-downs-1/objects.png"),
    access("public/courses/goodwood-downs-1/package/course.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/manifest.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/gameplay.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/surface-map.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/terrain-debug.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/surface-id.png"),
    access("public/courses/goodwood-downs-1/package/holes/01/surface.r8"),
    access("public/courses/goodwood-downs-1/package/holes/01/materials.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/render/manifest.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/render/terrain-preview.png"),
    access("public/courses/goodwood-downs-1/package/holes/01/render/terrain-land-preview.png"),
    access("public/courses/goodwood-downs-1/package/holes/01/render/context-water-mask.png"),
    access("public/courses/goodwood-downs-1/package/holes/01/render/context-water-fill.png"),
    access("public/courses/goodwood-downs-1/package/holes/01/terrain.glb"),
    access("public/courses/goodwood-downs-1/package/holes/01/collision.glb"),
    access("public/courses/goodwood-downs-1/package/holes/01/collision.json"),
    access("public/courses/goodwood-downs-1/package/holes/01/validation.json"),
  ]);

  const terrainDebug = JSON.parse(
    await readFile("public/courses/goodwood-downs-1/package/holes/01/terrain-debug.json", "utf8"),
  );
  assert.equal(terrainDebug.schema, "golfin.terrain-debug.v0");
  assert.ok(terrainDebug.vertices.length > 0);

  const validation = JSON.parse(
    await readFile("public/courses/goodwood-downs-1/package/holes/01/validation.json", "utf8"),
  );
  assert.equal(terrainDebug.stats.triangles, validation.terrainMesh.triangles);

  const gameplay = JSON.parse(
    await readFile("public/courses/goodwood-downs-1/package/holes/01/gameplay.json", "utf8"),
  );
  assert.equal(gameplay.hole.id, "goodwood-downs-1");
  assert.equal(gameplay.features.some((feature) => feature.id.startsWith("synthetic-water:")), false);
});

test("server-renders the course inspector shell", async () => {
  const response = await render("/inspector");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Golfin Course Inspector<\/title>/i);
  assert.match(html, /Loading compiled hole package/);
});
