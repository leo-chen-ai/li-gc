import assert from "node:assert/strict";
import test from "node:test";

import {
  isManagedPhotoGroupReady,
  summarizeManagedAttendanceConfig,
} from "./lib.ts";

test("summarizes managed attendance config by attendance days and directions", () => {
  assert.equal(
    summarizeManagedAttendanceConfig({
      monthly_attendance_days: 22,
      shift: "night",
      check_in_time: "19:10",
      check_out_time: "23:05",
    }),
    "夜班 · 每月 22 天 · 预计 44 条 · 19:10/23:05"
  );
});

test("requires both in and out photos before a photo group is ready", () => {
  assert.equal(
    isManagedPhotoGroupReady({
      generation_status: "ready",
      in_photos: ["https://example.com/in.jpg"],
      out_photos: ["https://example.com/out.jpg"],
    }),
    true
  );
  assert.equal(
    isManagedPhotoGroupReady({
      generation_status: "ready",
      in_photos: ["https://example.com/in.jpg"],
      out_photos: [],
    }),
    false
  );
});
