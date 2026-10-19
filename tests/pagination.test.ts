import test from "node:test";
import assert from "node:assert/strict";
import { parsePagination } from "../src/lib/pagination.ts";

test("uses defaults and accepts a valid page", () => {
  assert.deepEqual(parsePagination(new Request("https://example.test/api/items")), {limit:25,offset:0});
  assert.deepEqual(parsePagination(new Request("https://example.test/api/items?limit=40&offset=80")), {limit:40,offset:80});
});

test("clamps oversized limits and offsets and falls back for invalid values", () => {
  assert.deepEqual(parsePagination(new Request("https://example.test/api/items?limit=9999&offset=999999999999"),25,100), {limit:100,offset:10_000_000});
  assert.deepEqual(parsePagination(new Request("https://example.test/api/items?limit=-3&offset=not-a-number")), {limit:25,offset:0});
});
