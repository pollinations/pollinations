# 🎨 Code Style Guide

> Blossom AI coding standards and best practices

---

## 🎯 Overview

This guide defines the coding standards for Blossom AI to ensure:
- ✅ Consistent code style across the project
- ✅ Readability and maintainability
- ✅ Easy collaboration
- ✅ Automated code quality checks

---

## 🐍 Python Style Guide

### Basic Principles

We follow **PEP 8** with some modifications for modern Python development:

- **Line Length**: 100 characters (not 80)
- **Quotes**: Double quotes for strings
- **Imports**: Organized into three groups
- **Type Hints**: Encouraged where beneficial

### Line Length

```python
# Good ✅ - within 100 characters
result = some_function(arg1, arg2, arg3, arg4, arg5)

# Bad ❌ - exceeds 100 characters
result = some_function_with_very_long_name(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8)

# Good ✅ - line continuation
result = some_function(
    arg1, arg2, arg3,
    arg4, arg5, arg6
)
```

### String Quotes

```python
# Good ✅ - Double quotes
message = "Hello, World!"
sql_query = "SELECT * FROM users WHERE id = 1"

# Acceptable ✅ - Single quotes for consistency
char = 'a'
regex = r'\d+'

# Bad ❌ - Mixed quotes
message = 'Hello, World!'  # Inconsistent with project style
```

### Imports Organization

```python
# Good ✅ - Organized imports
# 1. Standard library imports
import os
import sys
from typing import List, Dict, Optional
from datetime import datetime

# 2. Third-party imports
import httpx
from pydantic import BaseModel
from redis import asyncio as aioredis

# 3. Local imports
from blossom_ai.core.config import SessionConfig
from blossom_ai.utils.cache import CacheManager
from blossom_ai.generators.image_generator import ImageGenerator

# Bad ❌ - Unorganized imports
import os
from blossom_ai.core.config import SessionConfig
import sys
import httpx
from blossom_ai.utils.cache import CacheManager
```

---

## 🏗️ Naming Conventions

### Classes

```python
# Good ✅ - PascalCase
class BlossomClient:
    pass

class ImageGenerationRequest:
    pass

class HTTPClientAdapter:
    pass

# Bad ❌ - Wrong case
class blossomClient:
    pass

class image_generation_request:
    pass
```

### Functions and Methods

```python
# Good ✅ - snake_case
def generate_image():
    pass

def process_user_request():
    pass

class MyClass:
    def analyze_image(self):
        pass

# Bad ❌ - Wrong case
def GenerateImage():
    pass

def processUserRequest():
    pass
```

### Variables

```python
# Good ✅ - snake_case
api_key = "secret"
user_name = "john_doe"
image_count = 5

# Constants - UPPER_SNAKE_CASE
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30.0
API_ENDPOINT = "https://api.example.com"

# Bad ❌ - Wrong case
apiKey = "secret"
UserName = "john_doe"
maxRetries = 3
```

### Private Members

```python
class MyClass:
    def __init__(self):
        # Private attribute
        self._internal_state = None
        
        # Very private (name mangling)
        self.__very_private = None
    
    def _internal_method(self):
        """Internal use only."""
        pass
    
    def public_method(self):
        """Public API."""
        pass
```

---

## 📝 Documentation Style

### Docstrings

```python
def process_image(
    image_path: str,
    width: int = 1024,
    height: int = 1024,
    quality: str = "standard"
) -> ImageObject:
    """Process and generate an image from the given parameters.
    
    This function takes an image path and generation parameters,
    then creates a new image using the specified AI model.
    
    Args:
        image_path: Path to the source image file.
        width: Width of the generated image in pixels. Defaults to 1024.
        height: Height of the generated image in pixels. Defaults to 1024.
        quality: Quality setting - "standard" or "hd". Defaults to "standard".
    
    Returns:
        ImageObject containing the generated image and metadata.
    
    Raises:
        ValidationError: If image_path is invalid or parameters are out of range.
        NetworkError: If there's a problem with the API connection.
        RateLimitError: If rate limit is exceeded.
    
    Example:
        >>> image = process_image("photo.jpg", width=1536, height=1024)
        >>> image.save("output.png")
        
    See Also:
        ImageGenerator: The underlying image generation class.
        SessionConfig: Configuration options for image generation.
    """
    pass
```

### Class Docstrings

