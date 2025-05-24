import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
}

export interface User {
  github_user_id: string;
  username: string;
  avatar_url?: string;
  email?: string;
  domain_allowlist?: string[];
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
}
