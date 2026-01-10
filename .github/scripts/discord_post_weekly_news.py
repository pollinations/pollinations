import os
import sys
import json
import time
import random
import re
import requests
from datetime import datetime, timedelta, timezone

POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
MODEL = "gemini-large"
NEWS_FOLDER = "social/news"


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_latest_news_file() -> tuple[str, str]:
    """Find and read the latest news file from social/news/ folder based on today's date and regex.

    Returns: (date, content) tuple
    """
    if not os.path.exists(NEWS_FOLDER):
        print(f"Error: {NEWS_FOLDER}/ folder not found")
        return None, None

    # Get all files in NEWS folder
    all_files = os.listdir(NEWS_FOLDER)

    # Date pattern: YYYY-MM-DD.md
    date_pattern = re.compile(r'^(\d{4}-\d{2}-\d{2})\.md$')

    today = datetime.now(timezone.utc).date()

    # Find files matching the date pattern and parse dates
    dated_files = []
    for f in all_files:
        match = date_pattern.match(f)
        if match:
            try:
                file_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                dated_files.append((file_date, f))
            except ValueError:
                continue

    if not dated_files:
        print(f"No dated news files found in {NEWS_FOLDER}/")
        return None, None

    # Sort by date descending
    dated_files.sort(key=lambda x: x[0], reverse=True)

    # First, try to find today's file
    selected_file = None
    for file_date, filename in dated_files:
        if file_date == today:
            print(f"Found today's NEWS file: {filename}")
            selected_file = (file_date, filename)
            break

    # If no file for today, get the most recent one
    if not selected_file:
        file_date, filename = dated_files[0]
        print(f"No NEWS file for today ({today}), using most recent: {filename} ({file_date})")
        selected_file = (file_date, filename)

    entry_date = selected_file[0].strftime('%Y-%m-%d')
    latest_file = selected_file[1]

    # Read the file content
    file_path = os.path.join(NEWS_FOLDER, latest_file)
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove the header line "# Weekly Update - YYYY-MM-DD" to get just the entries
    lines = content.split('\n')
    if lines and lines[0].startswith('# Weekly Update'):
        content = '\n'.join(lines[1:]).strip()

    return entry_date, content


def create_discord_prompt(news_entry: str, entry_date: str) -> tuple:
    """Create prompt to transform NEWS.md entry for Discord"""

    # Try to parse date, fallback to current date if format doesn't match
    try:
        # Extract just the YYYY-MM-DD part if there's extra stuff
        date_part = entry_date[:10] if len(entry_date) >= 10 else entry_date
        end_date = datetime.strptime(date_part, "%Y-%m-%d")
    except ValueError:
        end_date = datetime.now(timezone.utc)

    start_date = end_date - timedelta(days=7)

    MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    date_str = f"From {start_date.day} {MONTH[start_date.month - 1]} {start_date.year} to {end_date.day} {MONTH[end_date.month - 1]} {end_date.year}"

    system_prompt = f"""You are creating a weekly digest for the Pollinations AI Discord community.
    Transform the provided NEWS.md entry into an engaging Discord message.

    CONTEXT: Pollinations is an open-source AI platform. Your audience is USERS who care about what they can DO now.

    OUTPUT FORMAT:
    ```
    [Greet <@&1424461167883194418> naturally and casually in a playful, witty way. short]

    ## 🌸 Weekly Update - {date_str}
    (do not change anything from the mentioned date_str, strictly use it as is)

    [Create sections that make sense - you have COMPLETE FREEDOM]
    [MAKE SURE THAT WE PUT ALL THE INFO IN SOMEWHERE AROUND 200-400 WORDS TOTAL]
    [Examples: "🎮 Discord Bot", "🚀 New Models", "⚡ Performance", "🔄 API Changes", "✨ Feature Drops", etc.]

    ### [Section with emoji]
    - Major change with clear user benefit
    - Another significant addition
    - Focus on what users can now do

    ### [Another section if needed]
    - More impactful changes
    - Keep it user-focused and exciting

    [Add as many sections as needed - organize however makes most sense!]
    ```

    CRITICAL RULES:
    - Greet <@&1424461167883194418> naturally - be witty and creative!
    - Write for USERS - focus on impact and excitement, not technical details
    - Only include MAJOR changes that matter to users
    - NO PR numbers, NO author names, NO technical jargon
    - Skip all bug fixes, error handling, and maintenance work
    - Skip styling and UI cosmetics completely
    - If no major impactful changes found, return only: SKIP
    - Be witty, fun, and celebratory about real wins
    - Do not add unnecessary length to the output
    - Keep it as concise and brief as possible while still covering whats needed
    - Focus mainly on changes that impact the user's who use services powered by pollinations rather than developers who use pollinations.
    - Give the final output as whole that isn't overloaded with technical info nor full of clutter but appealing to users while being fairly simple!

    TONE: Conversational, witty, celebratory. Highlight the cool stuff.
    LENGTH: Keep it punchy but complete"""

    user_prompt = f"""Transform this NEWS.md entry into an engaging Discord message:

{news_entry}

Create a polished, witty weekly digest that celebrates these wins and makes them exciting for users. Group logically and present the real impact."""

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
            "temperature": 0.7,
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
    sys.exit(1)


