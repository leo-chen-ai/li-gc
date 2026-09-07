import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  getFieldOptionLabel,
  workerFormFields,
} from "@/features/projects/data/construction-form-fields";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import type {
  ConstructionAttendanceCalendarRow,
  ConstructionPersonnelWorker,
} from "@/features/projects/types/construction-types";
import { useDashboardProjectsMap } from "../hooks/use-dashboard-queries";

const TABS = [
  "职业履历",
  "工资信息",
  "考勤统计",
  "投诉记录",
  "资格证书",
  "注册证书",
  "不良行为",
  "代领信息",
] as const;

type TabName = (typeof TABS)[number];
const ENABLED_TABS: TabName[] = ["职业履历", "考勤统计"];

function collectPhotoUrls(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("http") || trimmed.startsWith("data:") || trimmed.startsWith("/")) {
      return [trimmed];
    }
    try {
      return collectPhotoUrls(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectPhotoUrls(item));
  if (typeof value === "object" && value && "url" in value) {
    return collectPhotoUrls((value as { url?: unknown }).url);
  }
  return [];
}

function maskPhone(phone?: string | null) {
  const raw = (phone ?? "").trim();
  if (!raw) return "—";
  if (raw.length <= 3) return `${raw}********`;
  return `${raw.slice(0, 3)}********`;
}

function maskIdCard(id?: string | null, reveal = false) {
  const raw = (id ?? "").trim();
  if (!raw) return "—";
  if (reveal || raw.length < 10) return raw;
  return `${raw.slice(0, 6)}${"*".repeat(Math.max(0, raw.length - 8))}${raw.slice(-2)}`;
}

