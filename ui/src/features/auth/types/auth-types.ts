export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  name: string;
  role: string;
  created_at?: string;
  avatar_url?: string;
}

export interface AuthResponse {
  user: User;
  token: TokenResponse;
}

export type ScanLoginStatus = "pending" | "confirmed" | "consumed";

export interface ScanLoginSession {
  scan_token: string;
  qr_payload: string;
  expires_in: number;
  status: ScanLoginStatus;
}

export interface ScanLoginStatusResponse {
  status: ScanLoginStatus;
  expires_in: number;
}

export type ScanLoginPollResponse = AuthResponse | ScanLoginStatusResponse;

export interface LoginCredentials {
  account: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username?: string;
  name?: string;
  password: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
}
