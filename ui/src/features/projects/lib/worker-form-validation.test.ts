import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkerCreatePayload } from "./worker-form-validation.ts";

test("requires phone when creating worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        name: "张三",
        worker_type: 1,
        work_type: 2,
      }),
    /请填写手机号/
  );
});

test("requires work type for construction worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        name: "张三",
        phone: "13800000000",
        worker_type: 1,
      }),
    /请选择工种/
  );
});

test("requires manager type for manager worker", () => {
  assert.throws(
    () =>
      validateWorkerCreatePayload({
        name: "李四",
        phone: "13800000001",
        worker_type: 1001,
      }),
    /请选择人员类型/
  );
});

test("accepts required fields for create", () => {
  assert.doesNotThrow(() =>
    validateWorkerCreatePayload({
      name: "张三",
      phone: "13800000000",
      worker_type: 1,
      work_type: 2,
    })
  );
});
