import { cn } from "@/lib/utils";

export function MetricCell({
  label,
  value,
  accent = "default",
  helper,
  compact = false,
}: {
  label: string;
  value: string | number;
  accent?: "default" | "teal" | "amber" | "slate";
  helper?: string;
  compact?: boolean;
}) {
  const accentClass = {
    default: "text-foreground",
    teal: "text-[#0f6b5d] dark:text-teal-300",
    amber: "text-amber-700 dark:text-amber-300",
    slate: "text-slate-700 dark:text-slate-300",
  }[accent];

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card",
        compact ? "px-3 py-2" : "px-4 py-3"
      )}
    >
      <div className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate font-semibold tracking-normal", compact ? "text-xl" : "text-2xl", accentClass)}>
        {value}
      </div>
      {helper ? <div className={cn("text-xs text-slate-400 dark:text-muted-foreground", compact ? "mt-0.5" : "mt-1")}>{helper}</div> : null}
    </div>
  );
}
