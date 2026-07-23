import logging
from typing import Any

import aiohttp

from ...utils.cache import TTLCache
from ...core.config import config
from . import auth as github_auth
from .projects import ProjectsMixin
from .repo_overview import RepoOverviewMixin

logger = logging.getLogger(__name__)

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

CACHE_TTL = 300


class GitHubGraphQL(ProjectsMixin, RepoOverviewMixin):
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None
        self._connector: aiohttp.TCPConnector | None = None
        self._cache = TTLCache(maxsize=512, ttl=CACHE_TTL)

    @property
    def owner(self) -> str:
        return config.bot.default_repo.split("/")[0]

    @property
    def repo(self) -> str:
        return config.bot.default_repo.split("/")[1]

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._connector = aiohttp.TCPConnector(
                limit=50,
                limit_per_host=30,
                keepalive_timeout=60,
                enable_cleanup_closed=True,
                ttl_dns_cache=300,
                use_dns_cache=True,
            )
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=aiohttp.ClientTimeout(total=30, connect=10),
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
        if self._connector:
            await self._connector.close()
            self._connector = None

    async def _get_token(self, for_projects: bool = False) -> str | None:
        if for_projects:
            if github_auth.github_app_auth:
                token = await github_auth.github_app_auth.get_token()
                if token:
                    logger.debug("Using GitHub App token for project operation")
                    return token
            if config.github.project_pat:
                logger.debug("Falling back to GITHUB_PROJECT_PAT for project operation")
                return config.github.project_pat
            else:
                logger.warning("ProjectV2 operation: No GitHub App or GITHUB_PROJECT_PAT configured")
                return None

        if github_auth.github_app_auth:
            token = await github_auth.github_app_auth.get_token()
            if token:
                return token
        return config.github.token if config.github.token else None

    async def _execute(
        self,
        query: str,
        variables: dict | None = None,
        use_sub_issues: bool = False,
        for_projects: bool = False,
    ) -> dict:
        token = await self._get_token(for_projects=for_projects)
        if not token:
            if for_projects:
                return {
                    "error": "ProjectV2 access requires GitHub App with project permissions OR GITHUB_PROJECT_PAT with 'project' scope."
                }
            return {"error": "GitHub token not configured"}

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        if use_sub_issues or "subIssue" in query or "parent" in query:
            headers["GraphQL-Features"] = "sub_issues"

        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables

        try:
            session = await self.get_session()
            async with session.post(
                GITHUB_GRAPHQL_URL,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    if "errors" in data:
                        error_msgs = [e.get("message", str(e)) for e in data["errors"]]
                        logger.warning(f"GraphQL errors: {error_msgs}")
                        return {
                            "data": data.get("data"),
                            "error": "; ".join(error_msgs),
                        }
                    return {"data": data.get("data")}
                else:
                    error_text = await response.text()
                    logger.error(f"GraphQL error {response.status}: {error_text[:200]}")
                    return {"error": f"GitHub API error {response.status}: {error_text[:100]}"}
        except Exception as e:
            logger.error(f"GraphQL request failed: {e}")
            return {"error": f"GitHub request failed: {str(e)}"}

    async def get_issue_full(self, issue_number: int, comments_count: int = 5) -> dict | None:
        query = """
        query GetIssueFull($owner: String!, $repo: String!, $number: Int!, $commentsCount: Int!) {
            repository(owner: $owner, name: $repo) {
                issue(number: $number) {
                    number
                    title
                    body
                    state
                    url
                    createdAt
                    updatedAt
                    author { login }
                    labels(first: 10) {
                        nodes { name }
                    }
                    assignees(first: 5) {
                        nodes { login }
                    }
                    comments(last: $commentsCount) {
                        totalCount
                        nodes {
                            author { login }
                            body
                            createdAt
                        }
                    }
                    subIssues(first: 50) {
                        totalCount
                        nodes {
                            number
                            title
                            state
                            url
                        }
                    }
                    subIssuesSummary {
                        total
                        completed
                        percentCompleted
                    }
                    parent {
                        number
                        title
                        state
                        url
                    }
                }
            }
        }
        """

        result = await self._execute(
            query,
            {
                "owner": self.owner,
                "repo": self.repo,
                "number": issue_number,
                "commentsCount": comments_count,
            },
        )

        if result.get("error"):
            return {"error": result["error"]}

        data = result.get("data")
        if not data or not data.get("repository"):
            return {"error": f"Issue #{issue_number} not found"}

        issue = data["repository"].get("issue")
        if not issue:
            return {"error": f"Issue #{issue_number} not found"}

        return self._format_issue_full(issue)

    async def search_issues_full(self, keywords: str, state: str = "open", limit: int = 10) -> list[dict]:
        state_filter = ""
        if state == "open":
            state_filter = "is:open"
        elif state == "closed":
            state_filter = "is:closed"

        search_query = f"repo:{config.bot.default_repo} is:issue {state_filter} {keywords}"

        query = """
        query SearchIssuesFull($query: String!, $limit: Int!) {
            search(query: $query, type: ISSUE, first: $limit) {
                issueCount
                nodes {
                    ... on Issue {
                        number
                        title
                        body
                        state
                        url
                        createdAt
                        updatedAt
                        author { login }
                        labels(first: 5) {
                            nodes { name }
                        }
                        comments {
                            totalCount
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"query": search_query, "limit": limit})

        if result.get("error"):
            return [{"error": result["error"]}]

        data = result.get("data")
        if not data or not data.get("search"):
            return []

        issues = []
        for node in data["search"].get("nodes", []):
            if node:
                issues.append(self._format_issue_list(node))

        return issues

    async def get_issues_batch(self, issue_numbers: list[int], include_comments: bool = False) -> dict:
        if not issue_numbers:
            return {}

        issue_queries = []
        for i, num in enumerate(issue_numbers[:20]):
            comments_fragment = (
                """
                comments(last: 3) {
                    nodes {
                        author { login }
                        body
                        createdAt
                    }
                }
            """
                if include_comments
                else ""
            )

            issue_queries.append(f"""
                issue{i}: issue(number: {num}) {{
                    number
                    title
                    body
                    state
                    url
                    createdAt
                    author {{ login }}
                    labels(first: 5) {{
                        nodes {{ name }}
                    }}
                    comments {{
                        totalCount
                    }}
                    {comments_fragment}
                }}
            """)

        query = f"""
        query GetIssuesBatch($owner: String!, $repo: String!) {{
            repository(owner: $owner, name: $repo) {{
                {" ".join(issue_queries)}
            }}
        }}
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo})

        if result.get("error"):
            return {"error": result["error"]}

        data = result.get("data")
        if not data or not data.get("repository"):
            return {}

        results = {}
        repo_data = data["repository"]
        for i, num in enumerate(issue_numbers[:20]):
            issue = repo_data.get(f"issue{i}")
            if issue:
                results[num] = self._format_issue_list(issue)
                if include_comments and "comments" in issue:
                    results[num]["comments"] = [
                        {
                            "author": (c["author"]["login"] if c.get("author") else "ghost"),
                            "body": c["body"],
                            "created_at": c["createdAt"][:10],
                        }
                        for c in issue["comments"].get("nodes", [])
                    ]

        return results

    async def find_similar_issues(self, keywords: str, limit: int = 5) -> list[dict]:
        search_query = f"repo:{config.bot.default_repo} is:issue is:open {keywords}"

        query = """
        query FindSimilar($query: String!, $limit: Int!) {
            search(query: $query, type: ISSUE, first: $limit) {
                nodes {
                    ... on Issue {
                        number
                        title
                        body
                        state
                        url
                        createdAt
                        author { login }
                        labels(first: 3) {
                            nodes { name }
                        }
                        comments {
                            totalCount
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"query": search_query, "limit": limit})

        if result.get("error"):
            return [{"error": result["error"]}]

        data = result.get("data")
        if not data or not data.get("search"):
            return []

        return [self._format_issue_list(node) for node in data["search"].get("nodes", []) if node]

    async def search_user_issues(self, discord_username: str, state: str = "open", limit: int = 10) -> list[dict]:
        if state == "open":
            pass
        elif state == "closed":
            pass

        return await self.search_issues_full(keywords=f'"**Author:**" "{discord_username}"', state=state, limit=limit)

    async def get_latest_issue_number(self) -> int | None:
        query = """
        query GetLatestIssue($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
                issues(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
                    nodes {
                        number
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo})

        data = result.get("data")
        if not data or not data.get("repository"):
            return None

        issues = data["repository"]["issues"].get("nodes", [])
        if issues:
            return issues[0]["number"] + 1
        return None

    def _format_issue_full(self, issue: dict) -> dict:
        body = issue.get("body") or ""
        result = {
            "number": issue["number"],
            "title": issue["title"],
            "body": body,
            "state": issue["state"].lower(),
            "url": issue["url"],
            "created_at": issue["createdAt"][:10],
            "updated_at": (issue.get("updatedAt", "")[:10] if issue.get("updatedAt") else ""),
            "author": issue["author"]["login"] if issue.get("author") else "ghost",
            "labels": [l["name"] for l in issue.get("labels", {}).get("nodes", [])],
            "assignees": [a["login"] for a in issue.get("assignees", {}).get("nodes", [])],
            "comments_count": issue.get("comments", {}).get("totalCount", 0),
        }

        if "comments" in issue and "nodes" in issue["comments"]:
            result["comments"] = [
                {
                    "author": c["author"]["login"] if c.get("author") else "ghost",
                    "body": c["body"],
                    "created_at": c["createdAt"][:10],
                }
                for c in issue["comments"]["nodes"]
            ]

        if "subIssues" in issue:
            sub_issues = issue["subIssues"]
            if sub_issues.get("totalCount", 0) > 0:
                result["sub_issues"] = [
                    {
                        "number": si["number"],
                        "title": si["title"],
                        "state": si["state"].lower(),
                        "url": si["url"],
                    }
                    for si in sub_issues.get("nodes", [])
                ]
                result["sub_issues_count"] = sub_issues["totalCount"]

        if "subIssuesSummary" in issue and issue["subIssuesSummary"]:
            summary = issue["subIssuesSummary"]
            result["sub_issues_summary"] = {
                "total": summary.get("total", 0),
                "completed": summary.get("completed", 0),
                "percent_completed": summary.get("percentCompleted", 0),
            }

        if "parent" in issue and issue["parent"]:
            parent = issue["parent"]
            result["parent_issue"] = {
                "number": parent["number"],
                "title": parent["title"],
                "state": parent["state"].lower(),
                "url": parent["url"],
            }

        return result

    def _format_issue_list(self, issue: dict) -> dict:
        body = issue.get("body") or ""
        return {
            "number": issue["number"],
            "title": issue["title"],
            "body": body,
            "state": issue["state"].lower(),
            "url": issue["url"],
            "created_at": issue["createdAt"][:10],
            "author": issue["author"]["login"] if issue.get("author") else "ghost",
            "labels": [l["name"] for l in issue.get("labels", {}).get("nodes", [])],
            "comments_count": issue.get("comments", {}).get("totalCount", 0),
        }

    async def _rest_get(self, url: str) -> dict:
        """GET-only REST request to GitHub API."""
        try:
            token = await self._get_token()
            if not token:
                return {"error": "GitHub token not configured"}
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
            session = await self.get_session()
            async with session.get(url, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {"data": data}
                else:
                    text = await resp.text()
                    return {"error": f"GitHub API returned {resp.status}: {text[:200]}"}
        except Exception as e:
            return {"error": str(e)}

    async def execute_custom_request(
        self,
        request: str,
        include_body: bool = False,
        limit: int = 50,
        graphql_query: str | None = None,
        rest_endpoint: str | None = None,
        rest_url: str | None = None,
    ) -> dict:
        if graphql_query:
            # Block mutations — only allow queries
            # Strip comments (# ...) before checking to prevent bypass
            lines = [l for l in graphql_query.strip().splitlines() if not l.strip().startswith("#")]
            stripped = "\n".join(lines).strip().lower()
            if stripped.startswith("mutation") or not stripped:
                return {"error": "Mutations not allowed. github_custom is read-only."}

            result = await self._execute(
                graphql_query,
                {"owner": self.owner, "repo": self.repo, "limit": min(limit, 100)},
            )
            return {
                "mode": "graphql",
                "query": (graphql_query[:200] + "..." if len(graphql_query) > 200 else graphql_query),
                "data": result.get("data", result),
            }

        if rest_url:
            # Full URL mode — must be api.github.com, GET only
            if not rest_url.startswith("https://api.github.com/"):
                return {"error": "rest_url must start with https://api.github.com/"}
            result = await self._rest_get(rest_url)
            return {"mode": "rest", "url": rest_url, **result}

        if rest_endpoint:
            # Repo-relative endpoint — no whitelist, any GET path allowed
            endpoint = rest_endpoint.strip("/")
            url = f"https://api.github.com/repos/{self.owner}/{self.repo}/{endpoint}"
            result = await self._rest_get(url)
            return {"mode": "rest", "endpoint": endpoint, **result}

        request_lower = request.lower()
        limit = min(limit, 100)

        results = {}

        needs_issues = any(word in request_lower for word in ["issue", "spam", "stale", "bug", "report"])
        needs_prs = any(word in request_lower for word in ["pr", "pull request", "merge"])
        needs_commits = any(word in request_lower for word in ["commit", "contributor", "active", "activity"])
        needs_stats = any(word in request_lower for word in ["stat", "health", "overview", "summary"])
        needs_releases = "release" in request_lower
        needs_branches = "branch" in request_lower
        needs_labels = "label" in request_lower

        if not any(
            [
                needs_issues,
                needs_prs,
                needs_commits,
                needs_stats,
                needs_releases,
                needs_branches,
                needs_labels,
            ]
        ):
            needs_issues = True

        if needs_issues:
            issues_data = await self._fetch_all_issues(limit=limit, include_body=include_body)
            results["issues"] = issues_data

        if needs_prs:
            prs_data = await self._fetch_prs(limit=limit)
            results["pull_requests"] = prs_data

        if needs_commits:
            commits_data = await self._fetch_commits(limit=min(limit, 100))
            results["commits"] = commits_data

        if needs_stats:
            stats_data = await self._fetch_repo_stats()
            results["repo_stats"] = stats_data

        if needs_releases:
            releases_data = await self._fetch_releases(limit=limit)
            results["releases"] = releases_data

        if needs_branches:
            branches_data = await self._fetch_branches(limit=limit)
            results["branches"] = branches_data

        if needs_labels:
            labels_data = await self._fetch_labels()
            results["labels"] = labels_data

        return {
            "request": request,
            "data": results,
            "note": "Raw data provided. Analyze this to answer the user's question.",
        }

    async def get_repo_overview(self, issues_limit: int = 10, include_projects: bool = True) -> dict:
        query = """
        query RepoOverview($owner: String!, $repo: String!, $issuesLimit: Int!) {
            repository(owner: $owner, name: $repo) {
                openIssues: issues(states: OPEN) { totalCount }
                closedIssues: issues(states: CLOSED) { totalCount }

                issues(first: $issuesLimit, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        number
                        title
                        state
                        url
                        createdAt
                        updatedAt
                        author { login }
                        labels(first: 5) { nodes { name } }
                        comments { totalCount }
                    }
                }

                labels(first: 50) {
                    nodes {
                        name
                        color
                        issues(states: OPEN) { totalCount }
                    }
                }

                milestones(first: 20, states: OPEN, orderBy: {field: DUE_DATE, direction: ASC}) {
                    nodes {
                        title
                        number
                        dueOn
                        progressPercentage
                        issues(states: OPEN) { totalCount }
                        closedIssues: issues(states: CLOSED) { totalCount }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "issuesLimit": issues_limit})

        if result.get("error"):
            return {"error": result["error"]}

        repo = result.get("data", {}).get("repository", {})
        if not repo:
            return {"error": "Repository not found"}

        overview = {
            "issue_counts": {
                "open": repo.get("openIssues", {}).get("totalCount", 0),
                "closed": repo.get("closedIssues", {}).get("totalCount", 0),
            },
            "recent_issues": [
                {
                    "number": i["number"],
                    "title": i["title"],
                    "state": i["state"].lower(),
                    "url": i["url"],
                    "created": i["createdAt"][:10],
                    "updated": i["updatedAt"][:10] if i.get("updatedAt") else "",
                    "author": i["author"]["login"] if i.get("author") else "ghost",
                    "labels": [l["name"] for l in i.get("labels", {}).get("nodes", [])],
                    "comments": i.get("comments", {}).get("totalCount", 0),
                }
                for i in repo.get("issues", {}).get("nodes", [])
            ],
            "labels": [
                {
                    "name": l["name"],
                    "color": l["color"],
                    "open_issues": l["issues"]["totalCount"],
                }
                for l in sorted(
                    repo.get("labels", {}).get("nodes", []),
                    key=lambda x: x["issues"]["totalCount"],
                    reverse=True,
                )
            ],
            "milestones": [
                {
                    "title": m["title"],
                    "number": m["number"],
                    "due": m["dueOn"][:10] if m.get("dueOn") else None,
                    "progress": m.get("progressPercentage", 0),
                    "open": m["issues"]["totalCount"],
                    "closed": m["closedIssues"]["totalCount"],
                }
                for m in repo.get("milestones", {}).get("nodes", [])
            ],
        }

        if include_projects:
            projects_result = await self.list_projects(limit=10)
            if not projects_result.get("error"):
                overview["projects"] = [
                    {"number": p["number"], "title": p["title"], "url": p["url"]}
                    for p in projects_result.get("projects", [])[:5]
                ]

        return overview

    async def get_edit_history(
        self, number: int, is_pr: bool = False, limit: int = 10, edit_index: int | None = None
    ) -> dict:
        item_type = "pullRequest" if is_pr else "issue"

        query = f"""
        query GetEditHistory($owner: String!, $repo: String!, $number: Int!, $limit: Int!) {{
            repository(owner: $owner, name: $repo) {{
                {item_type}(number: $number) {{
                    number
                    title
                    createdAt
                    author {{ login }}

                    userContentEdits(first: $limit) {{
                        totalCount
                        nodes {{
                            editedAt
                            editor {{ login }}
                            diff
                        }}
                    }}

                    timelineItems(first: 50, itemTypes: [RENAMED_TITLE_EVENT]) {{
                        nodes {{
                            ... on RenamedTitleEvent {{
                                createdAt
                                actor {{ login }}
                                previousTitle
                                currentTitle
                            }}
                        }}
                    }}
                }}
            }}
        }}
        """

        result = await self._execute(
            query,
            {"owner": self.owner, "repo": self.repo, "number": number, "limit": limit},
        )

        if result.get("error"):
            return {"error": result["error"]}

        data = result.get("data", {}).get("repository", {}).get(item_type)
        if not data:
            return {"error": f"{'PR' if is_pr else 'Issue'} #{number} not found"}

        title_changes = []
        for event in data.get("timelineItems", {}).get("nodes", []):
            if event:
                title_changes.append(
                    {
                        "date": event["createdAt"][:16].replace("T", " "),
                        "by": (event["actor"]["login"] if event.get("actor") else "ghost"),
                        "from": event["previousTitle"],
                        "to": event["currentTitle"],
                    }
                )

        body_edits = []
        edits_data = data.get("userContentEdits", {})
        nodes = edits_data.get("nodes", [])

        for i, edit in enumerate(nodes):
            if edit:
                diff = edit.get("diff", "(no diff available)")
                if edit_index is not None and i == edit_index:
                    diff_display = diff
                else:
                    diff_display = diff[:500] + "..." if len(diff) > 500 else diff

                body_edits.append(
                    {
                        "index": i,
                        "date": edit["editedAt"][:16].replace("T", " "),
                        "by": (edit["editor"]["login"] if edit.get("editor") else "ghost"),
                        "diff": diff_display,
                        "truncated": edit_index != i and len(diff) > 500,
                    }
                )

        return {
            "number": data["number"],
            "current_title": data["title"],
            "type": "PR" if is_pr else "Issue",
            "author": data["author"]["login"] if data.get("author") else "ghost",
            "created": data["createdAt"][:10],
            "title_changes": title_changes,
            "title_change_count": len(title_changes),
            "body_edits": body_edits,
            "body_edit_count": edits_data.get("totalCount", 0),
            "has_edits": len(title_changes) > 0 or len(body_edits) > 0,
        }


github_graphql = GitHubGraphQL()
