import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

from src.integrations.github.graphql import GitHubGraphQL
from src.integrations.github.pr_review import PRReviewMixin


def issue_node(number: int, body: str, author: str = "octocat") -> dict:
    return {
        "number": number,
        "title": f"issue {number}",
        "body": body,
        "state": "OPEN",
        "url": "https://example.test",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "author": {"login": author},
        "labels": {"nodes": []},
        "comments": {"totalCount": 0},
    }


class SearchUserIssuesTests(unittest.IsolatedAsyncioTestCase):
    async def test_searches_later_page_for_exact_canonical_author(self):
        client = GitHubGraphQL()
        client._execute = AsyncMock(
            side_effect=[
                {
                    "data": {
                        "search": {
                            "pageInfo": {"hasNextPage": True, "endCursor": "next"},
                            "nodes": [issue_node(1, "**Author:** Bea")],
                        }
                    }
                },
                {
                    "data": {
                        "search": {
                            "pageInfo": {"hasNextPage": False, "endCursor": None},
                            "nodes": [issue_node(2, "**Author:** Ada")],
                        }
                    }
                },
            ]
        )

        result = await client.search_user_issues("Ada")

        self.assertEqual([issue["number"] for issue in result], [2])
        self.assertIn('"Ada"', client._execute.await_args_list[0].args[1]["query"])
        self.assertEqual(client._execute.await_args_list[1].args[1]["after"], "next")


class CustomFilteringTests(unittest.IsolatedAsyncioTestCase):
    async def test_custom_author_uses_server_filter_and_honors_include_body(self):
        client = GitHubGraphQL()
        client._execute = AsyncMock(
            return_value={
                "data": {
                    "search": {
                        "issueCount": 2,
                        "pageInfo": {"hasNextPage": True},
                        "nodes": [issue_node(9, "private body")],
                    }
                }
            }
        )

        result = await client.execute_custom_request(request="issues", author="octocat", limit=1)

        self.assertEqual(result["data"]["issues"]["matched_total"], 2)
        self.assertNotIn("body", result["data"]["issues"]["items"][0])
        variables = client._execute.await_args.args[1]
        self.assertIn("repo:", variables["query"])
        self.assertIn("author:octocat", variables["query"])
        self.assertNotIn(" body ", client._execute.await_args.args[0])

    async def test_custom_rejects_author_qualifier_injection(self):
        result = await GitHubGraphQL().execute_custom_request(request="issues", author="octocat is:closed")

        self.assertEqual(result["error"], "author must be a valid GitHub login")


class RestEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_endpoint_query_is_normalized_before_pagination(self):
        client = GitHubGraphQL()
        client._rest_get = AsyncMock(return_value={"data": []})

        await client.execute_custom_request(rest_endpoint="issues?state=open&page=99", request="", limit=20, page=2)

        url = client._rest_get.await_args.args[0]
        self.assertEqual(url.count("?"), 1)
        self.assertEqual(parse_qs(urlsplit(url).query), {"state": ["open"], "page": ["2"], "per_page": ["20"]})


class RestSearchPaginationTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_fetches_multiple_pages(self):
        from src.integrations.github.client import GitHubManager

        client = GitHubManager()
        items = [
            {
                "number": number,
                "title": str(number),
                "body": "",
                "state": "open",
                "html_url": "https://example.test",
                "labels": [],
                "created_at": "2026-01-01T00:00:00Z",
                "user": {"login": "ada"},
            }
            for number in range(150)
        ]
        payloads = [{"total_count": 250, "items": items[:100]}, {"total_count": 250, "items": items[100:]}]

        class Request:
            def __init__(self, payload):
                self.payload = payload

            async def __aenter__(self):
                return SimpleNamespace(status=200, json=AsyncMock(return_value=self.payload))

            async def __aexit__(self, *_args):
                return None

        calls = []
        client.get_session = AsyncMock(
            return_value=SimpleNamespace(get=lambda url, **_kwargs: calls.append(url) or Request(payloads.pop(0)))
        )
        client._get_headers = AsyncMock(return_value={})
        with patch("src.integrations.github.client.has_github_auth", return_value=True):
            result = await client.search_issues("bug", limit=150)
        self.assertEqual(len(result), 150)
        self.assertIn("page=2", calls[1])


