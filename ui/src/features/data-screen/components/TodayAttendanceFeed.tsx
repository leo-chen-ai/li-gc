import { createPortal } from "react-dom";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getFieldOptionLabel,
  workerFormFields,
} from "@/features/projects/data/construction-form-fields";
import type { AttendanceFeedItem } from "../api/dashboard-api";
import { dataScreenAsset } from "../config/assets";
import { WorkerDetailModal } from "./WorkerDetailModal";

const FEED_DISPLAY_CAP = 40;
/** 自动滚动速度（略加快） */
const SCROLL_SPEED_PX_PER_SEC = 48;
/** 接近顶部时允许新记录自然插入；否则补偿 scrollTop 避免跳动 */
const NEAR_TOP_PX = 48;

function maskPhone(phone?: string | null) {
  const raw = String(phone ?? "").replace(/\s+/g, "");
  if (!raw) return "—";
  if (raw.length <= 3) return `${raw}********`;
  return `${raw.slice(0, 3)}********`;
}

function resolvePhotoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http") || trimmed.startsWith("data:")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return resolvePhotoUrl(parsed);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const url = resolvePhotoUrl(typeof item === "string" ? item : null);
        if (url) return url;
      }
    }
    if (parsed && typeof parsed === "object" && "url" in parsed) {
      return resolvePhotoUrl(String((parsed as { url?: unknown }).url ?? ""));
    }
  } catch {
    /* plain path */
  }
  return trimmed;
}

function workTypeLabel(workType: number | null | undefined) {
  if (workType == null || Number.isNaN(Number(workType))) return "其它";
  return getFieldOptionLabel(workerFormFields, "work_type", Number(workType), "其它");
}

function todayKey() {
  return new Date().toLocaleDateString("sv-SE");
}

function normalizeTodayFeed(items: AttendanceFeedItem[]) {
  const day = todayKey();
  return items
    .filter((it) => it.triggerTime.slice(0, 10) === day)
    .sort((a, b) => b.triggerTime.localeCompare(a.triggerTime))
    .slice(0, FEED_DISPLAY_CAP);
}

