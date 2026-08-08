import { useState } from "react";
import { CalendarCog, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ManagedAttendancePage } from "@/features/managed-attendance/components/ManagedAttendancePage";
import { SupplementalAttendancePage } from "@/features/supplemental-attendance/components/SupplementalAttendancePage";
import { useAuthUser } from "@/stores/use-auth-store";
import { cn } from "@/lib/utils";

type ModuleView = "settings" | "dispatch";

export function AttendanceHostingPage({
  initialView = "dispatch",
}: {
  initialView?: ModuleView;
}) {
  const user = useAuthUser();
  const canManage = user?.role === "admin";
  const [view, setView] = useState<ModuleView>(
    canManage ? initialView : "dispatch",
  );

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="rounded-xl border bg-white p-2 shadow-sm dark:bg-card">
        <div className="flex gap-2">
          {canManage ? (
            <ModuleButton
              active={view === "settings"}
              onClick={() => setView("settings")}
              icon={<CalendarCog className="size-4" />}
              title="托管设置"
              description=""
            />
          ) : null}
          <ModuleButton
            active={view === "dispatch"}
            onClick={() => setView("dispatch")}
            icon={<Send className="size-4" />}
            title="下发记录"
            description=""
          />
        </div>
      </section>

      {view === "settings" && canManage ? (
        <ManagedAttendancePage embedded />
      ) : (
        <SupplementalAttendancePage embedded />
      )}
    </div>
  );
}

function ModuleButton({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-9 min-w-0 justify-start gap-2 px-3 text-left text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        active && "bg-[#0f6b5d] text-white hover:bg-[#0f6b5d] hover:text-white",
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {description ? <span className="block truncate text-xs">{description}</span> : null}
      </span>
    </Button>
  );
}