```python
class ImageGenerator:
    """Generate images using AI models.
    
    This class provides methods to generate images from text prompts
    using various AI models like DALL-E 3 and DALL-E 2.
    
    Attributes:
        config: SessionConfig object containing generation parameters.
        cache: Cache backend for storing generated images.
        logger: Logger instance for tracking operations.
    
    Example:
        >>> generator = ImageGenerator(config)
        >>> image = generator.generate("a beautiful sunset")
        >>> image.save("sunset.png")
    """
    
    def __init__(self, config: SessionConfig):
        """Initialize the image generator.
        
        Args:
            config: Configuration object with API keys and settings.
        """
        self.config = config
```

---

## 🔄 Control Flow

### Conditional Statements

```python
# Good ✅ - Clear and readable
if user_is_authenticated and has_sufficient_credits:
    process_request()
elif user_is_authenticated:
    prompt_for_payment()
else:
    redirect_to_login()

# Bad ❌ - Confusing
if user_is_authenticated:
    if has_sufficient_credits:
        process_request()
    else:
        prompt_for_payment()
else:
    redirect_to_login()
```

### Loops

```python
# Good ✅ - Clear loop variable names
for image_file in image_files:
    if image_file.suffix.lower() in ['.jpg', '.png']:
        process_image(image_file)

# Good ✅ - With enumerate
for index, image_file in enumerate(image_files):
    logger.info(f"Processing image {index + 1}/{len(image_files)}")
    process_image(image_file)

# Bad ❌ - Unclear variable names
for f in files:
    if f.suffix in ['.jpg', '.png']:
        process(f)
```

### List Comprehensions

```python
# Good ✅ - Readable comprehension
valid_images = [
    file for file in image_files
    if file.suffix.lower() in ['.jpg', '.png', '.gif']
    and file.stat().st_size > 0
]

# Good ✅ - With transformation
image_paths = [
    str(file.absolute())
    for file in image_files
    if file.exists()
]

# Bad ❌ - Too complex
result = [x for x in items if x > 0 and x % 2 == 0 and x not in seen]
```

---

## 🎨 Code Formatting

### Function Arguments

```python
# Good ✅ - Aligned arguments
def process_image_with_options(
    image_path: str,
    width: int = 1024,
    height: int = 1024,
    quality: str = "standard",
    style: str = "vivid",
    **kwargs
) -> ImageObject:
    pass

# Good ✅ - Hanging indent
def process_image_with_options(
    image_path: str, width: int = 1024, height: int = 1024,
    quality: str = "standard", style: str = "vivid", **kwargs
) -> ImageObject:
    pass

# Bad ❌ - Misaligned
def process_image_with_options(image_path: str,
                              width: int = 1024,
                              height: int = 1024) -> ImageObject:
    pass
```

### Data Structures

```python
# Good ✅ - Aligned dictionaries
config = {
    "api_key": "secret",
    "base_url": "https://api.example.com",
    "timeout": 30.0,
    "rate_limit_per_minute": 60,
    "cache_enabled": True,
}

# Good ✅ - Lists
image_formats = [
    "jpg",
    "png",
    "gif",
    "webp",
]

# Bad ❌ - Inconsistent
config = {
    "api_key":"secret",
    "base_url" : "https://api.example.com",
    "timeout" :30.0
}
```

### String Formatting

```python
# Good ✅ - f-strings
user_message = f"Hello, {user_name}! You have {credit_count} credits."

# Good ✅ - With formatting
price_display = f"${price:.2f}"

# Acceptable ✅ - .format() for complex cases
message = "User {name} has {count} items".format(name=user_name, count=item_count)

# Bad ❌ - String concatenation
message = "Hello, " + user_name + "! You have " + str(credit_count) + " credits."
```

---

## 🔍 Error Handling

### Exception Handling

```python
# Good ✅ - Specific exceptions
try:
    response = ai.text.generate(prompt)
except ValidationError as e:
    logger.warning(f"Invalid prompt: {e}")
    return error_response("Invalid input")
except RateLimitError as e:
    logger.info(f"Rate limited, waiting {e.retry_after}s")
    time.sleep(e.retry_after)
    return retry_generation(prompt)
except NetworkError as e:
    logger.error(f"Network error: {e}")
    return error_response("Service unavailable")
except Exception as e:
    logger.exception(f"Unexpected error: {e}")
    return error_response("Internal error")

# Bad ❌ - Generic exception
```

