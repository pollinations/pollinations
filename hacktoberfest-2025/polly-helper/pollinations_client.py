"""Pollinations API client for enhancing issue descriptions."""

import aiohttp
import json
from config import POLLINATIONS_API_BASE, POLLINATIONS_API_KEY, ISSUE_ENHANCE_PROMPT


class PollinationsClient:
    """Client for interacting with enter.pollinations.ai API."""

    def __init__(self):
        self.base_url = POLLINATIONS_API_BASE
        self.api_key = POLLINATIONS_API_KEY

    async def enhance_issue(self, issue_text: str) -> dict | None:
        """
        Use AI to parse and enhance an issue description.
        
        Args:
            issue_text: Raw issue description from Discord
            
        Returns:
            Dict with 'title' and 'description', or None on error
        """
        messages = [
            {"role": "system", "content": ISSUE_ENHANCE_PROMPT},
            {"role": "user", "content": issue_text}
        ]

        headers = {"Content-Type": "application/json"}
        payload = {
            "model": "openai",
            "messages": messages
        }

        url = f"{self.base_url}/api/generate/v1/chat/completions"
        
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=60) as response:
                    if response.status == 200:
                        data = await response.json()
                        content = data["choices"][0]["message"]["content"]
                        
                        # Parse the JSON response
                        try:
                            # Clean up the response (remove markdown code blocks if present)
                            content = content.strip()
                            if content.startswith("```"):
                                content = content.split("```")[1]
                                if content.startswith("json"):
                                    content = content[4:]
                            content = content.strip()
                            
                            result = json.loads(content)
                            if "title" in result and "description" in result:
                                return result
                        except json.JSONDecodeError:
                            # If JSON parsing fails, create a basic structure
                            return {
                                "title": issue_text[:80],
                                "description": issue_text
                            }
                    else:
                        print(f"API error: {response.status}")
                        return None
                        
        except Exception as e:
            print(f"Error enhancing issue: {e}")
            return None


# Singleton instance
pollinations_client = PollinationsClient()