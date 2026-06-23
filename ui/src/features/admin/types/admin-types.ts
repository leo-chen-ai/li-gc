import type { User } from "@/features/auth/types/auth-types";

// Extended user with timestamps (for admin view)
export interface UserWithTimestamps extends User {
  created_at?: string;
  updated_at?: string;
}

// Log level request
export interface LogLevelRequest {
  level: "trace" | "debug" | "info" | "warn" | "error";
}

// Backward compatible alias
export type { LogLevelRequest as ChangeLogLevelRequest };

export interface DashboardStats {
  total_users: number;
  total_admins: number;
  total_api_keys: number;
  active_api_keys: number;
  new_users_this_month: number;
}

export interface ApiKey {
  id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  user_count: number;
  menu_keys: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  description?: string;
}

export interface AdminUploadFile {
  id: string;
  is_deleted: boolean;
  biz_type: string | null;
  biz_id: string | null;
  field_key: string | null;
  original_filename: string | null;
  object_key: string;
  bucket: string | null;
  endpoint: string | null;
  public_base_url: string;
  public_url: string;
  storage_driver: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
