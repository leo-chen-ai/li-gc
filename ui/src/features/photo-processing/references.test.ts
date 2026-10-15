import assert from "node:assert/strict";
import test from "node:test";
import { prepareStudioReferences, referencePhotoSrc } from "./references.ts";

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

test("预览保留同次抽取的进出场原图，来源数组变化不影响本批", () => {
  const input = [{ record_id: "in", out_record_id: "out", in_photo: "https://example.com/in.jpg", out_photo: "https://example.com/out.jpg" }];
  const batch = prepareStudioReferences(input);
  input[0].in_photo = "changed";
  assert.equal(batch.references[0].in_photo, "https://example.com/in.jpg");
  assert.equal(batch.references[0].out_photo, "https://example.com/out.jpg");
});
test("预览支持设备原图数据，拒绝非图片及脚本地址", () => {
  const raw = "/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
  assert.equal(referencePhotoSrc(raw), `data:image/jpeg;base64,${raw}`);
  assert.equal(referencePhotoSrc(`data:image/jpeg;base64,${raw}`), `data:image/jpeg;base64,${raw}`);
  assert.equal(referencePhotoSrc("https://example.com/a.jpg"), "https://example.com/a.jpg");
  for (const value of [null, "", "javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "/private/path.jpg"]) {
    assert.equal(referencePhotoSrc(value), undefined);
  }
});
