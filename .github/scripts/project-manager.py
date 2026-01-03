import os
import json
import requests
import time
import random
from typing import Optional

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_EVENT = json.loads(os.getenv("GITHUB_EVENT", "{}"))
POLLINATIONS_TOKEN = os.getenv("POLLINATIONS_TOKEN")
REPO_OWNER = "pollinations"
REPO_NAME = "pollinations"

IS_PULL_REQUEST = "pull_request" in GITHUB_EVENT
ITEM_DATA = (
    GITHUB_EVENT.get("pull_request")
    if IS_PULL_REQUEST
    else GITHUB_EVENT.get("issue", {})
)
ISSUE_NUMBER = ITEM_DATA.get("number")
ISSUE_TITLE = ITEM_DATA.get("title", "")
ISSUE_BODY = ITEM_DATA.get("body", "") or ""
ISSUE_AUTHOR = ITEM_DATA.get("user", {}).get("login", "")
ISSUE_NODE_ID = ITEM_DATA.get("node_id", "")

GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"
POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"


GITHUB_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}

CONFIG = {
    "projects": {
        "dev": {
            "id": "PVT_kwDOBS76fs4AwCAM",
            "name": "Dev",
            "number": 20,
            "description": "Core development, features, refactors, infrastructure - internal only",
            "internal_only": True,
            "default_status": "Backlog",
            "status_field_id": "PVTSSF_lADOBS76fs4AwCAMzgmXaAM",
            "status_options": {
                "Backlog": "f75ad846",
                "To Do": "d89ca0b2",
                "In Progress": "47fc9ee4",
                "In Review": "ca6ba6c3",
                "Done": "98236657",
                "Discarded": "bc3f7e3a",
            },
            "priority_field_id": "PVTSSF_lADOBS76fs4AwCAMzg2DKDk",
            "priority_options": {
                "Urgent": "0f53228f",
                "High": "dc7fa85f",
                "Medium": "15fd4fac",
                "Low": "7495a981",
            },
        },
        "support": {
            "id": "PVT_kwDOBS76fs4BLr1H",
            "name": "Support",
            "number": 21,
            "description": "User help, billing, API questions, bug reports from users",
            "internal_only": False,
            "default_status": "To do",
            "status_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7L1RQ",
            "status_options": {
                "To do": "f75ad846",
                "In progress": "47fc9ee4",
                "Done": "98236657",
                "Discarded": "bc3f7e3a",
            },
            "priority_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7NAkI",
            "priority_options": {
                "Urgent": "5b4c403c",
                "High": "509f6cf1",
                "Medium": "ce60ee16",
                "Low": "ca5161be",
            },
        },
        "news": {
            "id": "PVT_kwDOBS76fs4BLtD8",
            "name": "News",
            "number": 22,
            "description": "News workflows, social media automation, announcements, releases",
            "internal_only": False,
            "default_status": "Review",
            "status_field_id": "PVTSSF_lADOBS76fs4BLtD8zg7Mrxg",
            "status_options": {
                "Review": "f75ad846",
                "Done": "98236657",
            },
            "priority_field_id": None,
            "priority_options": {},
        }
    },
    "labels": {
        # DEV (TOP + TYPE)
        "DEV": "Applied to all Dev items",
        "BUG": "Something is broken",
        "FEATURE": "New functionality request",
        "QUEST": "Community task - pollen reward if merged",
        "TRACKING": "Meta-issue tracking other items",
        
        # SUPPORT (TOP + TYPE + TAG)
        "SUPPORT": "Applied to all Support issues",
        "HELP": "User needs assistance",
        "BALANCE": "Pollen balance issue",
        "BILLING": "Payment or subscription issue",
        "API": "API usage or integration issue",
        
        # NEWS (TOP only)
        "NEWS": "Applied to all News PRs",
    },
    "org_members": [
        "voodoohop",
        "eulervoid",
        "ElliotEtag",
        "Circuit-Overtime",
        "Itachi-1824"
    ],
    "member_skills": {
        "voodoohop": ["dev", "support", "news", "general"],
        "eulervoid": ["backend", "infrastructure", "api", "core", "database"],
        "ElliotEtag": ["frontend", "features", "bug-fixes", "integration"],
        "Circuit-Overtime": ["backend", "devops", "scaling", "performance", "news"],
        "Itachi-1824": ["community", "quests", "tasks", "coordination", "tracking"],
    },
}


def is_org_member(username: str) -> bool:
    if username.lower() in [m.lower() for m in CONFIG["org_members"]]:
        return True

    try:
        resp = requests.get(
            f"{GITHUB_API}/orgs/{REPO_OWNER}/members/{username}", headers=GITHUB_HEADERS
        )
        return resp.status_code == 204
    except requests.RequestException:
        return False


