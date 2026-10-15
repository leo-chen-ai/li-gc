import assert from "node:assert/strict";
import test from "node:test";
import { prepareStudioReferences } from "./references.ts";

test("整批固定两个方向背景，各套和重试只更换衣服参考", () => {
  const source = Array.from({ length: 30 }, (_, i) => ({ record_id: `in-${i}`, out_record_id: `out-${i}` }));
  const batch = prepareStudioReferences(source);
  const { references, ...scenes } = batch;
  for (let index = 0; index < 30; index++) {
    const request = { ...scenes, reference_record_id: references[index].record_id };
    assert.equal(request.background_in_record_id, "in-0");
    assert.equal(request.background_out_record_id, "out-0");
    assert.equal(request.reference_record_id, `in-${index}`);
  }
  source[0].record_id = "changed";
  assert.equal(batch.references[0].record_id, "in-0");
  assert.equal(batch.background_in_record_id, "in-0");
});
test("没有成对参考时不启动批次", () => {
  assert.throws(() => prepareStudioReferences([]));
  assert.throws(() => prepareStudioReferences([{ record_id: "in", out_record_id: "" }]));
});
