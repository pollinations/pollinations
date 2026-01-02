import os
import json
import requests
from typing import Optional

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_EVENT = json.loads(os.getenv("GITHUB_EVENT", "{}"))
REPO_OWNER = "pollinations"
REPO_NAME = "pollinations"
IS_PULL_REQUEST = "pull_request" in GITHUB_EVENT
ISSUE_NUMBER = GITHUB_EVENT.get("pull_request", {}).get("number") if IS_PULL_REQUEST else GITHUB_EVENT.get("issue", {}).get("number")
ISSUE_TITLE = GITHUB_EVENT.get("pull_request", {}).get("title") or GITHUB_EVENT.get("issue", {}).get("title", "")
ISSUE_BODY = GITHUB_EVENT.get("pull_request", {}).get("body") or GITHUB_EVENT.get("issue", {}).get("body", "")
ISSUE_AUTHOR = GITHUB_EVENT.get("pull_request", {}).get("user", {}).get("login") or GITHUB_EVENT.get("issue", {}).get("user", {}).get("login", "")
ORG_MEMBERS_CACHE = {}


API_BASE = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"
GITHUB_HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}


CONFIG = {
  "projects": {
    "support": {
      "name": "Support",
      "description": "User support issues, bug reports, help requests, pollen/reward questions, voting/feedback, technical assistance",
      "priorities": {
        "Urgent": "Critical bugs, service-breaking issues, security issues, user completely blocked",
        "High": "Important bugs, pollen/reward related, crash reports, blocking issues",
        "Medium": "Regular bugs, help questions, feature feedback",
        "Low": "Discussions, ideas, minor issues"
      },
      "default_status": "To do"
    },
    "dev": {
      "name": "Dev",
      "description": "Feature requests, implementation tasks, code improvements, development work, new features",
      "priorities": {
        "High": "Critical features, security improvements, critical fixes",
        "Medium": "Regular features, general improvements, optimizations",
        "Low": "Nice-to-have features, documentation, minor enhancements"
      },
      "default_status": "Backlog",
      "backlog_status": "Backlog",
      "todo_status": "To do"
    },
    "news": {
      "name": "News",
      "description": "PR submissions announcing updates, releases, changelog entries, newsworthy changes",
      "priorities": {
        "High": "Major releases, critical updates, important announcements, security updates",
        "Medium": "Regular updates, feature announcements, workflow improvements",
        "Low": "Minor updates, documentation changes, social media posts"
      },
      "default_status": "To do"
    }
  },
  "labels": {
    "BUG": "Bug reports, errors, issues",
    "FEATURE": "Feature requests, new implementations",
    "HELP": "Help requests, questions, how-to",
    "POLLEN": "Pollen, rewards, tokens, community incentives",
    "VOTING": "Polls, voting, feedback, opinions",
    "QUEST": "Development quests, tasks",
    "NEWS": "News and releases",
    "EXTERNAL": "External contributions, third-party PRs (not from org members)",
    "TRACKING": "Tracking issues"
  },
  "org_members": {
    "eulervoid": ["backend", "api", "infrastructure", "devops", "database"],
    "voodoohop": ["frontend", "react", "ui", "design", "performance"],
    "ElliotEtag": ["ai", "ml", "image-generation", "models"],
    "Circuit-Overtime": ["docs", "tutorials", "guides", "examples"],
    "Itachi-1824": ["testing", "qa", "automation", "ci/cd"]
  },
  "classification_guidelines": {
    "note": "These are guidelines only. Use AI judgment based on context and impact. Each issue/PR must go to EXACTLY ONE project.",
    "project_assignment": {
      "support": "User-facing issues: bugs users encounter, support requests, blockers, pollen/reward questions, voting/feedback. Use when user impact is primary concern.",
      "dev": "Internal development work: feature requests for new capabilities, code improvements, architecture, internal tasks. Use when development effort is primary concern.",
      "news": "PR submissions that represent releases, updates, or announcements. Use for PRs that introduce versioned changes or major milestones."
    },
    "priority_context": {
      "support": {
        "Urgent": "User completely blocked or unable to use service (service down, critical bug, security breach)",
        "High": "Significant user impact (crashes, pollen system issues, blocking workflows)",
        "Medium": "Regular bugs or help questions with moderate impact",
        "Low": "Minor issues, discussions, feature ideas"
      },
      "dev": {
        "High": "Critical system improvements, security fixes, breaking changes needed",
        "Medium": "Regular features, optimizations, code quality improvements",
        "Low": "Nice-to-have features, documentation, minor refactoring"
      },
      "news": {
        "High": "Major releases, critical security updates, significant milestones",
        "Medium": "Regular updates, feature releases, workflow improvements",
        "Low": "Minor patches, documentation updates, housekeeping"
      }
    },
    "single_project_rule": "Each issue or PR must be assigned to ONLY ONE project. If it spans multiple areas, prioritize based on primary impact: user-facing → support, development work → dev, release announcement → news."
  },
  "assignment_rules": {
    "enabled_for_projects": ["dev"],
    "fallback_assignee": "voodoohop",
    "match_threshold": "best expertise match from org_members"
  }
}


POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"

PROJECT_NAMES = {key: proj["name"] for key, proj in CONFIG["projects"].items()}
VALID_LABELS = set(CONFIG["labels"].keys())
INTERNAL_DEVELOPERS = CONFIG["org_members"]