function sameIdOrder(a: AttendanceFeedItem[], b: AttendanceFeedItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

type Props = {
  projectId: string;
  items: AttendanceFeedItem[];
};

export function TodayAttendanceFeed({ projectId, items }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const scrollCompensateRef = useRef(0);
  const loopHeightRef = useRef(0);
  const [looping, setLooping] = useState(false);
  const [detailWorkerId, setDetailWorkerId] = useState<string | null>(null);
  const [liveList, setLiveList] = useState<AttendanceFeedItem[]>(() =>
    normalizeTodayFeed(items),
  );

  // 增量合并：按 id 去重，新记录插到前面；滚动中途补偿高度，避免整表刷飞
  useEffect(() => {
    const incoming = normalizeTodayFeed(items);
    setLiveList((prev) => {
      if (prev.length === 0) return incoming;
      if (sameIdOrder(prev, incoming)) {
        // 仅字段更新（如补全 phone），保持顺序
        const map = new Map(incoming.map((it) => [it.id, it]));
        return prev.map((it) => map.get(it.id) ?? it);
      }

      const mergedMap = new Map<string, AttendanceFeedItem>();
      for (const it of incoming) mergedMap.set(it.id, it);
      for (const it of prev) {
        if (!mergedMap.has(it.id)) mergedMap.set(it.id, it);
      }
      const merged = [...mergedMap.values()]
        .filter((it) => it.triggerTime.slice(0, 10) === todayKey())
        .sort((a, b) => b.triggerTime.localeCompare(a.triggerTime))
        .slice(0, FEED_DISPLAY_CAP);

      const el = feedRef.current;
      if (el && el.scrollTop > NEAR_TOP_PX) {
        const prevIds = new Set(prev.map((p) => p.id));
        let newOnTop = 0;
        for (const it of merged) {
          if (prevIds.has(it.id)) break;
          newOnTop += 1;
        }
        if (newOnTop > 0) {
          const sample = el.querySelector(".pb-feed-card") as HTMLElement | null;
          const rowH = sample?.offsetHeight ?? 116;
          scrollCompensateRef.current = newOnTop * rowH;
        }
      }

      return merged;
    });
  }, [items]);

  useLayoutEffect(() => {
    const el = feedRef.current;
    const delta = scrollCompensateRef.current;
    if (!el || !delta) return;
    el.scrollTop += delta;
    scrollCompensateRef.current = 0;
  }, [liveList]);

  // 测量第一份列表高度；仅在内容溢出时启用双份无缝循环
  useLayoutEffect(() => {
    const feed = feedRef.current;
    const track = trackRef.current;
    if (!feed || !track || liveList.length === 0) {
      loopHeightRef.current = 0;
      setLooping(false);
      return;
    }

    const measure = () => {
      const h = track.offsetHeight;
      loopHeightRef.current = h;
      const needsLoop = h > feed.clientHeight + 2;
      setLooping((prev) => (prev === needsLoop ? prev : needsLoop));
      // 若关闭循环后 scrollTop 落在第二份区域，收回
      if (!needsLoop && feed.scrollTop > 0) {
        feed.scrollTop = Math.min(feed.scrollTop, Math.max(0, h - feed.clientHeight));
      } else if (needsLoop && h > 0) {
        while (feed.scrollTop >= h) feed.scrollTop -= h;
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    ro.observe(feed);
    return () => ro.disconnect();
  }, [liveList]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el || liveList.length === 0) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const loopH = loopHeightRef.current;
      // 无缝循环：滚过第一份高度后回减，避免到底瞬间跳顶抽搐
      if (!pausedRef.current && loopH > el.clientHeight + 2) {
        el.scrollTop += SCROLL_SPEED_PX_PER_SEC * dt;
        while (el.scrollTop >= loopH) {
          el.scrollTop -= loopH;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // 仅在有/无数据时启停滚动，避免每次合并都重置动画
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveList.length === 0]);

  const openDetail = (item: AttendanceFeedItem) => {
    const id = item.workerId;
    if (!id) {
      toast.error("人员 ID 缺失，请重启本地 API 后刷新");
      return;
    }
    setDetailWorkerId(id);
  };

  const renderRows = (keyPrefix: string) =>
    liveList.map((item) => (
      <AttRow
        key={`${keyPrefix}-${item.id}`}
        item={item}
        onOpen={() => openDetail(item)}
      />
    ));

  return (
    <>
      <div
        className="pb-att-feed"
        ref={feedRef}
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        {liveList.length === 0 ? (
          <div className="pb-empty">暂无出勤记录</div>
        ) : (
          <>
            <div className="pb-att-feed-track" ref={trackRef}>
              {renderRows("a")}
            </div>
            {looping ? (
              <div className="pb-att-feed-track" aria-hidden>
                {renderRows("b")}
              </div>
            ) : null}
          </>
        )}
      </div>

      {detailWorkerId
        ? createPortal(
            <WorkerDetailModal
              projectId={projectId}
              workerId={detailWorkerId}
              onClose={() => setDetailWorkerId(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

const AttRow = memo(function AttRow({
  item,
  onOpen,
}: {
  item: AttendanceFeedItem;
  onOpen: () => void;
}) {
  const isIn = item.direction === 0;
  const photo = resolvePhotoUrl(item.workerPhotoUrl);
  return (
    <button type="button" className="pb-feed-card" onClick={onOpen}>
      <div className="pb-feed-avatar">
        {photo ? <img src={photo} alt="" /> : (item.workerName || "?").slice(0, 1)}
      </div>
      <div className="pb-feed-mid">
        <div className="pb-feed-name">{item.workerName || "—"}</div>
        <div className={`pb-feed-dir-line ${isIn ? "in" : "out"}`}>
          <img
            className="pb-feed-dir-icon"
            src={isIn ? dataScreenAsset("board-dir-in.png") : dataScreenAsset("board-dir-out.png")}
            alt=""
          />
          <span>{isIn ? "进" : "出"}</span>
        </div>
        <div className="pb-feed-phone">手机号：{maskPhone(item.phone)}</div>
      </div>
      <div className="pb-feed-right">
        <span className="pb-feed-job">{workTypeLabel(item.workType)}</span>
        <span className="pb-feed-time">
          {item.triggerTime.replace("T", " ").slice(0, 19)}
        </span>
      </div>
    </button>
  );
});