function formatYm(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelOf(key: string, value: string | number | boolean | null | undefined) {
  return getFieldOptionLabel(workerFormFields, key, value, "—");
}

function workStatusLabel(status?: number | null) {
  if (status === 1) return "在场";
  if (status === 2) return "退场";
  return "—";
}

type Props = {
  projectId: string;
  workerId: string;
  onClose: () => void;
};

export function WorkerDetailModal({ projectId, workerId, onClose }: Props) {
  const [tab, setTab] = useState<TabName>("职业履历");
  const [worker, setWorker] = useState<ConstructionPersonnelWorker | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealId, setRevealId] = useState(false);
  const [month, setMonth] = useState(formatYm());
  const [filterProjectId, setFilterProjectId] = useState(projectId);
  const [calendarRow, setCalendarRow] = useState<ConstructionAttendanceCalendarRow | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const { data: projects } = useDashboardProjectsMap();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    constructionProjectService
      .getPersonnelWorker(workerId)
      .then((data) => {
        if (!cancelled) setWorker(data);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("获取人员详情失败");
          setWorker(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  useEffect(() => {
    if (tab !== "考勤统计" || !filterProjectId) return;
    let cancelled = false;
    setAttLoading(true);
    constructionProjectService
      .getAttendanceCalendar(filterProjectId, {
        month,
        worker_id: workerId,
        page: 1,
        page_size: 1,
      })
      .then((res) => {
        if (!cancelled) setCalendarRow(res.items[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setCalendarRow(null);
          toast.error("获取考勤统计失败");
        }
      })
      .finally(() => {
        if (!cancelled) setAttLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, filterProjectId, month, workerId]);

  const photo = useMemo(() => collectPhotoUrls(worker?.avatar)[0] ?? null, [worker]);

  const attendDays = useMemo(() => {
    if (!calendarRow) return 0;
    return calendarRow.days.filter((d) => d.first_in_time || d.last_out_time || (d.work_point ?? 0) > 0)
      .length;
  }, [calendarRow]);

  const workPoints = useMemo(() => {
    if (!calendarRow) return 0;
    return Math.round(calendarRow.total_work_point ?? 0);
  }, [calendarRow]);

  const onTabClick = (name: TabName) => {
    if (!ENABLED_TABS.includes(name)) {
      toast.info("暂未开放");
      return;
    }
    setTab(name);
  };

  return (
    <div className="pb-wd-mask" onClick={onClose}>
      <div
        className="pb-wd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="人员详情"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pb-wd-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className="pb-wd-title">人员详情</div>

        {loading ? (
          <div className="pb-wd-loading">加载中…</div>
        ) : !worker ? (
          <div className="pb-wd-loading">未找到人员信息</div>
        ) : (
          <>
            <div className="pb-wd-profile">
              <div className="pb-wd-photo">
                {photo ? <img src={photo} alt="" /> : <span>{(worker.name ?? "?").slice(0, 1)}</span>}
              </div>
              <div className="pb-wd-fields">
                <Field label="工人姓名" value={worker.name || "—"} />
                <Field label="性别" value={labelOf("gender", worker.gender)} />
                <Field label="籍贯" value={labelOf("native_place", worker.native_place)} />

                <Field label="民族" value={worker.nation || "—"} />
                <Field label="文化程度" value={labelOf("education", worker.education)} />
                <Field
                  label="出生日期"
                  value={
                    worker.id_card && worker.id_card.length >= 14
                      ? `${worker.id_card.slice(6, 10)}年${worker.id_card.slice(10, 12)}月`
                      : "—"
                  }
                />

                <Field label="政治面貌" value={labelOf("political_status", worker.political_status)} />
                <Field label="证件类型" value="身份证" />
                <Field
                  label="证件号码"
                  value={
                    <span className="pb-wd-idline">
                      {maskIdCard(worker.id_card, revealId)}
                      {worker.id_card ? (
                        <button type="button" className="pb-wd-link" onClick={() => setRevealId((v) => !v)}>
                          {revealId ? "隐藏" : "查看"}
                        </button>
                      ) : null}
                    </span>
                  }
                />

                <Field label="手机号码" value={maskPhone(worker.phone)} />
                <Field label="婚姻状况" value="—" />
                <Field label="国籍" value="中国" />

                <Field label="紧急联系人" value="—" />
                <Field label="紧急联系方式" value="—" />
                <Field
                  label="详细地址"
                  value={worker.current_address || worker.address || "—"}
                />
              </div>
            </div>

            <div className="pb-wd-tabs">
              {TABS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`pb-wd-tab ${tab === name ? "active" : ""}`}
                  onClick={() => onTabClick(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="pb-wd-tab-body">
              {tab === "职业履历" ? (
                <div className="pb-wd-table-wrap">
                  <table className="pb-wd-table">
                    <thead>
                      <tr>
                        <th>所属项目</th>
                        <th>进场日期</th>
                        <th>退场时间</th>
                        <th>所属企业</th>
                        <th>所属班组</th>
                        <th>工种</th>
                        <th>合同</th>
                        <th>状态</th>
                        <th>评价</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td title={worker.project_name ?? ""}>{worker.project_name || "—"}</td>
                        <td>{(worker.entry_time ?? "").slice(0, 10) || "—"}</td>
                        <td>{(worker.exit_time ?? "").slice(0, 10) || "—"}</td>
                        <td title={worker.unit_name ?? ""}>{worker.unit_name || "—"}</td>
                        <td title={worker.team_name ?? ""}>{worker.team_name || "—"}</td>
                        <td>{labelOf("work_type", worker.work_type)}</td>
                        <td>—</td>
                        <td>{workStatusLabel(worker.work_status)}</td>
                        <td>—</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="pb-wd-pager">共 1 条</div>
                </div>
              ) : null}

              {tab === "考勤统计" ? (
                <div className="pb-wd-att">
                  <div className="pb-wd-att-filters">
                    <label>
                      选择项目
                      <select
                        value={filterProjectId}
                        onChange={(e) => setFilterProjectId(e.target.value)}
                      >
                        {(projects ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      出勤年月
                      <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                      />
                    </label>
                    <button type="button" className="pb-wd-btn primary" onClick={() => setMonth((m) => m)}>
                      查询
                    </button>
                    <button
                      type="button"
                      className="pb-wd-btn"
                      onClick={() => toast.info("导出功能暂未开放")}
                    >
                      导出
                    </button>
                    <span className="pb-wd-att-sum">
                      累计出勤天数: {attendDays}天
                      <em>累计记工数: {workPoints}</em>
                    </span>
                  </div>

                  <div className="pb-wd-table-wrap">
                    <table className="pb-wd-table">
                      <thead>
                        <tr>
                          <th>所属项目</th>
                          <th>所属企业</th>
                          <th>所属班组</th>
                          <th>工种</th>
                          <th>出勤年月</th>
                          <th>出勤天数</th>
                          <th>记工数</th>
                          <th>补工天数</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attLoading ? (
                          <tr>
                            <td colSpan={9}>加载中…</td>
                          </tr>
                        ) : calendarRow ? (
                          <tr>
                            <td>{worker.project_name || "—"}</td>
                            <td>{worker.unit_name || "—"}</td>
                            <td>{calendarRow.team_name || worker.team_name || "—"}</td>
                            <td>{labelOf("work_type", worker.work_type)}</td>
                            <td>{month}</td>
                            <td>{attendDays}</td>
                            <td>{workPoints}</td>
                            <td>0</td>
                            <td>
                              <button
                                type="button"
                                className="pb-wd-link"
                                onClick={() => toast.info("考勤明细暂未开放")}
                              >
                                考勤明细
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={9}>暂无数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div className="pb-wd-pager">共 {calendarRow ? 1 : 0} 条</div>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="pb-wd-field">
      <span className="pb-wd-field-label">{label}:</span>
      <span className="pb-wd-field-value">{value}</span>
    </div>
  );
}
