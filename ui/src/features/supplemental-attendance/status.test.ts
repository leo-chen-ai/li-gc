import assert from "node:assert/strict";
import test from "node:test";

import {
  supplementalDeviceStatusLabel,
  supplementalSendStatusLabel,
} from "./status.ts";

test("supplemental platform send statuses have distinct labels", () => {
  assert.equal(supplementalSendStatusLabel("unassigned"), "未分配设备");
  assert.equal(supplementalSendStatusLabel("delivered"), "平台已送达");
  assert.equal(supplementalSendStatusLabel("failed"), "发送失败");
});

test("supplemental device result statuses do not imply platform delivery", () => {
  assert.equal(supplementalDeviceStatusLabel(null), "尚无考勤机返回");
  assert.equal(supplementalDeviceStatusLabel("accepted"), "考勤机已受理");
  assert.equal(supplementalDeviceStatusLabel("success"), "考勤机处理成功");
});
