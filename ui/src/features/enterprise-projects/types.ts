export type EnterpriseProjectStatus = "active" | "paused" | "completed" | "archived";
export type EnterpriseCustomerStatus = "active" | "inactive" | "archived";
export type EnterpriseOwnEntityStatus = "active" | "inactive" | "archived";
export type IssuedInvoiceStatus = "draft" | "issued" | "voided";
export type ReceivedInvoiceStatus = "pending" | "received" | "voided";
export type CashRecordStatus = "draft" | "confirmed" | "cancelled";
export type EnterpriseRecordKind = "issued-invoices" | "received-invoices" | "collections" | "payments";

export interface EnterpriseAttachment {
  name: string;
  url: string;
}

export interface EnterpriseListResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface EnterpriseListFilters {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: string;
  customer_id?: string;
  own_entity_id?: string;
  year?: number;
  date_from?: string;
  date_to?: string;
}

export interface EnterpriseProject {
  id: string;
  project_code: string | null;
  name: string;
  customer_id: string | null;
  customer_name: string | null;
  own_entity_id: string | null;
  own_entity_name: string | null;
  contract_amount_cents: number;
  owner_name: string | null;
  status: EnterpriseProjectStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnterpriseProjectPayload {
  project_code?: string;
  name: string;
  customer_id?: string;
  customer_name?: string;
  own_entity_id?: string;
  own_entity_name?: string;
  contract_amount?: string;
  owner_name?: string;
  status?: EnterpriseProjectStatus;
  planned_start_date?: string;
  planned_end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  remark?: string;
}

export interface EnterpriseCustomer {
  id: string;
  customer_code: string | null;
  name: string;
  credit_code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  status: EnterpriseCustomerStatus;
  remark: string | null;
  project_count?: number;
  contract_amount_cents?: number;
  issued_invoice_amount_cents?: number;
  received_invoice_amount_cents?: number;
  collection_amount_cents?: number;
  payment_amount_cents?: number;
  cash_profit_cents?: number;
  accounting_profit_cents?: number;
  receivable_balance_cents?: number;
  payable_balance_cents?: number;
  created_at: string;
  updated_at: string;
}

export interface EnterpriseCustomerPayload {
  customer_code?: string;
  name: string;
  credit_code?: string;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  status?: EnterpriseCustomerStatus;
  remark?: string;
}

export interface EnterpriseCustomerSummary {
  customer_id: string;
  year: number;
  project_count: number;
  contract_amount_cents: number;
  issued_invoice_amount_cents: number;
  received_invoice_amount_cents: number;
  collection_amount_cents: number;
  payment_amount_cents: number;
  cash_profit_cents: number;
  accounting_profit_cents: number;
  receivable_balance_cents: number;
  payable_balance_cents: number;
  collection_rate: number;
  payment_rate: number;
}

export interface EnterpriseOwnEntity {
  id: string;
  name: string;
  credit_code: string | null;
  bank_name: string | null;
  bank_account: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  status: EnterpriseOwnEntityStatus;
  is_default: boolean;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnterpriseOwnEntityPayload {
  name: string;
  credit_code?: string;
  bank_name?: string;
  bank_account?: string;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  status?: EnterpriseOwnEntityStatus;
  is_default?: boolean;
  remark?: string;
}

export interface EnterpriseProjectSummary {
  project_id: string;
  issued_invoice_amount_cents: number;
  received_invoice_amount_cents: number;
  collection_amount_cents: number;
  payment_amount_cents: number;
  cash_profit_cents: number;
  accounting_profit_cents: number;
  receivable_balance_cents: number;
  payable_balance_cents: number;
}

export interface IssuedInvoice {
  id: string;
  project_id: string;
  counterparty_id: string | null;
  customer_name: string | null;
  own_entity_id: string | null;
  own_entity_name: string | null;
  invoice_no: string | null;
  invoice_date: string;
  amount_cents: number;
  tax_rate: number | null;
  status: IssuedInvoiceStatus;
  remark: string | null;
  attachments: EnterpriseAttachment[];
  created_at: string;
}

export interface ReceivedInvoice {
  id: string;
  project_id: string;
  counterparty_id: string | null;
  supplier_name: string | null;
  own_entity_id: string | null;
  own_entity_name: string | null;
  invoice_no: string | null;
  invoice_date: string;
  amount_cents: number;
  tax_rate: number | null;
  expense_type: string | null;
  status: ReceivedInvoiceStatus;
  remark: string | null;
  attachments: EnterpriseAttachment[];
  created_at: string;
}

export interface CollectionRecord {
  id: string;
  project_id: string;
  issued_invoice_id: string | null;
  counterparty_id: string | null;
  payer_name: string | null;
  own_entity_id: string | null;
  own_entity_name: string | null;
  collection_date: string;
  amount_cents: number;
  account_name: string | null;
  status: CashRecordStatus;
  remark: string | null;
  attachments: EnterpriseAttachment[];
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  project_id: string;
  received_invoice_id: string | null;
  counterparty_id: string | null;
  payee_name: string | null;
  own_entity_id: string | null;
  own_entity_name: string | null;
  payment_date: string;
  amount_cents: number;
  account_name: string | null;
  status: CashRecordStatus;
  remark: string | null;
  attachments: EnterpriseAttachment[];
  created_at: string;
}

export type EnterpriseRecord =
  | IssuedInvoice
  | ReceivedInvoice
  | CollectionRecord
  | PaymentRecord;

export interface FinancialRecordPayload {
  customer_id?: string;
  counterparty_id?: string;
  own_entity_id?: string;
  own_entity_name?: string;
  invoice_no?: string;
  invoice_date?: string;
  customer_name?: string;
  supplier_name?: string;
  expense_type?: string;
  payer_name?: string;
  payee_name?: string;
  collection_date?: string;
  payment_date?: string;
  amount?: string;
  tax_rate?: string;
  account_name?: string;
  issued_invoice_id?: string;
  received_invoice_id?: string;
  status?: string;
  attachments?: EnterpriseAttachment[];
  attachment_text?: string;
  remark?: string;
}