class CustomPullRequestIntentTests(unittest.IsolatedAsyncioTestCase):
    async def test_natural_language_prs_by_author_does_not_query_issues(self):
        client = GitHubGraphQL()
        with patch(
            "src.integrations.github.pull_requests.github_pr_manager.list_prs",
            AsyncMock(return_value={"prs": [], "state": "all", "author": "octocat"}),
        ) as list_prs:
            result = await client.execute_custom_request(request="PRs by author", author="octocat")

        self.assertNotIn("issues", result["data"])
        self.assertEqual(result["data"]["pull_requests"]["author"], "octocat")
        self.assertEqual(list_prs.await_args.kwargs["state"], "all")

    async def test_bug_report_queries_issues_not_pull_requests(self):
        client = GitHubGraphQL()
        client._fetch_all_issues = AsyncMock(return_value={"items": []})
        with patch("src.integrations.github.pull_requests.github_pr_manager.list_prs", AsyncMock()) as list_prs:
            result = await client.execute_custom_request(request="bug report")

        self.assertIn("issues", result["data"])
        list_prs.assert_not_awaited()

    async def test_explicit_issues_and_prs_query_both(self):
        client = GitHubGraphQL()
        client._fetch_all_issues = AsyncMock(return_value={"items": []})
        with patch(
            "src.integrations.github.pull_requests.github_pr_manager.list_prs", AsyncMock(return_value={"prs": []})
        ) as list_prs:
            result = await client.execute_custom_request(request="open issues and closed PRs")

        self.assertIn("issues", result["data"])
        self.assertIn("pull_requests", result["data"])
        self.assertEqual(list_prs.await_args.kwargs["state"], "closed")


