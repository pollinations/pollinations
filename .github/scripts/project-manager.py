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

POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"

PROJECT_NAMES = {
    "support": "Support",
    "dev": "Dev", 
    "news": "News"
}

VALID_LABELS = {
    "BUG", "FEATURE", "HELP", "POLLEN", "VOTING", "QUEST", "NEWS", "EXTERNAL",
    "TRACKING", "TIER-SEED", "TIER-FLOWER", "TIER-INCOMPLETE", "TIER-REVIEW", "TIER-COMPLETE", "TIER-REJECTED"
}

INTERNAL_DEVELOPERS = {
    "eulervoid": ["backend", "api", "infrastructure", "devops", "database"],
    "voodoohop": ["frontend", "react", "ui", "design", "performance"],
    "ElliotEtag": ["ai", "ml", "image-generation", "models"],
    "Circuit-Overtime": ["docs", "tutorials", "guides", "examples"],
    "Itachi-1824": ["testing", "qa", "automation", "ci/cd"],
}

def classify_with_ai() -> dict:
    dev_expertise = "\n".join([f"- @{dev}: {', '.join(areas)}" for dev, areas in INTERNAL_DEVELOPERS.items()])
    
    system_prompt = f"""You are a GitHub issue and PR classifier for the Pollinations open-source project. Your task is to automatically organize issues and pull requests.

INTERNAL DEVELOPMENT TEAM:
{dev_expertise}

Projects:
- support: User support issues, bug reports, help requests, pollen/reward questions, voting/feedback, technical assistance
- dev: Feature requests, implementation tasks, code improvements, development work, new features
- news: PR submissions announcing updates, releases, changelog entries, newsworthy changes

Support Priority:
- Urgent: Critical bugs, service-breaking issues, security issues, user completely blocked
- High: Important bugs, pollen/reward related, crash reports, blocking issues
- Medium: Regular bugs, help questions, feature feedback
- Low: Discussions, ideas, minor issues

Dev Priority:
- High: Critical features, security improvements, critical fixes
- Medium: Regular features, general improvements, optimizations
- Low: Nice-to-have features, documentation, minor enhancements

News Priority:
- High: Major releases, critical updates, important announcements, security updates
- Medium: Regular updates, feature announcements, workflow improvements
- Low: Minor updates, documentation changes, social media posts

Labels (choose all that apply):
- BUG: Bug reports, errors, issues
- FEATURE: Feature requests, new implementations
- HELP: Help requests, questions, how-to
- POLLEN: Pollen, rewards, tokens, community incentives
- VOTING: Polls, voting, feedback, opinions
- QUEST: Development quests, tasks
- NEWS: News and releases
- EXTERNAL: External contributions, third-party PRs (not from org members)
- TRACKING: Tracking issues

Status:
- For support/news: "To do"
- For dev: "Backlog" for features, "To do" for bugs

For dev project items, suggest an assignee from the team based on expertise match. If none match well, return null for assignee.

CRITICAL: Return ONLY valid JSON, no markdown, no explanation:
{{"project": "support|dev|news", "priority": "Urgent|High|Medium|Low", "labels": ["LABEL1", "LABEL2"], "status": "To do|Backlog", "assignee": "username_or_null", "reasoning": "one sentence"}}"""

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

