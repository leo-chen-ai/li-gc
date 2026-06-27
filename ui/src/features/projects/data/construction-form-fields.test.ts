import assert from "node:assert/strict";
import test from "node:test";

import {
  getFieldsBySection,
  inferNativePlaceFromAddress,
  teamFormFields,
  unitFormFields,
  workerFormFields,
} from "./construction-form-fields.ts";

const selectFieldExpectations = [
  ["unit.company_type", unitFormFields, "company_type"],
  ["unit.salary_calc_type", unitFormFields, "salary_calc_type"],
  ["unit.quantity_unit_type", unitFormFields, "quantity_unit_type"],
  ["team.work_type", teamFormFields, "work_type"],
  ["team.settlement_type", teamFormFields, "settlement_type"],
  ["team.quantity_unit_type", teamFormFields, "quantity_unit_type"],
  ["worker.native_place", workerFormFields, "native_place"],
  ["worker.work_type", workerFormFields, "work_type"],
  ["worker.worker_type", workerFormFields, "worker_type"],
  ["worker.political_status", workerFormFields, "political_status"],
  ["worker.manager_type", workerFormFields, "manager_type"],
  ["worker.settlement_type", workerFormFields, "settlement_type"],
  ["worker.quantity_unit_type", workerFormFields, "quantity_unit_type"],
  ["worker.salary_bank", workerFormFields, "salary_bank"],
  ["worker.education", workerFormFields, "education"],
  ["worker.work_status", workerFormFields, "work_status"],
] as const;

test("construction ledger dictionary fields render as selects", () => {
  for (const [name, fields, key] of selectFieldExpectations) {
    const field = fields.find((item) => item.key === key);

    assert.ok(field, `${name} field exists`);
    assert.equal(field.control, "select", `${name} should use select control`);
    assert.ok(field.options && field.options.length > 0, `${name} should define options`);
  }
});

test("team leader is selected from project workers", () => {
  const field = teamFormFields.find((item) => item.key === "leader_id");

  assert.ok(field, "team leader field exists");
  assert.equal(field.label, "班组长");
  assert.equal(field.control, "select");
  assert.equal(field.optionsSource, "workers");
});

test("worker form starts with team scope fields", () => {
  const sections = getFieldsBySection(workerFormFields);

  assert.equal(sections[0]?.section, "班组归属");
  assert.deepEqual(
    sections[0]?.fields.slice(0, 2).map((field) => field.key),
    ["unit_id", "team_id"]
  );
});

test("worker native place is grouped with identity document information", () => {
  const sections = getFieldsBySection(workerFormFields);
  const teamScopeSection = sections.find((item) => item.section === "班组归属");
  const identitySection = sections.find((item) => item.section === "证件信息");

  assert.ok(identitySection, "identity section exists");
  assert.equal(teamScopeSection?.fields.some((field) => field.key === "native_place"), false);
  assert.equal(identitySection.fields.some((field) => field.key === "native_place"), true);
});

test("worker signature photo supports manual signing", () => {
  const field = workerFormFields.find((item) => item.key === "signature_photo");

  assert.ok(field, "signature photo field exists");
  assert.equal(field.label, "人员签字");
  assert.equal(field.control, "upload");
  assert.equal(field.uploadKind, "image");
  assert.equal(field.signaturePad, true);
});

test("worker form hides real-name authentication bookkeeping fields", () => {
  const keys = workerFormFields.map((field) => field.key);

  assert.equal(keys.includes("auth_status"), false);
  assert.equal(keys.includes("auth_fail_reason"), false);
});

test("worker native place is inferred from recognized address", () => {
  assert.equal(inferNativePlaceFromAddress("杭州市西湖区桑园地村4组25号"), "330100");
  assert.equal(inferNativePlaceFromAddress("江苏省淮安市清江浦区北京北路"), "320000");
  assert.equal(inferNativePlaceFromAddress(""), null);
});
