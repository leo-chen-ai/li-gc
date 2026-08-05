import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type StructuredWorkerOption = {
  id: string;
  name: string;
  unitName?: string;
  teamName?: string;
  description?: string;
};

type StructuredWorkerSelectProps = {
  workers: StructuredWorkerOption[];
  value: string[];
  onChange: (workerIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

/** 可复用的“单位 → 班组 → 人员”结构化多选组件。 */
export function StructuredWorkerSelect({
  workers,
  value,
  onChange,
  placeholder = "按单位、班组选择人员",
  disabled,
}: StructuredWorkerSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const groups = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    const visible = normalizedKeyword
      ? workers.filter((worker) =>
          [worker.name, worker.unitName, worker.teamName, worker.description]
            .filter(Boolean)
            .some((text) => text!.toLocaleLowerCase().includes(normalizedKeyword))
        )
      : workers;
    const unitMap = new Map<string, Map<string, StructuredWorkerOption[]>>();
    for (const worker of visible) {
      const unit = worker.unitName || "未分配单位";
      const team = worker.teamName || "未分配班组";
      if (!unitMap.has(unit)) unitMap.set(unit, new Map());
      const teamMap = unitMap.get(unit)!;
      if (!teamMap.has(team)) teamMap.set(team, []);
      teamMap.get(team)!.push(worker);
    }
    return Array.from(unitMap, ([unitName, teams]) => ({
      unitName,
      teams: Array.from(teams, ([teamName, members]) => ({ teamName, members })),
    }));
  }, [keyword, workers]);

  const toggleIds = (ids: string[], checked: boolean) => {
    const next = new Set(value);
    ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    onChange(Array.from(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-auto min-h-10 w-full justify-between bg-white px-3 font-normal dark:bg-background"
        >
          <span className={cn("flex min-w-0 items-center gap-2", value.length === 0 && "text-muted-foreground")}>
            <Users className="size-4 shrink-0 text-[#0f6b5d]" />
            <span className="truncate">{value.length ? `已选择 ${value.length} 人` : placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(560px,calc(100vw-32px))] p-0">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索姓名、单位或班组" className="pl-9" />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>共 {workers.length} 人，已选 {value.length} 人</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(workers.map((worker) => worker.id))}>全选</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>清空</Button>
            </div>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {groups.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">没有匹配人员</div> : groups.map((unit) => (
            <div key={unit.unitName} className="mb-2 overflow-hidden rounded-lg border">
              <div className="bg-slate-50 px-3 py-2 text-sm font-semibold dark:bg-muted/40">{unit.unitName}</div>
              {unit.teams.map((team) => {
                const teamIds = team.members.map((member) => member.id);
                const teamChecked = teamIds.every((id) => selected.has(id));
                return (
                  <div key={team.teamName} className="border-t">
                    <label className="flex cursor-pointer items-center gap-2 bg-white px-3 py-2 text-sm font-medium hover:bg-emerald-50/60 dark:bg-background dark:hover:bg-muted/40">
                      <Checkbox checked={teamChecked} onCheckedChange={(checked) => toggleIds(teamIds, checked === true)} />
                      <span>{team.teamName}</span><span className="text-xs font-normal text-muted-foreground">{team.members.length} 人</span>
                    </label>
                    <div className="grid gap-1 border-t bg-slate-50/40 p-2 sm:grid-cols-2 dark:bg-muted/10">
                      {team.members.map((worker) => {
                        const checked = selected.has(worker.id);
                        return (
                          <button key={worker.id} type="button" onClick={() => toggleIds([worker.id], !checked)} className={cn("flex min-w-0 items-center gap-2 rounded-md border bg-white px-2.5 py-2 text-left hover:border-emerald-300 dark:bg-background", checked && "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30")}>
                            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", checked && "border-[#0f6b5d] bg-[#0f6b5d] text-white")}>
                              {checked ? <Check className="size-3" /> : null}
                            </span>
                            <span className="min-w-0"><span className="block truncate text-sm font-medium">{worker.name}</span><span className="block truncate text-xs text-muted-foreground">{worker.description || team.teamName}</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
