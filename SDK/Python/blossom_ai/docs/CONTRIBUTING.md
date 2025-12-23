# 🤝 Contributing to Blossom AI

> Guidelines for contributing to the Blossom AI project

---

## 🌸 Welcome Contributors!

Thank you for your interest in contributing to Blossom AI! This document provides guidelines and instructions for contributing to the project.

### Ways to Contribute

- 🐛 **Report Bugs**: Create detailed bug reports
- 💡 **Suggest Features**: Propose new functionality
- 📝 **Improve Documentation**: Fix docs and add examples
- 🎨 **Code Contributions**: Submit pull requests
- 🧪 **Testing**: Help improve test coverage
- 📊 **Performance**: Optimize and benchmark

---

## 📋 Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive Behavior:**
- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

**Unacceptable Behavior:**
- The use of sexualized language or imagery
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

---

## 🚀 Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/your-username/blossom-ai.git
cd blossom-ai

# Add upstream remote
git remote add upstream https://github.com/PrimeevolutionZ/blossom-ai.git
```

### 2. Set Up Development Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install in development mode
pip install -e ".[dev]"

# Install pre-commit hooks
pre-commit install
```

### 3. Verify Setup

```bash
# Run tests
pytest

# Run linting
ruff check .

# Run type checking
mypy blossom_ai

# Run formatting check
black --check .
```

---

## 🏗️ Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write clean, readable code
- Follow coding standards (see below)
- Add tests for new functionality
- Update documentation as needed

### 3. Test Changes

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_client.py

# Run with coverage
pytest --cov=blossom_ai

# Run specific marker
pytest -m "not slow"
```

### 4. Commit Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add new image generation parameter"

# Push to your fork
git push origin feature/your-feature-name
```

### 5. Create Pull Request

- Go to your fork on GitHub
- Click "New Pull Request"
- Fill out the template
- Link related issues

---

## 🎨 Coding Standards

### Python Style Guide

We follow PEP 8 with some modifications:

- **Line Length**: 100 characters
- **Quotes**: Double quotes for strings
- **Imports**: Group into stdlib, third-party, local
- **Type Hints**: Use where beneficial

**Example:**

```python
"""Example module showing coding standards."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

import httpx
from pydantic import BaseModel

from blossom_ai.core.config import SessionConfig
from blossom_ai.core.interfaces import HttpClientProtocol


class ExampleClass:
    """Example class with proper documentation."""
    
    def __init__(self, config: SessionConfig) -> None:
        """Initialize with configuration.
        
        Args:
            config: Session configuration object.
        """
        self.config = config
        self._client: Optional[httpx.AsyncClient] = None
    
    async def example_method(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        """Process a prompt and return result.
        
        Args:
            prompt: Input text to process.
            **kwargs: Additional parameters.
        
        Returns:
            Dictionary containing processed result.
        
        Raises:
            ValueError: If prompt is invalid.
        """
        if not prompt.strip():
            raise ValueError("Prompt cannot be empty")
        
        # Implementation here
        return {"result": f"Processed: {prompt}"}
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `BlossomClient`)
- **Functions/Methods**: snake_case (e.g., `generate_image`)
- **Variables**: snake_case (e.g., `api_key`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Private**: Leading underscore (e.g., `_internal_method`)

### Documentation Standards

All public classes and methods must have docstrings:

```python
def example_function(param1: str, param2: int = 0) -> bool:
    """Brief description of the function.
    
    Longer description if needed. Can span multiple lines
    and provide additional context.
    
    Args:
        param1: Description of the first parameter.
        param2: Description of the second parameter with default.
    
    Returns:
        Description of the return value.
    
    Raises:
        ValueError: When param1 is invalid.
        NetworkError: When network request fails.
    
    Example:
        >>> result = example_function("test", 42)
        >>> print(result)
        True
    """
```

---

## 🧪 Testing Guidelines

### Test Structure

```python
import pytest
from unittest.mock import Mock, AsyncMock
from blossom_ai import BlossomClient


class TestBlossomClient:
    """Test cases for BlossomClient."""
    
    def test_initialization(self):
        """Test client initialization."""
        client = BlossomClient()
        assert client is not None
    
    @pytest.mark.asyncio
    async def test_async_generation(self):
        """Test async text generation."""
        async with BlossomClient() as client:
            response = await client.text.generate("test")
            assert response.text is not None
    
    @pytest.mark.parametrize("prompt,expected_type", [
        ("short text", str),
        ("generate number", str),
        ("explain AI", str),
    ])
    def test_various_prompts(self, prompt, expected_type):
        """Test different prompt types."""
        with BlossomClient() as client:
            response = client.text.generate(prompt)
            assert isinstance(response.text, expected_type)
