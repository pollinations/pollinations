import os
import sys
import json
import time
import random
import re
import requests
from datetime import datetime, timedelta, timezone
from common import load_prompt, get_env, call_pollinations_api, generate_image, MODEL

NEWS_FOLDER = "social/news"

# Platform name for prompt loading
PLATFORM = "discord"


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
    """Create prompt to transform NEWS.md entry for Discord
    
    Prompts are loaded from social/prompts/discord/
    """

    # Try to parse date, fallback to current date if format doesn't match
    try:
        date_part = entry_date[:10] if len(entry_date) >= 10 else entry_date
        end_date = datetime.strptime(date_part, "%Y-%m-%d")
    except ValueError:
        end_date = datetime.now(timezone.utc)

    start_date = end_date - timedelta(days=7)

    MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    date_str = f"From {start_date.day} {MONTH[start_date.month - 1]} {start_date.year} to {end_date.day} {MONTH[end_date.month - 1]} {end_date.year}"

    # Load system prompt and inject date_str
    system_prompt_template = load_prompt(PLATFORM, "weekly_news_system")
    system_prompt = system_prompt_template.replace("{date_str}", date_str)

    # Load user prompt and inject news_entry
    user_prompt_template = load_prompt(PLATFORM, "weekly_news_user")
    user_prompt = user_prompt_template.replace("{news_entry}", news_entry)

    return system_prompt, user_prompt


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
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token, exit_on_failure=True)
    discord_message = parse_message(ai_response)

    if discord_message.upper().startswith('SKIP'):
        print("AI returned SKIP — no functional updates for Discord.")
        return

    # Generate image
    print("Generating image...")
    image_prompt_system = load_prompt(PLATFORM, "image_prompt_system")
    image_prompt = call_pollinations_api(image_prompt_system, discord_message, pollinations_token, temperature=0.7)
    image_bytes = None
    if image_prompt:
        image_prompt = image_prompt.strip()
        print(f"Image prompt: {image_prompt[:100]}...")
        image_bytes, _ = generate_image(image_prompt, pollinations_token)

    # Post to Discord
    post_to_discord(discord_webhook, discord_message)

    # Post image as follow-up file upload
    if image_bytes:
        time.sleep(0.5)
        files = {"file": ("image.jpg", image_bytes, "image/jpeg")}
        response = requests.post(discord_webhook, files=files)
        if response.status_code in [200, 204]:
            print("📷 Image posted to Discord!")
        else:
            print(f"Warning: Failed to post image: {response.status_code}")


if __name__ == "__main__":
    main()
