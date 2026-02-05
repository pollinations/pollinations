#!/usr/bin/env python3
"""
LinkedIn Post Generator - Simplified version using common utilities and external prompts.
"""

import sys
import json
import base64
import requests
from datetime import datetime, timezone
from typing import Dict, List, Optional

from common import (
    GITHUB_API_BASE,
    get_env,
    load_prompt,
    get_date_range,
    get_merged_prs,
    call_pollinations_api,
    generate_image,
    commit_image_to_branch,
    get_file_sha,
    format_pr_summary,
)

# LinkedIn-specific image dimensions
LINKEDIN_IMAGE_WIDTH = 2048
LINKEDIN_IMAGE_HEIGHT = 2048


def generate_linkedin_post(prs: List[Dict], token: str) -> Optional[Dict]:
    """Generate LinkedIn post content using AI"""
    
    # Format PR summary for the prompt
    pr_summary = format_pr_summary(prs, "WEEKLY")
    
    # Load prompts from files
    system_prompt_template = load_prompt("linkedin", "system")
    system_prompt = system_prompt_template.replace("{pr_summary}", pr_summary)
    
    # Choose user prompt based on whether we have PRs
    if prs:
        user_prompt_template = load_prompt("linkedin", "user_with_prs")
        pr_titles = [pr['title'] for pr in prs[:5]]
        user_prompt = user_prompt_template.replace("{pr_titles}", str(pr_titles))
        user_prompt = user_prompt.replace("{pr_count}", str(len(prs)))
    else:
        user_prompt = load_prompt("linkedin", "user_thought_leadership")
    
    print(f"Calling Pollinations API for LinkedIn post...")
    
    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.7)
    
    if not response:
        return None
    
    # Parse JSON from response
    try:
        # Try to extract JSON from response
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        
        if json_start >= 0 and json_end > json_start:
            json_str = response[json_start:json_end]
            post_data = json.loads(json_str)
            print(f"Generated {post_data.get('post_type', 'unknown')} post")
            return post_data
        else:
            print(f"No JSON found in response")
            return None
            
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"Response: {response[:500]}...")
        return None


