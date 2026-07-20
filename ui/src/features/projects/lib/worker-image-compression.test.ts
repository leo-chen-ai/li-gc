import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKER_AVATAR_MAX_BYTES,
  WORKER_ID_CARD_MAX_BYTES,
  workerImageLimitLabel,
  workerImageMaxBytes,
} from "./worker-image-compression.ts";

test("worker images use strict platform compression targets", () => {
  assert.equal(workerImageMaxBytes("avatar"), WORKER_AVATAR_MAX_BYTES);
  assert.equal(workerImageMaxBytes("ocr_photo"), WORKER_ID_CARD_MAX_BYTES);
  assert.equal(workerImageMaxBytes("id_card_back_file"), WORKER_ID_CARD_MAX_BYTES);
  assert.equal(workerImageMaxBytes("signature_photo"), null);
  assert.match(workerImageLimitLabel("avatar") ?? "", /小于 20KB/);
  assert.match(workerImageLimitLabel("ocr_photo") ?? "", /小于 50KB/);
});
