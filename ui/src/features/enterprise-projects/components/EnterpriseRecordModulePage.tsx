import { useCallback, useState } from "react";
import type { EnterpriseCustomer, EnterpriseProject, EnterpriseRecordKind } from "../types";
import {
  EnterpriseCustomerSearchSelect,
  EnterpriseProjectSearchSelect,
} from "./EnterpriseSearchSelect";
import { RecordTab } from "./EnterpriseProjectDetailPage";

export function EnterpriseRecordModulePage({ module }: { module: EnterpriseRecordKind }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<EnterpriseCustomer | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<EnterpriseProject | null>(null);
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
