import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

import {
  useEnterpriseCustomersQuery,
  useEnterpriseOwnEntitiesQuery,
  useEnterpriseProjectsQuery,
} from "../hooks";
import {
  buildCustomerOptionLabel,
  buildEnterpriseSelectLabel,
  buildEnterpriseProjectSearchFilters,
  formatCents,
} from "../lib";
import type { EnterpriseCustomer, EnterpriseOwnEntity, EnterpriseProject } from "../types";

type BaseSearchSelectProps = {
  value: string;
  selectedLabel?: string | null;
  onValueChange: (value: string) => void;
  includeEmptyOption?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function EnterpriseCustomerSearchSelect({
  value,
  selectedLabel,
  onValueChange,
  onCustomerChange,
  includeEmptyOption = true,
  emptyLabel = "暂不关联往来单位",
  placeholder = "搜索往来单位名称、编号、税号、联系人、电话",
  disabled,
  className,
}: BaseSearchSelectProps & {
  onCustomerChange?: (customer: EnterpriseCustomer | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const customersQuery = useEnterpriseCustomersQuery({
    page: 1,
    page_size: 20,
    keyword: keyword || undefined,
    status: "active",
  });
  const customers = customersQuery.data?.items ?? [];
  const options = useMemo(
    () =>
      customers.map((customer) => ({
        id: customer.id,
        label: buildCustomerOptionLabel(customer),
        customer,
      })),
    [customers]
  );
  const selected = options.find((option) => option.id === value);
  const buttonLabel = value
    ? buildEnterpriseSelectLabel(selected, value, selectedLabel)
    : selectedLabel || emptyLabel;

  const handleSelect = (nextValue: string, customer: EnterpriseCustomer | null) => {
    onValueChange(nextValue);
    onCustomerChange?.(customer);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between gap-2 border-slate-200 bg-white px-3 text-left font-normal",
            className
          )}
          title={buttonLabel}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-slate-500")}>
            {buttonLabel}
          </span>
          {customersQuery.isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(360px,var(--radix-popover-content-available-height,360px))] w-[--radix-popover-trigger-width] min-w-[360px] overflow-hidden p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput value={keyword} onValueChange={setKeyword} placeholder={placeholder} />
          <CommandList className="max-h-72 overflow-y-auto">
            <CommandEmpty>
              {customersQuery.isFetching
                ? "往来单位搜索中..."
                : customersQuery.isError
                  ? "往来单位加载失败，请重新搜索"
                  : "暂无匹配往来单位"}
            </CommandEmpty>
            <CommandGroup>
              {includeEmptyOption ? (
                <CommandItem value="__empty_customer__" onSelect={() => handleSelect("", null)}>
                  <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{emptyLabel}</span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => handleSelect(option.id, option.customer)}
                  className="items-start"
                >
                  <Check className={cn("mt-0.5 size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <CustomerOptionContent customer={option.customer} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EnterpriseProjectSearchSelect({
  value,
  selectedLabel,
  onValueChange,
  onProjectChange,
  onOptionsChange,
  customerId,
  includeEmptyOption = false,
  emptyLabel = "暂不关联项目",
  placeholder = "搜索项目名称、编号、往来单位、负责人",
  disabled,
  className,
}: BaseSearchSelectProps & {
  onProjectChange?: (project: EnterpriseProject | null) => void;
  onOptionsChange?: (projects: EnterpriseProject[]) => void;
  customerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const projectsQuery = useEnterpriseProjectsQuery(
    buildEnterpriseProjectSearchFilters({ keyword, customerId })
  );
  const projects = projectsQuery.data?.items ?? [];
  const options = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        label: buildProjectOptionLabel(project),
        project,
      })),
    [projects]
  );
  const selected = options.find((option) => option.id === value);
  const buttonLabel = value
    ? buildEnterpriseSelectLabel(selected, value, selectedLabel)
    : emptyLabel;

  useEffect(() => {
    onOptionsChange?.(projects);
  }, [onOptionsChange, projects]);

  const handleSelect = (nextValue: string, project: EnterpriseProject | null) => {
    onValueChange(nextValue);
    onProjectChange?.(project);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between gap-2 border-slate-200 bg-white px-3 text-left font-normal",
            className
          )}
          title={buttonLabel}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-slate-500")}>
            {buttonLabel}
          </span>
          {projectsQuery.isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(360px,var(--radix-popover-content-available-height,360px))] w-[--radix-popover-trigger-width] min-w-[380px] overflow-hidden p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput value={keyword} onValueChange={setKeyword} placeholder={placeholder} />
          <CommandList className="max-h-72 overflow-y-auto">
            <CommandEmpty>
              {projectsQuery.isFetching
                ? "项目搜索中..."
                : projectsQuery.isError
                  ? "项目加载失败，请重新搜索"
                  : "暂无匹配项目"}
            </CommandEmpty>
            <CommandGroup>
              {includeEmptyOption ? (
                <CommandItem value="__empty_project__" onSelect={() => handleSelect("", null)}>
                  <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{emptyLabel}</span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => handleSelect(option.id, option.project)}
                  className="items-start"
                >
                  <Check className={cn("mt-0.5 size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <ProjectOptionContent project={option.project} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EnterpriseOwnEntitySearchSelect({
  value,
  selectedLabel,
  onValueChange,
  onEntityChange,
  includeEmptyOption = true,
  emptyLabel = "暂不关联主体",
  placeholder = "搜索主体名称、税号、开户行、账号",
  disabled,
  className,
}: BaseSearchSelectProps & {
  onEntityChange?: (entity: EnterpriseOwnEntity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const entitiesQuery = useEnterpriseOwnEntitiesQuery({
    page: 1,
    page_size: 20,
    keyword: keyword || undefined,
    status: "active",
  });
  const entities = entitiesQuery.data?.items ?? [];
  const options = useMemo(
    () =>
      entities.map((entity) => ({
        id: entity.id,
        label: buildOwnEntityOptionLabel(entity),
        entity,
      })),
    [entities]
  );
  const selected = options.find((option) => option.id === value);
  const buttonLabel = value
    ? buildEnterpriseSelectLabel(selected, value, selectedLabel)
    : selectedLabel || emptyLabel;

  const handleSelect = (nextValue: string, entity: EnterpriseOwnEntity | null) => {
    onValueChange(nextValue);
    onEntityChange?.(entity);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between gap-2 border-slate-200 bg-white px-3 text-left font-normal",
            className
          )}
          title={buttonLabel}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-slate-500")}>
            {buttonLabel}
          </span>
          {entitiesQuery.isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(360px,var(--radix-popover-content-available-height,360px))] w-[--radix-popover-trigger-width] min-w-[380px] overflow-hidden p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput value={keyword} onValueChange={setKeyword} placeholder={placeholder} />
          <CommandList className="max-h-72 overflow-y-auto">
            <CommandEmpty>
              {entitiesQuery.isFetching
                ? "主体搜索中..."
                : entitiesQuery.isError
                  ? "主体加载失败，请重新搜索"
                  : "暂无匹配主体"}
            </CommandEmpty>
            <CommandGroup>
              {includeEmptyOption ? (
                <CommandItem value="__empty_entity__" onSelect={() => handleSelect("", null)}>
                  <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{emptyLabel}</span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => handleSelect(option.id, option.entity)}
                  className="items-start"
                >
                  <Check className={cn("mt-0.5 size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <OwnEntityOptionContent entity={option.entity} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CustomerOptionContent({ customer }: { customer: EnterpriseCustomer }) {
  const title = customer.name || customer.id;
  const meta = [customer.customer_code, customer.credit_code, customer.contact_name, customer.contact_phone]
    .filter(Boolean)
    .join(" / ");

  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium" title={title}>
        {title}
      </span>
      {meta ? (
        <span className="mt-0.5 block truncate text-xs text-slate-500" title={meta}>
          {meta}
        </span>
      ) : null}
    </span>
  );
}

function ProjectOptionContent({ project }: { project: EnterpriseProject }) {
  const title = project.name || project.id;
  const meta = [
    project.project_code,
    project.customer_name,
    formatCents(project.contract_amount_cents),
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium" title={title}>
        {title}
      </span>
      {meta ? (
        <span className="mt-0.5 block truncate text-xs text-slate-500" title={meta}>
          {meta}
        </span>
      ) : null}
    </span>
  );
}

function OwnEntityOptionContent({ entity }: { entity: EnterpriseOwnEntity }) {
  const title = entity.name || entity.id;
  const meta = [entity.credit_code, entity.bank_name, entity.bank_account, entity.contact_name]
    .filter(Boolean)
    .join(" / ");

  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium" title={title}>
        {title}
      </span>
      {meta ? (
        <span className="mt-0.5 block truncate text-xs text-slate-500" title={meta}>
          {meta}
        </span>
      ) : null}
    </span>
  );
}

function buildProjectOptionLabel(project: EnterpriseProject) {
  return [project.project_code, project.name, project.customer_name].filter(Boolean).join(" · ");
}

function buildOwnEntityOptionLabel(entity: EnterpriseOwnEntity) {
  return [entity.name, entity.credit_code, entity.bank_name].filter(Boolean).join(" · ");
}