### Raising Exceptions

```python
# Good ✅ - Descriptive error messages
class ImageGenerationError(Exception):
    """Raised when image generation fails."""
    pass

def validate_image_size(width: int, height: int):
    if width <= 0 or height <= 0:
        raise ValidationError(
            f"Invalid image dimensions: {width}x{height}. "
            f"Both width and height must be positive integers."
        )
    
    if width > 2048 or height > 2048:
        raise ValidationError(
            f"Image dimensions {width}x{height} exceed maximum allowed size of 2048x2048"
        )
```

---

## 🧪 Testing Style

### Test Structure

```python
import pytest
from unittest.mock import Mock, patch

class TestImageGeneration:
    """Test cases for image generation functionality."""
    
    def test_generate_image_with_valid_prompt(self):
        """Test that valid prompts generate images successfully."""
        # Arrange
        prompt = "a beautiful sunset"
        
        # Act
        image = ai.image.generate(prompt)
        
        # Assert
        assert image is not None
        assert image.width == 1024
        assert image.height == 1024
    
    def test_generate_image_with_invalid_prompt(self):
        """Test that invalid prompts raise ValidationError."""
        # Arrange
        prompt = ""  # Empty prompt
        
        # Act & Assert
        with pytest.raises(ValidationError):
            ai.image.generate(prompt)
    
    @patch('blossom_ai.utils.http_client.httpx.AsyncClient')
    def test_generate_image_with_mock_client(self, mock_client_class):
        """Test image generation with mocked HTTP client."""
        # Arrange
        mock_client = Mock()
        mock_response = Mock()
        mock_response.json.return_value = {"image_url": "https://example.com/image.png"}
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client
        
        # Act
        image = ai.image.generate("test prompt")
        
        # Assert
        assert image is not None
        mock_client.post.assert_called_once()
```

### Test Naming

```python
# Good ✅ - Descriptive test names
def test_user_authentication_with_valid_credentials():
    pass

def test_user_authentication_fails_with_invalid_password():
    pass

def test_rate_limiting_blocks_requests_after_limit_reached():
    pass

# Bad ❌ - Vague names
def test_auth():
    pass

def test_login():
    pass
```

---

## 🎭 Type Hints

### Function Signatures

```python
from typing import List, Dict, Optional, Union, Any
from pathlib import Path

# Good ✅ - Comprehensive type hints
def process_images(
    image_paths: List[Path],
    config: SessionConfig,
    callback: Optional[Callable[[ImageObject], None]] = None
) -> Dict[str, Union[int, List[str]]]:
    """Process multiple images with configuration and optional callback."""
    pass

# Good ✅ - Generic types
T = TypeVar('T')

def get_or_create(
    key: str,
    factory: Callable[[], T],
    cache: CacheBackendProtocol
) -> T:
    """Get from cache or create using factory."""
    pass

# Bad ❌ - Missing type hints
def process_images(image_paths, config, callback=None):
    pass
```

### Variable Type Hints

```python
# Good ✅ - Clear variable types
images: List[ImageObject] = []
user_ids: Set[int] = set()
config_dict: Dict[str, Any] = {}
cache_ttl: int = 3600

# Good ✅ - Optional values
api_key: Optional[str] = os.getenv("API_KEY")
result: Union[str, None] = None

# Bad ❌ - Unclear types
images = []  # What type of objects?
user_ids = set()  # What type of IDs?
```

---

## 🚀 Performance Considerations

### Efficient Code Patterns

```python
# Good ✅ - Use generators for large datasets
def process_large_dataset(file_paths):
    for file_path in file_paths:
        if is_valid_image(file_path):
            yield process_image(file_path)

# Good ✅ - Comprehensions for simple transformations
valid_images = [
    file for file in image_files
    if file.suffix.lower() in ['.jpg', '.png']
]

# Good ✅ - Context managers for resources
with open("config.json", "r") as f:
    config = json.load(f)

# Bad ❌ - Loading everything into memory
all_images = []
for file_path in file_paths:
    all_images.append(load_image(file_path))
# Memory intensive for large datasets
```

### Caching

```python
from functools import lru_cache

# Good ✅ - Cache expensive operations
@lru_cache(maxsize=128)
def validate_api_key(api_key: str) -> bool:
    """Validate API key (expensive operation)."""
    # API call or database query
    return True

# Good ✅ - Instance-level caching
class ImageProcessor:
    def __init__(self):
        self._cache = {}
    
    def get_cached_result(self, key: str):
        return self._cache.get(key)
    
    def set_cached_result(self, key: str, value):
        self._cache[key] = value
```

