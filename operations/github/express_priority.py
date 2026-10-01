"""Move recent issues from paying customers to Express priority on the Dev project.

Only issues the project manager already gave a priority are changed, so census
responses and app submissions are left alone, and an issue it hasn't reached yet
is picked up on the next run.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests

GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
TINYBIRD_READ_TOKEN = os.environ["TINYBIRD_READ_TOKEN"]
SINCE_HOURS = float(os.getenv("SINCE_HOURS") or 2)
DRY_RUN = os.getenv("DRY_RUN") == "1"
DEV_PROJECT_ID = "PVT_kwDOBS76fs4AwCAM"
EXPRESS = "Express"


def graphql(query: str, variables: dict) -> dict:
    r = requests.post(
        "https://api.github.com/graphql",
        headers={"Authorization": f"Bearer {GITHUB_TOKEN}"},
        json={"query": query, "variables": variables},
        timeout=30,
    )
    data = r.json() if r.status_code == 200 else {}
    if "data" not in data or data.get("errors"):
        sys.exit(f"GraphQL failed: {r.status_code} {r.text[:300]}")
    return data["data"]


def paying_customer_ids() -> set:
    r = requests.get(
        "https://api.europe-west2.gcp.tinybird.co/v0/pipes/paid_customers.json",
        headers={"Authorization": f"Bearer {TINYBIRD_READ_TOKEN}"},
        timeout=30,
    )
    if r.status_code != 200:
        sys.exit(f"Tinybird paid_customers failed: {r.status_code} {r.text[:200]}")
    return {row["github_id"] for row in r.json().get("data", []) if row.get("github_id") is not None}


def express_option() -> tuple:
    field = graphql(
        """query($id: ID!) { node(id: $id) { ... on ProjectV2 { field(name: "Priority") {
            ... on ProjectV2SingleSelectField { id options { id name } } } } } }""",
        {"id": DEV_PROJECT_ID},
    )["node"]["field"]
    option = next((o["id"] for o in field["options"] if o["name"] == EXPRESS), None)
    if not option:
        sys.exit(f"Dev Priority field has no {EXPRESS} option")
    return field["id"], option


def recent_issues() -> list:
    since = (datetime.now(timezone.utc) - timedelta(hours=SINCE_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    issues, cursor = [], None
    while True:
        page = graphql(
            """query($q: String!, $after: String) {
                search(type: ISSUE, query: $q, first: 100, after: $after) {
                    pageInfo { hasNextPage endCursor }
                    nodes { ... on Issue {
                        number
                        author { login ... on User { databaseId } }
                        projectItems(first: 10) { nodes {
                            id
                            project { id }
                            fieldValueByName(name: "Priority") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
                        } }
                    } }
                } }""",
            {"q": f"repo:pollinations/pollinations is:issue is:open created:>={since}", "after": cursor},
        )["search"]
        issues += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            return issues
        cursor = page["pageInfo"]["endCursor"]


def main():
    customers = paying_customer_ids()
    field_id, option_id = express_option()
    for issue in recent_issues():
        if (issue.get("author") or {}).get("databaseId") not in customers:
            continue
        item = next((i for i in issue["projectItems"]["nodes"] if i["project"]["id"] == DEV_PROJECT_ID), None)
        priority = ((item or {}).get("fieldValueByName") or {}).get("name")
        if priority is None or priority == EXPRESS:
            continue
        print(f"{'DRY-RUN ' if DRY_RUN else ''}#{issue['number']}\t{priority} -> {EXPRESS}")
        if not DRY_RUN:
            graphql(
                """mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
                    updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f,
                        value: { singleSelectOptionId: $o } }) { projectV2Item { id } } }""",
                {"p": DEV_PROJECT_ID, "i": item["id"], "f": field_id, "o": option_id},
            )


if __name__ == "__main__":
    main()
