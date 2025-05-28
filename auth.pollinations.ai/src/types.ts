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
