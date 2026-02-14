#!/usr/bin/env node

/**
 * Recover missing Issue_URLs for legacy apps in APPS.md.
 * Searches GitHub issues by app URL/name to find the original submission.
 * Also backfills GitHub_Username and GitHub_UserID from the found issue.
 *
 * Usage: node .github/scripts/app-recover-issues.js [options]
 *   --dry-run    Show changes without modifying APPS.md
 *   --verbose    Show detailed output
 *
 * Env vars:
 *   GITHUB_TOKEN   Required — for GitHub API access
 */

const fs = require("fs");
const https = require("https");

const APPS_FILE = "apps/APPS.md";
const GITHUB_API = "api.github.com";

// Known bad issues that are NOT real app submissions
const BAD_ISSUES = new Set(["2275", "1088", "3842"]);

const colors = {
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	reset: "\x1b[0m",
	bold: "\x1b[1m",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

function fetchJSON(path) {
	return new Promise((resolve) => {
		const options = {
			hostname: GITHUB_API,
			path,
			method: "GET",
			headers: {
				"User-Agent": "pollinations-recover/1.0",
				Accept: "application/vnd.github.v3+json",
			},
		};

		if (process.env.GITHUB_TOKEN) {
			options.headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
		}

		const req = https.request(options, (res) => {
			let data = "";
			res.on("data", (chunk) => {
				data += chunk;
			});
			res.on("end", () => {
				if (res.statusCode === 200) {
					try {
						resolve({ data: JSON.parse(data) });
					} catch {
						resolve({ error: "parse error" });
					}
				} else {
					resolve({ error: `status ${res.statusCode}` });
				}
			});
		});

		req.on("error", (err) => resolve({ error: err.message }));
		req.setTimeout(10000, () => {
			req.destroy();
			resolve({ error: "timeout" });
		});
		req.end();
	});
}

async function searchIssues(query) {
	const encoded = encodeURIComponent(`repo:pollinations/pollinations ${query}`);
	const { data, error } = await fetchJSON(
		`/search/issues?q=${encoded}&per_page=5`,
	);
	if (error) return { error };
	return { data: data.items || [] };
}

async function main() {
	console.log(`${colors.bold}🔍 Recover Issue URLs${colors.reset}\n`);

	if (!process.env.GITHUB_TOKEN) {
		console.error(
			`${colors.red}Error: GITHUB_TOKEN environment variable is required${colors.reset}`,
		);
		process.exit(1);
	}

	if (dryRun) {
		console.log(
			`${colors.yellow}[DRY RUN] APPS.md will not be modified${colors.reset}\n`,
		);
	}

	const content = fs.readFileSync(APPS_FILE, "utf8");
	const lines = content.split("\n");

	const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
	const headers = lines[headerIdx].split("|").map((h) => h.trim());

	const USERNAME_COL = headers.findIndex(
		(h) => h.toLowerCase() === "github_username",
	);
	const USERID_COL = headers.findIndex(
		(h) => h.toLowerCase() === "github_userid",
	);
	const ISSUE_COL = headers.findIndex(
		(h) => h.toLowerCase() === "issue_url",
	);
	const NAME_COL = headers.findIndex((h) => h.toLowerCase() === "name");
	const URL_COL = headers.findIndex(
		(h) => h.toLowerCase() === "web_url",
	);
	const SUBMITTED_COL = headers.findIndex(
		(h) => h.toLowerCase() === "submitted_date",
	);

	// Find apps with empty Issue_URL
	const toRecover = [];
	const dataStartIdx = headerIdx + 2;

	for (let i = dataStartIdx; i < lines.length; i++) {
		const line = lines[i];
		if (!line.startsWith("|")) continue;

		const cols = line.split("|");
		const issueUrl = (cols[ISSUE_COL] || "").trim();
		const name = (cols[NAME_COL] || "").trim();
		const webUrl = (cols[URL_COL] || "").trim();

		if (issueUrl) continue; // Already has an issue URL
		if (!name) continue;

		toRecover.push({ lineIdx: i, name, webUrl });
	}

	console.log(`Found ${toRecover.length} apps with missing Issue_URLs\n`);

	if (toRecover.length === 0) {
		console.log(
			`${colors.green}All apps have Issue_URLs!${colors.reset}`,
		);
		return 0;
	}

	const changes = [];
	let notFound = 0;
	let errors = 0;

	for (let idx = 0; idx < toRecover.length; idx++) {
		const app = toRecover[idx];

		if (!verbose) {
			process.stdout.write(
				`\rSearching: ${idx + 1}/${toRecover.length}`,
			);
		}

		// Strategy 1: Search by URL (most reliable)
		let found = null;
		if (app.webUrl) {
			// Extract domain+path for search
			const urlMatch = app.webUrl.match(/https?:\/\/(.+)/);
			const searchUrl = urlMatch ? urlMatch[1] : app.webUrl;

			const { data: urlResults, error } = await searchIssues(searchUrl);
			if (error) {
				if (verbose) {
					console.log(
						`${colors.yellow}⚠ ${app.name}: search error — ${error}${colors.reset}`,
					);
				}
				errors++;
				await new Promise((r) => setTimeout(r, 2000));
				continue;
			}

			// Filter out known bad issues and find real submissions
			const candidates = urlResults.filter(
				(issue) =>
					!BAD_ISSUES.has(String(issue.number)) &&
					(issue.title.includes("[Project Submission]") ||
						issue.title.includes("[App Submission]") ||
						issue.title.toLowerCase().includes(app.name.toLowerCase().slice(0, 10))),
			);

			if (candidates.length === 1) {
				found = candidates[0];
			} else if (candidates.length > 1) {
				// Pick the most specific match
				found = candidates[0];
			}
		}

		// Strategy 2: Search by app name
		if (!found) {
			const { data: nameResults, error } = await searchIssues(
				`"${app.name}"`,
			);
			if (error) {
				if (verbose) {
					console.log(
						`${colors.yellow}⚠ ${app.name}: name search error — ${error}${colors.reset}`,
					);
				}
				errors++;
				await new Promise((r) => setTimeout(r, 2000));
				continue;
			}

			const candidates = nameResults.filter(
				(issue) =>
					!BAD_ISSUES.has(String(issue.number)) &&
					(issue.title.includes("[Project Submission]") ||
						issue.title.includes("[App Submission]")),
			);

			if (candidates.length >= 1) {
				found = candidates[0];
			}
		}

		if (!found) {
			if (verbose) {
				console.log(
					`${colors.yellow}✗ ${app.name}: no matching issue found${colors.reset}`,
				);
			}
			notFound++;
			await new Promise((r) => setTimeout(r, 500));
			continue;
		}

		const issueNumber = found.number;
		const issueUrl = `https://github.com/pollinations/pollinations/issues/${issueNumber}`;
		const author = found.user?.login || "";
		const userId = found.user?.id ? String(found.user.id) : "";
		const submittedDate = found.created_at
			? found.created_at.slice(0, 10)
			: "";

		if (verbose) {
			console.log(
				`${colors.green}✓ ${app.name}: #${issueNumber} by @${author}${colors.reset}`,
			);
		}

		changes.push({
			lineIdx: app.lineIdx,
			name: app.name,
			issueUrl,
			issueNumber,
			author,
			userId,
			submittedDate,
		});

		// Rate limit (GitHub search API: 30 req/min)
		await new Promise((r) => setTimeout(r, 2500));
	}

	if (!verbose) console.log("\n");

	// Apply changes
	if (!dryRun && changes.length > 0) {
		for (const change of changes) {
			const cols = lines[change.lineIdx].split("|");
			cols[ISSUE_COL] = ` ${change.issueUrl} `;

			// Backfill username if empty
			const existingUsername = (cols[USERNAME_COL] || "").trim();
			if (!existingUsername && change.author) {
				cols[USERNAME_COL] = ` @${change.author} `;
				if (USERID_COL !== -1) {
					cols[USERID_COL] = ` ${change.userId} `;
				}
			}

			// Backfill submitted date if empty
			const existingDate = (cols[SUBMITTED_COL] || "").trim();
			if (!existingDate && change.submittedDate) {
				cols[SUBMITTED_COL] = ` ${change.submittedDate} `;
			}

			lines[change.lineIdx] = cols.join("|");
		}

		fs.writeFileSync(APPS_FILE, lines.join("\n"));
		console.log(
			`\n${colors.green}✅ Updated ${changes.length} apps in ${APPS_FILE}${colors.reset}`,
		);
	}

	// Summary
	console.log(`\n${colors.bold}📊 Summary${colors.reset}`);
	console.log(
		`${colors.green}✓ Recovered: ${changes.length}${colors.reset}`,
	);
	console.log(
		`${colors.yellow}✗ Not found: ${notFound}${colors.reset}`,
	);
	console.log(
		`${colors.yellow}⚠ Errors: ${errors}${colors.reset}`,
	);

	if (dryRun && changes.length > 0) {
		console.log(
			`\n${colors.cyan}[DRY RUN] Would update:${colors.reset}`,
		);
		for (const c of changes) {
			console.log(`  ${c.name}: #${c.issueNumber} by @${c.author}`);
		}
	}

	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(
			`${colors.red}Fatal error: ${err.message}${colors.reset}`,
		);
		process.exit(1);
	});
