import type { AttendanceRecord, ConstructionUnit, Project, Team, Worker } from "../data/mock-projects";

type StatusLine = {
  value: string;
  done: boolean;
  attention?: boolean;
  count?: number;
};

export type ProjectOverviewAudit = {
  completeness: {
    basicInfo: number;
    unitInfo: number;
    teamInfo: number;
    realNameAttendance: number;
  };
  workPermit: StatusLine;
  unitMatch: StatusLine;
  teamAttendance: StatusLine;
  attendanceExceptions: StatusLine;
  pendingRiskCount: number;
  recommendation: string;
};

type ProjectOverviewInputs = {
  units: ConstructionUnit[];
  teams: Team[];
  workers: Worker[];
  attendance: AttendanceRecord[];
};

const EMPTY_LABELS = new Set(["未填写", "待办理", "未命名项目", "未命名单位", "未命名班组", "未命名工人", "未匹配单位", "未匹配班组", "未匹配工人"]);

export function countTodayEntries(records: AttendanceRecord[], now = new Date()): number {
  const today = toDateKey(now);

  return records.filter((record) => record.direction === "进场" && dateKeyFromValue(record.time) === today).length;
}

export function buildProjectOverviewAudit(
  project: Project,
  { units, teams, workers, attendance }: ProjectOverviewInputs
): ProjectOverviewAudit {
  const missingTeamAttendanceCount = teams.filter(
    (team) => !isFilled(team.attendanceStart) || !isFilled(team.attendanceEnd)
  ).length;
  const attendanceExceptionCount = attendance.filter((record) => record.status !== "有效").length;
  const workPermitDone = isFilled(project.workPermit) && project.workPermit !== "待办理";
  const unitMatched = units.length > 0;

  const workPermit: StatusLine = {
    value: workPermitDone ? "已填写" : "待办理",
    done: workPermitDone,
    attention: !workPermitDone,
    count: workPermitDone ? 0 : 1,
  };
  const unitMatch: StatusLine = {
    value: unitMatched ? "已匹配" : "未匹配",
    done: unitMatched,
    attention: !unitMatched,
    count: unitMatched ? 0 : 1,
  };
  const teamAttendance: StatusLine = {
    value: buildTeamAttendanceValue(teams.length, missingTeamAttendanceCount),
    done: teams.length > 0 && missingTeamAttendanceCount === 0,
    attention: teams.length === 0 || missingTeamAttendanceCount > 0,
    count: teams.length === 0 ? 1 : missingTeamAttendanceCount,
  };
  const attendanceExceptions: StatusLine = {
    value: attendanceExceptionCount > 0 ? `${attendanceExceptionCount} 条待补图` : "暂无异常",
    done: attendanceExceptionCount === 0,
    attention: attendanceExceptionCount > 0,
    count: attendanceExceptionCount,
  };
  const riskLines = [workPermit, unitMatch, teamAttendance, attendanceExceptions];

  return {
    completeness: {
      basicInfo: completeness([
        project.name,
        project.code,
        project.workPermit,
        project.address,
        project.contractor,
        project.buildUnit,
        project.manager,
        project.managerPhone,
        project.startDate,
        project.finishDate,
        project.investment,
        project.laborCost,
        project.area,
        project.realNameManager,
        project.laborManager,
      ]),
      unitInfo: averageCompleteness(
        units,
        (unit) => [unit.name, unit.type, unit.creditCode, unit.manager, unit.phone, unit.salaryType]
      ),
      teamInfo: averageCompleteness(
        teams,
        (team) => [team.name, team.unitName, team.type, team.leader, team.phone, team.salaryType, team.attendanceStart, team.attendanceEnd]
      ),
      realNameAttendance: buildRealNameAttendanceCompleteness(workers, attendance),
    },
    workPermit,
    unitMatch,
    teamAttendance,
    attendanceExceptions,
    pendingRiskCount: riskLines.filter((line) => !line.done).length,
    recommendation: buildRecommendation(unitMatch, teamAttendance, attendanceExceptions, workPermit),
  };
}

function buildRealNameAttendanceCompleteness(workers: Worker[], attendance: AttendanceRecord[]) {
  if (workers.length === 0) return 0;

  const activeWorkerCount = workers.filter((worker) => worker.status === "在场").length;
  const workerCompleteness = activeWorkerCount / workers.length;
  const attendanceCompleteness =
    attendance.length === 0
      ? 0
      : attendance.filter((record) => record.status === "有效").length / attendance.length;

  return Math.round(((workerCompleteness + attendanceCompleteness) / 2) * 100);
}

function averageCompleteness<T>(records: T[], valuesForRecord: (record: T) => unknown[]) {
  if (records.length === 0) return 0;

  const values = records.flatMap(valuesForRecord);
  return completeness(values);
}

function completeness(values: unknown[]) {
  if (values.length === 0) return 0;

  const filled = values.filter(isFilled).length;
  return Math.round((filled / values.length) * 100);
}

function isFilled(value: unknown) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  const normalized = String(value).trim();
  return normalized.length > 0 && !EMPTY_LABELS.has(normalized);
}

function buildRecommendation(...lines: StatusLine[]) {
  const pending = lines.filter((line) => !line.done);

  if (pending.length === 0) return "当前关键资料已完成，继续关注考勤更新。";

  return `建议优先处理${pending.map((line) => line.value).join("、")}。`;
}

function buildTeamAttendanceValue(teamCount: number, missingTeamAttendanceCount: number) {
  if (teamCount === 0) return "无班组";
  if (missingTeamAttendanceCount > 0) return `${missingTeamAttendanceCount} 个班组待核对`;
  return "已核对";
}

function dateKeyFromValue(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : toDateKey(date);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
