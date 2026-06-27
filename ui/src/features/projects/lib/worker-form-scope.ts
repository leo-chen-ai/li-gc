export type WorkerFormScopeSelection =
  | { kind: "all" }
  | { kind: "unit"; unitName: string }
  | { kind: "team"; unitName: string; teamName: string };

type ScopeUnit = {
  id: string;
  company_name?: string | null;
};

type ScopeTeam = {
  id: string;
  unit_id: string;
  name?: string | null;
  work_type?: number | null;
};

export function resolveWorkerFormScopeDefaults(
  units: ScopeUnit[],
  teams: ScopeTeam[],
  selection: WorkerFormScopeSelection
) {
  if (selection.kind === "team") {
    const unit = units.find((item) => item.company_name === selection.unitName);
    const team = teams.find(
      (item) => item.name === selection.teamName && (!unit || item.unit_id === unit.id)
    );

    return {
      unit_id: unit?.id ?? team?.unit_id ?? units[0]?.id ?? "",
      team_id: team?.id ?? "",
      work_type: team?.work_type == null ? "" : String(team.work_type),
    };
  }

  if (selection.kind === "unit") {
    const unit = units.find((item) => item.company_name === selection.unitName);
    const team = unit ? teams.find((item) => item.unit_id === unit.id) : undefined;

    return {
      unit_id: unit?.id ?? units[0]?.id ?? "",
      team_id: team?.id ?? "",
      work_type: team?.work_type == null ? "" : String(team.work_type),
    };
  }

  const unit = units[0];
  const team = unit ? teams.find((item) => item.unit_id === unit.id) ?? teams[0] : teams[0];

  return {
    unit_id: unit?.id ?? team?.unit_id ?? "",
    team_id: team?.id ?? "",
    work_type: team?.work_type == null ? "" : String(team.work_type),
  };
}