---

## 🔧 Code Quality Tools

### Configuration Files

#### .black.toml
```toml
[tool.black]
line-length = 100
target-version = ['py311']
include = '\.pyi?$'
extend-exclude = '''
/(
  # directories
  \.eggs
  | \.git
  | \.hg
  | \.mypy_cache
  | \.tox
  | \.venv
  | _build
  | buck-out
  | build
  | dist
)/
'''
```

#### .ruff.toml
```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = [
    "E",  # pycodestyle errors
    "W",  # pycodestyle warnings
    "F",  # pyflakes
    "I",  # isort
    "B",  # flake8-bugbear
    "C4", # flake8-comprehensions
    "UP", # pyupgrade
]
ignore = [
    "E501",  # line too long, handled by black
    "B008",  # do not perform function calls in argument defaults
]

[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]
"tests/*.py" = ["B018"]
```

#### mypy.ini
```ini
[mypy]
python_version = 3.11
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = True
disallow_incomplete_defs = True
check_untyped_defs = True
disallow_untyped_decorators = True
no_implicit_optional = True
warn_redundant_casts = True
warn_unused_ignores = True
warn_no_return = True
warn_unreachable = True
strict_equality = True

[mypy-tests.*]
disallow_untyped_defs = False
```

---

## 🎓 Best Practices Summary

### Do's ✅

1. **Use consistent naming** (snake_case for functions/variables, PascalCase for classes)
2. **Write docstrings** for all public functions and classes
3. **Use type hints** where beneficial
4. **Handle specific exceptions** instead of generic ones
5. **Keep functions small** and focused on a single responsibility
6. **Use meaningful variable names** that describe the data
7. **Add comments** for complex logic (but prefer self-documenting code)
8. **Format code consistently** using Black
9. **Write tests** for all new functionality
10. **Review code** before committing

### Don'ts ❌

1. **Don't use magic numbers** - use named constants
2. **Don't repeat yourself** - follow DRY principle
3. **Don't ignore exceptions** - handle them properly
4. **Don't use global variables** - prefer dependency injection
5. **Don't write long functions** - break them into smaller ones
6. **Don't use unclear abbreviations** - prefer full names
7. **Don't commit debugging code** - remove print statements and breakpoints
8. **Don't skip tests** - even for small changes
9. **Don't ignore performance** - consider algorithmic complexity
10. **Don't forget security** - sanitize inputs and handle sensitive data properly

---

## 📊 Code Quality Metrics

### Automated Checks

```bash
# Run all quality checks
make quality-check

# Or individually
black --check .
ruff check .
mypy blossom_ai/
bandit -r blossom_ai/
pytest --cov=blossom_ai --cov-report=html
```

### Quality Gates

- **Black Formatting**: 100% compliance required
- **Ruff Linting**: Zero warnings
- **MyPy Type Checking**: Zero errors
- **Test Coverage**: Minimum 90%
- **Security Scan**: Zero high-severity issues

---

## 🚀 Continuous Integration

### GitHub Actions Workflow

```yaml
name: Code Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.11", "3.12"]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install black ruff mypy pytest pytest-cov bandit
    
    - name: Check code formatting with Black
      run: black --check --diff .
    
    - name: Lint with Ruff
      run: ruff check .
    
    - name: Type check with MyPy
      run: mypy blossom_ai/
    
    - name: Security check with Bandit
      run: bandit -r blossom_ai/ -f json -o bandit-report.json
    
    - name: Test with pytest
      run: pytest --cov=blossom_ai --cov-report=xml
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

---

## 📚 Related Documentation

- [📝 Contributing Guide](CONTRIBUTING.md)
- [🧪 Testing Guide](TESTING.md)
- [🔒 Security Guide](../../SECURITY.md)
- [🚀 Deployment Guide](DEPLOYMENT.md)
- [⚙️ Configuration Guide](CONFIGURATION.md)

---

## 🎉 Conclusion

Following these style guidelines ensures that Blossom AI remains:
- **Consistent** across all contributors
- **Readable** and easy to understand
- **Maintainable** for long-term development
- **Professional** in quality and appearance

Remember: Code is read far more often than it's written. Write code for your future self and other developers!
