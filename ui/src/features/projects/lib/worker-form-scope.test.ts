import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkerFormScopeDefaults } from "./worker-form-scope.ts";

const units = [
  { id: "unit-1", company_name: "总包单位" },
  { id: "unit-2", company_name: "劳务单位" },
];

const teams = [
  { id: "team-1", unit_id: "unit-1", name: "钢筋班", work_type: 1 },
  { id: "team-2", unit_id: "unit-2", name: "木工班", work_type: 2 },
];

test("resolves selected team to worker form unit and team defaults", () => {
  assert.deepEqual(
    resolveWorkerFormScopeDefaults(units, teams, {
      kind: "team",
      unitName: "劳务单位",
      teamName: "木工班",
    }),
    {
      unit_id: "unit-2",
      team_id: "team-2",
      work_type: "2",
    }
  );
});

test("resolves selected unit to unit default and first team under it", () => {
  assert.deepEqual(
    resolveWorkerFormScopeDefaults(units, teams, {
      kind: "unit",
      unitName: "总包单位",
    }),
    {
      unit_id: "unit-1",
      team_id: "team-1",
      work_type: "1",
    }
  );
});
