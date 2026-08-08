import type { LucideIcon } from "lucide-react";
import { ClipboardList } from "lucide-react";

type AdminPlaceholderPageProps = {
  group: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  statusText?: string;
};

export function AdminPlaceholderPage({
  title,
  icon: Icon = ClipboardList,
  statusText = "该模块已预留，暂无数据。",
}: AdminPlaceholderPageProps) {
  return (
    <div className="space-y-3">
      <section className="flex min-h-[320px] items-center justify-center rounded-xl border bg-white p-6 text-center shadow-sm dark:bg-card">
        <div>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-[#0f6b5d]">
            <Icon className="size-6" />
          </div>
          <div className="mt-4 text-base font-semibold">{title}</div>
          <p className="mt-2 text-sm text-muted-foreground">{statusText}</p>
        </div>
      </section>
    </div>
  );
}
