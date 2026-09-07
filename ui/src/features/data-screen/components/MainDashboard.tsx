import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  useDashboardOverview,
  useDashboardProjectsMap,
  useDashboardSmartSite,
  useDashboardAlerts30d,
  useDashboardAlertsToday,
  useDashboardAttendance30d,
} from "../hooks/use-dashboard-queries";
import { WorldMap } from "./WorldMap";
import type { MapProjectPoint } from "./WorldMap";
import { ParticleBackground } from "./ParticleBackground";
import { AnimatedNumber } from "./AnimatedNumber";
import { dataScreenAsset } from "../config/assets";
import { ScreenStage } from "./ScreenStage";
import type { MapProject } from "../api/dashboard-api";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ── Isolated clock display: per-second updates re-render only this node ──

function HeaderClock() {
  const now = useClock();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const weekdays = ["星期天", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekday = weekdays[now.getDay()];
  return (
    <div className="db-header-time">
      {dateStr} {timeStr} {weekday}
    </div>
  );
}

// ── Fullscreen toggle: only this component re-renders on state change ────

function HeaderFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
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
    <button
      className="db-header-fs"
      onClick={toggle}
      title={isFullscreen ? "退出全屏" : "进入全屏"}
      aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
    >
      {isFullscreen ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M5 1H1v4M11 1h4v4M5 15H1v-4M11 15h4v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M1 1l4 4M15 1l-4 4M1 15l4-4M15 15l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ── Panel wrapper with corners ───────────────────────────────────────────

function P({
  title,
  subtitle,
  children,
  className = "",
  extra,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`db-panel ${className}`}>
      <div className="db-panel-bottom" />
      <div className="db-panel-grid" />
      <div className="db-stream" />
      <div className="db-corner-bl" />
      <div className="db-corner-br" />
      <div className="db-title db-title-bar">
        <span className="db-title-text">{title}</span>
        {subtitle && <span className="db-title-sub">{subtitle}</span>}
        {extra}
      </div>
      <div className="db-content-area">{children}</div>
    </div>
  );
}

// ── Small SVG progress ring ────────────────────────────────────────────────

function AttRing({
  percent,
  color,
  size = 48,
  iconSrc,
  trackColor = "rgba(80, 110, 150, 0.35)",
  strokeWidth = 7,
}: {
  percent: number;
  color: string;
  size?: number;
  iconSrc?: string;
  trackColor?: string;
  strokeWidth?: number;
}) {
  const r = 24 - strokeWidth / 2 - 1;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const iconSize = Math.round(size * 0.38);
  return (
    <div className="db-att-ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={`${(p / 100) * c} ${c}`}
          transform="rotate(-90 24 24)"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
      </svg>
      {iconSrc ? (
        <img
          className="db-att-ring-icon"
          src={iconSrc}
          alt=""
          draggable={false}
          style={{ width: iconSize, height: iconSize }}
        />
      ) : null}
    </div>
  );
}

// ── Tiny line icons for stats ─────────────────────────────────────────────

function PersonIcon({
  kind,
  color,
}: {
  kind: "id" | "person" | "mgr" | "star";
  color: string;
}) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 3px ${color})` }}
    >
      {kind === "id" && (
        <>
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2"
            stroke={color}
            strokeWidth="1.7"
          />
          <circle cx="8.3" cy="10.3" r="1.9" stroke={color} strokeWidth="1.5" />
          <path
            d="M5.8 15.8c.4-1.7 1.3-2.6 2.5-2.6s2.1.9 2.5 2.6"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M14 9.8h4M14 13h4"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "person" && (
        <>
          <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.7" />
          <path
            d="M5.5 19.5c.8-3.8 3.4-5.8 6.5-5.8s5.7 2 6.5 5.8"
            stroke={color}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "mgr" && (
        <>
          <circle cx="12" cy="7.5" r="3.2" stroke={color} strokeWidth="1.7" />
          <path
            d="M5.5 19.5c.8-3.8 3.4-5.8 6.5-5.8s5.7 2 6.5 5.8"
            stroke={color}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="m12 13.9-1.1 1.7 1.1 2.9 1.1-2.9-1.1-1.7Z"
            fill={color}
          />
        </>
      )}
      {kind === "star" && (
        <path
          d="M12 4.2 14.3 9l5.3.75-3.9 3.7.95 5.3L12 16.2l-4.65 2.55.95-5.3-3.9-3.7L9.7 9 12 4.2Z"
          stroke={color}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

// ── Left column ──────────────────────────────────────────────────────────

const LeftColumn = memo(function LeftColumn() {
  const { data, isLoading } = useDashboardOverview();
  const o = data;
  const [sqTab, setSqTab] = useState<"safety" | "quality">("safety");

  const rate =
    o && o.totalActive > 0
      ? ((o.todayAttendance / o.totalActive) * 100).toFixed(1)
      : "0.0";

  if (isLoading && !o) {
    return (
      <>
        <P title="企业综合数据" subtitle="OVERVIEW" className="flex-[1.8]">
          <div className="db-skeleton-block">
            <div className="db-skeleton-bar" style={{ width: "90%" }} />
            <div className="db-skeleton-bar" style={{ width: "60%" }} />
          </div>
        </P>
        <div className="db-panel db-circular">
          <div className="db-circular-titles">
            <div className="db-circular-shadow">
              <span className="db-circular-border" />
              <span className="db-circular-icon" aria-hidden="true" />
              <span className="db-circular-text">今日出勤</span>
            </div>
            <div className="db-circular-shadow">
              <span className="db-circular-border" />
              <span className="db-circular-icon" aria-hidden="true" />
              <span className="db-circular-text">合同签署</span>
            </div>
          </div>
          <div className="db-circular-content">
            <div className="db-skeleton-block" style={{ width: "100%" }}>
              <div className="db-skeleton-bar db-skeleton-bar-lg" />
              <div className="db-skeleton-bar db-skeleton-bar-sm" style={{ width: "50%" }} />
            </div>
          </div>
        </div>
        <div className="db-panel db-safety">
          <div className="db-safety-tabs">
            <button type="button" className="db-safety-tab active">
              安全管理
            </button>
            <button type="button" className="db-safety-tab">
              质量管理
            </button>
          </div>
          <div className="db-safety-body">
            <div className="db-skeleton-block">
              <div className="db-skeleton-bar" style={{ width: "85%" }} />
              <div className="db-skeleton-bar" style={{ width: "55%" }} />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Enterprise data — 1:1 reference spacing */}
      <P title="企业综合数据" className="flex-none db-enterprise">
        <div className="db-ym-content">
          <div className="db-ym-grid">
            {[
              { l: "项目总数", v: o?.projectTotal },
              { l: "筹备", v: o?.statusPreparation },
              {
                l: "完工/竣工",
                v: (o?.statusCompleted ?? 0) + (o?.statusFinished ?? 0),
              },
              { l: "立项", v: o?.statusApproved },
              { l: "在建", v: o?.statusInProgress },
              { l: "停工", v: o?.statusStopped },
            ].map((i) => (
              <div key={i.l} className="db-ym-item">
                <div className="db-ym-label">{i.l}</div>
                <div className="db-ym-value-row">
                  <AnimatedNumber value={i.v ?? 0} className="db-key-num" />
                  <span className="db-ym-unit">个</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="db-human">
          {[
            { l: "累计实名登记", v: o?.totalRegistered, icon: dataScreenAsset("icon-registered.png") },
            { l: "在册人员", v: o?.totalActive, icon: dataScreenAsset("icon-active.png") },
            { l: "管理人员", v: o?.totalManagement, icon: dataScreenAsset("icon-mgmt.png") },
            { l: "党员人数", v: o?.totalPartyMember, icon: dataScreenAsset("icon-party.png") },
          ].map((i) => (
            <div key={i.l} className="db-human-card">
              <div className="db-human-frame">
                <img className="db-human-icon" src={i.icon} alt="" draggable={false} />
              </div>
              <div className="db-human-label">{i.l}</div>
              <AnimatedNumber value={i.v ?? 0} className="db-human-qty" />
            </div>
          ))}
        </div>
      </P>

      {/* 今日出勤 / 合同签署 — circular 纯 CSS（无 tab 切图） */}
      <div className="db-panel db-circular">
        <div className="db-circular-titles">
          <div className="db-circular-shadow">
            <span className="db-circular-border" />
            <span className="db-circular-icon" aria-hidden="true" />
            <span className="db-circular-text">今日出勤</span>
          </div>
          <div className="db-circular-shadow">
            <span className="db-circular-border" />
            <span className="db-circular-icon" aria-hidden="true" />
            <span className="db-circular-text">合同签署</span>
          </div>
        </div>
        <div className="db-circular-content">
          <div className="db-circular-item">
            <div className="db-circular-meta">
              <div className="db-circular-label">今日出勤人数</div>
              <div className="db-circular-num-row">
                <AnimatedNumber
                  value={o?.todayAttendance ?? 0}
                  className="db-circular-num"
                />
                <span className="db-circular-unit">人</span>
              </div>
              <div className="db-circular-rate">出勤率 {rate}%</div>
            </div>
            <AttRing
              percent={parseFloat(rate)}
              color="#2ddcce"
              size={88}
              strokeWidth={6.5}
              iconSrc={dataScreenAsset("ring-attendance.png")}
            />
          </div>
          <div className="db-circular-item">
            <div className="db-circular-meta">
              <div className="db-circular-label">签署人数</div>
              <div className="db-circular-num-row">
                <span className="db-circular-num">0</span>
                <span className="db-circular-unit">人</span>
              </div>
              <div className="db-circular-rate">签署率 0%</div>
            </div>
            <AttRing
              percent={0}
              color="#1e90ff"
              size={88}
              strokeWidth={6.5}
              iconSrc={dataScreenAsset("ring-contract.png")}
            />
          </div>
        </div>
      </div>

      {/* 安全管理 / 质量管理 — 双 tab 同一套内容 */}
      <div className="db-panel db-safety">
        <div className="db-safety-tabs">
          <button
            type="button"
            className={`db-safety-tab${sqTab === "safety" ? " active" : ""}`}
            onClick={() => setSqTab("safety")}
          >
            安全管理
          </button>
          <button
            type="button"
            className={`db-safety-tab${sqTab === "quality" ? " active" : ""}`}
            onClick={() => setSqTab("quality")}
          >
            质量管理
          </button>
        </div>
        <div className="db-safety-body">
          <ul className="db-safety-grid">
            {[
              { l: "待整改总数", v: 0, icon: dataScreenAsset("sq-pending.png") },
              { l: "已整改总数", v: 0, icon: dataScreenAsset("sq-done.png") },
              { l: "无风险", v: 0, icon: dataScreenAsset("sq-risk-none.png") },
              { l: "低风险", v: 0, icon: dataScreenAsset("sq-risk-low.png") },
              { l: "较大风险", v: 0, icon: dataScreenAsset("sq-risk-mid.png") },
              { l: "重大风险", v: 0, icon: dataScreenAsset("sq-risk-high.png") },
            ].map((i) => (
              <li key={i.l} className="db-safety-item">
                <div className="db-safety-fx">
                  <img className="db-safety-icon" src={i.icon} alt="" draggable={false} />
                  <div className="db-safety-box">
                    {i.l}
                    <div className="db-safety-num-wrap">
                      <AnimatedNumber value={i.v} className="db-safety-num" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="db-safety-pies">
            <DonutMini
              data={[
                { name: "待整改", value: 0, color: "#22e3bb" },
                { name: "已整改", value: 0, color: "rgba(255,255,255,0.08)" },
              ]}
            />
            <DonutMini
              data={[
                { name: "无风险", value: 0, color: "#22e3bb" },
                { name: "较大风险", value: 0, color: "#f6b831" },
                { name: "低风险", value: 0, color: "#3176f6" },
                { name: "重大风险", value: 0, color: "#f66831" },
              ]}
            />
          </div>
        </div>
      </div>
    </>
  );
});

// ── Mini donut ────────────────────────────────────────────────────────────

const DonutMini = memo(function DonutMini({
  data,
  center,
  equalWhenZero = true,
}: {
  data: { name: string; value: number; color: string }[];
  center?: string;
  /** 全 0 时按等分色块展示（对齐参考环图） */
  equalWhenZero?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const pieData =
    total > 0
      ? data
      : equalWhenZero
        ? data.map((d) => ({ ...d, value: 1 }))
        : [{ name: "暂无数据", value: 1, color: "rgba(120, 160, 200, 0.18)" }];
  return (
    <div className="db-safety-pie">
      <div className="db-safety-pie-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              dataKey="value"
              stroke="none"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={false as any}
            >
              {pieData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {center && <div className="db-donut-center">{center}</div>}
      </div>
      <div className="db-safety-pie-legend">
        {data.map((d) => (
          <div key={d.name} className="db-safety-legend-row">
            <span
              className="db-safety-legend-sq"
              style={{ background: d.color }}
            />
            <span>{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Smart-site module icons (keyed by backend module key) ────────────────

// 展示顺序与名称以设计图为准，count 通过 key 与后端模块联动
const SITE_ITEMS: { label: string; icon: string; key?: string }[] = [
  { label: "考勤机", icon: dataScreenAsset("site-attendance.png"), key: "attendance_device" },
  { label: "塔吊监测", icon: dataScreenAsset("site-tower.png"), key: "tower_crane" },
  { label: "升降机监测", icon: dataScreenAsset("site-elevator.png"), key: "elevator" },
  { label: "视频监控", icon: dataScreenAsset("site-video.png"), key: "video_monitor" },
  { label: "AI识别", icon: dataScreenAsset("site-ai.png"), key: "ai_camera" },
  { label: "环境监测", icon: dataScreenAsset("site-env.png"), key: "env_monitor" },
  { label: "智能水电", icon: dataScreenAsset("site-water.png"), key: "water_control" },
  { label: "智能安全帽", icon: dataScreenAsset("site-helmet.png"), key: "smart_helmet" },
  { label: "无人机全景", icon: dataScreenAsset("site-drone.png") },
  { label: "全景模拟", icon: dataScreenAsset("site-pano.png") },
  { label: "疫情防控", icon: dataScreenAsset("site-epidemic.png") },
  { label: "安全监测", icon: dataScreenAsset("site-safety.png"), key: "safety_check" },
  { label: "质量监测", icon: dataScreenAsset("site-quality.png"), key: "quality_check" },
  { label: "高支模", icon: dataScreenAsset("site-formwork.png"), key: "high_formwork" },
  { label: "深基坑", icon: dataScreenAsset("site-pit.png"), key: "deep_pit" },
  { label: "智能烟感", icon: dataScreenAsset("site-smoke.png") },
  { label: "LED屏", icon: dataScreenAsset("site-led.png"), key: "led_board" },
  { label: "车辆冲洗", icon: dataScreenAsset("site-vehicle.png"), key: "vehicle" },
];

// 展示顺序与切图以设计图为准（对齐 tg .staff .numBox）
const STAFF_ALERT_ITEMS: { label: string; icon: string }[] = [
  { label: "管理人员出勤预警", icon: dataScreenAsset("alert-mgmt.png") },
  { label: "人证不相似预警", icon: dataScreenAsset("alert-id.png") },
  { label: "手机定位关闭预警", icon: dataScreenAsset("alert-location.png") },
  { label: "手机进程终止预警", icon: dataScreenAsset("alert-process.png") },
];

// ── Right column ─────────────────────────────────────────────────────────

const RightColumn = memo(function RightColumn() {
  const { data: smartSite, isLoading: siteLoading } = useDashboardSmartSite();
  const { data: alerts30d } = useDashboardAlerts30d();
  const { data: alertsToday, isLoading: alertLoading } = useDashboardAlertsToday();

  const alertData = useMemo(() => {
    const colors = [
      "#3A7BEB",
      "#7C7BE1",
      "#88AAFF",
      "#FFA391",
      "#FFDC8B",
      "#9CED7B",
    ] as const;
    const rows = [
      { name: "AI识别预警", value: alerts30d?.pending ?? 0, color: colors[0] },
      { name: "塔吊监测预警", value: alerts30d?.resolved ?? 0, color: colors[1] },
      { name: "升降机预警", value: alerts30d?.lowRisk ?? 0, color: colors[2] },
      { name: "环境监测预警", value: alerts30d?.mediumRisk ?? 0, color: colors[3] },
      { name: "质量监测预警", value: alerts30d?.noRisk ?? 0, color: colors[4] },
      { name: "安全监测预警", value: alerts30d?.highRisk ?? 0, color: colors[5] },
    ];
    return rows;
  }, [alerts30d]);

  const totalAlerts = alertData.reduce((s, d) => s + d.value, 0);

  return (
    <>
      {/* Smart site modules */}
      <P title="智慧工地开通项目数" className="db-right-projects">
        {siteLoading && !smartSite ? (
          <div className="db-skeleton-block">
            <div className="db-skeleton-bar" style={{ width: "95%" }} />
            <div className="db-skeleton-bar" style={{ width: "80%" }} />
            <div className="db-skeleton-bar" style={{ width: "90%" }} />
            <div className="db-skeleton-bar" style={{ width: "70%" }} />
          </div>
        ) : (
        <div className="db-grid-site">
          {SITE_ITEMS.map((it) => (
            <div key={it.label} className="db-site-item">
              <img className="db-site-icon" src={it.icon} alt="" draggable={false} />
              <div className="db-site-meta">
                <AnimatedNumber
                  value={it.key ? (smartSite?.modules ?? []).find((m) => m.key === it.key)?.count ?? 0 : 0}
                  className="db-site-qty"
                />
                <div className="db-site-label">{it.label}</div>
              </div>
            </div>
          ))}
        </div>
        )}
      </P>

      {/* 30-day alert donut — 对齐 tg v-circle / MaxCircle */}
      <P title="最近三十天工地预警统计" className="db-right-stats">
        <div className="db-right-warn">
          <div className="db-right-warn-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    totalAlerts > 0
                      ? alertData
                      : alertData.map((d) => ({ ...d, value: 1 }))
                  }
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={74}
                  dataKey="value"
                  stroke="none"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={false as any}
                  isAnimationActive={false}
                >
                  {alertData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="db-right-warn-center">
              <div className="db-right-warn-center-row">
                <AnimatedNumber value={totalAlerts} className="db-right-warn-num" />
                <span className="db-right-warn-unit">次</span>
              </div>
              <div className="db-right-warn-sub">预警</div>
            </div>
          </div>
          <div className="db-right-warn-legend">
            {alertData.map((d) => {
              const pct =
                totalAlerts > 0
                  ? `${((d.value / totalAlerts) * 100).toFixed(0)}%`
                  : "0%";
              return (
                <div key={d.name} className="db-right-warn-legend-row">
                  <span
                    className="db-right-warn-legend-dot"
                    style={{ background: d.color }}
                  />
                  <span className="db-right-warn-legend-name">
                    {d.name}&nbsp;{pct}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </P>

      {/* Today personnel alerts */}
      <P title="今日人员预警" className="db-right-staff">
        {alertLoading && !alertsToday ? (
          <div className="db-skeleton-block">
            <div className="db-skeleton-bar" style={{ width: "80%" }} />
            <div className="db-skeleton-bar" style={{ width: "60%" }} />
          </div>
        ) : (
        <div className="db-alert-grid">
          {STAFF_ALERT_ITEMS.map((it) => {
            const count =
              alertsToday?.items.find((x) => x.label === it.label)?.count ?? 0;
            return (
              <div key={it.label} className="db-alert-item">
                <img
                  className="db-alert-icon"
                  src={it.icon}
                  alt=""
                  draggable={false}
                />
                <div className="db-alert-meta">
                  <div className="db-alert-count-row">
                    <AnimatedNumber value={count} className="db-alert-count" />
                    {count > 0 ? (
                      <span className="db-alert-unit">次</span>
                    ) : null}
                  </div>
                  <div className="db-alert-label">{it.label}</div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </P>
    </>
  );
});

// ── Bottom chart ─────────────────────────────────────────────────────────

const BottomChart = memo(function BottomChart() {
  const { data } = useDashboardAttendance30d();
  const chartData = data ?? [];

  return (
    <div className="db-panel db-att30">
      <div className="db-att30-title">
        <span className="db-att30-title-text">最近三十天考勤统计</span>
      </div>
      <div className="db-att30-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 18, right: 18, bottom: 6, left: 4 }}
          >
            <CartesianGrid
              stroke="rgba(255, 255, 255, 0.55)"
              vertical={false}
              strokeDasharray="0"
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#ffffff", fontSize: 11 }}
              axisLine={{ stroke: "rgba(140, 160, 210, 0.65)" }}
              tickLine={false}
              interval={3}
              minTickGap={8}
            />
            <YAxis
              tick={{ fill: "#ffffff", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
              allowDecimals={false}
              domain={[0, (max: number) => (max <= 0 ? 100 : Math.ceil(max / 20) * 20)]}
              ticks={
                chartData.every((d) => !d.count)
                  ? [0, 20, 40, 60, 80, 100]
                  : undefined
              }
            />
            <Tooltip
              contentStyle={{
                background: "rgba(4, 35, 82, 0.96)",
                border: "1px solid rgba(4, 100, 180, 0.55)",
                borderRadius: 4,
                color: "#ffffff",
                fontSize: 12,
              }}
              labelStyle={{ color: "#ffffff" }}
            />
            <Line
              type="linear"
              dataKey="count"
              name="出勤人数"
              stroke="#91cc75"
              strokeWidth={2}
              dot={{ r: 3.5, fill: "#91cc75", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#91cc75", stroke: "#044087", strokeWidth: 1 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// ── Main Dashboard ───────────────────────────────────────────────────────

export function MainDashboard() {
  const { data: projects } = useDashboardProjectsMap();
  const [selected, setSelected] = useState<MapProject | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Lock body scroll while dashboard is mounted
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalHeight = document.body.style.height;
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.height = originalHeight;
    };
  }, []);

  // Stable handlers so WorldMap memo stays effective
  const handleProjectClick = useCallback((p: MapProjectPoint) => {
    setSelected(p as MapProject);
  }, []);
  const clearSelected = useCallback(() => setSelected(null), []);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  const allProjects = useMemo(() => projects ?? [], [projects]);

  // Filter projects by search term
  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return allProjects;
    return allProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.mapPoiName?.toLowerCase().includes(term) ?? false) ||
        (p.mapAddress?.toLowerCase().includes(term) ?? false)
    );
  }, [allProjects, searchTerm]);

  return (
    <ScreenStage>
    <div className="dashboard-root">
      {/* Full-screen loading splash — covers everything until map is ready */}
      {!mapReady && (
        <div className="db-splash">
          <div className="db-splash-inner">
            <div className="db-splash-logo">智慧工地驾驶舱</div>
            <div className="db-splash-sub">SMART CONSTRUCTION COMMAND CENTER</div>
            <div className="db-splash-bar">
              <div className="db-splash-bar-fill" />
            </div>
            <div className="db-splash-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      )}

      {/* Full-screen map as bottom layer */}
      <div className="db-bg-map">
        <WorldMap
          projects={filteredProjects}
          onProjectClick={handleProjectClick}
          selectedProject={selected}
          onCloseTooltip={clearSelected}
          onMapReady={handleMapReady}
        />
      </div>

      {/* Floating particles between map and UI panels */}
      <ParticleBackground />

      <div className="db-content">
        {/* Header — reference layout: brand left / title center / time+fullscreen right */}
        <div className="db-header db-header-enterprise">
          <div className="db-header-left">
            <div className="db-brand">
              <span className="db-brand-mark">山</span>
              <div className="db-brand-text">
                <span className="db-brand-name">山淮筑</span>
                <span className="db-brand-sub">SHANHUAI.TOP</span>
              </div>
            </div>
          </div>

          <div className="db-header-center">
            <div className="db-header-title">智慧工地驾驶舱</div>
          </div>

          <div className="db-header-right">
            <HeaderClock />
            <HeaderFullscreen />
          </div>
        </div>

        {/* Body: left(full) | center-top(map+search) + center-bottom(chart) | right(full) */}
        <div className="db-body">
          <div className="db-col-left">
            <LeftColumn />
          </div>

          <div className="db-col-center-top">
            <div className="db-map-search">
              <input
                type="text"
                placeholder="项目名称搜索"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="db-col-center-bottom">
            <BottomChart />
          </div>

          <div className="db-col-right">
            <RightColumn />
          </div>
        </div>
      </div>

    </div>
    </ScreenStage>
  );
}