class NativeQueryTests(unittest.IsolatedAsyncioTestCase):
    def test_query_pins_scope_and_preserves_native_qualifiers(self):
        from src.integrations.github.graphql import build_scoped_search_query

        result = build_scoped_search_query(
            'label:"help wanted" milestone:"v1" created:>=2026-01-01',
            repository="pollinations/pollinations",
            kind="pr",
        )

        self.assertEqual(
            result,
            'repo:pollinations/pollinations is:pr (label:"help wanted" milestone:"v1" created:>=2026-01-01)',
        )

    def test_query_rejects_conflicting_scope(self):
        from src.integrations.github.graphql import build_scoped_search_query

        result = build_scoped_search_query(
            "repo:other/repo is:issue", repository="pollinations/pollinations", kind="pr"
        )

        self.assertEqual(result["error"], "query repo qualifier conflicts with the configured repository")

    async def test_pr_query_does_not_default_to_open(self):
        from src.integrations.github.pull_requests import GitHubPRManager

        response = {"data": {"search": {"issueCount": 0, "pageInfo": {"hasNextPage": False}, "nodes": []}}}
        with (
            patch("src.integrations.github.pull_requests.has_github_auth", return_value=True),
            patch(
                "src.integrations.github.pull_requests.github_graphql._execute", AsyncMock(return_value=response)
            ) as execute,
        ):
            await GitHubPRManager().list_prs(query='label:"help wanted"')

        query = execute.await_args.args[1]["query"]
        self.assertIn("is:pr", query)
        self.assertNotIn("is:open", query)

    async def test_pr_handler_omits_state_for_native_query(self):
        from src.integrations.github.pull_requests import github_pr_manager, tool_github_pr

        with patch.object(github_pr_manager, "list_prs", AsyncMock(return_value={})) as list_prs:
            await tool_github_pr(action="list", query="is:closed")

        self.assertIsNone(list_prs.await_args.kwargs["state"])

    async def test_pr_query_forwards_cursor_to_search_document(self):
        from src.integrations.github.pull_requests import GitHubPRManager

        response = {
            "data": {
                "search": {
                    "issueCount": 1,
                    "pageInfo": {"hasNextPage": True, "endCursor": "next"},
                    "nodes": [],
                }
            }
        }
        with (
            patch("src.integrations.github.pull_requests.has_github_auth", return_value=True),
            patch(
                "src.integrations.github.pull_requests.github_graphql._execute", AsyncMock(return_value=response)
            ) as execute,
        ):
            result = await GitHubPRManager().list_prs(query="is:closed", cursor="prior")

        self.assertIn("SearchPullRequests", execute.await_args.args[0])
        self.assertEqual(execute.await_args.args[1]["after"], "prior")
        self.assertEqual(result["next_cursor"], "next")

    async def test_issue_handler_query_preserves_closed_state_and_cursor(self):
        from src.integrations.github.handlers import tool_github_issue

        response = {
            "data": {"search": {"issueCount": 2, "pageInfo": {"hasNextPage": True, "endCursor": "next"}, "nodes": []}}
        }
        with patch(
            "src.integrations.github.handlers.github_graphql._execute", AsyncMock(return_value=response)
        ) as execute:
            result = await tool_github_issue(action="search", query='is:closed label:"help wanted"', cursor="prior")

        self.assertIn("SearchIssuesFull", execute.await_args.args[0])
        variables = execute.await_args.args[1]
        self.assertIn('is:closed label:"help wanted"', variables["query"])
        self.assertNotIn("is:open", variables["query"])
        self.assertEqual(variables["after"], "prior")
        self.assertTrue(result["truncated"])
        self.assertEqual(result["next_cursor"], "next")

    async def test_issue_query_rejects_explicit_open_conflict(self):
        from src.integrations.github.handlers import tool_github_issue

        result = await tool_github_issue(action="search", query="is:closed", state="open")

        self.assertEqual(result["error"], "query state qualifier conflicts with state filter")

    def test_query_rejects_other_repo_in_parenthesized_or_expression(self):
        from src.integrations.github.graphql import build_scoped_search_query

        result = build_scoped_search_query(
            "(repo:pollinations/pollinations OR repo:other/repo)",
            repository="pollinations/pollinations",
            kind="issue",
        )

        self.assertEqual(result["error"], "query repo qualifier conflicts with the configured repository")

    def test_query_rejects_parenthesized_wrong_item_kind(self):
        from src.integrations.github.graphql import build_scoped_search_query

        result = build_scoped_search_query("(is:pr OR is:open)", repository="pollinations/pollinations", kind="issue")

        self.assertEqual(result["error"], "query must target issues, not the other item kind")

    def test_query_rejects_state_qualifier_conflict(self):
        from src.integrations.github.graphql import build_scoped_search_query

        result = build_scoped_search_query(
            "state:closed", repository="pollinations/pollinations", kind="issue", state="open"
        )

        self.assertEqual(result["error"], "query state qualifier conflicts with state filter")

    async def test_blank_native_queries_are_rejected(self):
        from src.integrations.github.handlers import tool_github_issue
        from src.integrations.github.pull_requests import GitHubPRManager

        issue_result = await tool_github_issue(action="search", query="")
        with patch("src.integrations.github.pull_requests.has_github_auth", return_value=True):
            pr_result = await GitHubPRManager().list_prs(query="")

        self.assertEqual(issue_result["error"], "query must not be blank")
        self.assertEqual(pr_result["error"], "query must not be blank")


class PullRequestAuthorSearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_author_uses_server_search_before_limit(self):
        from src.integrations.github.pull_requests import GitHubPRManager

        response = {
            "data": {
                "search": {
                    "issueCount": 2,
                    "pageInfo": {"hasNextPage": True},
                    "nodes": [
                        {
                            "number": 9,
                            "title": "target",
                            "state": "OPEN",
                            "isDraft": False,
                            "url": "https://example.test",
                            "author": {"login": "target"},
                            "headRefName": "head",
                            "baseRefName": "main",
                            "createdAt": "2026-01-01T00:00:00Z",
                            "updatedAt": "2026-01-01T00:00:00Z",
                            "labels": {"nodes": []},
                        }
                    ],
                }
            }
        }
        with (
            patch("src.integrations.github.pull_requests.has_github_auth", return_value=True),
            patch(
                "src.integrations.github.pull_requests.github_graphql._execute", AsyncMock(return_value=response)
            ) as execute,
        ):
            result = await GitHubPRManager().list_prs(state="open", base="main", author="target", limit=1)
        self.assertEqual(result["matched_total"], 2)
        self.assertTrue(result["truncated"])
        self.assertIn('base:"main"', execute.await_args.args[1]["query"])

    async def test_rejects_author_qualifier_injection(self):
        from src.integrations.github.pull_requests import GitHubPRManager

        with patch("src.integrations.github.pull_requests.has_github_auth", return_value=True):
            result = await GitHubPRManager().list_prs(author="target is:closed")

        self.assertEqual(result["error"], "author must be a valid GitHub login")

    async def test_base_filter_uses_server_search_before_limit(self):
        from src.integrations.github.pull_requests import GitHubPRManager

        response = {"data": {"search": {"issueCount": 1, "pageInfo": {"hasNextPage": False}, "nodes": []}}}
        with (
            patch("src.integrations.github.pull_requests.has_github_auth", return_value=True),
            patch(
                "src.integrations.github.pull_requests.github_graphql._execute", AsyncMock(return_value=response)
            ) as execute,
        ):
            await GitHubPRManager().list_prs(base="release/next", limit=1)

        self.assertIn('base:"release/next"', execute.await_args.args[1]["query"])


class HandlerForwardingTests(unittest.IsolatedAsyncioTestCase):
    async def test_label_list_forwards_limit_and_cursor(self):
        from src.integrations.github.handlers import tool_github_issue

        with patch(
            "src.integrations.github.handlers.github_graphql._fetch_labels", AsyncMock(return_value={"labels": []})
        ) as fetch_labels:
            await tool_github_issue(action="list_labels", limit=25, cursor="labels-after")

        fetch_labels.assert_awaited_once_with(limit=25, after="labels-after")

    async def test_milestone_list_forwards_limit_cursor_and_default_state(self):
        from src.integrations.github.handlers import tool_github_issue

        with patch(
            "src.integrations.github.handlers.github_graphql._fetch_milestones",
            AsyncMock(return_value={"milestones": []}),
        ) as fetch_milestones:
            await tool_github_issue(action="list_milestones", limit=25, cursor="milestones-after")

        fetch_milestones.assert_awaited_once_with(state="open", limit=25, after="milestones-after")

    async def test_custom_handler_forwards_author_and_page(self):
        from src.integrations.github.handlers import tool_github_custom

        with patch(
            "src.integrations.github.handlers.github_graphql.execute_custom_request", AsyncMock(return_value={})
        ) as custom_request:
            await tool_github_custom(request="issues", author="octocat", limit=25, page=3)

        self.assertEqual(custom_request.await_args.kwargs["author"], "octocat")
        self.assertEqual(custom_request.await_args.kwargs["page"], 3)


class ProjectTruncationTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_limit_across_complete_scopes_is_not_truncated(self):
        client = GitHubGraphQL()
        client._execute = AsyncMock(
            side_effect=[
                {
                    "data": {
                        "organization": {
                            "projectsV2": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [
                                    {
                                        "id": "org-1",
                                        "number": 1,
                                        "title": "Org",
                                        "shortDescription": "",
                                        "url": "https://example.test/org",
                                        "closed": False,
                                    }
                                ],
                            }
                        }
                    }
                },
                {
                    "data": {
                        "repository": {
                            "projectsV2": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [
                                    {
                                        "id": "repo-2",
                                        "number": 2,
                                        "title": "Repo",
                                        "shortDescription": "",
                                        "url": "https://example.test/repo",
                                        "closed": False,
                                    }
                                ],
                            }
                        }
                    }
                },
            ]
        )

        result = await client.list_projects(limit=1)

        self.assertEqual(result["count"], 2)
        self.assertFalse(result["truncated"])


