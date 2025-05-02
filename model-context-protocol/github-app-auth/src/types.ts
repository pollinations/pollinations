/**
 * Type definitions for GitHub App authentication
 */

export interface Env {
  // Environment bindings
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_ID: string;
  REDIRECT_URI: string;
}

export interface User {
  github_user_id: string;
  username: string;
  app_installation_id?: string;
  installation_token?: string;
  token_expiry?: string;
  domain_allowlist?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthSession {
  session_id: string;
  github_user_id?: string;
  state: string;
  status: 'pending' | 'complete' | 'error';
  created_at?: string;
}

export interface TokenData {
  token: string;
  expires_at: Date;
}
