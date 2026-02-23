import logging
import time
from typing import Any

import aiohttp

from ..config import config
from . import github_auth

logger = logging.getLogger(__name__)

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

CACHE_TTL = 300


class TTLCache:
    def __init__(self, ttl: int = CACHE_TTL):
        self._cache: dict[str, tuple[float, Any]] = {}
        self._ttl = ttl

    def get(self, key: str) -> Any | None:
        if key in self._cache:
            timestamp, value = self._cache[key]
            if time.time() - timestamp < self._ttl:
                return value
            del self._cache[key]
        return None

    def set(self, key: str, value: Any):
        self._cache[key] = (time.time(), value)

    def invalidate(self, key: str | None = None):
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()


class GitHubGraphQL:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None
        self._connector: aiohttp.TCPConnector | None = None
        self._cache = TTLCache(ttl=CACHE_TTL)

    @property
    def owner(self) -> str:
        return config.github_repo.split("/")[0]

    @property
    def repo(self) -> str:
        return config.github_repo.split("/")[1]

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
            if config.github_project_pat:
                logger.debug("Falling back to GITHUB_PROJECT_PAT for project operation")
                return config.github_project_pat
            else:
                logger.warning("ProjectV2 operation: No GitHub App or GITHUB_PROJECT_PAT configured")
                return None

        if github_auth.github_app_auth:
            token = await github_auth.github_app_auth.get_token()
            if token:
                return token
        return config.github_token if config.github_token else None

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

        search_query = f"repo:{config.github_repo} is:issue {state_filter} {keywords}"

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
        search_query = f"repo:{config.github_repo} is:issue is:open {keywords}"

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

    async def get_project_id(self, project_number: int, org: str | None = None) -> str | None:
        if org is None:
            org = self.owner

        query = """
        query GetProjectId($org: String!, $number: Int!) {
            organization(login: $org) {
                projectV2(number: $number) {
                    id
                    title
                }
            }
        }
        """

        result = await self._execute(query, {"org": org, "number": project_number}, for_projects=True)

        if result.get("error"):
            return f"error:{result['error']}"

        data = result.get("data")
        if not data or not data.get("organization"):
            return None

        project = data["organization"].get("projectV2")
        if project:
            logger.info(f"Found project: {project['title']} (ID: {project['id']})")
            return project["id"]
        return None

    async def get_issue_node_id(self, issue_number: int, for_projects: bool = False) -> str | None:
        query = """
        query GetIssueId($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                issue(number: $number) {
                    id
                }
            }
        }
        """

        result = await self._execute(
            query,
            {"owner": self.owner, "repo": self.repo, "number": issue_number},
            for_projects=for_projects,
        )

        if result.get("error"):
            return f"error:{result['error']}"

        data = result.get("data")
        if not data or not data.get("repository"):
            return None

        issue = data["repository"].get("issue")
        return issue["id"] if issue else None

    async def get_pr_node_id(self, pr_number: int, for_projects: bool = False) -> str | None:
        query = """
        query GetPRId($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                    id
                }
            }
        }
        """

        result = await self._execute(
            query,
            {"owner": self.owner, "repo": self.repo, "number": pr_number},
            for_projects=for_projects,
        )

        if result.get("error"):
            return f"error:{result['error']}"

        data = result.get("data")
        if not data or not data.get("repository"):
            return None

        pr = data["repository"].get("pullRequest")
        return pr["id"] if pr else None

    async def get_content_node_id(self, number: int, for_projects: bool = False) -> tuple[str | None, str]:
        issue_id = await self.get_issue_node_id(number, for_projects=for_projects)
        if issue_id and not (isinstance(issue_id, str) and issue_id.startswith("error:")):
            return issue_id, "issue"

        pr_id = await self.get_pr_node_id(number, for_projects=for_projects)
        if pr_id and not (isinstance(pr_id, str) and pr_id.startswith("error:")):
            return pr_id, "pr"

        if isinstance(issue_id, str) and issue_id.startswith("error:"):
            return issue_id, "error"
        if isinstance(pr_id, str) and pr_id.startswith("error:"):
            return pr_id, "error"

        return None, "not_found"

    async def add_to_project(self, number: int, project_number: int, org: str | None = None) -> dict:
        project_id = await self.get_project_id(project_number, org)
        if not project_id:
            return {
                "success": False,
                "error": f"Project #{project_number} not found or not accessible",
            }
        if isinstance(project_id, str) and project_id.startswith("error:"):
            return {"success": False, "error": project_id[6:]}

        content_id, content_type = await self.get_content_node_id(number, for_projects=True)
        if not content_id or content_type in ("error", "not_found"):
            return {"success": False, "error": f"Issue/PR #{number} not found"}
        if isinstance(content_id, str) and content_id.startswith("error:"):
            return {"success": False, "error": content_id[6:]}

        mutation = """
        mutation AddToProject($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
                item {
                    id
                }
            }
        }
        """

        result = await self._execute(
            mutation,
            {"projectId": project_id, "contentId": content_id},
            for_projects=True,
        )

        if result.get("error"):
            return {"success": False, "error": result["error"]}

        data = result.get("data")
        if data and data.get("addProjectV2ItemById"):
            item = data["addProjectV2ItemById"].get("item")
            if item:
                type_label = "PR" if content_type == "pr" else "Issue"
                logger.info(f"Added {type_label} #{number} to project #{project_number}")
                return {
                    "success": True,
                    "number": number,
                    "type": content_type,
                    "project_number": project_number,
                    "message": f"Added {type_label} #{number} to project #{project_number}",
                }

        return {
            "success": False,
            "error": "Failed to add to project - check permissions",
        }

    async def add_issue_to_project(self, issue_number: int, project_number: int, org: str | None = None) -> dict:
        project_id = await self.get_project_id(project_number, org)
        if not project_id:
            return {
                "success": False,
                "error": f"Project #{project_number} not found or not accessible",
            }
        if isinstance(project_id, str) and project_id.startswith("error:"):
            return {"success": False, "error": project_id[6:]}

        issue_id = await self.get_issue_node_id(issue_number, for_projects=True)
        if not issue_id:
            return {"success": False, "error": f"Issue #{issue_number} not found"}
        if isinstance(issue_id, str) and issue_id.startswith("error:"):
            return {"success": False, "error": issue_id[6:]}

        mutation = """
        mutation AddToProject($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
                item {
                    id
                }
            }
        }
        """

        result = await self._execute(
            mutation,
            {"projectId": project_id, "contentId": issue_id},
            for_projects=True,
        )

        if result.get("error"):
            return {"success": False, "error": result["error"]}

        data = result.get("data")
        if data and data.get("addProjectV2ItemById"):
            item = data["addProjectV2ItemById"].get("item")
            if item:
                logger.info(f"Added issue #{issue_number} to project #{project_number}")
                return {
                    "success": True,
                    "issue_number": issue_number,
                    "project_number": project_number,
                    "message": f"Added issue #{issue_number} to project #{project_number}",
                }

        return {
            "success": False,
            "error": "Failed to add issue to project - check permissions",
        }

    async def list_projects(self, org: str | None = None, limit: int = 20) -> dict:
        if org is None:
            org = self.owner

        all_projects = []

        org_query = """
        query ListOrgProjects($org: String!, $limit: Int!) {
            organization(login: $org) {
                projectsV2(first: $limit, orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        number
                        title
                        shortDescription
                        url
                        closed
                    }
                }
            }
        }
        """

        result = await self._execute(org_query, {"org": org, "limit": limit}, for_projects=True)
        if not result.get("error"):
            org_data = result.get("data", {}).get("organization")
            if org_data:
                projects_data = org_data.get("projectsV2", {}).get("nodes", [])
                for p in projects_data:
                    if p:
                        all_projects.append(
                            {
                                "id": p["id"],
                                "number": p["number"],
                                "title": p["title"],
                                "description": p.get("shortDescription") or "",
                                "url": p["url"],
                                "closed": p["closed"],
                                "level": "organization",
                            }
                        )

        repo_query = """
        query ListRepoProjects($owner: String!, $repo: String!, $limit: Int!) {
            repository(owner: $owner, name: $repo) {
                projectsV2(first: $limit, orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        number
                        title
                        shortDescription
                        url
                        closed
                    }
                }
            }
        }
        """

        result = await self._execute(
            repo_query,
            {"owner": self.owner, "repo": self.repo, "limit": limit},
            for_projects=True,
        )
        if not result.get("error"):
            repo_data = result.get("data", {}).get("repository")
            if repo_data:
                for p in repo_data.get("projectsV2", {}).get("nodes", []):
                    if p:
                        if not any(ep["number"] == p["number"] for ep in all_projects):
                            all_projects.append(
                                {
                                    "id": p["id"],
                                    "number": p["number"],
                                    "title": p["title"],
                                    "description": p.get("shortDescription") or "",
                                    "url": p["url"],
                                    "closed": p["closed"],
                                    "level": "repository",
                                }
                            )

        if not all_projects:
            return {
                "projects": [],
                "count": 0,
                "message": "No projects found. Either GITHUB_PROJECT_PAT is not set, or the organization has no ProjectV2 boards.",
            }

        return {"projects": all_projects, "count": len(all_projects)}

    async def get_project_view(self, project_number: int, org: str | None = None) -> dict:
        if org is None:
            org = self.owner

        query = """
        query GetProjectView($org: String!, $number: Int!) {
            organization(login: $org) {
                projectV2(number: $number) {
                    id
                    title
                    shortDescription
                    url
                    closed
                    fields(first: 20) {
                        nodes {
                            ... on ProjectV2Field {
                                id
                                name
                            }
                            ... on ProjectV2SingleSelectField {
                                id
                                name
                                options { id name color }
                            }
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"org": org, "number": project_number}, for_projects=True)

        project = None
        org_error = result.get("error")
        if not org_error:
            project = result.get("data", {}).get("organization", {}).get("projectV2")

        if not project:
            repo_query = """
            query GetRepoProjectView($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                    projectV2(number: $number) {
                        id
                        title
                        shortDescription
                        url
                        closed
                        fields(first: 20) {
                            nodes {
                                ... on ProjectV2Field {
                                    id
                                    name
                                }
                                ... on ProjectV2SingleSelectField {
                                    id
                                    name
                                    options { id name color }
                                }
                            }
                        }
                    }
                }
            }
            """
            result = await self._execute(
                repo_query,
                {"owner": self.owner, "repo": self.repo, "number": project_number},
                for_projects=True,
            )
            result.get("error")
            project = result.get("data", {}).get("repository", {}).get("projectV2")

        if not project:
            if org_error and "GITHUB_PROJECT_PAT" in str(org_error):
                return {
                    "error": org_error,
                    "hint": "Set GITHUB_PROJECT_PAT env var with a PAT that has 'project' scope",
                }
            if org_error and "Could not resolve" in str(org_error):
                return {
                    "error": f"Project #{project_number} not found. Ensure GITHUB_PROJECT_PAT is set with a PAT that has 'project' scope.",
                    "hint": "GitHub Apps cannot access ProjectV2 - you need a PAT with 'project' scope",
                }
            return {"error": f"Project #{project_number} not found"}

        status_options = []
        for field in project.get("fields", {}).get("nodes", []):
            if field and field.get("name") == "Status" and "options" in field:
                status_options = [{"name": o["name"], "color": o.get("color")} for o in field["options"]]
                break

        return {
            "title": project["title"],
            "description": project.get("shortDescription") or "",
            "url": project["url"],
            "closed": project["closed"],
            "status_options": status_options,
        }

    async def list_project_items(
        self, project_number: int, status: str | None = None, limit: int = 50, org: str | None = None
    ) -> dict:
        if org is None:
            org = self.owner

        items_fragment = """
            title
            items(first: $limit) {
                nodes {
                    id
                    content {
                        ... on Issue {
                            number
                            title
                            state
                            url
                            labels(first: 3) { nodes { name } }
                        }
                        ... on PullRequest {
                            number
                            title
                            state
                            url
                        }
                    }
                    fieldValues(first: 10) {
                        nodes {
                            ... on ProjectV2ItemFieldSingleSelectValue {
                                name
                                field { ... on ProjectV2SingleSelectField { name } }
                            }
                            ... on ProjectV2ItemFieldTextValue {
                                text
                                field { ... on ProjectV2Field { name } }
                            }
                        }
                    }
                }
            }
        """

        org_query = f"""
        query ListProjectItems($org: String!, $number: Int!, $limit: Int!) {{
            organization(login: $org) {{
                projectV2(number: $number) {{
                    {items_fragment}
                }}
            }}
        }}
        """

        result = await self._execute(
            org_query,
            {"org": org, "number": project_number, "limit": limit},
            for_projects=True,
        )
        project = None
        if not result.get("error"):
            project = result.get("data", {}).get("organization", {}).get("projectV2")

        if not project:
            repo_query = f"""
            query ListRepoProjectItems($owner: String!, $repo: String!, $number: Int!, $limit: Int!) {{
                repository(owner: $owner, name: $repo) {{
                    projectV2(number: $number) {{
                        {items_fragment}
                    }}
                }}
            }}
            """
            result = await self._execute(
                repo_query,
                {
                    "owner": self.owner,
                    "repo": self.repo,
                    "number": project_number,
                    "limit": limit,
                },
                for_projects=True,
            )
            if not result.get("error"):
                project = result.get("data", {}).get("repository", {}).get("projectV2")

        if not project:
            return {"error": f"Project #{project_number} not found"}

        items = []
        for node in project.get("items", {}).get("nodes", []):
            if not node or not node.get("content"):
                continue

            content = node["content"]
            item_status = None

            for fv in node.get("fieldValues", {}).get("nodes", []):
                if fv and fv.get("field", {}).get("name") == "Status":
                    item_status = fv.get("name")
                    break

            if status and item_status != status:
                continue

            items.append(
                {
                    "number": content["number"],
                    "title": content["title"],
                    "type": "issue" if "Issue" in str(type(content)) else "pr",
                    "state": content["state"].lower(),
                    "url": content["url"],
                    "status": item_status,
                    "labels": (
                        [l["name"] for l in content.get("labels", {}).get("nodes", [])] if content.get("labels") else []
                    ),
                }
            )

        return {
            "project": project["title"],
            "filter": status,
            "count": len(items),
            "items": items,
        }

    async def get_project_item(self, project_number: int, issue_number: int, org: str | None = None) -> dict:
        result = await self.list_project_items(project_number, limit=100, org=org)
        if result.get("error"):
            return result

        for item in result.get("items", []):
            if item["number"] == issue_number:
                return {"item": item}

        return {"error": f"Issue #{issue_number} not found in project #{project_number}"}

    async def remove_from_project(self, project_number: int, issue_number: int, org: str | None = None) -> dict:
        if org is None:
            org = self.owner

        query = """
        query FindProjectItem($org: String!, $number: Int!) {
            organization(login: $org) {
                projectV2(number: $number) {
                    id
                    items(first: 100) {
                        nodes {
                            id
                            content {
                                ... on Issue { number }
                                ... on PullRequest { number }
                            }
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"org": org, "number": project_number}, for_projects=True)
        if result.get("error"):
            return {"success": False, "error": result["error"]}

        project = result.get("data", {}).get("organization", {}).get("projectV2")
        if not project:
            return {"success": False, "error": f"Project #{project_number} not found"}

        item_id = None
        for node in project.get("items", {}).get("nodes", []):
            if node and node.get("content", {}).get("number") == issue_number:
                item_id = node["id"]
                break

        if not item_id:
            return {
                "success": False,
                "error": f"Issue #{issue_number} not in project #{project_number}",
            }

        mutation = """
        mutation RemoveFromProject($projectId: ID!, $itemId: ID!) {
            deleteProjectV2Item(input: {projectId: $projectId, itemId: $itemId}) {
                deletedItemId
            }
        }
        """

        result = await self._execute(mutation, {"projectId": project["id"], "itemId": item_id}, for_projects=True)
        if result.get("error"):
            return {"success": False, "error": result["error"]}

        if result.get("data", {}).get("deleteProjectV2Item"):
            return {
                "success": True,
                "message": f"Removed #{issue_number} from project #{project_number}",
            }

        return {"success": False, "error": "Failed to remove item"}

    async def set_project_item_status(
        self, project_number: int, issue_number: int, status: str, org: str | None = None
    ) -> dict:
        if org is None:
            org = self.owner

        query = """
        query GetProjectForStatusUpdate($org: String!, $number: Int!) {
            organization(login: $org) {
                projectV2(number: $number) {
                    id
                    fields(first: 20) {
                        nodes {
                            ... on ProjectV2SingleSelectField {
                                id
                                name
                                options { id name }
                            }
                        }
                    }
                    items(first: 100) {
                        nodes {
                            id
                            content {
                                ... on Issue { number }
                                ... on PullRequest { number }
                            }
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"org": org, "number": project_number}, for_projects=True)
        if result.get("error"):
            return {"success": False, "error": result["error"]}

        project = result.get("data", {}).get("organization", {}).get("projectV2")
        if not project:
            return {"success": False, "error": f"Project #{project_number} not found"}

        status_field_id = None
        status_option_id = None
        for field in project.get("fields", {}).get("nodes", []):
            if field and field.get("name") == "Status" and "options" in field:
                status_field_id = field["id"]
                for opt in field["options"]:
                    if opt["name"].lower() == status.lower():
                        status_option_id = opt["id"]
                        break
                break

        if not status_field_id:
            return {"success": False, "error": "Status field not found in project"}

        if not status_option_id:
            available = [
                o["name"]
                for f in project.get("fields", {}).get("nodes", [])
                if f and f.get("name") == "Status"
                for o in f.get("options", [])
            ]
            return {
                "success": False,
                "error": f"Status '{status}' not found. Available: {', '.join(available)}",
            }

        item_id = None
        for node in project.get("items", {}).get("nodes", []):
            if node and node.get("content", {}).get("number") == issue_number:
                item_id = node["id"]
                break

        if not item_id:
            return {
                "success": False,
                "error": f"Issue #{issue_number} not in project #{project_number}. Add it first.",
            }

        mutation = """
        mutation UpdateItemStatus($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: { singleSelectOptionId: $optionId }
            }) {
                projectV2Item { id }
            }
        }
        """

        result = await self._execute(
            mutation,
            {
                "projectId": project["id"],
                "itemId": item_id,
                "fieldId": status_field_id,
                "optionId": status_option_id,
            },
            for_projects=True,
        )

        if result.get("error"):
            return {"success": False, "error": result["error"]}

        if result.get("data", {}).get("updateProjectV2ItemFieldValue"):
            return {
                "success": True,
                "message": f"Set #{issue_number} status to '{status}'",
            }

        return {"success": False, "error": "Failed to update status"}

    async def set_project_item_field(
        self,
        project_number: int,
        issue_number: int,
        field_name: str,
        field_value: str,
        org: str | None = None,
    ) -> dict:
        if org is None:
            org = self.owner

        if field_name.lower() == "status":
            return await self.set_project_item_status(project_number, issue_number, field_value, org)

        query = """
        query GetProjectForFieldUpdate($org: String!, $number: Int!) {
            organization(login: $org) {
                projectV2(number: $number) {
                    id
                    fields(first: 20) {
                        nodes {
                            ... on ProjectV2Field {
                                id
                                name
                                dataType
                            }
                            ... on ProjectV2SingleSelectField {
                                id
                                name
                                options { id name }
                            }
                        }
                    }
                    items(first: 100) {
                        nodes {
                            id
                            content {
                                ... on Issue { number }
                                ... on PullRequest { number }
                            }
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"org": org, "number": project_number}, for_projects=True)
        if result.get("error"):
            return {"success": False, "error": result["error"]}

        project = result.get("data", {}).get("organization", {}).get("projectV2")
        if not project:
            return {"success": False, "error": f"Project #{project_number} not found"}

        target_field = None
        for field in project.get("fields", {}).get("nodes", []):
            if field and field.get("name", "").lower() == field_name.lower():
                target_field = field
                break

        if not target_field:
            available = [f["name"] for f in project.get("fields", {}).get("nodes", []) if f and f.get("name")]
            return {
                "success": False,
                "error": f"Field '{field_name}' not found. Available: {', '.join(available)}",
            }

        item_id = None
        for node in project.get("items", {}).get("nodes", []):
            if node and node.get("content", {}).get("number") == issue_number:
                item_id = node["id"]
                break

        if not item_id:
            return {
                "success": False,
                "error": f"Issue #{issue_number} not in project #{project_number}",
            }

        if "options" in target_field:
            option_id = None
            for opt in target_field["options"]:
                if opt["name"].lower() == field_value.lower():
                    option_id = opt["id"]
                    break
            if not option_id:
                available = [o["name"] for o in target_field["options"]]
                return {
                    "success": False,
                    "error": f"Option '{field_value}' not found. Available: {', '.join(available)}",
                }

            mutation = """
            mutation UpdateSingleSelect($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
                updateProjectV2ItemFieldValue(input: {
                    projectId: $projectId
                    itemId: $itemId
                    fieldId: $fieldId
                    value: { singleSelectOptionId: $optionId }
                }) {
                    projectV2Item { id }
                }
            }
            """
            result = await self._execute(
                mutation,
                {
                    "projectId": project["id"],
                    "itemId": item_id,
                    "fieldId": target_field["id"],
                    "optionId": option_id,
                },
                for_projects=True,
            )
        else:
            mutation = """
            mutation UpdateTextField($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
                updateProjectV2ItemFieldValue(input: {
                    projectId: $projectId
                    itemId: $itemId
                    fieldId: $fieldId
                    value: { text: $text }
                }) {
                    projectV2Item { id }
                }
            }
            """
            result = await self._execute(
                mutation,
                {
                    "projectId": project["id"],
                    "itemId": item_id,
                    "fieldId": target_field["id"],
                    "text": field_value,
                },
                for_projects=True,
            )

        if result.get("error"):
            return {"success": False, "error": result["error"]}

        if result.get("data", {}).get("updateProjectV2ItemFieldValue"):
            return {
                "success": True,
                "message": f"Set {field_name}='{field_value}' on #{issue_number}",
            }

        return {"success": False, "error": "Failed to update field"}

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

    async def execute_custom_request(
        self,
        request: str,
        include_body: bool = False,
        limit: int = 50,
        graphql_query: str | None = None,
        rest_endpoint: str | None = None,
    ) -> dict:
        if graphql_query:
            query_lower = graphql_query.lower()
            if any(
                word in query_lower
                for word in [
                    "mutation",
                    "delete",
                    "update",
                    "create",
                    "add",
                    "remove",
                    "set",
                ]
            ):
                return {"error": "Mutations not allowed via github_custom. Use specific tools for write operations."}

            result = await self._execute(
                graphql_query,
                {"owner": self.owner, "repo": self.repo, "limit": min(limit, 100)},
            )
            return {
                "mode": "graphql",
                "query": (graphql_query[:200] + "..." if len(graphql_query) > 200 else graphql_query),
                "data": result.get("data", result),
            }

        if rest_endpoint:
            endpoint = rest_endpoint.strip("/")
            allowed_prefixes = [
                "issues",
                "pulls",
                "commits",
                "releases",
                "branches",
                "tags",
                "contributors",
                "stats",
                "contents",
                "labels",
                "milestones",
            ]
            if not any(endpoint.startswith(p) for p in allowed_prefixes):
                return {"error": f"REST endpoint must start with one of: {allowed_prefixes}"}

            url = f"https://api.github.com/repos/{self.owner}/{self.repo}/{endpoint}"
            try:
                token = await self._get_token()
                if not token:
                    return {"error": "GitHub token not configured"}
                headers = {"Authorization": f"Bearer {token}"}
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=headers) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            return {"mode": "rest", "endpoint": endpoint, "data": data}
                        else:
                            return {"error": f"REST API returned {resp.status}"}
            except Exception as e:
                return {"error": str(e)}

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

    async def _fetch_all_issues(self, limit: int = 50, include_body: bool = False) -> dict:
        body_field = "body" if include_body else ""

        query = f"""
        query AllIssues($owner: String!, $repo: String!, $limit: Int!) {{
            repository(owner: $owner, name: $repo) {{
                open: issues(states: OPEN) {{ totalCount }}
                closed: issues(states: CLOSED) {{ totalCount }}
                issues(first: $limit, states: OPEN, orderBy: {{field: CREATED_AT, direction: DESC}}) {{
                    nodes {{
                        number
                        title
                        {body_field}
                        state
                        url
                        createdAt
                        updatedAt
                        author {{ login }}
                        labels(first: 5) {{ nodes {{ name }} }}
                        comments {{ totalCount }}
                    }}
                }}
            }}
        }}
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "limit": limit})

        if result.get("error"):
            return {"error": result["error"]}

        repo = result.get("data", {}).get("repository", {})
        issues = repo.get("issues", {}).get("nodes", [])

        formatted = []
        for i in issues:
            item = {
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
            if include_body:
                item["body"] = i.get("body", "")
            formatted.append(item)

        return {
            "counts": {
                "open": repo.get("open", {}).get("totalCount", 0),
                "closed": repo.get("closed", {}).get("totalCount", 0),
            },
            "items": formatted,
            "fetched": len(formatted),
        }

    async def _fetch_prs(self, limit: int = 50) -> dict:
        query = """
        query PRs($owner: String!, $repo: String!, $limit: Int!) {
            repository(owner: $owner, name: $repo) {
                open: pullRequests(states: OPEN) { totalCount }
                closed: pullRequests(states: CLOSED) { totalCount }
                merged: pullRequests(states: MERGED) { totalCount }
                pullRequests(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
                    nodes {
                        number
                        title
                        state
                        url
                        createdAt
                        author { login }
                        additions
                        deletions
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "limit": limit})

        if result.get("error"):
            return {"error": result["error"]}

        repo = result.get("data", {}).get("repository", {})
        prs = repo.get("pullRequests", {}).get("nodes", [])

        return {
            "counts": {
                "open": repo.get("open", {}).get("totalCount", 0),
                "closed": repo.get("closed", {}).get("totalCount", 0),
                "merged": repo.get("merged", {}).get("totalCount", 0),
            },
            "items": [
                {
                    "number": pr["number"],
                    "title": pr["title"],
                    "state": pr["state"].lower(),
                    "author": pr["author"]["login"] if pr.get("author") else "ghost",
                    "url": pr["url"],
                    "created": pr["createdAt"][:10],
                    "changes": f"+{pr['additions']}/-{pr['deletions']}",
                }
                for pr in prs
            ],
        }

    async def _fetch_commits(self, limit: int = 50) -> dict:
        query = """
        query Commits($owner: String!, $repo: String!, $limit: Int!) {
            repository(owner: $owner, name: $repo) {
                defaultBranchRef {
                    target {
                        ... on Commit {
                            history(first: $limit) {
                                nodes {
                                    oid
                                    messageHeadline
                                    committedDate
                                    author {
                                        user { login }
                                        name
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "limit": limit})

        if result.get("error"):
            return {"error": result["error"]}

        commits = (
            result.get("data", {})
            .get("repository", {})
            .get("defaultBranchRef", {})
            .get("target", {})
            .get("history", {})
            .get("nodes", [])
        )

        return {
            "items": [
                {
                    "sha": c["oid"][:7],
                    "message": c["messageHeadline"][:100],
                    "author": (
                        c["author"]["user"]["login"]
                        if c.get("author", {}).get("user")
                        else c.get("author", {}).get("name", "unknown")
                    ),
                    "date": c["committedDate"][:10],
                }
                for c in commits
            ]
        }

    async def _fetch_repo_stats(self) -> dict:
        query = """
        query RepoStats($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
                stargazerCount
                forkCount
                watchers { totalCount }
                issues(states: OPEN) { totalCount }
                closedIssues: issues(states: CLOSED) { totalCount }
                pullRequests(states: OPEN) { totalCount }
                mergedPRs: pullRequests(states: MERGED) { totalCount }
                releases { totalCount }
                createdAt
                pushedAt
                primaryLanguage { name }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo})

        if result.get("error"):
            return {"error": result["error"]}

        repo = result.get("data", {}).get("repository", {})

        return {
            "stars": repo.get("stargazerCount", 0),
            "forks": repo.get("forkCount", 0),
            "watchers": repo.get("watchers", {}).get("totalCount", 0),
            "open_issues": repo.get("issues", {}).get("totalCount", 0),
            "closed_issues": repo.get("closedIssues", {}).get("totalCount", 0),
            "open_prs": repo.get("pullRequests", {}).get("totalCount", 0),
            "merged_prs": repo.get("mergedPRs", {}).get("totalCount", 0),
            "releases": repo.get("releases", {}).get("totalCount", 0),
            "created": repo.get("createdAt", "")[:10],
            "last_push": repo.get("pushedAt", "")[:10],
            "language": (
                repo.get("primaryLanguage", {}).get("name", "unknown") if repo.get("primaryLanguage") else "unknown"
            ),
        }

    async def _fetch_releases(self, limit: int = 20) -> dict:
        query = """
        query Releases($owner: String!, $repo: String!, $limit: Int!) {
            repository(owner: $owner, name: $repo) {
                releases(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
                    nodes {
                        name
                        tagName
                        publishedAt
                        url
                        isPrerelease
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "limit": limit})

        if result.get("error"):
            return {"error": result["error"]}

        releases = result.get("data", {}).get("repository", {}).get("releases", {}).get("nodes", [])

        return {
            "items": [
                {
                    "name": r["name"] or r["tagName"],
                    "tag": r["tagName"],
                    "published": (r["publishedAt"][:10] if r.get("publishedAt") else "draft"),
                    "url": r["url"],
                    "prerelease": r["isPrerelease"],
                }
                for r in releases
            ]
        }

    async def _fetch_branches(self, limit: int = 30) -> dict:
        query = """
        query Branches($owner: String!, $repo: String!, $limit: Int!) {
            repository(owner: $owner, name: $repo) {
                refs(first: $limit, refPrefix: "refs/heads/", orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
                    nodes {
                        name
                        target {
                            ... on Commit {
                                committedDate
                            }
                        }
                    }
                }
                defaultBranchRef { name }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "limit": limit})

        if result.get("error"):
            return {"error": result["error"]}

        repo = result.get("data", {}).get("repository", {})
        branches = repo.get("refs", {}).get("nodes", [])
        default = repo.get("defaultBranchRef", {}).get("name", "main")

        return {
            "default": default,
            "items": [
                {
                    "name": b["name"],
                    "is_default": b["name"] == default,
                    "last_commit": b.get("target", {}).get("committedDate", "")[:10],
                }
                for b in branches
            ],
        }

    async def _fetch_labels(self) -> dict:
        cache_key = f"labels:{self.owner}/{self.repo}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug("Labels cache hit")
            return cached

        query = """
        query Labels($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
                labels(first: 50) {
                    nodes {
                        name
                        color
                        issues(states: OPEN) { totalCount }
                    }
                }
            }
        }
        """

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo})

        if result.get("error"):
            return {"error": result["error"]}

        labels = result.get("data", {}).get("repository", {}).get("labels", {}).get("nodes", [])

        response = {
            "items": [
                {
                    "name": l["name"],
                    "color": l["color"],
                    "open_issues": l["issues"]["totalCount"],
                }
                for l in sorted(labels, key=lambda x: x["issues"]["totalCount"], reverse=True)
            ]
        }

        self._cache.set(cache_key, response)
        return response

    async def _fetch_milestones(self, state: str = "OPEN") -> dict:
        cache_key = f"milestones:{self.owner}/{self.repo}:{state.upper()}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug("Milestones cache hit")
            return cached

        states_filter = []
        if state.upper() == "ALL":
            states_filter = ["OPEN", "CLOSED"]
        else:
            states_filter = [state.upper()]

        query = """
        query Milestones($owner: String!, $repo: String!, $states: [MilestoneState!]) {
            repository(owner: $owner, name: $repo) {
                milestones(first: 100, states: $states, orderBy: {field: DUE_DATE, direction: ASC}) {
                    nodes {
                        title
                        description
                        state
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

        result = await self._execute(query, {"owner": self.owner, "repo": self.repo, "states": states_filter})

        if result.get("error"):
            return {"error": result["error"]}

        milestones = result.get("data", {}).get("repository", {}).get("milestones", {}).get("nodes", [])

        response = {
            "items": [
                {
                    "title": m["title"],
                    "description": m.get("description") or "",
                    "state": m["state"].lower(),
                    "number": m["number"],
                    "open_issues": m["issues"]["totalCount"],
                    "closed_issues": m["closedIssues"]["totalCount"],
                    "progress": m.get("progressPercentage", 0),
                    "due_on": m["dueOn"][:10] if m.get("dueOn") else None,
                }
                for m in milestones
            ]
        }

        self._cache.set(cache_key, response)
        return response

    async def add_sub_issue(self, parent_issue_number: int, child_issue_number: int) -> dict:
        parent_id = await self.get_issue_node_id(parent_issue_number)
        if not parent_id:
            return {
                "success": False,
                "error": f"Parent issue #{parent_issue_number} not found",
            }

        child_id = await self.get_issue_node_id(child_issue_number)
        if not child_id:
            return {
                "success": False,
                "error": f"Child issue #{child_issue_number} not found",
            }

        mutation = """
        mutation AddSubIssue($parentId: ID!, $childId: ID!) {
            addSubIssue(input: {issueId: $parentId, subIssueId: $childId}) {
                issue {
                    number
                    title
                }
                subIssue {
                    number
                    title
                }
            }
        }
        """

        result = await self._execute(mutation, {"parentId": parent_id, "childId": child_id})

        if result.get("error"):
            return {"success": False, "error": result["error"]}

        data = result.get("data", {}).get("addSubIssue")
        if data:
            logger.info(f"Added #{child_issue_number} as sub-issue of #{parent_issue_number}")
            return {
                "success": True,
                "parent": {
                    "number": parent_issue_number,
                    "title": data.get("issue", {}).get("title"),
                },
                "child": {
                    "number": child_issue_number,
                    "title": data.get("subIssue", {}).get("title"),
                },
                "message": f"Added #{child_issue_number} as sub-issue of #{parent_issue_number}",
            }

        return {"success": False, "error": "Failed to add sub-issue"}

    async def remove_sub_issue(self, parent_issue_number: int, child_issue_number: int) -> dict:
        parent_id = await self.get_issue_node_id(parent_issue_number)
        if not parent_id:
            return {
                "success": False,
                "error": f"Parent issue #{parent_issue_number} not found",
            }

        child_id = await self.get_issue_node_id(child_issue_number)
        if not child_id:
            return {
                "success": False,
                "error": f"Child issue #{child_issue_number} not found",
            }

        mutation = """
        mutation RemoveSubIssue($parentId: ID!, $childId: ID!) {
            removeSubIssue(input: {issueId: $parentId, subIssueId: $childId}) {
                issue {
                    number
                    title
                }
                subIssue {
                    number
                    title
                }
            }
        }
        """

        result = await self._execute(mutation, {"parentId": parent_id, "childId": child_id})

        if result.get("error"):
            return {"success": False, "error": result["error"]}

        data = result.get("data", {}).get("removeSubIssue")
        if data:
            logger.info(f"Removed #{child_issue_number} as sub-issue of #{parent_issue_number}")
            return {
                "success": True,
                "parent": {"number": parent_issue_number},
                "removed_child": {"number": child_issue_number},
                "message": f"Removed #{child_issue_number} from #{parent_issue_number}'s sub-issues",
            }

        return {"success": False, "error": "Failed to remove sub-issue"}

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
