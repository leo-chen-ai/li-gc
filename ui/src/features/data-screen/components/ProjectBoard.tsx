import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
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
  LabelList,
} from "recharts";
import {
  useProjectBoard,
  useAttendanceFeed,
  useTodayHourly,
  useDashboardProjectsMap,
} from "../hooks/use-dashboard-queries";
import { ParticleBackground } from "./ParticleBackground";
import { ScreenStage } from "./ScreenStage";
import type { AttendanceFeedItem } from "../api/dashboard-api";

const PIE_COLORS = [
  "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#a78bfa",
  "#c084fc", "#e879f9", "#fb7185", "#34d399", "#fbbf24",
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

const tooltipStyle = {
  background: "rgba(6,22,48,0.96)",
  border: "1px solid rgba(0,220,255,0.35)",
  borderRadius: 6,
  color: "#e4f0fa",
  fontSize: 11,
  boxShadow: "0 4px 20px rgba(0,180,255,0.2)",
};

// ── Fullscreen toggle (shared pattern from MainDashboard) ──────────────

function FullscreenBtn() {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  return (
    <button className="db-header-back" onClick={toggle} title={isFs ? "退出全屏" : "进入全屏"}>
      {isFs ? "✕ 退出全屏" : "⛶ 全屏"}
    </button>
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
      <div className="pb-title">
        <span className="pb-title-bar" />
        <span className="pb-title-text">{title}</span>
        {subtitle && <span className="pb-title-sub">{subtitle}</span>}
        <span className="pb-title-line" />
      </div>
      <div className={scrollable ? "pb-content" : "pb-content pb-content-no-scroll"}>{children}</div>
    </div>
  );
}

// ── Today attendance with summary + grouped list ────────────────────────

// Max rows rendered per column — keeps DOM bounded even at 1000+ workers.
// 20 unique × 2 duplicate = 40 DOM nodes/column max.
const FEED_DISPLAY_CAP = 20;

// Scroll feed column: measures whether content overflows before animating.
function AttFeedCol({
  label,
  count,
  items,
  headerClass,
  dotClass,
  scrollClass,
  emptyText,
}: {
  label: string;
  count: number;
  items: AttendanceFeedItem[];
  headerClass: string;
  dotClass: string;
  scrollClass: string;
  emptyText: string;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  // After each render, check if content height exceeds container height.
  // Only enable scroll (and DOM duplication) when content truly overflows.
  useEffect(() => {
    const feed  = feedRef.current;
    const inner = innerRef.current;
    if (!feed || !inner) return;
    setShouldScroll(inner.scrollHeight > feed.clientHeight + 4);
  });

  const renderList = useMemo(
    () => shouldScroll ? [...items, ...items] : items,
    [items, shouldScroll]
  );

  return (
    <div className="pb-att-col">
      <div className={`pb-att-col-header ${headerClass}`}>
        <span className={`pb-att-dot ${dotClass}`} />
        <span>{label}</span>
        <span className="pb-att-count">{count}</span>
      </div>
      <div className="pb-scroll-feed" ref={feedRef}>
        {items.length === 0 ? (
          <div className="pb-empty">{emptyText}</div>
        ) : (
          <div
            ref={innerRef}
            className={shouldScroll ? scrollClass : "pb-static-list"}
          >
            {renderList.map((item, i) => (
              <AttRow key={`${item.id}-${i}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TodayAttendancePanel({ items }: { items: AttendanceFeedItem[] }) {

  // Filter to today only and group by direction
  const { inList, outList, stats } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayItems = items.filter((it) => it.triggerTime.slice(0, 10) === today);

    const inAll = todayItems
      .filter((it) => it.direction === 0)
      .sort((a, b) => b.triggerTime.localeCompare(a.triggerTime));
    const outAll = todayItems
      .filter((it) => it.direction === 1)
      .sort((a, b) => b.triggerTime.localeCompare(a.triggerTime));

    // Unique workers who came in today (full set for accurate stats)
    const inWorkers = new Set(inAll.map((it) => it.workerName));
    const outWorkers = new Set(outAll.map((it) => it.workerName));
    const onSite = new Set([...inWorkers].filter((w) => !outWorkers.has(w)));

    return {
      // Cap rendered list to keep DOM bounded, statistics use full set
      inList: inAll.slice(0, FEED_DISPLAY_CAP),
      outList: outAll.slice(0, FEED_DISPLAY_CAP),
      stats: {
        totalIn: inWorkers.size,
        totalOut: outWorkers.size,
        onSite: onSite.size,
      },
    };
  }, [items]);

  return (
    <div className="pb-attendance-panel">
      {/* Summary stats */}
      <div className="pb-att-stats">
        <div className="pb-stat-item pb-stat-card-green">
          <span className="pb-stat-value pb-stat-green">{stats.totalIn}</span>
          <span className="pb-stat-label">今日进场</span>
        </div>
        <div className="pb-stat-item pb-stat-card-orange">
          <span className="pb-stat-value pb-stat-orange">{stats.totalOut}</span>
          <span className="pb-stat-label">今日出场</span>
        </div>
        <div className="pb-stat-item pb-stat-card-cyan">
          <span className="pb-stat-value pb-stat-cyan">{stats.onSite}</span>
          <span className="pb-stat-label">当前在场</span>
        </div>
      </div>

      {/* Two-column lists */}
      <div className="pb-att-columns">
        <AttFeedCol
          label="进场"
          count={stats.totalIn}
          items={inList}
          headerClass="pb-att-col-header-in"
          dotClass="pb-att-dot-in"
          scrollClass="pb-scroll-inner"
          emptyText="暂无进场记录"
        />
        <AttFeedCol
          label="出场"
          count={stats.totalOut}
          items={outList}
          headerClass="pb-att-col-header-out"
          dotClass="pb-att-dot-out"
          scrollClass="pb-scroll-inner pb-scroll-inner-out"
          emptyText="暂无出场记录"
        />
      </div>
    </div>
  );
}

const AttRow = memo(function AttRow({ item }: { item: AttendanceFeedItem }) {
  return (
    <div className="pb-feed-row">
      <div className="pb-feed-avatar">
        {item.workerPhotoUrl ? (
          <img src={item.workerPhotoUrl} alt="" />
        ) : (
          item.workerName.slice(0, 1)
        )}
      </div>
      <div className="pb-feed-info">
        <div className="pb-feed-name">{item.workerName}</div>
        <div className="pb-feed-equip">
          {item.equipmentName ? item.equipmentName : "—"}
        </div>
      </div>
      <div className="pb-feed-time">
        {item.triggerTime.slice(11, 16)}
      </div>
    </div>
  );
});

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
  const navigate = useNavigate();
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
    () => (hourly ?? []).map((h) => ({ hour: `${h.hour}:00`, count: h.count })),
    [hourly]
  );

  const barData = useMemo(() => {
    if (!board) return [];
    return [
      { name: "在册工人", value: board.project.activeWorkers, fill: "#38bdf8" },
      { name: "日均出勤", value: Math.round(board.dailyAvgAttendance), fill: "#34d399" },
      { name: "今日出勤", value: board.todayAttendanceCount, fill: "#fbbf24" },
      {
        name: "在场人数",
        value: board.teamAttendance.reduce((s, t) => s + t.onSiteCount, 0),
        fill: "#818cf8",
      },
    ];
  }, [board]);

  const statusLabel = useCallback((s?: number | null) => {
    if (s === 5) return "在建";
    if (s === 6) return "完工";
    if (s === 8) return "竣工";
    if (s === 7) return "停工";
    if (s === 3) return "筹备";
    return "—";
  }, []);

  const statusColor = useCallback((s?: number | null) => {
    if (s === 5) return "#00e88f";
    if (s === 7) return "#ff4757";
    return "#00d4ff";
  }, []);

  return (
    <ScreenStage>
    <div className="dashboard-root pb-root">
      <div className="pb-bg-image" />
      <div className="pb-bg-radial" />
      <div className="pb-bg-grid" />
      <div className="pb-bg-hex" />
      <div className="db-board-dots" />
      <div className="db-board-floor" />
      <ParticleBackground />

      <div className="db-content pb-content-wrap">
        {/* Header */}
        <div className="db-header">
          <div className="db-header-left">
            <button
              className="db-header-back"
              onClick={() => navigate({ to: "/app/data-screen" })}
            >
              ← 返回大屏
            </button>
          </div>
          <div className="db-header-center">
            <div className="db-board-banner" />
            <div className="db-header-title" style={{ fontSize: 24, letterSpacing: "4px", paddingLeft: "4px" }}>
              {board?.project.name ?? "项目看板"}
            </div>
            <div className="db-header-title-line" />
          </div>
          <div className="db-header-right">
            <FullscreenBtn />
            <ProjectSwitcher
              currentId={projectId}
              currentName={board?.project.name}
            />
          </div>
          <div className="db-header-line" />
        </div>

        {/* Tabs */}
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

        {/* Body */}
        {boardLoading && !board ? (
          <div className="pb-loading">
            <span className="pb-loading-dot" />
            <span className="pb-loading-dot" />
            <span className="pb-loading-dot" />
          </div>
        ) : activeTab === DEFAULT_TAB ? (
        <div className="pb-grid">
          {/* Left Column: Project Info + Hourly Chart */}
          <div className="pb-col pb-col-left">
            <P
              title="项目概况"
              subtitle="PROJECT INFO"
              className="pb-flex-md"
            >
              <div className="pb-info-list">
                {[
                  { l: "项目名称", v: board?.project.name, wide: true },
                  { l: "项目编号", v: board?.project.id?.slice(0, 10) },
                  { l: "项目状态", v: statusLabel(board?.project.status), vc: statusColor(board?.project.status) },
                  { l: "总投资", v: board?.project.investmentAmount ? `${board.project.investmentAmount}万元` : "—" },
                  { l: "建筑面积", v: board?.project.area ?? "—" },
                  { l: "总包单位", v: board?.project.contractor, wide: true },
                  { l: "项目经理", v: board?.project.projectManager },
                  { l: "联系电话", v: board?.project.projectManagerPhone },
                  { l: "开工日期", v: board?.project.startDate },
                  { l: "竣工日期", v: board?.project.endDate },
                  { l: "实名登记", v: board?.project.totalWorkers, vc: "#00d4ff" },
                  { l: "在册人员", v: board?.project.activeWorkers, vc: "#00e88f" },
                ].map((row) => (
                  <div
                    key={row.l}
                    className={`pb-info-row ${row.wide ? "pb-info-row-wide" : ""}`}
                  >
                    <span className="pb-info-label">{row.l}</span>
                    <span
                      className="pb-info-value"
                      style={row.vc ? { color: row.vc } : undefined}
                    >
                      {row.v ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </P>

            <P
              title="今日出勤情况"
              subtitle="HOURLY TREND"
              className="pb-flex-lg"
              scrollable={false}
            >
              <div className="pb-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fill: "#7fa4c4", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#7fa4c4", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      fill="url(#hourlyGrad)"
                      dot={{ r: 3, fill: "#22d3ee", strokeWidth: 0 }}
                      activeDot={{ r: 5, stroke: "#22d3ee", strokeWidth: 2, fill: "#fff" }}
                      isAnimationActive={false}
                      name="出勤人数"
                    >
                      <LabelList
                        dataKey="count"
                        position="top"
                        fill="#e4f0fa"
                        fontSize={10}
                        fontWeight={700}
                        offset={8}
                      />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </P>
          </div>

          {/* Center Column: Team Table + Bar + Pie */}
          <div className="pb-col pb-col-center">
            <P
              title="今日各班组出勤情况"
              subtitle="TEAM ATTENDANCE"
              className="pb-flex-1"
            >
              <div className="pb-table-wrap">
                <table className="pb-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>序号</th>
                      <th>班组名称</th>
                      <th className="text-right">出勤</th>
                      <th className="text-right">在场</th>
                      <th className="text-right">总人数</th>
                      <th className="text-right">出勤率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(board?.teamAttendance ?? []).slice(0, 15).map((t, i) => {
                      const rateColor =
                        t.attendanceRate >= 50
                          ? "#00e88f"
                          : t.attendanceRate >= 20
                          ? "#ffd43b"
                          : "#ff4757";
                      return (
                        <tr key={t.teamName}>
                          <td>
                            <span className="pb-idx" style={{
                              background: i < 3
                                ? `radial-gradient(circle at 35% 30%, ${PIE_COLORS[i]}, rgba(0,40,80,0.8))`
                                : undefined
                            }}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="pb-td-name">{t.teamName}</td>
                          <td className="text-right">
                            <span className="pb-num">{t.attendanceCount}</span>
                          </td>
                          <td className="text-right">
                            <span className="pb-num pb-num-green">{t.onSiteCount}</span>
                          </td>
                          <td className="text-right pb-td-total">{t.totalCount}</td>
                          <td className="text-right">
                            <span className="pb-rate" style={{ color: rateColor }}>
                              {t.attendanceRate.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(board?.teamAttendance?.length ?? 0) > 15 && (
                  <div className="pb-table-more">
                    共 {board!.teamAttendance.length} 个班组，展示前 15 个
                  </div>
                )}
              </div>
            </P>

            <div className="pb-charts-row">
              <P
                title="日均出勤统计"
                subtitle="DAILY STATS"
                className="pb-flex-1"
                scrollable={false}
              >
                <div className="pb-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#7fa4c4", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#7fa4c4", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar
                        dataKey="value"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                        name="人数"
                      >
                        <LabelList
                          dataKey="value"
                          position="top"
                          fill="#e4f0fa"
                          fontSize={11}
                          fontWeight={700}
                          offset={6}
                        />
                        {barData.map((d, i) => (
                          <Cell key={i} fill={d.fill} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </P>

              <P
                title="项目各工种人数占比"
                subtitle="WORKER TYPES"
                className="pb-flex-1"
                scrollable={false}
              >
                <div className="pb-chart-wrap pb-chart-with-legend">
                  <div className="pb-pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={board?.workerTypeDistribution ?? []}
                          cx="50%"
                          cy="50%"
                          innerRadius="45%"
                          outerRadius="75%"
                          dataKey="count"
                          nameKey="workerTypeName"
                          stroke="rgba(3,14,32,0.6)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          label={(props: any) => {
                            const pct = Number(props.percent ?? 0);
                            if (pct < 0.06) return "";
                            return `${(pct * 100).toFixed(0)}%`;
                          }}
                          labelLine={false}
                        >
                          {(board?.workerTypeDistribution ?? []).map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                              opacity={0.92}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value, name) => [value, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pb-pie-legend">
                    {(board?.workerTypeDistribution ?? []).map((d, i) => {
                      const total = (board?.workerTypeDistribution ?? []).reduce((s, w) => s + w.count, 0);
                      const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={d.workerTypeName} className="pb-pie-legend-item">
                          <span
                            className="pb-pie-legend-dot"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="pb-pie-legend-name" title={d.workerTypeName}>
                            {d.workerTypeName}
                          </span>
                          <span className="pb-pie-legend-count">{d.count}人</span>
                          <span className="pb-pie-legend-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </P>
            </div>
          </div>

          {/* Right Column: Today Attendance */}
          <div className="pb-col pb-col-right">
            <P
              title="今日出勤情况"
              subtitle="ATTENDANCE"
              className="pb-flex-full"
            >
              <TodayAttendancePanel items={feed ?? []} />
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
