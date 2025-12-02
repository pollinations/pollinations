"""Pollinations API client for the helper bot using enter.pollinations.ai."""

import aiohttp
import base64
from config import POLLINATIONS_API_BASE, POLLINATIONS_API_KEY, GITHUB_TOKEN, SYSTEM_PROMPT

# Configuration constants
CODE_CONTEXT_MAX_CHARS = 3000  # Maximum characters of code context to include
CODE_SEARCH_MAX_RESULTS = 5   # Maximum number of code search results
CODE_KEYWORDS = ["code", "example", "how to", "implement", "function", "class", "source", "file"]


class GitHubClient:
    """Client for fetching code from GitHub repository."""
    
    def __init__(self, token: str = None):
        self.token = token
        self.base_url = "https://api.github.com"
        self.repo = "pollinations/pollinations"
    
    async def get_file_content(self, path: str) -> str:
        """
        Fetch file content from the pollinations/pollinations repository.
        
        Args:
            path: File path relative to repository root (e.g., "APIDOCS.md")
            
        Returns:
            File content as string, or error message
        """
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Polly-Helper-Bot"
        }
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        
        url = f"{self.base_url}/repos/{self.repo}/contents/{path}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("encoding") == "base64":
                            content = base64.b64decode(data["content"]).decode("utf-8")
                            return content
                        return data.get("content", "")
                    elif response.status == 404:
                        return f"File not found: {path}"
                    else:
                        return f"Error fetching file: {response.status}"
        except Exception as e:
            return f"Error: {str(e)}"
    
    async def search_code(self, query: str) -> list:
        """
        Search for code in the pollinations/pollinations repository.
        
        Args:
            query: Search query
            
        Returns:
            List of matching file paths and snippets
        """
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Polly-Helper-Bot"
        }
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        
        url = f"{self.base_url}/search/code?q={query}+repo:{self.repo}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = []
                        for item in data.get("items", [])[:CODE_SEARCH_MAX_RESULTS]:
                            results.append({
                                "path": item.get("path"),
                                "url": item.get("html_url")
                            })
                        return results
                    else:
                        return []
        except Exception:
            return []


class PollinationsClient:
    """Client for interacting with enter.pollinations.ai API."""

    def __init__(self):
        self.base_url = POLLINATIONS_API_BASE
        self.api_key = POLLINATIONS_API_KEY
        self.github = GitHubClient(GITHUB_TOKEN)

    async def get_ai_response(self, user_message: str, conversation_history: list = None) -> str:
        """
        Get an AI response using enter.pollinations.ai with Claude model.
        
        Args:
            user_message: The user's question or issue
            conversation_history: Optional list of previous messages for context
            
        Returns:
            AI-generated response string
        """
        # Check if user is asking about code - fetch relevant context
        code_context = ""
        if any(keyword in user_message.lower() for keyword in CODE_KEYWORDS):
            # Try to fetch relevant documentation
            apidocs = await self.github.get_file_content("APIDOCS.md")
            if not apidocs.startswith("Error") and not apidocs.startswith("File not found"):
                # Truncate to avoid token limits
                code_context = f"\n\n## Relevant Code from Repository:\n{apidocs[:CODE_CONTEXT_MAX_CHARS]}..."
        
        system_content = SYSTEM_PROMPT + code_context
        messages = [{"role": "system", "content": system_content}]
        
        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history)
        
        messages.append({"role": "user", "content": user_message})

        headers = {"Content-Type": "application/json"}

        payload = {
            "model": "claude",
            "messages": messages
        }

        # enter.pollinations.ai OpenAI-compatible endpoint
        url = f"{self.base_url}/api/generate/v1/chat/completions"
        
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=60) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data["choices"][0]["message"]["content"]
                    else:
                        error_text = await response.text()
                        return f"I'm having trouble connecting to the API right now. Error: {response.status} - {error_text[:200]}"
                        
        except aiohttp.ClientTimeout:
            return "The API request timed out. This might indicate a server-side issue. Please try again in a moment."
        except Exception as e:
            return f"An error occurred while processing your request: {str(e)}"

    async def fetch_code(self, file_path: str) -> str:
        """
        Fetch code from the pollinations/pollinations repository.
        
        Args:
            file_path: Path to file in repository
            
        Returns:
            File content or error message
        """
        return await self.github.get_file_content(file_path)

    async def check_api_health(self) -> dict:
        """
        Check the health of enter.pollinations.ai API.
        
        Returns:
            Dict with status information
        """
        results = {
            "api_reachable": False,
            "image_models": False,
            "text_models": False
        }

        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with aiohttp.ClientSession() as session:
            # Check image models endpoint
            try:
                async with session.get(f"{self.base_url}/api/generate/image/models", headers=headers, timeout=10) as response:
                    results["image_models"] = response.status == 200
                    if response.status == 200:
                        results["api_reachable"] = True
            except:
                pass

            # Check text models endpoint
            try:
                async with session.get(f"{self.base_url}/api/generate/v1/models", headers=headers, timeout=10) as response:
                    results["text_models"] = response.status == 200
                    if response.status == 200:
                        results["api_reachable"] = True
            except:
                pass

        return results


# Singleton instance
pollinations_client = PollinationsClient()