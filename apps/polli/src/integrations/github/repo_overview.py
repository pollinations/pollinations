"""Bulk repository data fetchers feeding get_repo_overview()."""

import logging

from ...core.config import config

logger = logging.getLogger(__name__)


class RepoOverviewMixin:
    """Fetchers for issues, PRs, commits, stats, releases, branches, labels, milestones.

    Mixed into GitHubGraphQL; relies on the host class for `_execute`, `owner`, and `repo`.
    """

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
