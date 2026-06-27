import type { ConstructionOverview } from "../types/construction-types";

export type AdminOverviewTone = "good" | "warn" | "danger" | "neutral";

export type AdminOverviewKpiIcon = "projects" | "units" | "teams" | "workers" | "attendance" | "platform" | "wages";

export type AdminOverviewKpi = {
  label: string;
  value: string;
  helper: string;
  progress: number;
  tone: AdminOverviewTone;
  icon: AdminOverviewKpiIcon;
};

export type AdminOverviewMatrixRow = {
  label: string;
  current: string;
  detail: string;
  health: string;
  risk: string;
  action: string;
  score: number;
  tone: AdminOverviewTone;
};

export type AdminOverviewMetrics = {
  kpis: AdminOverviewKpi[];
  matrixRows: AdminOverviewMatrixRow[];
  wage: {
    payableCents: number;
    paidCents: number;
    unpaidCents: number;
    paidRate: number;
  };
  attendance: {
    sevenDayCount: number;
    sevenDayAverage: number;
    peakCount: number;
  };
  platform: {
    successCount: number;
    failedCount: number;
    totalCount: number;
    successRate: number;
  };
  projects: {
    activeCount: number;
    otherCount: number;
  };
};

export function buildAdminOverviewMetrics(data: ConstructionOverview | undefined): AdminOverviewMetrics {
  const projectCount = data?.project_count ?? 0;
  const unitCount = data?.unit_count ?? 0;
  const teamCount = data?.team_count ?? 0;
  const workerCount = data?.worker_count ?? 0;
  const todayAttendanceCount = data?.today_attendance_count ?? 0;
  const payableCents = data?.wage_payable_amount_cents ?? 0;
  const paidCents = data?.wage_paid_amount_cents ?? 0;
  const unpaidCents = data?.wage_unpaid_amount_cents ?? Math.max(0, payableCents - paidCents);
  const paidRate = rateFromBasisPoints(data?.wage_paid_rate_basis_points, payableCents > 0 ? paidCents / payableCents : 0);
  const attendanceTrend = data?.attendance_trend ?? [];
  const sevenDayCount = data?.attendance_7day_count ?? attendanceTrend.reduce((sum, item) => sum + item.count, 0);
  const sevenDayAverage = data?.attendance_7day_average ?? (attendanceTrend.length > 0 ? sevenDayCount / attendanceTrend.length : 0);
  const peakCount = attendanceTrend.reduce((max, item) => Math.max(max, item.count), 0);
  const activeCount = data?.project_active_count ?? (data?.project_status_distribution ?? [])
    .filter((item) => String(item.status) === "1")
    .reduce((sum, item) => sum + item.count, 0);
  const otherCount = data?.project_other_count ?? Math.max(0, projectCount - activeCount);
  const platformStatusMap = new Map((data?.platform_status_distribution ?? []).map((item) => [item.status, item.count]));
  const successCount = data?.platform_success_count ?? platformStatusMap.get("success") ?? 0;
  const failedCount = data?.platform_failed_count ?? platformStatusMap.get("failed") ?? 0;
  const totalCount = (data?.platform_status_distribution ?? []).reduce((sum, item) => sum + item.count, 0);
  const successRate = rateFromBasisPoints(data?.platform_success_rate_basis_points, totalCount > 0 ? successCount / totalCount : 1);
  const attendanceRate = workerCount > 0 ? todayAttendanceCount / workerCount : 0;

  return {
    kpis: [
      { label: "项目", value: String(projectCount), helper: `进行中 ${activeCount}`, progress: projectCount > 0 ? activeCount / projectCount : 0, tone: otherCount > 0 ? "warn" : "good", icon: "projects" },
      { label: "单位", value: String(unitCount), helper: `参建单位`, progress: unitCount > 0 ? 1 : 0, tone: unitCount > 0 ? "good" : "neutral", icon: "units" },
      { label: "班组", value: String(teamCount), helper: `施工班组`, progress: teamCount > 0 ? 1 : 0, tone: teamCount > 0 ? "good" : "neutral", icon: "teams" },
      { label: "工人", value: String(workerCount), helper: `实名人员`, progress: workerCount > 0 ? 1 : 0, tone: workerCount > 0 ? "good" : "neutral", icon: "workers" },
      { label: "今日考勤", value: String(todayAttendanceCount), helper: `7日 ${sevenDayCount}`, progress: Math.min(1, attendanceRate), tone: attendanceRate >= 0.7 ? "good" : "warn", icon: "attendance" },
      { label: "平台请求", value: String(data?.platform_today_request_count ?? 0), helper: `成功率 ${formatPercent(successRate)}`, progress: successRate, tone: failedCount > 0 ? "warn" : "good", icon: "platform" },
      { label: "未发工资", value: formatMoneyCompact(unpaidCents), helper: `发放率 ${formatPercent(paidRate)}`, progress: paidRate, tone: unpaidCents > 0 ? "warn" : "good", icon: "wages" },
    ],
    matrixRows: [
      {
        label: "项目状态",
        current: `${projectCount} 个项目`,
        detail: `进行中 ${activeCount} · 其他 ${otherCount}`,
        health: otherCount > 0 ? "关注" : "良好",
        risk: otherCount > 0 ? "中风险" : "低风险",
        action: otherCount > 0 ? "核对非进行中项目状态" : "保持项目台账更新",
        score: projectCount > 0 ? activeCount / projectCount : 0,
        tone: otherCount > 0 ? "warn" : "good",
      },
      {
        label: "劳务规模",
        current: `${workerCount} 人`,
        detail: `单位 ${unitCount} · 班组 ${teamCount}`,
        health: workerCount > 0 ? "良好" : "待补",
        risk: workerCount > 0 ? "低风险" : "中风险",
        action: workerCount > 0 ? "维护人员实名信息" : "补充单位、班组和工人",
        score: workerCount > 0 ? 0.85 : 0,
        tone: workerCount > 0 ? "good" : "warn",
      },
      {
        label: "考勤活跃",
        current: `${todayAttendanceCount} 次`,
        detail: `7日 ${sevenDayCount} · 日均 ${formatDecimal(sevenDayAverage)}`,
        health: attendanceRate >= 0.7 ? "良好" : "一般",
        risk: attendanceRate >= 0.7 ? "低风险" : "中风险",
        action: attendanceRate >= 0.7 ? "持续核对打卡完整性" : "提醒班组补充考勤",
        score: Math.min(1, attendanceRate),
        tone: attendanceRate >= 0.7 ? "good" : "warn",
      },
      {
        label: "工资风险",
        current: `${formatMoneyCompact(unpaidCents)} 未发`,
        detail: `应发 ${formatMoneyCompact(payableCents)} · 已发 ${formatMoneyCompact(paidCents)}`,
        health: unpaidCents > 0 ? "关注" : "良好",
        risk: unpaidCents > 0 ? "中风险" : "低风险",
        action: unpaidCents > 0 ? "尽快完成工资确认" : "保持工资发放闭环",
        score: paidRate,
        tone: unpaidCents > 0 ? "warn" : "good",
      },
      {
        label: "平台对接",
        current: `${data?.platform_today_request_count ?? 0} 次请求`,
        detail: `成功 ${successCount} · 失败 ${failedCount}`,
        health: failedCount > 0 ? "关注" : "良好",
        risk: failedCount > 0 ? "中风险" : "低风险",
        action: failedCount > 0 ? "查看失败日志并重试" : "保持平台同步正常",
        score: successRate,
        tone: failedCount > 0 ? "warn" : "good",
      },
    ],
    wage: { payableCents, paidCents, unpaidCents, paidRate },
    attendance: { sevenDayCount, sevenDayAverage, peakCount },
    platform: { successCount, failedCount, totalCount, successRate },
    projects: { activeCount, otherCount },
  };
}

export function formatMoneyCompact(cents: number) {
  const amount = Math.max(0, cents) / 100;
  return `${(amount / 10000).toFixed(2).replace(/\.?0+$/, "")}万`;
}

export function formatPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${(safeValue * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatDecimal(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function rateFromBasisPoints(value: number | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value / 10000));
  }

  return Math.max(0, Math.min(1, Number.isFinite(fallback) ? fallback : 0));
}
