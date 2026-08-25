import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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
  const holeJson = JSON.parse(await readFile("public/courses/goodwood-park-1/hole.json", "utf8"));
  assert.equal(holeJson.name, "Goodwood The Park - Hole 1");
  assert.equal(holeJson.yards, 389);
  assert.deepEqual(holeJson.world, { width: 900, height: 1250 });
  assert.ok(holeJson.worldUnitsPerYard > 0);

  await Promise.all([
    access("public/courses/goodwood-park-1/terrain-base.png"),
    access("public/courses/goodwood-park-1/normal.png"),
    access("public/courses/goodwood-park-1/masks.png"),
    access("public/courses/goodwood-park-1/shadow.png"),
    access("public/courses/goodwood-park-1/objects.png"),
    access("public/courses/goodwood-park-1/package/course.json"),
    access("public/courses/goodwood-park-1/package/holes/01/manifest.json"),
    access("public/courses/goodwood-park-1/package/holes/01/gameplay.json"),
    access("public/courses/goodwood-park-1/package/holes/01/surface-map.json"),
    access("public/courses/goodwood-park-1/package/holes/01/collision.json"),
    access("public/courses/goodwood-park-1/package/holes/01/validation.json"),
  ]);
});
