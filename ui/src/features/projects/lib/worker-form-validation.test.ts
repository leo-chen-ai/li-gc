import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkerCreatePayload } from "./worker-form-validation.ts";

const baseRequired = {
  avatar: "https://example.com/avatar.jpg",
  ocr_photo: "https://example.com/ocr.jpg",
  id_card_back_file: "https://example.com/back.jpg",
  id_card: "110101199001011234",
  nation: "汉族",
};

test("requires phone when creating worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        ...baseRequired,
        name: "张三",
        worker_type: 1,
        work_type: 2,
      }),
    /请填写手机号/
  );
});

test("requires work type for every worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        ...baseRequired,
        name: "张三",
        phone: "13800000000",
        worker_type: 1,
      }),
    /请选择工种/
  );
});

test("拒绝市住建字典之外的旧工种", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        ...baseRequired,
        name: "张三",
        phone: "13800000000",
        worker_type: 1,
        work_type: 12,
        political_status: 1,
      }),
    /工种不在市住建工人工种字典中/
  );
});

test("requires manager type for manager worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        ...baseRequired,
        name: "李四",
        phone: "13800000001",
        worker_type: 1001,
        work_type: 2,
        political_status: 1,
      }),
    /请选择人员类型/
  );
});

test("requires political status for every worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        ...baseRequired,
        name: "张三",
        phone: "13800000000",
        worker_type: 1,
        work_type: 2,
      }),
    /请选择政治面貌/
  );
});

test("requires photo and id card images", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        name: "张三",
        phone: "13800000000",
        worker_type: 1,
        work_type: 2,
        political_status: 1,
      }),
    /请上传照片/
  );
});

test("requires id card number and nation", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        avatar: "https://example.com/avatar.jpg",
        ocr_photo: "https://example.com/ocr.jpg",
        id_card_back_file: "https://example.com/back.jpg",
        name: "张三",
        phone: "13800000000",
        worker_type: 1,
        work_type: 2,
        political_status: 1,
      }),
    /请填写身份证号/
  );
});

test("accepts required fields for create", () => {
  assert.doesNotThrow(() =>
    validateWorkerCreatePayload({
      ...baseRequired,
      name: "张三",
      phone: "13800000000",
      worker_type: 1,
      work_type: 2,
      political_status: 1,
    })
  );
});