def classify_with_ai(is_internal: bool) -> dict:
    org_members = ", ".join(CONFIG["org_members"])
    member_skills = CONFIG.get("member_skills", {})
    skills_info = "\n".join(
        [f"  - {member}: {', '.join(skills)}" for member, skills in member_skills.items()]
    )
    system_prompt = f"""You are a GitHub issue/PR classifier for Pollinations. Analyze and classify into ONE project.
    PROJECTS:
    - dev: Core development work, features, refactors, infrastructure, code improvements (INTERNAL ONLY)
    - support: User help, bug reports, API questions, billing issues, pollen balance questions
    - news: Release announcements, changelog, social media posts, community updates

    RULES:
    1. Author is {"INTERNAL (org member)" if is_internal else "EXTERNAL (community contributor)"}
    2. {"Internal authors can go to any project based on content" if is_internal else "External authors ALWAYS go to 'support' (dev is internal-only)"}
    3. Each item goes to exactly ONE project
    4. Set priority based on impact: Urgent (critical/blocking), High (important), Medium (normal), Low (minor)

    LABELS (pick 1-2 most relevant, UPPERCASE):
    Dev labels: DEV, BUG, FEATURE, QUEST, TRACKING
    Support labels: SUPPORT, HELP, BUG, FEATURE, BALANCE, BILLING, API
    News labels: NEWS

    ASSIGNEE SELECTION:
    Team members and their skills:
{skills_info}
    
    Pick the BEST team member from the list above who would be most suitable to handle this issue based on its content and complexity.
    Match the issue requirements with member skills. Use 'voodoohop' as fallback if no clear match.

    Return ONLY valid JSON:
    {{"project": "dev|support|news", "priority": "Urgent|High|Medium|Low", "labels": ["label1"], "assignee": "username", "reasoning": "brief why"}}"""

    item_type = "Pull Request" if IS_PULL_REQUEST else "Issue"
    user_prompt = f"""{item_type} #{ISSUE_NUMBER}
    Author: {ISSUE_AUTHOR} ({"internal" if is_internal else "external"})
    Title: {ISSUE_TITLE}
    Body: {ISSUE_BODY[:2000]}"""

    for attempt in range(3):
        try:
            seed = random.randint(0, 2147483647)
            headers = (
                {"Authorization": f"Bearer {POLLINATIONS_TOKEN}"}
                if POLLINATIONS_TOKEN
                else {}
            )
            response = requests.post(
                POLLINATIONS_API,
                headers=headers,
                json={
                    "model": "openai",
                    "seed": seed,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"},
                },
                timeout=300,  
            )

            if response.status_code == 429:
                wait_time = 2**attempt
                print(
                    f"Rate limited, waiting {wait_time}s before retry (seed: {seed})..."
                )
                time.sleep(wait_time)
                continue

            if response.status_code != 200:
                print(
                    f"AI API error: {response.status_code}, attempt {attempt + 1}/3 (seed: {seed})"
                )
                if attempt < 2:
                    time.sleep(2**attempt)
                    continue
                return get_fallback_classification(is_internal)

            content = (
                response.json()
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            return json.loads(content.strip())

        except (requests.RequestException, json.JSONDecodeError, KeyError) as e:
            print(f"Classification error: {e}, attempt {attempt + 1}/3")
            if attempt < 2:
                time.sleep(2**attempt)
                continue
            return get_fallback_classification(is_internal)

    return get_fallback_classification(is_internal)


def get_fallback_classification(is_internal: bool) -> dict:
    return {
        "project": "dev" if is_internal else "support",
        "priority": "Medium",
        "labels": ["EXTERNAL"] if not is_internal else [],
        "reasoning": "Fallback classification",
    }


def graphql_request(query: str, variables: dict = None) -> dict:
    for attempt in range(3):
        try:
            response = requests.post(
                GITHUB_GRAPHQL,
                headers={**GITHUB_HEADERS, "Content-Type": "application/json"},
                json={"query": query, "variables": variables or {}},
                timeout=30,
            )

            if response.status_code == 403 or response.status_code == 429:
                wait_time = 2**attempt
                print(f"Rate limited, waiting {wait_time}s before retry...")
                time.sleep(wait_time)
                continue

            if response.status_code != 200:
                print(f"GraphQL error: {response.status_code} - {response.text}")
                return {}

            data = response.json()
            if "errors" in data:
                print(f"GraphQL errors: {data['errors']}")
                return {}

            return data.get("data", {})

        except requests.RequestException as e:
            print(f"GraphQL request error: {e}")
            if attempt < 2:
                time.sleep(2**attempt)
                continue
            return {}

    return {}


def add_to_project(project_id: str) -> Optional[str]:
    mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
            item {
                id
            }
        }
    }
    """

    result = graphql_request(
        mutation, {"projectId": project_id, "contentId": ISSUE_NODE_ID}
    )

    item = result.get("addProjectV2ItemById", {}).get("item", {})
    return item.get("id")


def set_project_field(project_id: str, item_id: str, field_id: str, option_id: str):
    mutation = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: {singleSelectOptionId: $optionId}
        }) {
            projectV2Item {
                id
            }
        }
    }
    """

    graphql_request(
        mutation,
        {
            "projectId": project_id,
            "itemId": item_id,
            "fieldId": field_id,
            "optionId": option_id,
        },
    )