```

### Test Markers

Use pytest markers to categorize tests:

```python
@pytest.mark.unit          # Fast unit tests
@pytest.mark.integration   # Integration tests
@pytest.mark.slow           # Slow tests
@pytest.mark.api            # Tests that hit real APIs
@pytest.mark.e2e            # End-to-end tests
```

Run specific test categories:
```bash
pytest -m "unit"           # Run only unit tests
pytest -m "not slow"       # Run fast tests
pytest -m "api" --tb=short # Run API tests
```

### Mocking

```python
from unittest.mock import Mock, AsyncMock, patch
from blossom_ai import BlossomClient


@patch('blossom_ai.utils.http_client.httpx.AsyncClient')
def test_with_mock_http(mock_client_class):
    """Test with mocked HTTP client."""
    
    # Setup mock
    mock_client = Mock()
    mock_response = Mock()
    mock_response.json.return_value = {"text": "mocked response"}
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client_class.return_value = mock_client
    
    # Test
    with BlossomClient() as client:
        response = client.text.generate("test")
        assert response.text == "mocked response"
```

---

## 📝 Commit Message Guidelines

### Format

```
<type>: <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no logic change)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build process or auxiliary tool changes
- **ci**: CI/CD changes

### Examples

```
feat: add image generation batch processing

- Add batch_generate method to ImageGenerator
- Support concurrent image generation
- Add progress tracking
- Update tests and documentation

Closes #123
```

```
fix: resolve rate limiting issue in async mode

- Fix semaphore usage in async requests
- Add proper backoff strategy
- Add tests for concurrent rate limiting

Fixes #456
```

```
docs: update installation guide for Windows

- Add Windows-specific instructions
- Update troubleshooting section
- Add screenshots
```

---

## 🔄 Pull Request Process

### 1. Before Submitting

- [ ] Code follows style guidelines
- [ ] All tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated
- [ ] Changelog updated (if applicable)

### 2. PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
Describe testing performed.

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
```

### 3. Review Process

1. **Automated Checks**: CI/CD runs tests and linting
2. **Code Review**: Maintainers review the code
3. **Feedback**: Address review comments
4. **Merge**: Approved PRs are merged

### 4. After Merge

- Your contribution is included in the next release
- You'll be added to the contributors list
- Release notes will credit your contribution

---

## 🎓 Development Tips

### Useful Commands

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=blossom_ai --cov-report=html

# Run linting
ruff check .

# Auto-fix linting issues
ruff check . --fix

# Format code
black .

# Type checking
mypy blossom_ai

# Security scan
bandit -r blossom_ai

# Dependency check
safety check
```

### Debugging

```python
import logging

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)

# Use structured logger
from blossom_ai.utils.logging import StructuredLogger

logger = StructuredLogger("my_test")
logger.debug("Debug message", extra_data="value")
```

### IDE Setup

**VS Code:**
```json
{
    "python.linting.enabled": true,
    "python.linting.ruffEnabled": true,
    "python.formatting.provider": "black",
    "python.formatting.blackArgs": ["--line-length", "100"],
    "python.testing.pytestEnabled": true,
    "python.testing.unittestEnabled": false,
    "python.testing.nosetestsEnabled": false
}
```

**PyCharm:**
- Set Black as external formatter
- Enable Ruff plugin
- Configure pytest as test runner

---

## 📚 Resources

### Documentation

- [📖 API Reference](API_REFERENCE.md)
- [🎓 Tutorial](TUTORIAL.md)
- [🏗️ Architecture](ARCHITECTURE.md)
- [🎨 Code Style](CODE_STYLE.md)
- [🧪 Testing Guide](TESTING.md)

### Community

- 💬 [GitHub Discussions](https://github.com/PrimeevolutionZ/blossom-ai/discussions)
- 🐛 [Issue Tracker](https://github.com/PrimeevolutionZ/blossom-ai/issues)
- 📧 Email: develop@eclips-team.ru

### Learning Resources

- [Python Type Hints](https://mypy.readthedocs.io/)
- [Async/Await](https://docs.python.org/3/library/asyncio.html)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Protocol Types](https://peps.python.org/pep-0544/)

---

## 🏆 Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- GitHub contributors page
- Special mentions for significant contributions

Thank you for contributing to Blossom AI! Your efforts help make AI accessible to everyone. 🌸
