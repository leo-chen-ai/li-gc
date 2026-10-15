import assert from "node:assert/strict";
import test from "node:test";
import { prepareStudioReferences, referencePhotoSrc, studioPairReference } from "./references.ts";

test("30套背景分别对应各自进出场原图，不复用第1套", () => {
  const source = Array.from({ length: 30 }, (_, i) => ({ record_id: `in-${i}`, out_record_id: `out-${i}` }));
  const batch = prepareStudioReferences(source);
  assert.equal("background_in_record_id" in batch, false);
  for (let index = 0; index < 30; index++) {
    const request = studioPairReference(batch.references, index);
    assert.deepEqual(request, {
      reference_record_id: `in-${index}`, reference_out_record_id: `out-${index}`,
      background_in_record_id: `in-${index}`, background_out_record_id: `out-${index}`,
    });
  }
  source[0].record_id = "changed";
  assert.equal(batch.references[0].record_id, "in-0");
  assert.throws(() => studioPairReference(batch.references, 30));
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
