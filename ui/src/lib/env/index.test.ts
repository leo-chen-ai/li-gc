import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiUrl } from "./index.ts";

test("uses configured API URL when VITE_API_URL is present", () => {
  assert.equal(
    resolveApiUrl("http://36.151.143.235:30081", "http://admin.shanhuai.top"),
    "http://36.151.143.235:30081"
  );
});

test("aligns a localhost API with a 127.0.0.1 development page", () => {
  assert.equal(
    resolveApiUrl("http://localhost:8080", "http://127.0.0.1:8073"),
    "http://127.0.0.1:8080"
  );
});

test("aligns a 127.0.0.1 API with a localhost development page", () => {
  assert.equal(
    resolveApiUrl("http://127.0.0.1:8080", "http://localhost:8073"),
    "http://localhost:8080"
  );
});

test("does not rewrite non-loopback configured API hosts", () => {
  assert.equal(
    resolveApiUrl("https://shanhuai.top", "http://127.0.0.1:8073"),
    "https://shanhuai.top"
  );
});

test("uses browser origin when VITE_API_URL is absent", () => {
  assert.equal(resolveApiUrl("", "http://admin.shanhuai.top"), "http://admin.shanhuai.top");
});

test("falls back to localhost when neither VITE_API_URL nor browser origin is available", () => {
  assert.equal(resolveApiUrl("", ""), "http://localhost:8080");
});
