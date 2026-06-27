import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiUrl } from "./index.ts";

test("uses configured API URL when VITE_API_URL is present", () => {
  assert.equal(
    resolveApiUrl("http://36.151.143.235:30081", "http://admin.shanhuai.top"),
    "http://36.151.143.235:30081"
  );
});

test("uses browser origin when VITE_API_URL is absent", () => {
  assert.equal(resolveApiUrl("", "http://admin.shanhuai.top"), "http://admin.shanhuai.top");
});

test("falls back to localhost when neither VITE_API_URL nor browser origin is available", () => {
  assert.equal(resolveApiUrl("", ""), "http://localhost:8080");
});
