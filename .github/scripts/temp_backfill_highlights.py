import os
import sys
import json
import time
import random
import base64
import requests

GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
MODEL = "gemini-large"
NEWS_FOLDER = "NEWS"


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_news_file_content(github_token: str, owner: str, repo: str, file_date: str) -> str:
    """Fetch a specific NEWS file from the repo"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    file_path = f"{NEWS_FOLDER}/{file_date}.md"

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers
    )

    if response.status_code == 200:
        content = base64.b64decode(response.json()['content']).decode('utf-8')
        return content
    else:
        print(f"Error fetching {file_path}: {response.status_code}")
        return None


def get_links_file(github_token: str, owner: str, repo: str) -> str:
    """Fetch NEWS/LINKS.md containing reference links for highlights"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWS_FOLDER}/LINKS.md",
        headers=headers
    )

    if response.status_code == 200:
        content = response.json().get("content", "")
        return base64.b64decode(content).decode("utf-8")
    else:
        print(f"No LINKS.md found (status: {response.status_code}), continuing without links reference")
        return ""


def create_highlights_prompt(news_content: str, week_date: str, links_content: str = "") -> tuple:
    """Create prompt to extract highlights from a single week's NEWS"""

    links_section = ""
    if links_content:
        links_section = f"""
## REFERENCE LINKS
Use these links when relevant to add helpful references in your highlights.
Add links naturally in the description using markdown format: [text](url)

{links_content}
"""

    system_prompt = f"""You are a strict curator for Pollinations.AI highlights.

## CONTEXT - What is Pollinations.AI?
Pollinations.AI is a free, open-source AI platform providing:
- **Image Generation** - Create images via simple URLs or API calls
- **Text/Chat API** - Access LLMs like GPT, Claude, Gemini, Llama, Mistral
- **Audio Generation** - Text-to-speech and music generation
- **Discord Bot** - AI features directly in Discord servers
- **Web Apps** - Various AI-powered tools and creative demos

Our users are creators, developers, and hobbyists who love FREE, easy-to-use AI tools.

## WHERE THIS OUTPUT GOES
The highlights you extract will be displayed **DIRECTLY** (copy-pasted as-is) on:
1. **Pollinations.AI website** - News/updates section
2. **GitHub README.md** - Latest news section

**IMPORTANT:** These highlights are REPLACED every week with new ones. Old highlights get pushed down and eventually removed. So each week's highlights should stand on their own and showcase that week's best stuff.

This is a HIGHLIGHT REEL - not a changelog. Only the exciting stuff that makes users go "wow, I want to try this!"

## SELECTION CRITERIA
**Typically 3-4 highlights per week. Sometimes 0. Max ~10 for huge release weeks.**

### INCLUDE (things that TRULY affect users):
- **New AI models** - New LLMs, image models, audio models users can now access
- **Speed/Performance boosts** - Faster generation, reduced latency (only if significant/noticeable)
- **New features** - New capabilities users can try RIGHT NOW
- **New integrations** - Discord bot features, new platform connections, new APIs
- **New endpoints/tools** - New API endpoints, new web apps, new parameters
- **New creative options** - New styles, formats, output options
- **Big announcements** - Partnerships, milestones, major releases

### EXCLUDE (skip ALL of these - users don't care):
- Bug fixes (even critical ones - users don't celebrate fixes)
- Internal performance improvements users won't notice
- Refactors, cleanups, code quality improvements
- CI/CD, workflows, GitHub Actions, deployment changes
- Documentation updates, README changes, tests
- Error handling, logging, monitoring improvements
- Internal/developer-facing changes
- Dependency updates, security patches
- Minor UI tweaks, small polish items
- Any maintenance or housekeeping work

## OUTPUT FORMAT
```
- **YYYY-MM-DD** – **🚀 Feature Name** Punchy description of what users can DO now. [Relevant Link](url) if applicable.
- **YYYY-MM-DD** – **✨ Another Feature** Brief and exciting. Use `backticks` for code. Check the [API Docs](url).
```

Rules:
1. Format: `- **YYYY-MM-DD** – **emoji Title** Description with [links](url) when relevant`
2. Use the DATE provided in the changelog header (the week's end date)
3. Emojis: 🚀 ✨ 🎨 🎵 🤖 🔗 📱 💡 🌟 🎯
4. Focus on USER BENEFIT
5. NO PR numbers, NO authors
6. 1-2 lines max per entry
7. Output ONLY the markdown bullets
8. Add relevant links from REFERENCE LINKS section when they add value (don't force links)
{links_section}
## CRITICAL
- Output exactly `SKIP` if nothing qualifies
- Use your judgment - if something feels exciting and user-facing, include it
- Typical weeks: 3-4 highlights. Slow weeks: 0-2. Big release weeks: up to 10
- Trust your instincts on what users would find exciting"""

    user_prompt = f"""Review this Pollinations.AI changelog and extract ONLY highlights worthy of the website and README.

**DATE FOR THIS CHANGELOG: {week_date}**
Use this date for all highlights from this changelog.

Typical week: 3-4 highlights. Some weeks: 0. Be very selective.

CHANGELOG:
{news_content}

Output markdown bullets only, or SKIP if nothing qualifies."""

    return system_prompt, user_prompt


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, max_retries: int = 3) -> str:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    last_error = None
    for attempt in range(max_retries):
        seed = random.randint(0, 2147483647)

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "seed": seed
        }

        if attempt > 0:
            print(f"Retry {attempt}/{max_retries - 1} with new seed: {seed}")

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload,
                timeout=120
            )

            if response.status_code == 200:
                try:
                    result = response.json()
                    return result['choices'][0]['message']['content']
                except (KeyError, IndexError, json.JSONDecodeError) as e:
                    last_error = f"Error parsing API response: {e}"
                    error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                    print(f"{last_error}")
                    print(f"Response preview: {error_preview}")
            else:
                last_error = f"API error: {response.status_code}"
                error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                print(f"{last_error}")
                print(f"Error preview: {error_preview}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(last_error)

        if attempt < max_retries - 1:
            print("Waiting 5 seconds before retry...")
            time.sleep(5)

    print(f"All {max_retries} attempts failed. Last error: {last_error}")
    return ""


def parse_response(response: str) -> str:
    """Clean up AI response, removing code blocks if present"""
    message = response.strip()

    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)

    return message.strip()


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    file_date = get_env('FILE_DATE')

    owner_name, repo_name = repo_full_name.split('/')

    print(f"=== Generating highlights for {file_date} ===")

    # Fetch the NEWS file for this date
    news_content = get_news_file_content(github_token, owner_name, repo_name, file_date)

    if not news_content:
        print(f"Could not fetch NEWS file for {file_date}")
        # Write SKIP so the artifact exists but is empty
        with open(f"highlights-{file_date}.txt", 'w') as f:
            f.write("SKIP")
        sys.exit(0)

    print(f"Fetched NEWS file, processing...")

    # Fetch links reference file
    print("Fetching LINKS.md for reference links...")
    links_content = get_links_file(github_token, owner_name, repo_name)

    # Generate highlights using AI
    system_prompt, user_prompt = create_highlights_prompt(news_content, file_date, links_content)
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)

    if not ai_response:
        print(f"Failed to get AI response for {file_date}")
        with open(f"highlights-{file_date}.txt", 'w') as f:
            f.write("SKIP")
        sys.exit(0)

    highlights = parse_response(ai_response)

    # Write the highlights to a file (will be uploaded as artifact)
    output_file = f"highlights-{file_date}.txt"

    if highlights.upper().strip() == "SKIP":
        print(f"AI returned SKIP - no highlights for {file_date}")
        with open(output_file, 'w') as f:
            f.write("SKIP")
    elif highlights.strip():
        print(f"Generated highlights for {file_date}:")
        print(highlights)
        with open(output_file, 'w') as f:
            f.write(highlights)
    else:
        print(f"Empty response for {file_date}")
        with open(output_file, 'w') as f:
            f.write("SKIP")

    print("=== Done ===")


if __name__ == "__main__":
    main()
