import type { ConstructionReportingPlatform } from "../types/construction-types";

export function ProjectReportingPlatforms({
  platforms,
  emptyText = "未配置",
}: {
  platforms?: ConstructionReportingPlatform[];
  emptyText?: string;
}) {
  if (!platforms?.length) {
    return <span className="text-xs text-slate-400 dark:text-muted-foreground">{emptyText}</span>;
  }

  return (
    <div className="space-y-1">
      {platforms.map((platform, index) => (
        <div
          key={`${platform.platform_type}-${index}`}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-foreground"
        >
          <span
            aria-label={platform.is_enabled ? "已启用" : "已停用"}
            className={platform.is_enabled
              ? "size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.14)]"
              : "size-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"}
          />
          <span className="break-words">{platform.platform_name}</span>
        </div>
      ))}
    </div>
  );
}
