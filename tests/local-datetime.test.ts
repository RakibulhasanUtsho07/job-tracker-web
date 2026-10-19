import test from "node:test";
import assert from "node:assert/strict";
import { toLocalDateTimeInput } from "../src/lib/local-datetime.ts";

test("formats UTC instants into the browser-local wall-clock value", () => {
  assert.equal(toLocalDateTimeInput("2026-10-19T06:00:00.000Z", -360), "2026-10-19T12:00");
});

test("returns empty values for missing or invalid timestamps", () => {
  assert.equal(toLocalDateTimeInput(null), "");
  assert.equal(toLocalDateTimeInput("not-a-date", -360), "");
});
