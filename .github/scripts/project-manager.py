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
ISSUE_TITLE = os.getenv("ISSUE_TITLE", "")
ISSUE_BODY = os.getenv("ISSUE_BODY", "")
ISSUE_AUTHOR = os.getenv("ISSUE_AUTHOR", "")

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

def classify_with_ai() -> dict:
    system_prompt = """You are a GitHub issue and PR classifier for the Pollinations open-source project. Your task is to automatically organize issues and pull requests.

CLASSIFICATION RULES:

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
- Always High for news/release PRs

Labels (choose all that apply):
- BUG: Bug reports, errors, issues
- FEATURE: Feature requests, new implementations
- HELP: Help requests, questions, how-to
- POLLEN: Pollen, rewards, tokens, community incentives
- VOTING: Polls, voting, feedback, opinions
- QUEST: Development quests, tasks
- NEWS: News and releases
- EXTERNAL: External contributions, third-party PRs
- TRACKING: Tracking issues

Status:
- For support/news: "To do"
- For dev: "Backlog" for features, "To do" for bugs

CRITICAL: Return ONLY valid JSON, no markdown, no explanation:
{"project": "support|dev|news", "priority": "Urgent|High|Medium|Low", "labels": ["LABEL1", "LABEL2"], "status": "To do|Backlog", "reasoning": "one sentence"}"""

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
        ]
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

def add_to_project(issue_num: int, project_id: str):
    card_resp = requests.post(
        f"https://api.github.com/projects/{project_id}/cards",
        headers={**GITHUB_HEADERS, "Accept": "application/vnd.github.inertia-preview+json"},
        json={
            "content_id": issue_num,
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

def main():
    classification = classify_with_ai()
    
    if not classification:
        print("Failed to classify with AI")
        return
    
    project_key = classification.get("project", "").lower()
    labels = classification.get("labels", [])
    
    project_name = PROJECT_NAMES.get(project_key)
    
    if not project_name:
        print(f"Invalid project: {project_key}")
        return
    
    project_id = get_project_id(project_name)
    if project_id:
        add_to_project(int(ISSUE_NUMBER), project_id)
    
    if labels:
        update_labels(labels)
    
    print(f"Classified as {project_name} with priority {classification.get('priority')}")
    print(f"Labels: {labels}")
    print(f"Reasoning: {classification.get('reasoning')}")

if __name__ == "__main__":
    main()

