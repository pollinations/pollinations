#!/usr/bin/env node
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
 *   ISSUE_NUMBER=123 ISSUE_AUTHOR=username node app-validate-submission.js
 */

const { execSync } = require('child_process');

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR;

async function main() {
  const result = {
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
    result.checks.registration = {
      error: err.message,
      registered: false
    };
    result.valid = false;
    result.errors.push(`Failed to check registration: ${err.message}`);
  }

  // 3. Fetch issue to get body for duplicate check and repo URL
  try {
    const issueCmd = `gh issue view ${ISSUE_NUMBER} --repo pollinations/pollinations --json body`;
    const issueData = JSON.parse(execSync(issueCmd, { encoding: 'utf-8' }));
    const body = issueData.body || '';

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

    // 4. Check duplicates
    if (appUrl || result.repo_url || appName) {
      try {
        const projectJson = JSON.stringify({
          name: appName,
          url: appUrl,
          repo: result.repo_url || ''
        });

        const dupCmd = `PROJECT_JSON='${projectJson.replace(/'/g, "\\'")}' GITHUB_USERNAME="${ISSUE_AUTHOR}" node .github/scripts/app-check-duplicate.js`;
        const dupOutput = execSync(dupCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        const dupResult = JSON.parse(dupOutput);

        result.checks.duplicate = dupResult;

        if (dupResult.isDuplicate && ['url_exact', 'repo_exact', 'name_user_exact'].includes(dupResult.matchType)) {
          result.valid = false;
          result.errors.push(`Duplicate detected: ${dupResult.matchType} - ${dupResult.reason}`);
        }
      } catch (err) {
        result.checks.duplicate = { error: err.message };
      }
    }

    // 5. Fetch GitHub stars if repo URL found
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

    // 6. Check for existing PR for this issue
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
    result.errors.push(`Failed to fetch issue: ${err.message}`);
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
