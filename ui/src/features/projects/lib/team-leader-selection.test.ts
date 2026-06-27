import assert from "node:assert/strict";
import test from "node:test";

import { buildTeamLeaderPatch } from "./team-leader-selection.ts";

const workers = [
  {
    id: "worker-1",
    name: "张三",
    phone: "13800000000",
    id_card: "332603197912123456",
  },
];

test("builds team leader form patch from selected worker", () => {
  assert.deepEqual(buildTeamLeaderPatch(workers, "worker-1"), {
    leader_id: "worker-1",
    leader_name: "张三",
    leader_phone: "13800000000",
    leader_id_card: "332603197912123456",
  });
});

test("clears leader fields when worker is not selected", () => {
  assert.deepEqual(buildTeamLeaderPatch(workers, ""), {
    leader_id: "",
    leader_name: "",
    leader_phone: "",
    leader_id_card: "",
  });
});
