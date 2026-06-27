import assert from "node:assert/strict";
import test from "node:test";

import { countActiveWorkersByTeamId, countActiveWorkersByUnitId } from "./project-resource-counts.ts";

test("counts active workers by construction team and unit", () => {
  const workers = [
    { id: "worker-1", team_id: "team-a", unit_id: "unit-a", is_deleted: false },
    { id: "worker-2", team_id: "team-a", unit_id: "unit-a", is_deleted: false },
    { id: "worker-3", team_id: "team-b", unit_id: "unit-b", is_deleted: false },
    { id: "worker-4", team_id: "team-a", unit_id: "unit-a", is_deleted: true },
    { id: "worker-5", team_id: null, unit_id: null, is_deleted: false },
  ];

  assert.deepEqual(Object.fromEntries(countActiveWorkersByTeamId(workers)), {
    "team-a": 2,
    "team-b": 1,
  });
  assert.deepEqual(Object.fromEntries(countActiveWorkersByUnitId(workers)), {
    "unit-a": 2,
    "unit-b": 1,
  });
});