def parse_message(response: str) -> str:
    message = response.strip()

    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)

    return message.strip()


def chunk_message(message: str, max_length: int = 1900) -> list:
    if len(message) <= max_length:
        return [message]

    chunks = []
    remaining = message

    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break

        chunk = remaining[:max_length]
        split_point = max_length

        last_para = chunk.rfind('\n\n')
        if last_para > max_length * 0.5:
            split_point = last_para + 2
        else:
            last_line = chunk.rfind('\n')
            if last_line > max_length * 0.5:
                split_point = last_line + 1
            else:
                last_space = chunk.rfind(' ')
                if last_space > max_length * 0.5:
                    split_point = last_space + 1

        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()

    return chunks


def post_to_discord(webhook_url: str, message: str):
    chunks = chunk_message(message)

    print(f"Message length: {len(message)} chars")
    print(f"Split into {len(chunks)} chunk(s)")

    for i, chunk in enumerate(chunks):
        if i > 0:
            time.sleep(0.5)

        # Safety check - Discord limit is 2000, we use 1900 for safety
        if len(chunk) > 2000:
            print(f"Warning: Chunk {i+1} exceeds 2000 chars ({len(chunk)}), truncating...")
            chunk = chunk[:1997] + "..."

        print(f"Posting chunk {i+1}/{len(chunks)} ({len(chunk)} chars)")

        payload = {"content": chunk}
        response = requests.post(webhook_url, json=payload)

        if response.status_code not in [200, 204]:
            print(f"Discord error: {response.status_code}")
            # Truncate error output to avoid exposing sensitive info in CI logs
            error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
            print(f"Error preview: {error_preview}")
            sys.exit(1)

    print("✅ Digest posted to Discord!")


def main():
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    discord_webhook = os.getenv('DISCORD_WEBHOOK_DIGEST') or get_env('DISCORD_WEBHOOK_URL')

    # Get the latest news file from social/news/ folder
    entry_date, latest_entry = get_latest_news_file()

    if not latest_entry:
        print("No news entries found. Skipping Discord post.")
        return

    print(f"Found latest entry from {entry_date}")
    print(f"Entry preview: {latest_entry[:200]}...")

    # Transform for Discord
    print("Transforming entry for Discord...")
    system_prompt, user_prompt = create_discord_prompt(latest_entry, entry_date)
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
    discord_message = parse_message(ai_response)

    if discord_message.upper().startswith('SKIP'):
        print("AI returned SKIP — no functional updates for Discord.")
        return

    # Post to Discord
    post_to_discord(discord_webhook, discord_message)


if __name__ == "__main__":
    main()
