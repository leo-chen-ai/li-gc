import assert from "node:assert/strict";
import test from "node:test";
import { STUDIO_PIPELINE, validateStudioResult } from "./protocol.ts";

test("拒绝旧生成结果及缺少人物图层的伪完成结果", () => {
  assert.throws(() => validateStudioResult({}, false));
  assert.throws(() => validateStudioResult({ pipeline: "legacy", entry_layer: "layer" }, false));
  assert.throws(() => validateStudioResult({ pipeline: STUDIO_PIPELINE }, false));
  assert.doesNotThrow(() => validateStudioResult({ pipeline: STUDIO_PIPELINE }, true));
  assert.doesNotThrow(() => validateStudioResult({ pipeline: STUDIO_PIPELINE, entry_layer: "layer" }, false));
});
