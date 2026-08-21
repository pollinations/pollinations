"""GitHub ProjectsV2 GraphQL operations."""

import logging

from ...core.config import config

logger = logging.getLogger(__name__)


class ProjectsMixin:
    """ProjectsV2 boards, items, and status/field mutations.

    Mixed into GitHubGraphQL; relies on the host class for `_execute`, `owner`, and `repo`.
    """

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