class PaginationMetadataTests(unittest.IsolatedAsyncioTestCase):
    async def test_milestones_omit_cursor_when_not_truncated(self):
        client = GitHubGraphQL()
        client._execute = AsyncMock(
            return_value={
                "data": {
                    "repository": {
                        "milestones": {"pageInfo": {"hasNextPage": False, "endCursor": "stale"}, "nodes": []}
                    }
                }
            }
        )

        result = await client._fetch_milestones()

        self.assertFalse(result["truncated"])
        self.assertIsNone(result["next_cursor"])


class OverviewProjectTests(unittest.IsolatedAsyncioTestCase):
    async def test_overview_preserves_all_requested_projects(self):
        client = GitHubGraphQL()
        client._execute = AsyncMock(
            return_value={
                "data": {
                    "repository": {
                        "openIssues": {"totalCount": 0},
                        "closedIssues": {"totalCount": 0},
                        "issues": {"nodes": []},
                        "labels": {"nodes": []},
                        "milestones": {"nodes": []},
                    }
                }
            }
        )
        client.list_projects = AsyncMock(
            return_value={
                "projects": [
                    {"number": number, "title": str(number), "url": "https://example.test"} for number in range(26)
                ],
                "truncated": False,
            }
        )

        result = await client.get_repo_overview()

        self.assertEqual(len(result["projects"]), 26)
        self.assertEqual(client.list_projects.await_args.kwargs["limit"], 100)


class ReviewSummaryCountTests(unittest.IsolatedAsyncioTestCase):
    async def test_counts_files_not_review_batches(self):
        class Review(PRReviewMixin):
            async def get_pr(self, _pr_number):
                return {"number": 1, "title": "PR", "url": "https://example.test"}

            async def get_pr_diff(self, _pr_number):
                return {"diff": "diff"}

            def _split_diff_by_file(self, _diff):
                return [{"filename": name} for name in ("a.py", "b.py", "c.py")]

            async def _review_files_concurrently(self, _files):
                return [
                    {"filenames": ["a.py", "b.py"], "findings": "LGTM", "high_priority": False},
                    {"filenames": ["c.py"], "findings": "", "high_priority": False, "error": "review_timeout"},
                ]

            async def _synthesize_review(self, _pr, _reviewed, _errored):
                return "LGTM"

        result = await Review().review_pr(1)

        self.assertEqual(result["files_requested"], 3)
        self.assertEqual(result["files_successfully_reviewed"], 2)
        self.assertEqual(result["successful_batches"], 1)
        self.assertEqual(result["failed_batches"], 1)


class GraphQLErrorPropagationTests(unittest.IsolatedAsyncioTestCase):
    async def test_custom_graphql_preserves_partial_data(self):
        client = GitHubGraphQL()
        client._execute = AsyncMock(
            return_value={"data": {"repository": None}, "error": "field unavailable", "partial": True}
        )
        result = await client.execute_custom_request(request="", graphql_query="query { repository { name } }")
        self.assertEqual(result["data"], {"repository": None})
        self.assertTrue(result["partial"])


class ReviewFailureCategoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_review_allows_reasoning_output_budget(self):
        client = AsyncMock()
        client.generate_text.return_value = "LGTM"
        with patch("src.ai.client.pollinations_client", client):
            result = await PRReviewMixin()._review_files_concurrently(
                [{"filename": "a.py", "diff": "+x", "high_priority": False}]
            )
        self.assertEqual(client.generate_text.await_args.kwargs["max_tokens"], 4096)
        self.assertNotIn("error", result[0])

    async def test_timeout_uses_safe_error_category(self):
        class Review(PRReviewMixin):
            pass

        client = AsyncMock()
        client.generate_text.side_effect = TimeoutError()
        with patch("src.ai.client.pollinations_client", client):
            result = await Review()._review_files_concurrently(
                [{"filename": "a.py", "diff": "diff --git a/a.py b/a.py\n@@ +1 @@\n+x", "high_priority": False}]
            )
        self.assertEqual(result[0]["error"], "review_timeout")
