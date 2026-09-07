import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import {
  useProjectBoard,
  useAttendanceFeed,
  useTodayHourly,
  useDashboardProjectsMap,
} from "../hooks/use-dashboard-queries";
import { ScreenStage } from "./ScreenStage";
import { TodayAttendanceFeed } from "./TodayAttendanceFeed";

const PIE_COLORS = [
  "#2f6fd6",
  "#7ddec8",
  "#a8e05f",
  "#e89a8a",
  "#d4b896",
  "#8eb8e8",
  "#9b8ec4",
  "#d4924a",
  "#4ecdc4",
  "#5ecf6a",
  "#f0c75e",
  "#6aa8ff",
];

const BAR_FILLS = [
  { top: "#5ee7ff", bottom: "#1a6fb8" },
  { top: "#ffb347", bottom: "#c46a12" },
  { top: "#b07dff", bottom: "#5b3bb8" },
  { top: "#ffd166", bottom: "#c48a18" },
];

const TABS = [
  "政企联动",
  "AI识别",
  "全景展示",
  "劳务实名制",
  "视频监控",
  "绿色工地",
  "数字孪生动画",
  "电子围栏",
  "质量安全",
  "智能安全帽",
  "塔吊监测",
  "升降机监测",
  "施工管理",
  "智能烟感",
];

const DEFAULT_TAB = "劳务实名制";

const AXIS_TICK = { fill: "rgba(255,255,255,0.88)", fontSize: 11 };
const GRID_STROKE = "rgba(180, 200, 230, 0.28)";
const tooltipStyle = {
  background: "rgba(6,22,48,0.96)",
  border: "1px solid rgba(0,220,255,0.35)",
  borderRadius: 6,
  color: "#e4f0fa",
  fontSize: 11,
  boxShadow: "0 4px 20px rgba(0,180,255,0.2)",
};

// ── Fullscreen toggle (shared pattern from MainDashboard) ──────────────

function useBoardClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function BoardClock() {
  const now = useBoardClock();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const weekdays = ["星期天", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return (
    <div className="db-header-time">
      {dateStr} {timeStr} {weekdays[now.getDay()]}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────

function P({
  title,
  subtitle,
  children,
  className = "",
  style,
  scrollable = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  scrollable?: boolean;
}) {
  return (
    <div className={`pb-panel ${className}`} style={style}>
      <div className="pb-panel-bg" />
      <div className="pb-panel-glow" />
      <div className="pb-panel-corner pb-panel-corner-tl" />
      <div className="pb-panel-corner pb-panel-corner-tr" />
      <div className="pb-panel-corner pb-panel-corner-bl" />
      <div className="pb-panel-corner pb-panel-corner-br" />
      <div className="pb-title pb-title-bar-img">
        <span className="pb-title-text">{title}</span>
        {subtitle && <span className="pb-title-sub">{subtitle}</span>}
      </div>
      <div className={scrollable ? "pb-content" : "pb-content pb-content-no-scroll"}>{children}</div>
    </div>
  );
}

// ── Project switcher (header right) ──────────────────────────────────────

function ProjectSwitcher({
  currentId,
  currentName,
}: {
  currentId: string;
  currentName?: string;
}) {
  const navigate = useNavigate();
  const { data: projects } = useDashboardProjectsMap();
  const [open, setOpen] = useState(false);
  const list = projects ?? [];

  return (
    <div className="db-switcher">
      <button className="db-switcher-btn" onClick={() => setOpen((o) => !o)}>
        <span className="db-switcher-name">{currentName ?? "选择项目"}</span>
        <span className="db-switcher-arrow">▾</span>
      </button>
      {open && (
        <>
          <div className="db-switcher-mask" onClick={() => setOpen(false)} />
          <div className="db-switcher-menu">
            {list.length === 0 && (
              <div className="db-switcher-empty">暂无可切换项目</div>
            )}
            {list.map((p) => (
              <button
                key={p.id}
                className={`db-switcher-item ${p.id === currentId ? "active" : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (p.id !== currentId) {
                    navigate({
                      to: "/app/data-screen/project/$projectId",
                      params: { projectId: p.id },
                    });
                  }
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Work-in-progress placeholder for unfinished tabs ─────────────────────

function BoardWip({ tab }: { tab: string }) {
  return (
    <div className="pb-wip">
      <svg
        width="72"
        height="72"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path
          d="M8 21h8M12 17v4M7 9l2.5 2.5L7 14M13 13h4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="pb-wip-title">「{tab}」大屏开发中</div>
      <div className="pb-wip-sub">STAY TUNED</div>
    </div>
  );
}

// ── Project Board ────────────────────────────────────────────────────────

type Props = { projectId: string };

export function ProjectBoard({ projectId }: Props) {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  const { data: board, isLoading: boardLoading } = useProjectBoard(projectId);
  const { data: feed } = useAttendanceFeed(projectId);
  const { data: hourly } = useTodayHourly(projectId);

  // Lock body scroll while dashboard is mounted
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.body.style.height;
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.height = prevHeight;
    };
  }, []);

  const hourlyData = useMemo(
    () => (hourly ?? []).map((h) => ({ hour: h.hour, count: h.count })),
    [hourly],
  );

  const barData = useMemo(() => {
    if (!board) return [];
    return [
      { name: "在册工人", value: board.project.activeWorkers },
      { name: "日均出勤", value: Math.round(board.dailyAvgAttendance) },
      { name: "今日出勤", value: board.todayAttendanceCount },
      {
        name: "场内人数",
        value: board.teamAttendance.reduce((s, t) => s + t.onSiteCount, 0),
      },
    ];
  }, [board]);

  const pieData = useMemo(() => {
    const list = board?.workerTypeDistribution ?? [];
    if (list.length === 0) {
      return [{ workerTypeName: "暂无", count: 1, empty: true }];
    }
    return list.map((d) => ({ ...d, empty: false }));
  }, [board]);

  const statusLabel = useCallback((s?: number | null) => {
    if (s === 5) return "在建";
    if (s === 6) return "完工";
    if (s === 8) return "竣工";
    if (s === 7) return "停工";
    if (s === 3) return "筹备";
    return "—";
  }, []);

  const overviewLines = useMemo(() => {
    const p = board?.project;
    const realNamePct =
      p && p.totalWorkers > 0
        ? ((p.activeWorkers / p.totalWorkers) * 100).toFixed(2)
        : "0.00";
    const dash = (v?: string | null) => (v && String(v).trim() ? v : "—");
    return [
      { fields: [{ l: "项目名称", v: dash(p?.name) }] },
      { fields: [{ l: "项目编号", v: dash(p?.id) }] },
      {
        fields: [
          { l: "项目状态", v: statusLabel(p?.status) },
          {
            l: "总投资",
            v: p?.investmentAmount ? `${p.investmentAmount}万元` : "—",
          },
        ],
      },
      {
        fields: [
          { l: "总面积", v: "—" },
          { l: "总长度", v: "-米" },
        ],
      },
      {
        fields: [
          { l: "建设性质", v: "—" },
          { l: "工程用途", v: "—" },
        ],
      },
      {
        fields: [
          { l: "项目分类", v: "—" },
          { l: "实名制进度", v: `${realNamePct}%` },
        ],
      },
      { fields: [{ l: "所在区域", v: dash(p?.area) }] },
      { fields: [{ l: "总承包单位", v: dash(p?.contractor) }] },
      {
        fields: [{ l: "总承包单位统一社会信用代码", v: "—" }],
      },
    ];
  }, [board, statusLabel]);

  return (
    <ScreenStage>
    <div className="dashboard-root pb-root">
      <div className="pb-bg-image" />

      <div className="db-content pb-content-wrap">
        {/* Header — 切图：看板顶部背景图 */}
        <div className="db-header db-header-board">
          <div className="db-header-left">
            <div className="db-brand db-brand-sm">
              <span className="db-brand-mark">山</span>
              <div className="db-brand-text">
                <span className="db-brand-name">山淮筑</span>
                <span className="db-brand-sub">SHANHUAI.TOP</span>
              </div>
            </div>
            <BoardClock />
          </div>
          <div className="db-header-center">
            <div className="db-header-title db-header-title-board">
              {board?.project.name ?? "项目看板"}
            </div>
          </div>
          <div className="db-header-right">
            <ProjectSwitcher
              currentId={projectId}
              currentName={board?.project.name}
            />
          </div>
        </div>

        {/* Tabs — 切图：tab背景图 / 选中后的tab背景图 */}
        <div className="db-board-tabs">
          {TABS.map((tab) => (
            <div
              key={tab}
              className={`db-board-tab ${tab === activeTab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              <span>{tab}</span>
            </div>
          ))}
        </div>

        {/* Body — 参考三列：左概况+小时图 / 中班组+(日均|工种) / 右出勤通高 */}
        {boardLoading && !board ? (
          <div className="pb-loading">
            <span className="pb-loading-dot" />
            <span className="pb-loading-dot" />
            <span className="pb-loading-dot" />
          </div>
        ) : activeTab === DEFAULT_TAB ? (
        <div className="pb-grid">
          <P title="项目概况" className="pb-flex-overview">
            <div className="pb-info-list">
              {overviewLines.map((line, i) => (
                <div
                  key={i}
                  className={`pb-info-line ${line.fields.length > 1 ? "pair" : "full"}`}
                >
                  {line.fields.map((f) => (
                    <div key={f.l} className="pb-info-field">
                      <span className="pb-info-label">{f.l}:</span>
                      <span className="pb-info-value" title={f.v}>
                        {f.v}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </P>

          <P title="今日各班组出勤情况" className="pb-flex-team">
            <div className="pb-team-wrap">
              <div className="pb-team-head">
                <span className="pb-team-h-idx">序号</span>
                <span className="pb-team-h-name">班组名称</span>
                <span className="pb-team-h-cen">今日出勤</span>
                <span className="pb-team-h-cen">今日在场</span>
                <span className="pb-team-h-cen">班组总人数</span>
                <span className="pb-team-h-cen">出勤率</span>
              </div>
              <ul className="pb-team-list">
                {(board?.teamAttendance ?? []).slice(0, 6).map((t, i) => {
                  const bdClass =
                    i === 0 ? "bd" : i === 1 ? "bd2" : i === 2 ? "bd3" : "bd4";
                  return (
                    <li
                      key={t.teamName}
                      className={i % 2 === 0 ? "pb-team-item item2" : "pb-team-item item"}
                    >
                      <div className="pb-team-idx-wrap">
                        <div className={`pb-team-bd ${bdClass}`}>{i + 1}</div>
                      </div>
                      <p className="pb-team-name" title={t.teamName}>
                        {t.teamName}
                      </p>
                      <p className="pb-team-cen pb-team-att">{t.attendanceCount}</p>
                      <p className="pb-team-cen pb-team-onsite">{t.onSiteCount}</p>
                      <p className="pb-team-cen pb-team-total">{t.totalCount}</p>
                      <p className="pb-team-cen pb-team-rate">
                        {t.attendanceRate.toFixed(2)}%
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </P>

          <div className="pb-cell-right">
            <P title="今日出勤" className="pb-flex-full" scrollable={false}>
              <TodayAttendanceFeed projectId={projectId} items={feed ?? []} />
            </P>
          </div>

          <P title="今日出勤情况" className="pb-flex-hourly" scrollable={false}>
            <div className="pb-chart-wrap pb-chart-ref">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData} margin={{ top: 28, right: 18, bottom: 8, left: 4 }}>
                  <defs>
                    <linearGradient id="pbHourlyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ecbff" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#3ecbff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: "rgba(140,160,210,0.35)" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    label={{
                      value: "人数",
                      position: "top",
                      offset: 12,
                      fill: "rgba(255,255,255,0.9)",
                      fontSize: 12,
                    }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3ecbff"
                    strokeWidth={2}
                    fill="url(#pbHourlyFill)"
                    dot={{ r: 3, fill: "#3ecbff", strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: "#7ae4ff" }}
                    isAnimationActive={false}
                    name="人数"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </P>

          <div className="pb-charts-row">
            <P title="日均出勤统计" className="pb-flex-1" scrollable={false}>
              <div className="pb-chart-wrap pb-chart-ref">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 28, right: 12, bottom: 8, left: 4 }} barCategoryGap="28%">
                    <defs>
                      {BAR_FILLS.map((c, i) => (
                        <linearGradient key={i} id={`pbBarFill${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c.top} stopOpacity={1} />
                          <stop offset="100%" stopColor={c.bottom} stopOpacity={1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid
                      stroke={GRID_STROKE}
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      label={{
                        value: "人数",
                        position: "top",
                        offset: 12,
                        fill: "rgba(255,255,255,0.9)",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false} name="人数">
                      {barData.map((_, i) => (
                        <Cell key={i} fill={`url(#pbBarFill${i % BAR_FILLS.length})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </P>

            <P title="项目各工种人数占比" className="pb-flex-1" scrollable={false}>
              <div className="pb-chart-wrap pb-chart-with-legend pb-chart-ref">
                <div className="pb-pie-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="48%"
                        innerRadius="52%"
                        outerRadius="78%"
                        paddingAngle={pieData.length > 1 && !pieData[0].empty ? 1.5 : 0}
                        dataKey="count"
                        nameKey="workerTypeName"
                        stroke="rgba(4, 20, 48, 0.85)"
                        strokeWidth={2}
                        isAnimationActive={false}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        label={false as any}
                      >
                        {pieData.map((d, i) => (
                          <Cell
                            key={d.workerTypeName}
                            fill={
                              d.empty
                                ? "rgba(120,160,200,0.2)"
                                : PIE_COLORS[i % PIE_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pb-pie-legend">
                  {pieData
                    .filter((d) => !d.empty)
                    .map((d, i) => (
                      <div key={d.workerTypeName} className="pb-pie-legend-item">
                        <span
                          className="pb-pie-legend-dot"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="pb-pie-legend-name" title={d.workerTypeName}>
                          {d.workerTypeName}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </P>
          </div>
        </div>
        ) : (
          <BoardWip tab={activeTab} />
        )}
      </div>
    </div>
    </ScreenStage>
  );
}
