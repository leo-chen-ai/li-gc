import assert from "node:assert/strict";
import test from "node:test";

import {
  describeCompositedPairs,
  directionLabel,
  findBackground,
  isTaskActive,
  mergeCompositedPairs,
  mergePhotoUrls,
  normalizePhotoUrls,
  photoDedupeKey,
  taskProgressPercent,
  taskStatusLabel,
  compositeStatusLabel,
} from "./lib.ts";
import type { PhotoGroupBackground } from "./types.ts";
import type { CompositeTask } from "./types.ts";

function buildTask(overrides: Partial<CompositeTask> = {}): CompositeTask {
  return {
    id: "task-1",
    group_id: "group-1",
    status: "running",
    total_count: 4,
    success_count: 1,
    failed_count: 0,
    skipped_count: 0,
    output_size: "1024x1536",
    prompt_text: null,
    error_summary: null,
    cancel_requested: false,
    created_at: "2026-09-22T00:00:00Z",
    started_at: "2026-09-22T00:00:01Z",
    completed_at: null,
    ...overrides,
  };
}

test("labels both attendance directions", () => {
  assert.equal(directionLabel(0), "进场");
  assert.equal(directionLabel(1), "出场");
});

test("labels composite and task statuses", () => {
  assert.equal(compositeStatusLabel("skipped"), "已跳过");
  assert.equal(compositeStatusLabel("weird"), "weird");
  assert.equal(taskStatusLabel("running"), "合成中");
  assert.equal(taskStatusLabel("cancelled"), "已取消");
});

test("only pending and running tasks keep polling", () => {
  assert.equal(isTaskActive(buildTask({ status: "pending" })), true);
  assert.equal(isTaskActive(buildTask({ status: "running" })), true);
  assert.equal(isTaskActive(buildTask({ status: "completed" })), false);
  assert.equal(isTaskActive(null), false);
});

test("task progress is a clamped percentage", () => {
  assert.equal(taskProgressPercent(buildTask()), 25);
  assert.equal(
    taskProgressPercent(
      buildTask({ success_count: 2, failed_count: 1, skipped_count: 1 })
    ),
    100
  );
  // 失败或跳过也算「处理完了」，进度条必须往前走
  assert.equal(taskProgressPercent(buildTask({ failed_count: 4 })), 100);
  // 除零保护
  assert.equal(taskProgressPercent(buildTask({ total_count: 0 })), 0);
  assert.equal(
    taskProgressPercent(buildTask({ total_count: 0, status: "completed" })),
    100
  );
});

test("drops photos that repeat an existing worker/date/direction triple", () => {
  assert.equal(
    photoDedupeKey({
      attendance_record_id: "rec-1",
      project_id: "proj-1",
      worker_id: "w-1",
      attendance_date: "2026-09-20",
      direction: 0,
    }),
    photoDedupeKey({
      attendance_record_id: "rec-1",
      project_id: "proj-1",
      worker_id: "w-1",
      attendance_date: "2026-09-20",
      direction: 0,
    })
  );
  assert.notEqual(
    photoDedupeKey({
      attendance_record_id: "rec-1",
      project_id: "proj-1",
      worker_id: "w-1",
      attendance_date: "2026-09-20",
      direction: 0,
    }),
    photoDedupeKey({
      attendance_record_id: "rec-1",
      project_id: "proj-1",
      worker_id: "w-1",
      attendance_date: "2026-09-20",
      direction: 1,
    })
  );
});

test("merging photo urls dedupes by url and keeps order", () => {
  const merged = mergePhotoUrls(
    ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    ["https://example.com/b.jpg", "https://example.com/c.jpg", ""]
  );
  assert.deepEqual(merged, [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg",
    "https://example.com/c.jpg",
  ]);
  assert.deepEqual(
    mergePhotoUrls(["https://example.com/a.jpg"], []),
    ["https://example.com/a.jpg"]
  );
});

test("normalizing photo urls drops blanks only", () => {
  assert.deepEqual(
    normalizePhotoUrls(["https://example.com/a.jpg", "", "https://example.com/b.jpg"]),
    ["https://example.com/a.jpg", "https://example.com/b.jpg"]
  );
});

test("merging composited pairs keeps in/out aligned by index", () => {
  // 分别按 URL 去重后重新对齐下标：进场不能配到别人的出场上。
  const merged = mergeCompositedPairs(
    [{ inPhoto: "https://example.com/in-a.jpg", outPhoto: "https://example.com/out-a.jpg" }],
    [
      { in_photo: "https://example.com/in-b.jpg", out_photo: "https://example.com/out-b.jpg" },
      { in_photo: "https://example.com/in-a.jpg", out_photo: "https://example.com/out-a.jpg" },
    ]
  );
  assert.deepEqual(merged, [
    { inPhoto: "https://example.com/in-a.jpg", outPhoto: "https://example.com/out-a.jpg" },
    { inPhoto: "https://example.com/in-b.jpg", outPhoto: "https://example.com/out-b.jpg" },
  ]);
});

test("merging composited pairs into an empty form yields one pair per photo", () => {
  assert.deepEqual(
    mergeCompositedPairs([], [
      { in_photo: "in-1", out_photo: "out-1" },
      { in_photo: "in-2", out_photo: "out-2" },
    ]),
    [
      { inPhoto: "in-1", outPhoto: "out-1" },
      { inPhoto: "in-2", outPhoto: "out-2" },
    ]
  );
});

test("merging composited pairs keeps half-filled existing slots in place", () => {
  // 已有的「只有进」或「只有出」保留原位（空串会占一个下标），
  // 新勾选的成对照片追加在后面，不会被塞进别人的空位。
  const merged = mergeCompositedPairs(
    [{ inPhoto: "in-a", outPhoto: "" }, { inPhoto: "", outPhoto: "out-b" }],
    [{ in_photo: "in-c", out_photo: "out-c" }]
  );
  assert.deepEqual(merged, [
    { inPhoto: "in-a", outPhoto: "" },
    { inPhoto: "", outPhoto: "out-b" },
    { inPhoto: "in-c", outPhoto: "out-c" },
  ]);
  // 存库前会把空串滤掉，所以不会写出长度不一致的 in_photos/out_photos。
  assert.deepEqual(
    merged.map((pair) => normalizePhotoUrls([pair.inPhoto, pair.outPhoto]).join("|")),
    ["in-a", "out-b", "in-c|out-c"]
  );
});

test("explains unpaired composited photos only when there are some", () => {
  assert.equal(describeCompositedPairs(0), "");
  assert.equal(
    describeCompositedPairs(3),
    "另有 3 张已合成照片没凑齐进/出一对，不会同步过去"
  );
});

test("finds a background by direction", () => {
  const backgrounds: PhotoGroupBackground[] = [
    { id: "b1", direction: 0, photo_url: "https://example.com/in.jpg", remark: null },
    { id: "b2", direction: 1, photo_url: "https://example.com/out.jpg", remark: null },
  ];
  assert.equal(findBackground(backgrounds, 0)?.id, "b1");
  assert.equal(findBackground(backgrounds, 1)?.id, "b2");
  assert.equal(findBackground([], 1), undefined);
});
