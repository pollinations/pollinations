import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  ADMIN_API_KEY: string;
}

export interface User {
  github_user_id: string;
  username: string;
  // Removed optional fields that aren't in the database schema
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
}

// User tier types
export type UserTier = 'seed' | 'flower' | 'nectar';

export interface UserTierInfo {
  user_id: string;
  username: string;
  tier: UserTier;
}

// Subdomain types
export type SubdomainSource = 'github_pages' | 'custom';

export interface Subdomain {
  id: number;
  user_id: string;
  subdomain: string;
  source: SubdomainSource;
  repo?: string;
  custom_domain: boolean;
  created_at: string;
  last_published?: string;
  updated_at: string;
}

export interface SubdomainRegistration {
  subdomain: string;
  source: SubdomainSource;
  repo?: string;
  custom_domain?: boolean;
}

export interface SubdomainUpdate {
  source?: SubdomainSource;
  repo?: string;
  custom_domain?: boolean;
}

export interface SubdomainStatus {
  subdomain: string;
  status: 'active' | 'pending' | 'error';
  last_published?: string;
  error_message?: string;
}
