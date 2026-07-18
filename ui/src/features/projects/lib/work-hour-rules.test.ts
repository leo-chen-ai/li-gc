import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkHourRules,
  createDefaultWorkHourRuleForm,
  parseWorkHourRules,
  summarizeWorkHourRules,
} from "./work-hour-rules.ts";

test("builds backend rules from visual work-hour fields", () => {
  const form = createDefaultWorkHourRuleForm();
  form.segments = [
    { id: "a", startHour: "2", endHour: "4", rate: "0.5" },
    { id: "b", startHour: "4", endHour: "20", rate: "1" },
    { id: "c", startHour: "20", endHour: "30", rate: "1.5" },
  ];

  assert.deepEqual(buildWorkHourRules(form), {
    algorithm: "tiered_duration",
    maxHours: 24,
    segments: [
      { fromHours: 2, toHours: 4, rate: 0.5 },
      { fromHours: 4, toHours: 20, rate: 1 },
      { fromHours: 20, toHours: 24, rate: 1.5 },
    ],
  });
});

test("uses the project default work-hour tiers", () => {
  assert.deepEqual(createDefaultWorkHourRuleForm().segments, [
    { id: "segment-1", startHour: "2", endHour: "4", rate: "0.5" },
    { id: "segment-2", startHour: "4", endHour: "20", rate: "1" },
    { id: "segment-3", startHour: "20", endHour: "24", rate: "1.5" },
  ]);
});

test("parses existing backend rules back into visual fields", () => {
  const form = parseWorkHourRules({
    algorithm: "tiered_duration",
    maxHours: 24,
    segments: [
      { fromHours: 0, toHours: 8, rate: 1 },
      { fromHours: 8, toHours: 15, rate: 1.5 },
      { fromHours: 15, toHours: 24, rate: 2 },
    ],
  });

  assert.deepEqual(form.segments, [
    { id: "segment-1", startHour: "0", endHour: "8", rate: "1" },
    { id: "segment-2", startHour: "8", endHour: "15", rate: "1.5" },
    { id: "segment-3", startHour: "15", endHour: "24", rate: "2" },
  ]);
});

test("parses old standard overtime rules into duration segments", () => {
  const form = parseWorkHourRules({
    standardHoursPerDay: 8,
    overtime: { enabled: true, afterHours: 8, rate: 1.5 },
  });

  assert.deepEqual(form.segments, [
    { id: "segment-1", startHour: "0", endHour: "8", rate: "1" },
    { id: "segment-2", startHour: "8", endHour: "24", rate: "1.5" },
  ]);
});

test("parses existing top-level overtime rules into duration segments", () => {
  const form = parseWorkHourRules({
    dayHours: 8,
    overtimeAfterHours: 9,
    nightShift: { ratio: 1.5 },
  });

  assert.deepEqual(form.segments, [
    { id: "segment-1", startHour: "0", endHour: "9", rate: "1" },
    { id: "segment-2", startHour: "9", endHour: "24", rate: "1.5" },
  ]);
});

test("summarizes rules without exposing raw JSON", () => {
  const summary = summarizeWorkHourRules({
    algorithm: "tiered_duration",
    maxHours: 24,
    segments: [
      { fromHours: 0, toHours: 8, rate: 1 },
      { fromHours: 8, toHours: 15, rate: 1.5 },
    ],
  });

  assert.equal(summary, "0-8小时算1 · 8-15小时算1.5 · 上限24小时");
});
