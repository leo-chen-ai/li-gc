import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  CollectionRecord,
  EnterpriseCustomer,
  EnterpriseCustomerPayload,
  EnterpriseCustomerSummary,
  EnterpriseListFilters,
  EnterpriseListResponse,
  EnterpriseOwnEntity,
  EnterpriseOwnEntityPayload,
  EnterpriseProject,
  EnterpriseProjectPayload,
  EnterpriseProjectSummary,
  EnterpriseRecordKind,
  FinancialRecordPayload,
  IssuedInvoice,
  PaymentRecord,
  ReceivedInvoice,
} from "./types";

function unwrapData<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (response.data == null) {
    throw new Error(fallbackMessage);
  }
  return response.data;
}

function exportParams(filters?: EnterpriseListFilters) {
  const { page: _page, page_size: _pageSize, ...rest } = filters ?? {};
  return rest;
}

type RecordResponse<T extends EnterpriseRecordKind> =
  T extends "issued-invoices"
    ? IssuedInvoice
    : T extends "received-invoices"
      ? ReceivedInvoice
      : T extends "collections"
        ? CollectionRecord
        : PaymentRecord;

export const enterpriseProjectService = {
  listCustomers: async (
    filters?: EnterpriseListFilters
  ): Promise<EnterpriseListResponse<EnterpriseCustomer>> => {
    const response = await apiClient.get<ApiResponse<EnterpriseListResponse<EnterpriseCustomer>>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMERS,
      { params: filters }
    );
    return unwrapData(response.data, "获取往来单位列表失败");
  },

  getCustomer: async (customerId: string): Promise<EnterpriseCustomer> => {
    const response = await apiClient.get<ApiResponse<EnterpriseCustomer>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMER(customerId)
    );
    return unwrapData(response.data, "获取往来单位详情失败");
  },

  createCustomer: async (payload: EnterpriseCustomerPayload): Promise<EnterpriseCustomer> => {
    const response = await apiClient.post<ApiResponse<EnterpriseCustomer>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMERS,
      payload
    );
    return unwrapData(response.data, "新增往来单位失败");
  },

  updateCustomer: async (
    customerId: string,
    payload: EnterpriseCustomerPayload
  ): Promise<EnterpriseCustomer> => {
    const response = await apiClient.patch<ApiResponse<EnterpriseCustomer>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMER(customerId),
      payload
    );
    return unwrapData(response.data, "修改往来单位失败");
  },

  deleteCustomer: async (customerId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMER(customerId));
  },

  exportCustomers: async (filters?: EnterpriseListFilters): Promise<Blob> => {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMERS_EXPORT, {
      params: exportParams(filters),
      responseType: "blob",
    });
    return response.data;
  },

  getCustomerSummary: async (
    customerId: string,
    year: number
  ): Promise<EnterpriseCustomerSummary> => {
    const response = await apiClient.get<ApiResponse<EnterpriseCustomerSummary>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_CUSTOMER_SUMMARY(customerId),
      { params: { year } }
    );
    return unwrapData(response.data, "获取往来单位经营汇总失败");
  },

  listOwnEntities: async (
    filters?: EnterpriseListFilters
  ): Promise<EnterpriseListResponse<EnterpriseOwnEntity>> => {
    const response = await apiClient.get<ApiResponse<EnterpriseListResponse<EnterpriseOwnEntity>>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_OWN_ENTITIES,
      { params: filters }
    );
    return unwrapData(response.data, "获取我方主体列表失败");
  },

  getOwnEntity: async (entityId: string): Promise<EnterpriseOwnEntity> => {
    const response = await apiClient.get<ApiResponse<EnterpriseOwnEntity>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_OWN_ENTITY(entityId)
    );
    return unwrapData(response.data, "获取我方主体详情失败");
  },

  createOwnEntity: async (payload: EnterpriseOwnEntityPayload): Promise<EnterpriseOwnEntity> => {
    const response = await apiClient.post<ApiResponse<EnterpriseOwnEntity>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_OWN_ENTITIES,
      payload
    );
    return unwrapData(response.data, "新增我方主体失败");
  },

  updateOwnEntity: async (
    entityId: string,
    payload: EnterpriseOwnEntityPayload
  ): Promise<EnterpriseOwnEntity> => {
    const response = await apiClient.patch<ApiResponse<EnterpriseOwnEntity>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_OWN_ENTITY(entityId),
      payload
    );
    return unwrapData(response.data, "修改我方主体失败");
  },

  deleteOwnEntity: async (entityId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(API_ENDPOINTS.ADMIN.ENTERPRISE_OWN_ENTITY(entityId));
  },

  exportOwnEntities: async (filters?: EnterpriseListFilters): Promise<Blob> => {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.ENTERPRISE_OWN_ENTITIES_EXPORT, {
      params: exportParams(filters),
      responseType: "blob",
    });
    return response.data;
  },

  listProjects: async (
    filters?: EnterpriseListFilters
  ): Promise<EnterpriseListResponse<EnterpriseProject>> => {
    const response = await apiClient.get<ApiResponse<EnterpriseListResponse<EnterpriseProject>>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECTS,
      { params: filters }
    );
    return unwrapData(response.data, "获取往来单位关联项目失败");
  },

  getProject: async (projectId: string): Promise<EnterpriseProject> => {
    const response = await apiClient.get<ApiResponse<EnterpriseProject>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT(projectId)
    );
    return unwrapData(response.data, "获取往来单位关联项目详情失败");
  },

  createProject: async (payload: EnterpriseProjectPayload): Promise<EnterpriseProject> => {
    const response = await apiClient.post<ApiResponse<EnterpriseProject>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECTS,
      payload
    );
    return unwrapData(response.data, "新增往来单位关联项目失败");
  },

  updateProject: async (
    projectId: string,
    payload: EnterpriseProjectPayload
  ): Promise<EnterpriseProject> => {
    const response = await apiClient.patch<ApiResponse<EnterpriseProject>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT(projectId),
      payload
    );
    return unwrapData(response.data, "修改往来单位关联项目失败");
  },

  deleteProject: async (projectId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT(projectId)
    );
  },

  exportProjects: async (filters?: EnterpriseListFilters): Promise<Blob> => {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECTS_EXPORT, {
      params: exportParams(filters),
      responseType: "blob",
    });
    return response.data;
  },

  getSummary: async (projectId: string): Promise<EnterpriseProjectSummary> => {
    const response = await apiClient.get<ApiResponse<EnterpriseProjectSummary>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT_SUMMARY(projectId)
    );
    return unwrapData(response.data, "获取经营汇总失败");
  },

  listRecords: async <T extends EnterpriseRecordKind>(
    projectId: string,
    module: T,
    filters?: EnterpriseListFilters
  ): Promise<EnterpriseListResponse<RecordResponse<T>>> => {
    const response = await apiClient.get<ApiResponse<EnterpriseListResponse<RecordResponse<T>>>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT_RECORDS(projectId, module),
      { params: filters }
    );
    return unwrapData(response.data, "获取流水记录失败");
  },

  createRecord: async <T extends EnterpriseRecordKind>(
    projectId: string,
    module: T,
    payload: FinancialRecordPayload
  ): Promise<RecordResponse<T>> => {
    const response = await apiClient.post<ApiResponse<RecordResponse<T>>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT_RECORDS(projectId, module),
      payload
    );
    return unwrapData(response.data, "新增流水记录失败");
  },

  updateRecord: async <T extends EnterpriseRecordKind>(
    projectId: string,
    module: T,
    recordId: string,
    payload: FinancialRecordPayload
  ): Promise<RecordResponse<T>> => {
    const response = await apiClient.patch<ApiResponse<RecordResponse<T>>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT_RECORD(projectId, module, recordId),
      payload
    );
    return unwrapData(response.data, "修改流水记录失败");
  },

  deleteRecord: async (
    projectId: string,
    module: EnterpriseRecordKind,
    recordId: string
  ): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT_RECORD(projectId, module, recordId)
    );
  },

  exportRecords: async (
    projectId: string,
    module: EnterpriseRecordKind,
    filters?: EnterpriseListFilters
  ): Promise<Blob> => {
    const response = await apiClient.get(
      API_ENDPOINTS.ADMIN.ENTERPRISE_PROJECT_RECORDS_EXPORT(projectId, module),
      {
        params: exportParams(filters),
        responseType: "blob",
      }
    );
    return response.data;
  },
};