def add_labels(labels: list):
    if not labels:
        return

    config_labels_upper = {k.upper() for k in CONFIG["labels"]}
    valid_labels = [l.upper() for l in labels if l.upper() in config_labels_upper]
    invalid_labels = [l.upper() for l in labels if l.upper() not in config_labels_upper]
    
    if invalid_labels:
        print(f"⚠ Skipping invalid labels: {invalid_labels}")
    
    if not valid_labels:
        print("No valid labels to add")
        return

    # Add project-level label (DEV, SUPPORT, or NEWS) if not already present
    project_key = classification.get("project", "support").upper()
    if project_key not in valid_labels:
        valid_labels.append(project_key)

    try:
        response = requests.post(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/labels",
            headers=GITHUB_HEADERS,
            json={"labels": valid_labels},
            timeout=10,
        )
        if response.status_code != 200:
            print(f"Failed to add labels: HTTP {response.status_code} - {response.text}")
        else:
            print(f"✓ Added labels: {valid_labels}")
    except requests.RequestException as e:
        print(f"Failed to add labels: {e}")


def find_best_assignee(classification: dict) -> Optional[str]:
    assignee = classification.get("assignee", "").strip()
    if assignee and assignee in CONFIG.get("org_members", []):
        return assignee
    
    return None


def assign_issue(assignee: str):
    try:
        response = requests.patch(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}",
            headers=GITHUB_HEADERS,
            json={"assignees": [assignee]},
            timeout=10,
        )
        if response.status_code != 200:
            print(f"Failed to assign: HTTP {response.status_code} - {response.text}")
        else:
            print(f"✓ Assigned to @{assignee}")
    except requests.RequestException as e:
        print(f"Failed to assign issue: {e}")


def main():
    if not ISSUE_NUMBER or not ISSUE_NODE_ID:
        print("No issue/PR found in event")
        return

    print(
        f"Processing {'PR' if IS_PULL_REQUEST else 'Issue'} #{ISSUE_NUMBER}: {ISSUE_TITLE}"
    )
    print(f"Author: {ISSUE_AUTHOR}")

    is_internal = is_org_member(ISSUE_AUTHOR)
    print(f"Internal member: {is_internal}")

    classification = classify_with_ai(is_internal)
    print(f"Classification: {json.dumps(classification, indent=2)}")

    project_key = classification.get("project", "support").lower()
    priority = classification.get("priority", "Medium")
    labels = classification.get("labels", [])

    project_config = CONFIG["projects"].get(project_key)
    if not project_config:
        print(f"Invalid project: {project_key}, defaulting to support")
        project_key = "support"
        project_config = CONFIG["projects"]["support"]

    if project_config.get("internal_only") and not is_internal:
        print(f"External user cannot be added to {project_key}, redirecting to support")
        project_key = "support"
        project_config = CONFIG["projects"]["support"]

    print(f"Adding to project: {project_config['name']}")
    item_id = add_to_project(project_config["id"])

    if not item_id:
        print("Failed to add to project")
        return

    print(f"Added to project, item ID: {item_id}")

    status = project_config.get("default_status")
    status_field_id = project_config.get("status_field_id")
    status_option_id = project_config.get("status_options", {}).get(status)

    if status_field_id and status_option_id:
        print(f"Setting status: {status}")
        set_project_field(
            project_config["id"], item_id, status_field_id, status_option_id
        )

    priority_field_id = project_config.get("priority_field_id")
    priority_option_id = project_config.get("priority_options", {}).get(priority)

    if priority_field_id and priority_option_id:
        print(f"Setting priority: {priority}")
        set_project_field(
            project_config["id"], item_id, priority_field_id, priority_option_id
        )

    if labels:
        print(f"Adding labels: {labels}")
        add_labels(labels)

    best_assignee = find_best_assignee(classification)
    if best_assignee:
        print(f"Assigning to @{best_assignee}")
        assign_issue(best_assignee)
    else:
        print("No valid assignee found, skipping assignment")

    print(f"\n✓ Successfully organized into {project_config['name']} project")
    print(f"  Priority: {priority}")
    print(f"  Reasoning: {classification.get('reasoning', 'N/A')}")


if __name__ == "__main__":
    main()
