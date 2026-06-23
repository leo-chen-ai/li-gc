import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useProjectOptionsQuery } from "../hooks/use-construction-projects";
import type { ConstructionProjectOption } from "../types/construction-types";

type ProjectSearchSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function ProjectSearchSelect({
  value,
  onValueChange,
  includeAllOption = false,
  allOptionLabel = "全部项目",
  placeholder = "搜索项目名称、施工许可证、单位",
  disabled,
  className,
}: ProjectSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const optionsQuery = useProjectOptionsQuery(keyword);
  const options = optionsQuery.data ?? [];
  const selectedProject = useMemo(
    () => options.find((project) => project.id === value),
    [options, value]
  );
  const buttonLabel = value
    ? formatProjectOptionLabel(selectedProject, value)
    : allOptionLabel;

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && optionsQuery.isError) {
      void optionsQuery.refetch();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between gap-2 border-slate-200 bg-white px-3 text-left font-normal dark:border-border dark:bg-background",
            className
          )}
          title={buttonLabel}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-slate-500 dark:text-muted-foreground")}>
            {buttonLabel}
          </span>
          {optionsQuery.isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-[320px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            placeholder={placeholder}
          />
          <CommandList>
            <CommandEmpty>
              {optionsQuery.isFetching
                ? "项目搜索中..."
                : optionsQuery.isError
                  ? "项目加载失败，请重新搜索"
                  : "暂无匹配项目"}
            </CommandEmpty>
            <CommandGroup>
              {includeAllOption ? (
                <CommandItem value="__all_projects__" onSelect={() => handleSelect("")}>
                  <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{allOptionLabel}</span>
                </CommandItem>
              ) : null}
              {options.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.id}
                  onSelect={() => handleSelect(project.id)}
                  className="items-start"
                >
                  <Check className={cn("mt-0.5 size-4", value === project.id ? "opacity-100" : "opacity-0")} />
                  <ProjectOptionContent project={project} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProjectOptionContent({ project }: { project: ConstructionProjectOption }) {
  const title = project.name || project.id;
  const meta = [project.work_permit, project.address_code_list || project.address]
    .filter(Boolean)
    .join(" / ");

  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium" title={title}>
        {title}
      </span>
      {meta ? (
        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-muted-foreground" title={meta}>
          {meta}
        </span>
      ) : null}
    </span>
  );
}

function formatProjectOptionLabel(project: ConstructionProjectOption | undefined, fallback: string) {
  return project?.name || fallback;
}
