import { FileInput, ReceiptText, WalletCards, WalletMinimal } from "lucide-react";
import { useCallback, useState } from "react";
import type { EnterpriseCustomer, EnterpriseProject, EnterpriseRecordKind } from "../types";
import {
  EnterpriseCustomerSearchSelect,
  EnterpriseProjectSearchSelect,
} from "./EnterpriseSearchSelect";
import { RecordTab } from "./EnterpriseProjectDetailPage";

const moduleMeta: Record<
  EnterpriseRecordKind,
  {
    title: string;
    description: string;
    icon: typeof ReceiptText;
  }
> = {
  "issued-invoices": {
    title: "开票管理",
    description: "按项目维护销售开票，金额进入账面收入和应收余额。",
    icon: ReceiptText,
  },
  "received-invoices": {
    title: "收票管理",
    description: "按项目维护成本收票，金额进入账面成本和应付余额。",
    icon: FileInput,
  },
  collections: {
    title: "回款管理",
    description: "按项目维护到账回款，已确认金额进入现金毛利。",
    icon: WalletMinimal,
  },
  payments: {
    title: "付款管理",
    description: "按项目维护对外付款，已确认金额进入现金支出。",
    icon: WalletCards,
  },
};

export function EnterpriseRecordModulePage({ module }: { module: EnterpriseRecordKind }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<EnterpriseCustomer | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<EnterpriseProject | null>(null);
  const meta = moduleMeta[module];
  const Icon = meta.icon;
  const selectedProjectLabel = selectedProject?.name;

  const handleOptionsChange = useCallback((projects: EnterpriseProject[]) => {
    if (projects.length === 0) {
      setSelectedProjectId("");
      setSelectedProject(null);
      return;
    }
    setSelectedProjectId((current) => {
      const matched = projects.find((project) => project.id === current);
      const nextProject = matched ?? projects[0];
      setSelectedProject(nextProject);
      return nextProject.id;
    });
  }, []);

  const handleCustomerChange = (customer: EnterpriseCustomer | null) => {
    setSelectedCustomer(customer);
    setSelectedCustomerId(customer?.id ?? "");
    setSelectedProjectId("");
    setSelectedProject(null);
  };

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-[#0f6b5d]">
              <Icon className="size-4" />
              企业经营管理
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">{meta.title}</h1>
          </div>
          <p className="text-sm text-slate-500">{meta.description}</p>
        </div>
      </section>

      {selectedProject ? (
        <RecordTab
          projectId={selectedProject.id}
          module={module}
          projectCustomerId={selectedProject.customer_id ?? ""}
          projectCustomerName={selectedProject.customer_name ?? ""}
          projectOwnEntityId={selectedProject.own_entity_id ?? ""}
          projectOwnEntityName={selectedProject.own_entity_name ?? ""}
          prefixFilters={
            <>
              <EnterpriseCustomerSearchSelect
                value={selectedCustomerId}
                selectedLabel={selectedCustomer?.name}
                onValueChange={setSelectedCustomerId}
                onCustomerChange={handleCustomerChange}
                emptyLabel="全部往来单位"
                placeholder="搜索往来单位"
              />
              <EnterpriseProjectSearchSelect
                value={selectedProjectId}
                selectedLabel={selectedProjectLabel}
                onValueChange={setSelectedProjectId}
                onProjectChange={setSelectedProject}
                onOptionsChange={handleOptionsChange}
                customerId={selectedCustomerId}
              />
            </>
          }
        />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[220px_minmax(260px,1fr)]">
            <EnterpriseCustomerSearchSelect
              value={selectedCustomerId}
              selectedLabel={selectedCustomer?.name}
              onValueChange={setSelectedCustomerId}
              onCustomerChange={handleCustomerChange}
              emptyLabel="全部往来单位"
              placeholder="搜索往来单位"
            />
            <EnterpriseProjectSearchSelect
              value={selectedProjectId}
              selectedLabel={selectedProjectLabel}
              onValueChange={setSelectedProjectId}
              onProjectChange={setSelectedProject}
              onOptionsChange={handleOptionsChange}
              customerId={selectedCustomerId}
            />
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            请选择往来单位关联项目。没有可选项时，请先在往来单位关联项目管理里新增项目。
          </div>
        </section>
      )}
    </div>
  );
}
