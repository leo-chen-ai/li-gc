import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { enterpriseProjectService } from "./services";
import type {
  EnterpriseCustomerPayload,
  EnterpriseListFilters,
  EnterpriseOwnEntityPayload,
  EnterpriseProjectPayload,
  EnterpriseRecordKind,
  FinancialRecordPayload,
} from "./types";

export const enterpriseProjectKeys = {
  all: ["enterprise-projects"] as const,
  customersRoot: () => [...enterpriseProjectKeys.all, "customers"] as const,
  customers: (filters?: EnterpriseListFilters) =>
    [...enterpriseProjectKeys.customersRoot(), filters ?? {}] as const,
  customer: (customerId: string) =>
    [...enterpriseProjectKeys.customersRoot(), "detail", customerId] as const,
  customerSummary: (customerId: string, year: number) =>
    [...enterpriseProjectKeys.customer(customerId), "summary", year] as const,
  ownEntitiesRoot: () => [...enterpriseProjectKeys.all, "own-entities"] as const,
  ownEntities: (filters?: EnterpriseListFilters) =>
    [...enterpriseProjectKeys.ownEntitiesRoot(), filters ?? {}] as const,
  ownEntity: (entityId: string) =>
    [...enterpriseProjectKeys.ownEntitiesRoot(), "detail", entityId] as const,
  lists: () => [...enterpriseProjectKeys.all, "list"] as const,
  list: (filters?: EnterpriseListFilters) =>
    [...enterpriseProjectKeys.lists(), filters ?? {}] as const,
  detail: (projectId: string) => [...enterpriseProjectKeys.all, "detail", projectId] as const,
  summary: (projectId: string) => [...enterpriseProjectKeys.detail(projectId), "summary"] as const,
  recordsRoot: (projectId: string, module: EnterpriseRecordKind) =>
    [...enterpriseProjectKeys.detail(projectId), module] as const,
  records: (projectId: string, module: EnterpriseRecordKind, filters?: EnterpriseListFilters) =>
    [...enterpriseProjectKeys.recordsRoot(projectId, module), filters ?? {}] as const,
};

export function useEnterpriseCustomersQuery(filters?: EnterpriseListFilters) {
  return useQuery({
    queryKey: enterpriseProjectKeys.customers(filters),
    queryFn: () => enterpriseProjectService.listCustomers(filters),
  });
}

export function useEnterpriseCustomerQuery(customerId: string) {
  return useQuery({
    queryKey: enterpriseProjectKeys.customer(customerId),
    queryFn: () => enterpriseProjectService.getCustomer(customerId),
    enabled: Boolean(customerId),
  });
}

export function useEnterpriseCustomerSummaryQuery(customerId: string, year: number) {
  return useQuery({
    queryKey: enterpriseProjectKeys.customerSummary(customerId, year),
    queryFn: () => enterpriseProjectService.getCustomerSummary(customerId, year),
    enabled: Boolean(customerId),
  });
}

export function useCreateEnterpriseCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EnterpriseCustomerPayload) =>
      enterpriseProjectService.createCustomer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.customersRoot() });
    },
  });
}

export function useUpdateEnterpriseCustomerMutation(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EnterpriseCustomerPayload) =>
      enterpriseProjectService.updateCustomer(customerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.customersRoot() });
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.customer(customerId) });
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.lists() });
    },
  });
}

export function useDeleteEnterpriseCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enterpriseProjectService.deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.customersRoot() });
    },
  });
}

export function useEnterpriseOwnEntitiesQuery(filters?: EnterpriseListFilters) {
  return useQuery({
    queryKey: enterpriseProjectKeys.ownEntities(filters),
    queryFn: () => enterpriseProjectService.listOwnEntities(filters),
  });
}

export function useEnterpriseOwnEntityQuery(entityId: string) {
  return useQuery({
    queryKey: enterpriseProjectKeys.ownEntity(entityId),
    queryFn: () => enterpriseProjectService.getOwnEntity(entityId),
    enabled: Boolean(entityId),
  });
}

export function useCreateEnterpriseOwnEntityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EnterpriseOwnEntityPayload) =>
      enterpriseProjectService.createOwnEntity(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.ownEntitiesRoot() });
    },
  });
}

export function useUpdateEnterpriseOwnEntityMutation(entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EnterpriseOwnEntityPayload) =>
      enterpriseProjectService.updateOwnEntity(entityId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.ownEntitiesRoot() });
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.ownEntity(entityId) });
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.lists() });
    },
  });
}

export function useDeleteEnterpriseOwnEntityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enterpriseProjectService.deleteOwnEntity,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.ownEntitiesRoot() });
    },
  });
}

export function useEnterpriseProjectsQuery(filters?: EnterpriseListFilters) {
  return useQuery({
    queryKey: enterpriseProjectKeys.list(filters),
    queryFn: () => enterpriseProjectService.listProjects(filters),
  });
}

export function useEnterpriseProjectQuery(projectId: string) {
  return useQuery({
    queryKey: enterpriseProjectKeys.detail(projectId),
    queryFn: () => enterpriseProjectService.getProject(projectId),
    enabled: Boolean(projectId),
  });
}

export function useEnterpriseProjectSummaryQuery(projectId: string) {
  return useQuery({
    queryKey: enterpriseProjectKeys.summary(projectId),
    queryFn: () => enterpriseProjectService.getSummary(projectId),
    enabled: Boolean(projectId),
  });
}

export function useEnterpriseRecordsQuery(
  projectId: string,
  module: EnterpriseRecordKind,
  filters?: EnterpriseListFilters
) {
  return useQuery({
    queryKey: enterpriseProjectKeys.records(projectId, module, filters),
    queryFn: () => enterpriseProjectService.listRecords(projectId, module, filters),
    enabled: Boolean(projectId),
  });
}

export function useCreateEnterpriseProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EnterpriseProjectPayload) =>
      enterpriseProjectService.createProject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.customersRoot() });
    },
  });
}

export function useUpdateEnterpriseProjectMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EnterpriseProjectPayload) =>
      enterpriseProjectService.updateProject(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.detail(projectId) });
    },
  });
}

export function useDeleteEnterpriseProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enterpriseProjectService.deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enterpriseProjectKeys.lists() });
    },
  });
}

export function useCreateEnterpriseRecordMutation(
  projectId: string,
  module: EnterpriseRecordKind
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FinancialRecordPayload) =>
      enterpriseProjectService.createRecord(projectId, module, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.recordsRoot(projectId, module),
      });
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.summary(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.detail(projectId),
      });
    },
  });
}

export function useUpdateEnterpriseRecordMutation(
  projectId: string,
  module: EnterpriseRecordKind,
  recordId: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FinancialRecordPayload) =>
      enterpriseProjectService.updateRecord(projectId, module, recordId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.recordsRoot(projectId, module),
      });
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.summary(projectId),
      });
    },
  });
}

export function useDeleteEnterpriseRecordMutation(
  projectId: string,
  module: EnterpriseRecordKind
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) =>
      enterpriseProjectService.deleteRecord(projectId, module, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.recordsRoot(projectId, module),
      });
      queryClient.invalidateQueries({
        queryKey: enterpriseProjectKeys.summary(projectId),
      });
    },
  });
}
