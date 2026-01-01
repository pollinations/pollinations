import os
import json
import requests
from typing import Optional

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_EVENT = json.loads(os.getenv("GITHUB_EVENT", "{}"))
ISSUE_NUMBER = os.getenv("ISSUE_NUMBER")
IS_PULL_REQUEST = os.getenv("IS_PULL_REQUEST") == "true"
REPO_OWNER = os.getenv("REPO_OWNER")
REPO_NAME = os.getenv("REPO_NAME")

API_BASE = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

PROJECT_NAMES = {
    "support": "Support",
    "dev": "Dev", 
    "news": "News"
}

def get_issue_or_pr():
    if IS_PULL_REQUEST:
        return GITHUB_EVENT.get("pull_request", {})
    return GITHUB_EVENT.get("issue", {})

def get_project_id(project_name: str) -> Optional[str]:
    resp = requests.get(
        f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/projects",
        headers=HEADERS
    )
    if resp.status_code != 200:
        return None
    
    for proj in resp.json():
        if proj["name"] == project_name:
            return proj["id"]
    return None

def add_to_project(issue_num: int, project_id: str):
    card_resp = requests.post(
        f"https://api.github.com/projects/{project_id}/cards",
        headers={**HEADERS, "Accept": "application/vnd.github.inertia-preview+json"},
        json={
            "content_id": issue_num,
            "content_type": "PullRequest" if IS_PULL_REQUEST else "Issue"
        }
    )
    return card_resp.status_code in [201, 200]

def set_status(project_id: str, card_id: str, status: str):
    requests.patch(
        f"https://api.github.com/projects/columns/cards/{card_id}",
        headers={**HEADERS, "Accept": "application/vnd.github.inertia-preview+json"},
        json={"note": status}
    )

def update_labels(labels: list):
    if not labels:
        return
    
    endpoint = f"{API_BASE}/issues/{ISSUE_NUMBER}/labels"
    requests.post(
        endpoint,
        headers=HEADERS,
        json={"labels": labels}
    )

def update_priority(priority: str):
    requests.patch(
        f"{API_BASE}/issues/{ISSUE_NUMBER}",
        headers=HEADERS,
        json={"state_reason": None}
    )

def classify_issue() -> tuple[str, str, list, str]:
    item = get_issue_or_pr()
    title = item.get("title", "").lower()
    body = (item.get("body") or "").lower()
    labels = [l["name"] for l in item.get("labels", [])]
    
    content = f"{title} {body}"
    
    if IS_PULL_REQUEST:
        if any(keyword in title for keyword in ["news", "weekly", "update"]):
            return "news", "To do", ["NEWS"], "High"
        return "dev", "To do", ["EXTERNAL"], "Medium"
    
    if any(word in content for word in ["bug", "broken", "error", "crash", "fail", "issue"]):
        if "urgent" in content or "critical" in content:
            return "support", "To do", ["BUG"], "Urgent"
        return "support", "To do", ["BUG"], "High"
    
    if any(word in content for word in ["feature", "add", "implement", "new", "request"]):
        return "dev", "Backlog", ["FEATURE"], "Medium"
    
    if any(word in content for word in ["help", "question", "how", "guide"]):
        return "support", "To do", ["HELP"], "Medium"
    
    if any(word in content for word in ["pollen", "reward", "earn", "token"]):
        return "support", "To do", ["POLLEN"], "High"
    
    if any(word in content for word in ["vote", "poll", "feedback", "opinion"]):
        return "support", "To do", ["VOTING"], "Medium"
    
    return "dev", "Backlog", ["QUEST"], "Low"

def main():
    project_key, status, labels, priority = classify_issue()
    project_name = PROJECT_NAMES.get(project_key)
    
    if not project_name:
        return
    
    project_id = get_project_id(project_name)
    if project_id:
        add_to_project(int(ISSUE_NUMBER), project_id)
    
    if labels:
        update_labels(labels)

if __name__ == "__main__":
    main()
