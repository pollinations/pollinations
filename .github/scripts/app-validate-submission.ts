#!/usr/bin/env npx ts-node
/**
 * Validates app submission before Claude processes it.
 *
 * Checks:
 * 1. Issue author is registered at Enter
 * 2. No duplicate submissions
 * 3. Fetches GitHub stars if repo provided
 *
 * Outputs JSON with validation results.
 *
 * Usage:
 *   ISSUE_NUMBER=123 ISSUE_AUTHOR=username npx ts-node app-validate-submission.ts
 */

import { execSync } from 'child_process';

interface RegistrationCheck {
  registered: boolean;
  username?: string;
  error?: string;
}

interface DuplicateCheck {
  isDuplicate?: boolean;
  matchType?: string;
  reason?: string;
  error?: string;
}

interface ExistingPR {
  number: number;
  headRefName: string;
  url: string;
}

interface ValidationResult {
  valid: boolean;
  issue_number: string | undefined;
  issue_author: string | undefined;
  checks: {
    registration?: RegistrationCheck;
    duplicate?: DuplicateCheck;
  };
  errors: string[];
  stars: number | null;
  repo_url: string | null;
  existing_pr?: ExistingPR | null;
}

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR;

async function main(): Promise<void> {
  const result: ValidationResult = {
    valid: true,
    issue_number: ISSUE_NUMBER,
    issue_author: ISSUE_AUTHOR,
    checks: {},
    errors: [],
    stars: null,
    repo_url: null
  };

  // 1. Check Enter registration
  try {
    const cmd = `cd enter.pollinations.ai && npx wrangler d1 execute DB --remote --env production --command "SELECT id FROM user WHERE LOWER(github_username) = LOWER('${ISSUE_AUTHOR}');" --json`;
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const data = JSON.parse(output);
    const registered = data?.[0]?.results?.length > 0;

    result.checks.registration = {
      registered,
      username: ISSUE_AUTHOR
    };

    if (!registered) {
      result.valid = false;
      result.errors.push(`User @${ISSUE_AUTHOR} is not registered at enter.pollinations.ai`);
    }
  } catch (err) {
    const error = err as Error;
    result.checks.registration = {
      error: error.message,
      registered: false
    };
    result.valid = false;
    result.errors.push(`Failed to check registration: ${error.message}`);
  }

  // 2. Fetch issue to get body for duplicate check and repo URL
  try {
    const issueCmd = `gh issue view ${ISSUE_NUMBER} --repo pollinations/pollinations --json body`;
    const issueData = JSON.parse(execSync(issueCmd, { encoding: 'utf-8' }));
    const body: string = issueData.body || '';

    // Extract repo URL if present
    const repoMatch = body.match(/https?:\/\/github\.com\/[^\s\)]+/i);
    if (repoMatch) {
      result.repo_url = repoMatch[0].replace(/\.git$/, '').replace(/\/$/, '');
    }

    // Extract app URL
    const urlMatch = body.match(/https?:\/\/[^\s\)]+/i);
    const appUrl = urlMatch ? urlMatch[0] : '';

    // Extract name (first line or "Name:" field)
    const nameMatch = body.match(/(?:name|app\s*name)\s*[:\-]?\s*(.+)/i) || body.match(/^(.+)$/m);
    const appName = nameMatch ? nameMatch[1].trim().substring(0, 50) : '';

    // 3. Check duplicates
    if (appUrl || result.repo_url || appName) {
      try {
        const projectJson = JSON.stringify({
          name: appName,
          url: appUrl,
          repo: result.repo_url || ''
        });

        const dupCmd = `GITHUB_USERNAME="${ISSUE_AUTHOR}" PROJECT_JSON='${projectJson.replace(/'/g, "\\'")}' npx ts-node .github/scripts/app-check-duplicate.ts`;
        const dupOutput = execSync(dupCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        const dupResult = JSON.parse(dupOutput);

        result.checks.duplicate = {
          isDuplicate: dupResult.isDuplicate,
          matchType: dupResult.matchType || undefined,
          reason: dupResult.reason || undefined
        };

        if (dupResult.isDuplicate && ['url_exact', 'repo_exact', 'name_user_exact'].includes(dupResult.matchType)) {
          result.valid = false;
          result.errors.push(`Duplicate detected: ${dupResult.matchType} - ${dupResult.reason}`);
        }
      } catch (err) {
        const error = err as Error;
        result.checks.duplicate = { error: error.message };
      }
    }

    // 4. Fetch GitHub stars if repo URL found
    if (result.repo_url) {
      try {
        const repoPath = result.repo_url.replace(/https?:\/\/github\.com\//i, '');
        const starsCmd = `gh api repos/${repoPath} --jq '.stargazers_count'`;
        const stars = parseInt(execSync(starsCmd, { encoding: 'utf-8' }).trim(), 10);
        result.stars = isNaN(stars) ? 0 : stars;
      } catch {
        result.stars = 0;
      }
    }

    // 5. Check for existing PR for this issue
    try {
      const prCmd = `gh pr list --repo pollinations/pollinations --search "Fixes #${ISSUE_NUMBER}" --json number,headRefName,url --jq '.[0]'`;
      const prOutput = execSync(prCmd, { encoding: 'utf-8' }).trim();
      if (prOutput) {
        result.existing_pr = JSON.parse(prOutput);
      }
    } catch {
      result.existing_pr = null;
    }

  } catch (err) {
    const error = err as Error;
    result.errors.push(`Failed to fetch issue: ${error.message}`);
  }

  console.log(JSON.stringify(result, null, 2));

  // Exit with error if validation failed
  if (!result.valid) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ valid: false, error: err.message }));
  process.exit(1);
});