def classify_with_ai() -> dict:
    dev_expertise = "\n".join([f"- @{dev}: {', '.join(areas)}" for dev, areas in INTERNAL_DEVELOPERS.items()])
    projects_desc = "\n".join([
        f"- {key}: {proj['description']}" 
        for key, proj in CONFIG["projects"].items()
    ])
    labels_desc = "\n".join([
        f"- {label}: {desc}"
        for label, desc in CONFIG["labels"].items()
    ])
    system_prompt = f"""You are a GitHub issue and PR classifier for the Pollinations open-source project. Your task is to automatically organize issues and pull requests using your intelligence and context understanding.

    INTERNAL DEVELOPMENT TEAM:
    {dev_expertise}

    PROJECTS (use your judgment - refer to project-manager-config.json for guidance):
    {projects_desc}

    LABELS:
    {labels_desc}

    CRITICAL CLASSIFICATION RULES:
    1. Each issue/PR must go to EXACTLY ONE project. Never assign to multiple projects.
    2. Choose project based on primary impact: if user-facing → support, if development work → dev, if release/announcement → news
    3. Use contextual intelligence: read the title, description, and author to understand the actual intent
    4. Base priority on real impact, not just keywords - context matters more than word matching

    PRIORITY GUIDANCE (use context, not rigid rules):
    - Support: Urgent = user blocked, High = significant impact, Medium = regular issue, Low = discussion/idea
    - Dev: High = critical/security, Medium = regular features, Low = nice-to-have
    - News: High = major release, Medium = regular update, Low = minor patch

    STATUS RULES:
    - Support/News items: "To do"
    - Dev items: "Backlog" for features, "To do" for bugs

    ASSIGNEE (dev projects only):
    - Suggest from team based on expertise match. Return null if no clear match.

    CRITICAL: Return ONLY valid JSON, no markdown:
    {{"project": "support|dev|news", "priority": "Urgent|High|Medium|Low", "labels": ["LABEL1", "LABEL2"], "status": "To do|Backlog", "assignee": "username_or_null", "reasoning": "brief explanation"}}"""

    item_type = "Pull Request" if IS_PULL_REQUEST else "Issue"
    user_prompt = f"""{item_type}:
    Title: {ISSUE_TITLE}
    Author: {ISSUE_AUTHOR}
    Description: {ISSUE_BODY}"""

    payload = {
        "model": "gemini-fast",
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
                "cache_control": {
                    "type": "ephemeral"
                }
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        "modalities": ["text"],
        "max_tokens": 1000
    }

    try:
        response = requests.post(
            POLLINATIONS_API,
            json=payload,
            timeout=30
        )

        if response.status_code != 200:
            print(f"API error: {response.status_code} - {response.text}")
            return {}

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        if not content:
            print("Empty response from API")
            return {}

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            try:
                start = content.find('{')
                end = content.rfind('}')
                if start != -1 and end != -1:
                    result = json.loads(content[start:end+1])
                    return result
            except json.JSONDecodeError:
                pass
            print(f"JSON parse error: {e}\nContent: {content}")
            return {}
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return {}
    except Exception as e:
        print(f"Classification error: {e}")
        return {}

def get_project_id(project_name: str) -> Optional[str]:
    resp = requests.get(
        f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/projects",
        headers=GITHUB_HEADERS
    )
    if resp.status_code != 200:
        return None
    
    for proj in resp.json():
        if proj["name"] == project_name:
            return proj["id"]
    return None

def add_to_project(project_id: str):
    card_resp = requests.post(
        f"https://api.github.com/projects/{project_id}/cards",
        headers={**GITHUB_HEADERS, "Accept": "application/vnd.github.inertia-preview+json"},
        json={
            "content_id": int(ISSUE_NUMBER),
            "content_type": "PullRequest" if IS_PULL_REQUEST else "Issue"
        }
    )
    return card_resp.status_code in [201, 200]

def update_labels(labels: list):
    if not labels:
        return
    
    validated_labels = [l for l in labels if l in VALID_LABELS]
    if not validated_labels:
        return
    
    endpoint = f"{API_BASE}/issues/{ISSUE_NUMBER}/labels"
    requests.post(
        endpoint,
        headers=GITHUB_HEADERS,
        json={"labels": validated_labels}
    )

def assign_issue(assignee: str):
    if not assignee or assignee == "null":
        return
    
    endpoint = f"{API_BASE}/issues/{ISSUE_NUMBER}/assignees"
    requests.post(
        endpoint,
        headers=GITHUB_HEADERS,
        json={"assignees": [assignee]}
    )

def main():
    if not ISSUE_NUMBER:
        print("No issue or PR number found")
        return
    
    classification = classify_with_ai()
    
    if not classification:
        print("Failed to classify with AI")
        return
    
    project_key = classification.get("project", "").lower()
    labels = list(classification.get("labels", []))
    assignee = classification.get("assignee")
    
    project_name = PROJECT_NAMES.get(project_key)
    
    if not project_name:
        print(f"Invalid project: {project_key}")
        return
    
    project_id = get_project_id(project_name)
    if project_id:
        add_to_project(project_id)
    
    if labels:
        update_labels(labels)
    
    if project_key == "dev" and assignee:
        assign_issue(assignee)
    
    print(f"Classified as {project_name} with priority {classification.get('priority')}")
    print(f"Labels: {labels}")
    if assignee and assignee != "null":
        print(f"Assigned to: @{assignee}")
    print(f"Reasoning: {classification.get('reasoning')}")

if __name__ == "__main__":
    main()

