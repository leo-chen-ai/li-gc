import assert from "node:assert/strict";
import test from "node:test";

import {
  getFieldsBySection,
  inferNativePlaceFromAddress,
  teamFormFields,
  unitFormFields,
  workerFormFields,
  workerWorkTypeOptions,
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

test("unit form hides legacy timer settings and keeps date picker registration date", () => {
  const keys = unitFormFields.map((field) => field.key);
  const registerDate = unitFormFields.find((field) => field.key === "register_date");

  assert.equal(keys.includes("timer_set_a"), false);
  assert.equal(keys.includes("timer_set_b"), false);
  assert.equal(keys.includes("timer_set_c"), false);
  assert.equal(registerDate?.valueType, "date");
});

test("team leader is selected from project workers", () => {
  const field = teamFormFields.find((item) => item.key === "leader_id");

  assert.ok(field, "team leader field exists");
  assert.equal(field.label, "班组长");
  assert.equal(field.control, "select");
  assert.equal(field.optionsSource, "workers");
});

test("team type is required and matches the Ningbo housing dictionary", () => {
  const typeField = teamFormFields.find((item) => item.key === "work_type");
  const leaderField = teamFormFields.find((item) => item.key === "leader_id");
  const labels = typeField?.options?.map((option) => option.label) ?? [];

  assert.equal(typeField?.required, true);
  assert.notEqual(leaderField?.required, true);
  assert.equal(typeField?.options?.[0]?.label, "项目管理部");
  assert.equal(teamFormFields[0]?.key, "is_manage_team");
  for (const label of [
    "砌筑工",
    "模板工",
    "机械设备安装工",
    "建筑起重机械安装拆卸工",
    "古建筑传统彩画工",
    "杂工",
    "其它",
  ]) {
    assert.equal(labels.includes(label), true, `missing Ningbo team type: ${label}`);
  }
});

test("worker form starts with team scope fields", () => {
  const sections = getFieldsBySection(workerFormFields);

  assert.equal(sections[0]?.section, "班组归属");
  assert.deepEqual(
    sections[0]?.fields.slice(0, 2).map((field) => field.key),
    ["unit_id", "team_id"]
  );
});

test("worker identity and employment fields are grouped with basic information", () => {
  const sections = getFieldsBySection(workerFormFields);
  const teamScopeSection = sections.find((item) => item.section === "班组归属");
  const basicSection = sections.find((item) => item.section === "基础信息");

  assert.ok(basicSection, "basic section exists");
  assert.equal(teamScopeSection?.fields.some((field) => field.key === "native_place"), false);
  assert.equal(basicSection.fields.some((field) => field.key === "native_place"), true);
  assert.equal(basicSection.fields.some((field) => field.key === "work_type"), true);
  assert.equal(basicSection.fields.some((field) => field.key === "political_status"), true);
  assert.equal(basicSection.fields.find((field) => field.key === "phone")?.required, true);
});

test("项目工人工种与宁波市住建文档字典一致", () => {
  assert.deepEqual(workerWorkTypeOptions.map((option) => option.label), [
    "砌筑工", "钢筋工", "架子工", "混凝土工", "模板工", "机械设备安装工", "通风工", "安装起重工", "安装钳工",
    "电气设备安装调试工", "管道工", "变电安装工", "建筑电工", "司泵工", "挖掘铲运和桩工机械司机", "桩机操作工",
    "起重信号工", "建筑起重机械安装拆卸工", "装饰装修工", "室内成套设施安装工", "建筑门窗幕墙安装工", "幕墙制作工", "防水工",
    "木工", "石工", "电焊工", "除尘工", "爆破工", "测量放线工", "线路架设工", "古建筑传统石工", "古建筑传统瓦工",
    "古建筑传统彩画工", "古建筑传统木工", "古建筑传统油工", "金属工", "杂工", "管理人员", "其它",
  ]);
});

test("manager type only appears for manager workers", () => {
  const constructionFields = getFieldsBySection(workerFormFields, { worker_type: "1" })
    .flatMap((section) => section.fields);
  const managerFields = getFieldsBySection(workerFormFields, { worker_type: "1001" })
    .flatMap((section) => section.fields);

  assert.equal(constructionFields.some((field) => field.key === "manager_type"), false);
  assert.equal(managerFields.find((field) => field.key === "manager_type")?.required, true);
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
  assert.equal(inferNativePlaceFromAddress("江苏省淮安市清江浦区北京北路"), "320800");
  assert.equal(inferNativePlaceFromAddress(""), null);
});