def create_post_pr(post_data: Dict, image_bytes: Optional[bytes], image_url: Optional[str], prs: List[Dict], github_token: str, owner: str, repo: str):
    """Create a PR with the LinkedIn post JSON"""

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    # Get base branch SHA
    ref_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers
    )
    if ref_response.status_code != 200:
        print(f"Error getting ref: {ref_response.text}")
        return

    base_sha = ref_response.json()['object']['sha']

    # Create new branch
    branch_name = f"linkedin-post-{today}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )

    if create_branch_response.status_code not in [200, 201]:
        if "Reference already exists" not in create_branch_response.text:
            print(f"Error creating branch: {create_branch_response.text}")
            return
        print(f"Branch {branch_name} already exists, updating...")

    print(f"Created branch: {branch_name}")

    # Commit image to branch and get stable URL
    if image_bytes:
        image_path = f"social/news/transformed/linkedin/posts/{today}-image.jpg"
        raw_url = commit_image_to_branch(image_bytes, image_path, branch_name, github_token, owner, repo)
        if raw_url:
            image_url = raw_url
        else:
            print("Warning: Using generation URL as fallback — Buffer may fail to fetch it")

    # Build the full post text
    full_post = post_data['hook'] + "\n\n" + post_data['body']
    if post_data.get('cta'):
        full_post += "\n\n" + post_data['cta']
    full_post += "\n\n" + " ".join(post_data.get('hashtags', []))

    # Create the JSON post data
    output_data = {
        "date": today,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "platform": "linkedin",
        "post_type": post_data.get('post_type', 'insight'),
        "hook": post_data['hook'],
        "body": post_data['body'],
        "cta": post_data.get('cta', ''),
        "full_post": full_post,
        "hashtags": post_data.get('hashtags', []),
        "image": {
            "url": image_url,
            "prompt": post_data.get('image_prompt', ''),
            "text": post_data.get('image_text', '')
        } if image_url else None,
        "reasoning": post_data.get('reasoning', ''),
        "pr_references": [f"#{pr['number']}" for pr in prs] if prs else [],
        "char_count": len(full_post)
    }

    # Create JSON file
    json_path = f"social/news/transformed/linkedin/posts/{today}.json"
    json_content = json.dumps(output_data, indent=2, ensure_ascii=False)
    json_encoded = base64.b64encode(json_content.encode()).decode()

    # Check if file exists
    json_sha = get_file_sha(github_token, owner, repo, json_path, branch_name)
    if not json_sha:
        json_sha = get_file_sha(github_token, owner, repo, json_path, "main")

    json_payload = {
        "message": f"linkedin: add post for {today}",
        "content": json_encoded,
        "branch": branch_name
    }
    if json_sha:
        json_payload["sha"] = json_sha

    json_response = requests.put(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{json_path}",
        headers=headers,
        json=json_payload
    )

    if json_response.status_code not in [200, 201]:
        print(f"Error creating JSON file: {json_response.text}")
        return

    print(f"Created {json_path}")

    # Create PR
    pr_title = f"LinkedIn Post - {today}"

    # Image preview in PR body
    image_preview = ""
    if image_url:
        image_preview = f"""
### Image
**Prompt:** {post_data.get('image_prompt', 'N/A')[:200]}...
**Text in image:** {post_data.get('image_text', 'N/A')}

![Preview]({image_url})
"""

    pr_body = f"""## LinkedIn Post for {today}

**Post Type:** {output_data['post_type']}
**Character Count:** {output_data['char_count']}

### Hook
{output_data['hook']}

### Body
{output_data['body']}

### CTA
{output_data['cta']}

### Hashtags
{' '.join(output_data['hashtags'])}
{image_preview}
---

**Reasoning:** {output_data['reasoning']}

**PR References:** {', '.join(output_data['pr_references']) if output_data['pr_references'] else 'None (thought leadership)'}

---
When this PR is merged, the post will be published to LinkedIn via Buffer.

Generated automatically by GitHub Actions
"""

    pr_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": "main"
        }
    )

    if pr_response.status_code not in [200, 201]:
        if "A pull request already exists" in pr_response.text:
            list_response = requests.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch_name}&state=open",
                headers=headers
            )
            if list_response.status_code == 200 and list_response.json():
                existing_pr = list_response.json()[0]
                update_response = requests.patch(
                    f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{existing_pr['number']}",
                    headers=headers,
                    json={"title": pr_title, "body": pr_body}
                )
                if update_response.status_code == 200:
                    print(f"Updated existing PR #{existing_pr['number']}: {existing_pr['html_url']}")
                    return
            print("PR already exists but could not update it")
            return
        print(f"Error creating PR: {pr_response.text}")
        return

    pr_info = pr_response.json()
    print(f"Created PR #{pr_info['number']}: {pr_info['html_url']}")

    # Add labels
    pr_labels = get_env('PR_LABELS', required=False)
    if pr_labels:
        labels_list = [label.strip() for label in pr_labels.split(',')]
        requests.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_info['number']}/labels",
            headers=headers,
            json={"labels": labels_list}
        )


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    source_repo = get_env('SOURCE_REPO', required=False) or "pollinations/pollinations"
    days_back = int(get_env('DAYS_BACK', required=False) or "7")
    force_thought_leadership = get_env('FORCE_THOUGHT_LEADERSHIP', required=False) == "true"

    owner_name, repo_name = repo_full_name.split('/')
    source_owner, source_repo_name = source_repo.split('/')

    # Fetch merged PRs (unless forcing thought leadership content)
    merged_prs = []
    if force_thought_leadership:
        print(f"\n=== Forcing Thought Leadership Content ===")
    else:
        start_date, _ = get_date_range(days_back)
        print(f"\n=== Fetching PRs from {source_repo} (last {days_back} days) ===")
        merged_prs = get_merged_prs(source_owner, source_repo_name, start_date, github_token)
        print(f"Found {len(merged_prs)} merged PRs")

    # Generate post
    print(f"\n=== Generating LinkedIn Post ===")
    post_data = generate_linkedin_post(merged_prs, pollinations_token)

    if not post_data:
        print("Failed to generate post. Exiting.")
        sys.exit(1)

    # Generate image
    print(f"\n=== Generating Image ===")
    image_bytes = None
    image_url = None
    if post_data.get('image_prompt'):
        image_bytes, image_url = generate_image(
            post_data['image_prompt'],
            pollinations_token,
            width=LINKEDIN_IMAGE_WIDTH,
            height=LINKEDIN_IMAGE_HEIGHT
        )
        if not image_bytes:
            print("Warning: Failed to generate image, continuing without it")

    # Create PR
    print(f"\n=== Creating PR ===")
    create_post_pr(post_data, image_bytes, image_url, merged_prs, github_token, owner_name, repo_name)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
