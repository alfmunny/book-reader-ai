/**
 * Regression test for #2047: vocabulary page word groups must use list
 * semantics so screen readers can announce item counts and position.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

test("vocabulary word groups container is a <ul> not a <div>", () => {
  // The word groups are rendered via sectionGroups.map(...)
  // They must be inside a <ul role="list"> for screen reader item counts.
  const mapIdx = src.indexOf("sectionGroups.map(");
  expect(mapIdx).toBeGreaterThan(-1);

  // Look back 300 chars from the map call to find the container opening tag
  const snippet = src.slice(Math.max(0, mapIdx - 300), mapIdx + 20);
  expect(snippet).toMatch(/<ul[^>]*role="list"/);
  expect(snippet).not.toMatch(/<div[^>]*space-y-4[^>]*>\s*$/);
});

test("each vocabulary word group is wrapped in a <li>", () => {
  // The renderGroup function result should be wrapped in <li key={...}>
  const mapIdx = src.indexOf("sectionGroups.map(");
  expect(mapIdx).toBeGreaterThan(-1);

  const snippet = src.slice(mapIdx, mapIdx + 200);
  expect(snippet).toMatch(/<li/);
});
