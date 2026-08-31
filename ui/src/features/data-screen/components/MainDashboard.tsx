import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
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
  const timeStr = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateStr = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
    <button className="db-header-back" onClick={toggle} title={isFullscreen ? "退出全屏" : "进入全屏"}>
      {isFullscreen ? "✕ 退出全屏" : "⛶ 全屏"}
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
      <div className="db-title">
        <span className="db-title-text">{title}</span>
        {subtitle && <span className="db-title-sub">{subtitle}</span>}
        <span className="db-title-line" />
        {extra}
      </div>
      <div className="db-content-area">{children}</div>
    </div>
  );
}

// ── Dual-title panel (two side-by-side section titles) ─────────────────────

function DuoP({
  t1,
  t2,
  children,
  className = "",
}: {
  t1: string;
  t2: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`db-panel ${className}`}>
      <div className="db-panel-bottom" />
      <div className="db-panel-grid" />
      <div className="db-stream" />
      <div className="db-corner-bl" />
      <div className="db-corner-br" />
      <div className="db-duo-header">
        <div className="db-title">
          <span className="db-title-text">{t1}</span>
          <span className="db-title-line" />
        </div>
        <div className="db-title">
          <span className="db-title-text">{t2}</span>
          <span className="db-title-line" />
        </div>
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
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const r = 19;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke="rgba(120, 160, 200, 0.18)"
        strokeWidth="5"
      />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`}
        transform="rotate(-90 24 24)"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
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

function SqIcon({
  kind,
  color,
}: {
  kind: "doc" | "check" | "shield" | "tri";
  color: string;
}) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 3px ${color})`, flexShrink: 0 }}
    >
      {kind === "doc" && (
        <>
          <rect
            x="6"
            y="4"
            width="12"
            height="16"
            rx="1.5"
            stroke={color}
            strokeWidth="1.6"
          />
          <path
            d="M9 9.5h6M9 13.5h6"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "check" && (
        <>
          <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
          <path
            d="m8.5 12.2 2.4 2.4 4.6-5"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === "shield" && (
        <path
          d="M12 3.5 19 6v6c0 4.4-3 7.4-7 8.5-4-1.1-7-4.1-7-8.5V6l7-2.5Z"
          stroke={color}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}
      {kind === "tri" && (
        <>
          <path
            d="M12 4.5 20.5 19h-17L12 4.5Z"
            stroke={color}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 10v4"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.6" r="0.9" fill={color} />
        </>
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
        <DuoP t1="今日出勤" t2="合同签署" className="flex-1">
          <div className="db-skeleton-block">
            <div className="db-skeleton-bar db-skeleton-bar-lg" />
            <div className="db-skeleton-bar db-skeleton-bar-sm" style={{ width: "50%" }} />
          </div>
        </DuoP>
        <P title="安全质量管理" subtitle="SAFETY" className="flex-[1.5]">
          <div className="db-skeleton-block">
            <div className="db-skeleton-bar" style={{ width: "85%" }} />
            <div className="db-skeleton-bar" style={{ width: "55%" }} />
          </div>
        </P>
      </>
    );
  }

  return (
    <>
      {/* Enterprise data */}
      <P title="企业综合数据" subtitle="OVERVIEW" className="flex-[1.8]">
        {/* Project status 3x2, same order as reference */}
        <div className="db-grid-3">
          {[
            { l: "项目总数", v: o?.projectTotal, c: "" },
            { l: "筹备", v: o?.statusPreparation, c: "" },
            {
              l: "完工/竣工",
              v: (o?.statusCompleted ?? 0) + (o?.statusFinished ?? 0),
              c: "db-num-green",
            },
            { l: "立项", v: o?.statusApproved, c: "" },
            { l: "在建", v: o?.statusInProgress, c: "db-num-green" },
            { l: "停工", v: o?.statusStopped, c: "db-num-red" },
          ].map((i) => (
            <div key={i.l} className="db-cell">
              <AnimatedNumber
                value={i.v ?? 0}
                className={`db-num db-num-sm ${i.c}`}
              />
              <div className="db-label">{i.l}</div>
            </div>
          ))}
        </div>

        {/* Personnel stats — 4-col row with icons */}
        <div className="db-grid-4 mt-2">
          {[
            { l: "实名登记", v: o?.totalRegistered, k: "id", col: "#00c8ff" },
            { l: "在册人员", v: o?.totalActive, k: "person", col: "#00c8ff" },
            { l: "管理人员", v: o?.totalManagement, k: "mgr", col: "#66b3ff" },
            { l: "党员人数", v: o?.totalPartyMember, k: "star", col: "#ff5c7a" },
          ].map((i) => (
            <div key={i.l} className="db-mod">
              <PersonIcon
                kind={i.k as "id" | "person" | "mgr" | "star"}
                color={i.col}
              />
              <AnimatedNumber
                value={i.v ?? 0}
                className="db-num db-num-md"
              />
              <div className="db-label">{i.l}</div>
            </div>
          ))}
        </div>
      </P>

      {/* Today attendance | contract sign — dual-title panel */}
      <DuoP t1="今日出勤" t2="合同签署" className="flex-1">
        <div className="db-grid-2">
          <div className="db-att-block">
            <div>
              <div className="flex items-baseline gap-1">
                <AnimatedNumber
                  value={o?.todayAttendance ?? 0}
                  className="db-num db-num-lg db-num-green db-num-scan"
                />
                <span className="db-label">人</span>
              </div>
              <div className="db-label">今日出勤人数</div>
              <div className="db-att-sub">
                出勤率 <span>{rate}%</span>
              </div>
            </div>
            <AttRing percent={parseFloat(rate)} color="#00e88f" size={64} />
          </div>
          <div className="db-att-block">
            <div>
              <div className="flex items-baseline gap-1">
                <span
                  className="db-num db-num-md"
                  style={{ color: "var(--db-text-dim)" }}
                >
                  0
                </span>
                <span className="db-label">人</span>
              </div>
              <div className="db-label">签署人数</div>
              <div className="db-att-sub">
                签署率 <span>0%</span>
              </div>
            </div>
            <AttRing percent={0} color="#00b8ff" size={64} />
          </div>
        </div>
      </DuoP>

      {/* Safety / quality management — tab switch */}
      <P
        title="安全质量管理"
        subtitle={sqTab === "safety" ? "SAFETY" : "QUALITY"}
        className="flex-[1.5]"
        extra={
          <div className="db-tabs">
            <button
              className={`db-tab${sqTab === "safety" ? " active" : ""}`}
              onClick={() => setSqTab("safety")}
            >
              安全
            </button>
            <button
              className={`db-tab${sqTab === "quality" ? " active" : ""}`}
              onClick={() => setSqTab("quality")}
            >
              质量
            </button>
          </div>
        }
      >
        {/* identical structure per tab keeps panel height stable */}
        <div className="db-grid-3">
          {[
            { l: "待整改", v: 0, c: "db-num-red", k: "doc", col: "#ff4757" },
            { l: "已整改", v: 0, c: "db-num-green", k: "check", col: "#00e88f" },
            { l: "无风险", v: 0, c: "", k: "shield", col: "#00e88f" },
            { l: "低风险", v: 0, c: "", k: "tri", col: "#00d4ff" },
            { l: "较大风险", v: 0, c: "db-num-orange", k: "tri", col: "#ff9f43" },
            { l: "重大风险", v: 0, c: "db-num-red", k: "tri", col: "#ff4757" },
          ].map((i) => (
            <div key={i.l} className="db-sq-item">
              <SqIcon kind={i.k as "doc" | "check" | "shield" | "tri"} color={i.col} />
              <div className="min-w-0">
                <div className="db-label" style={{ marginTop: 0 }}>
                  {i.l}
                </div>
                <AnimatedNumber
                  value={i.v}
                  className={`db-num db-num-md ${i.c}`}
                />
              </div>
            </div>
          ))}
        </div>
        {/* Donut charts row */}
        <div className="mt-3 flex gap-3" style={{ minHeight: 120 }}>
          <DonutMini
            center="整改"
            data={[
              { name: "待整改", value: 0, color: "#ff4757" },
              { name: "已整改", value: 0, color: "#00e88f" },
            ]}
          />
          {sqTab === "safety" ? (
            <DonutMini
              center="风险"
              data={[
                { name: "无风险", value: 0, color: "#00e88f" },
                { name: "低风险", value: 0, color: "#00d4ff" },
                { name: "较大风险", value: 0, color: "#ff9f43" },
                { name: "重大风险", value: 0, color: "#ff4757" },
              ]}
            />
          ) : (
            <DonutMini
              center="质量"
              data={[
                { name: "合格", value: 0, color: "#00e88f" },
                { name: "返工", value: 0, color: "#ff9f43" },
              ]}
            />
          )}
        </div>
      </P>
    </>
  );
});

// ── Mini donut ────────────────────────────────────────────────────────────

const DonutMini = memo(function DonutMini({
  data,
  center,
}: {
  data: { name: string; value: number; color: string }[];
  center?: string;
}) {
  // recharts renders nothing when all values are 0 — show a faint base ring
  const total = data.reduce((s, d) => s + d.value, 0);
  const pieData =
    total > 0
      ? data
      : [{ name: "暂无数据", value: 1, color: "rgba(120, 160, 200, 0.18)" }];
  return (
    <div className="flex-1 flex flex-col items-center">
      <div style={{ width: 100, height: 100, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={42}
              dataKey="value"
              stroke="none"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={false as any}
            >
              {pieData.map((d, i) => (
                <Cell key={i} fill={d.color} opacity={0.8} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {center && <div className="db-donut-center">{center}</div>}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
        {data.map((d) => (
          <div key={d.name} className="db-legend-row">
            <span
              className="db-legend-dot"
              style={{ background: d.color, boxShadow: `0 0 4px ${d.color}` }}
            />
            <span style={{ color: "var(--db-text-sec)" }}>{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Smart-site module icons (keyed by backend module key) ────────────────

// 展示顺序与名称以设计图为准，count 通过 key 与后端模块联动
const SITE_ITEMS: { label: string; icon: string; key?: string }[] = [
  { label: "考勤机", icon: "attendance_device", key: "attendance_device" },
  { label: "塔吊监测", icon: "tower_crane", key: "tower_crane" },
  { label: "升降机监测", icon: "elevator", key: "elevator" },
  { label: "视频监控", icon: "video_monitor", key: "video_monitor" },
  { label: "AI识别", icon: "ai_camera", key: "ai_camera" },
  { label: "环境监测", icon: "env_monitor", key: "env_monitor" },
  { label: "智能水电", icon: "water_control", key: "water_control" },
  { label: "智能安全帽", icon: "smart_helmet", key: "smart_helmet" },
  { label: "无人机全景", icon: "drone" },
  { label: "全景模拟", icon: "pano" },
  { label: "疫情防控", icon: "epidemic" },
  { label: "安全监测", icon: "safety_check", key: "safety_check" },
  { label: "质量监测", icon: "quality_check", key: "quality_check" },
  { label: "高支模", icon: "high_formwork", key: "high_formwork" },
  { label: "深基坑", icon: "deep_pit", key: "deep_pit" },
  { label: "智能烟感", icon: "smoke" },
  { label: "LED屏", icon: "led_board", key: "led_board" },
  { label: "车辆冲洗", icon: "vehicle", key: "vehicle" },
];

function ModIcon({ kind }: { kind: string }) {
  const s = { stroke: "currentColor", strokeWidth: 1.6, fill: "none" } as const;
  let body: React.ReactNode;
  switch (kind) {
    case "attendance_device":
      body = (
        <>
          <rect x="7" y="3.5" width="10" height="17" rx="1.5" {...s} />
          <circle cx="12" cy="9" r="2.2" {...s} />
          <path d="M9.5 15.5h5" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "real_name":
      body = (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" {...s} />
          <circle cx="8.3" cy="10.3" r="1.9" {...s} />
          <path d="M14 9.8h4M14 13h4" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "video_monitor":
      body = (
        <>
          <rect x="3.5" y="7" width="13" height="9" rx="1.5" {...s} />
          <path d="M16.5 10.5 20.5 8.5v7l-4-2" {...s} strokeLinejoin="round" />
          <circle cx="10" cy="11.5" r="2.2" {...s} />
        </>
      );
      break;
    case "env_monitor":
      body = (
        <>
          <path
            d="M19.5 4.5c-9 0-14 5-14 13.5 0 .5 0 1 .1 1.5C14 19.5 19.5 14 19.5 4.5Z"
            {...s}
            strokeLinejoin="round"
          />
          <path d="M6 19c3.4-6.4 7.4-10.4 13.5-14.5" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "tower_crane":
      body = (
        <>
          <path d="M4 7h16M12 7v13M8 20h8M12 7l-4 3" {...s} strokeLinecap="round" />
          <path d="M18 7v3" {...s} />
          <circle cx="18" cy="11.5" r="1.3" {...s} />
        </>
      );
      break;
    case "elevator":
      body = (
        <>
          <rect x="7.5" y="3.5" width="9" height="17" rx="1.5" {...s} />
          <path d="M10.5 9 12 7l1.5 2M13.5 15 12 17l-1.5-2" {...s} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
      break;
    case "deep_pit":
      body = (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" {...s} />
          <path d="M8 9h8M8 12h8M8 15h5" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "high_formwork":
      body = (
        <path d="M9 4.5v15M15 4.5v15M4.5 9h15M4.5 15h15" {...s} strokeLinecap="round" />
      );
      break;
    case "dust_control":
      body = (
        <path
          d="M4 9h9a2.5 2.5 0 1 0-2.5-2.5M4 13h13a2.5 2.5 0 1 1-2.5 2.5M4 17h7"
          {...s}
          strokeLinecap="round"
        />
      );
      break;
    case "water_control":
      body = (
        <>
          <path
            d="M12 4c3.4 4.1 5.8 7.2 5.8 10a5.8 5.8 0 0 1-11.6 0C6.2 11.2 8.6 8.1 12 4Z"
            {...s}
            strokeLinejoin="round"
          />
          <path d="M12.7 9.5l-1.9 2.8h2.4l-1.9 2.8" {...s} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
      break;
    case "drone":
      body = (
        <>
          <rect x="10" y="10.5" width="4" height="3" rx="0.8" {...s} />
          <path d="M10 10.5 7.8 8.3M14 10.5l2.2-2.2M10 13.5l-2.2 2.2M14 13.5l2.2 2.2" {...s} strokeLinecap="round" />
          <circle cx="7" cy="7.5" r="1.7" {...s} />
          <circle cx="17" cy="7.5" r="1.7" {...s} />
          <circle cx="7" cy="16.5" r="1.7" {...s} />
          <circle cx="17" cy="16.5" r="1.7" {...s} />
        </>
      );
      break;
    case "pano":
      body = (
        <>
          <circle cx="12" cy="12" r="7.5" {...s} />
          <path d="M4.5 12h15M12 4.5c3 2.5 3 12.5 0 15M12 4.5c-3 2.5-3 12.5 0 15" {...s} />
        </>
      );
      break;
    case "epidemic":
      body = (
        <>
          <circle cx="12" cy="12" r="4" {...s} />
          <path d="M12 5.5V8M12 16v2.5M5.5 12H8M16 12h2.5M7.4 7.4l1.8 1.8M14.8 14.8l1.8 1.8M16.6 7.4l-1.8 1.8M9.2 14.8l-1.8 1.8" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "smoke":
      body = (
        <>
          <circle cx="12" cy="9" r="4.5" {...s} />
          <path d="M10.5 9h3M9 16.5h6M10 19.5h4" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "elec_control":
      body = (
        <path d="M13 3 6 13.5h5L11 21l7-10.5h-5L13 3Z" {...s} strokeLinejoin="round" />
      );
      break;
    case "smart_helmet":
      body = (
        <>
          <path d="M5 15.5a7 7 0 0 1 14 0" {...s} />
          <path d="M3.5 15.5h17M10 8.7v-2.2h4v2.2" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "ai_camera":
      body = (
        <>
          <circle cx="12" cy="10" r="3" {...s} />
          <path d="M8 17.5c.7-2.4 2.2-3.6 4-3.6s3.3 1.2 4 3.6" {...s} strokeLinecap="round" />
          <path d="M4.5 4.5h3M4.5 4.5v3M19.5 4.5h-3M19.5 4.5v3M4.5 19.5h3M4.5 19.5v-3M19.5 19.5h-3M19.5 19.5v-3" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "vehicle":
      body = (
        <>
          <path d="M5 15 6.5 10h11L19 15" {...s} strokeLinejoin="round" />
          <rect x="4" y="15" width="16" height="3.5" rx="1" {...s} />
          <path d="M7 18.5v1.5M17 18.5v1.5" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "material":
      body = (
        <>
          <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" {...s} strokeLinejoin="round" />
          <path d="M4 8l8 4.5L20 8M12 12.5v8" {...s} />
        </>
      );
      break;
    case "quality_check":
      body = (
        <>
          <circle cx="10.5" cy="10.5" r="4.5" {...s} />
          <path d="m14 14 5.5 5.5" {...s} strokeLinecap="round" />
        </>
      );
      break;
    case "safety_check":
      body = (
        <>
          <path d="M12 3.5 19 6v6c0 4.4-3 7.4-7 8.5-4-1.1-7-4.1-7-8.5V6l7-2.5Z" {...s} strokeLinejoin="round" />
          <path d="m9 11.8 2.2 2.2 4-4.4" {...s} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
      break;
    case "led_board":
      body = (
        <>
          <rect x="4" y="5" width="16" height="10.5" rx="1.5" {...s} />
          <path d="M8 8.8h5M8 11.8h7M9 19.5h6M12 15.5v4" {...s} strokeLinecap="round" />
        </>
      );
      break;
    default:
      body = (
        <>
          <rect x="5" y="5" width="14" height="14" rx="2" {...s} />
          <path d="M9 12h6" {...s} strokeLinecap="round" />
        </>
      );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  );
}

// ── Personnel alert icons (solid style, by index) ────────────────────────

function AlertIcon({ idx }: { idx: number }) {
  const f = { fill: "currentColor" } as const;
  const w = { fill: "#eaf7ff" } as const;
  let body: React.ReactNode;
  switch (idx) {
    case 0: // person + gear (manager attendance)
      body = (
        <>
          <circle cx="10" cy="7.5" r="3.5" {...f} />
          <path d="M3.5 18.5a6.5 6.5 0 0 1 13 0Z" {...f} />
          <path
            d="M17.8 12.9v-1.2M17.8 21.9v-1.2M13.3 17.4h-1.2M23.5 17.4h-1.2M14.6 14.2l-.9-.9M21.9 21.5l-.9-.9M21 14.2l.9-.9M13.7 21.5l.9-.9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="17.8" cy="17.4" r="2.6" {...f} />
          <circle cx="17.8" cy="17.4" r="1" {...w} />
        </>
      );
      break;
    case 1: // id card (person-id mismatch)
      body = (
        <>
          <rect x="3" y="6" width="18" height="13" rx="1.5" {...f} />
          <circle cx="8" cy="11" r="1.8" {...w} />
          <path d="M5.6 15.8a2.7 2.7 0 0 1 4.8 0Z" {...w} />
          <rect x="13" y="9.3" width="5.2" height="1.5" rx="0.7" {...w} />
          <rect x="13" y="12.4" width="5.2" height="1.5" rx="0.7" {...w} />
        </>
      );
      break;
    case 2: // phone + location pin (location off)
      body = (
        <>
          <rect x="7.8" y="3" width="8.4" height="18" rx="1.8" {...f} />
          <path
            d="M12 7.6c-1.8 0-3.2 1.4-3.2 3.1 0 2.3 3.2 5.2 3.2 5.2s3.2-2.9 3.2-5.2c0-1.7-1.4-3.1-3.2-3.1Z"
            {...w}
          />
          <circle cx="12" cy="10.8" r="1.1" {...f} />
        </>
      );
      break;
    default: // phone + waveform (process terminated)
      body = (
        <>
          <rect x="7.8" y="3" width="8.4" height="18" rx="1.8" {...f} />
          <path
            d="M9.6 12h1.3l1-2.1 1.5 4.2 1-2.1h1.2"
            stroke="#eaf7ff"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  );
}

// ── Right column ─────────────────────────────────────────────────────────

const RightColumn = memo(function RightColumn() {
  const { data: smartSite, isLoading: siteLoading } = useDashboardSmartSite();
  const { data: alerts30d } = useDashboardAlerts30d();
  const { data: alertsToday, isLoading: alertLoading } = useDashboardAlertsToday();

  const alertData = useMemo(() => {
    if (!alerts30d) return [];
    return [
      { name: "AI识别预警", value: alerts30d.pending, color: "#00d4ff" },
      { name: "塔吊监测预警", value: alerts30d.resolved, color: "#a29bfe" },
      { name: "升降机预警", value: alerts30d.lowRisk, color: "#74b9ff" },
      { name: "环境监测预警", value: alerts30d.mediumRisk, color: "#ff9f43" },
      { name: "质量监测预警", value: alerts30d.noRisk, color: "#ffd43b" },
      { name: "安全监测预警", value: alerts30d.highRisk, color: "#00e88f" },
    ];
  }, [alerts30d]);

  const totalAlerts = alertData.reduce((s, d) => s + d.value, 0);

  return (
    <>
      {/* Smart site modules */}
      <P
        title="智慧工地开通项目数"
        subtitle="SMART SITE"
        className="flex-[2.2]"
        extra={
          <span
            className="db-num db-num-sm"
            style={{ marginLeft: "auto" }}
          >
            <AnimatedNumber value={smartSite?.deviceCount ?? 0} className="db-num db-num-sm" /> 台考勤机
          </span>
        }
      >
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
              <div className="db-site-icon">
                <ModIcon kind={it.icon} />
              </div>
              <div className="min-w-0">
                <AnimatedNumber
                  value={it.key ? (smartSite?.modules ?? []).find((m) => m.key === it.key)?.count ?? 0 : 0}
                  className="db-num db-num-md"
                />
                <div className="db-site-label">{it.label}</div>
              </div>
            </div>
          ))}
        </div>
        )}
      </P>

      {/* 30-day alert donut */}
      <P title="最近三十天工地预警统计" subtitle="ALERTS" className="flex-[1.3]">
        <div className="flex items-center gap-3">
          <div className="relative" style={{ width: 130, height: 130, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={alertData}
                  cx="50%"
                  cy="50%"
                  innerRadius={34}
                  outerRadius={56}
                  dataKey="value"
                  stroke="none"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={false as any}
                >
                  {alertData.map((d, i) => (
                    <Cell key={i} fill={d.color} opacity={0.85} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ fontFamily: "var(--db-font-num)" }}
            >
              <AnimatedNumber value={totalAlerts} className="db-num db-num-md db-num-scan" />
              <span className="db-label">预警</span>
            </div>
          </div>
          <div className="flex flex-col gap-[3px] flex-1">
            {alertData.map((d) => (
              <div key={d.name} className="db-legend-row">
                <span
                  className="db-legend-dot"
                  style={{
                    background: d.color,
                    boxShadow: `0 0 5px ${d.color}`,
                  }}
                />
                <span style={{ color: "var(--db-text-sec)" }}>{d.name}</span>
                <span
                  className="ml-auto"
                  style={{
                    color: "var(--db-text)",
                    fontFamily: "var(--db-font-num)",
                    fontWeight: 600,
                  }}
                >
                  {d.value > 0
                    ? `${((d.value / Math.max(totalAlerts, 1)) * 100).toFixed(0)}%`
                    : "0%"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </P>

      {/* Today personnel alerts */}
      <P title="今日人员预警" subtitle="TODAY" className="flex-1">
        {alertLoading && !alertsToday ? (
          <div className="db-skeleton-block">
            <div className="db-skeleton-bar" style={{ width: "80%" }} />
            <div className="db-skeleton-bar" style={{ width: "60%" }} />
          </div>
        ) : (
        <div className="db-alert-grid">
          {(alertsToday?.items ?? []).map((item, idx) => (
            <div key={item.label} className="db-alert-item">
              <div className="db-alert-icon">
                <AlertIcon idx={idx} />
              </div>
              <div className="db-alert-meta">
                <AnimatedNumber value={item.count} className="db-num db-num-md" />
                <div className="db-alert-label">{item.label}</div>
              </div>
            </div>
          ))}
        </div>
        )}
      </P>
    </>
  );
});

// ── Bottom chart ─────────────────────────────────────────────────────────

const tooltipStyle = {
  background: "rgba(5,16,32,0.96)",
  border: "1px solid rgba(0,229,255,0.35)",
  borderRadius: 4,
  color: "#e8f4ff",
  fontSize: 11,
  boxShadow: "0 0 20px rgba(0,229,255,0.15)",
};

const BottomChart = memo(function BottomChart() {
  const { data } = useDashboardAttendance30d();

  return (
    <div className="db-panel" style={{ padding: "8px 14px" }}>
      <div className="db-corner-bl" />
      <div className="db-corner-br" />
      <div className="db-title">
        <span className="db-title-text">最近三十天考勤统计</span>
        <span className="db-title-sub">ATTENDANCE</span>
        <span className="db-title-line" />
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data ?? []}
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.45} />
                <stop offset="60%" stopColor="#0088ff" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#0088ff" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: "#7fa4c4", fontSize: 10 }}
              axisLine={{ stroke: "rgba(0,200,255,0.1)" }}
              tickLine={false}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tick={{ fill: "#7fa4c4", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#00e5ff"
              strokeWidth={2.5}
              fill="url(#areaFill)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#00e5ff",
                stroke: "#050d16",
                strokeWidth: 2,
              }}
              name="出勤人数"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// ── Main Dashboard ───────────────────────────────────────────────────────

export function MainDashboard() {
  const navigate = useNavigate();
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
        {/* Header */}
        <div className="db-header">
          <div className="db-header-left">
            <button
              className="db-header-back"
              onClick={() => navigate({ to: "/app/admin/projects" })}
            >
              ← 返回
            </button>
            <HeaderFullscreen />
          </div>

          <div className="db-header-center">
            <div className="db-header-title">智慧工地驾驶舱</div>
            <div className="db-header-subtitle">SMART CONSTRUCTION COMMAND CENTER</div>
            <div className="db-header-title-line" />
            <div className="db-header-deco" />
          </div>

          <div className="db-header-right">
            <div className="db-header-search">
              <input
                type="text"
                placeholder="搜索项目 / 地点"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="db-header-search-icon">⌕</span>
            </div>
            <HeaderClock />
          </div>
        </div>

        {/* Body: left(full) | center-top(map) + center-bottom(chart) | right(full) */}
        <div className="db-body">
          <div className="db-col-left">
            <LeftColumn />
          </div>

          <div className="db-col-center-top">
            {/* Transparent - map shows through from bottom layer */}
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
