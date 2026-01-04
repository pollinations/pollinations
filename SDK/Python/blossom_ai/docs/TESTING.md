# 🧪 Testing Guide

> Comprehensive testing strategies for Blossom AI applications

---

## 🎯 Overview

This guide covers testing strategies for Blossom AI:
- **Unit testing** individual components
- **Integration testing** with external services
- **End-to-end testing** complete workflows
- **Performance testing** and benchmarking
- **Security testing** for vulnerabilities

---

## 🚀 Getting Started

### Test Structure

```
project/
├── blossom_ai/
│   ├── __init__.py
│   ├── client.py
│   └── ...
├── tests/
│   ├── __init__.py
│   ├── unit/
│   │   ├── test_client.py
│   │   ├── test_generators.py
│   │   └── test_utils.py
│   ├── integration/
│   │   ├── test_api_integration.py
│   │   └── test_cache_integration.py
│   ├── fixtures/
│   │   ├── sample_images.py
│   │   └── mock_responses.py
│   └── conftest.py
├── pytest.ini
└── requirements-test.txt
```

### Installing Test Dependencies

```bash
# Install test dependencies
pip install -e ".[dev]"

# Or install individually
pip install pytest pytest-asyncio pytest-cov pytest-mock
pip install pytest-xdist pytest-html
pip install coverage bandit mypy
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=blossom_ai --cov-report=html

# Run specific test file
pytest tests/unit/test_client.py

# Run with parallel execution
pytest -n auto

# Run with verbose output
pytest -v

# Run only failed tests
pytest --lf

# Run with specific marker
pytest -m "not slow"
```

---

## 🧪 Unit Testing

### Basic Unit Test

```python
import pytest
from unittest.mock import Mock, patch
from blossom_ai import BlossomClient, SessionConfig

class TestBlossomClient:
    """Test cases for BlossomClient."""
    
    def test_client_initialization(self):
        """Test client initialization with config."""
        config = SessionConfig(api_key="test-key")
        client = BlossomClient(config=config)
        
        assert client.config == config
        assert client.config.api_key == "test-key"
    
    def test_client_context_manager(self):
        """Test client as context manager."""
        config = SessionConfig(api_key="test-key")
        
        with BlossomClient(config=config) as client:
            assert client.config == config
        
        # Verify cleanup happened
        assert client._closed is True
    
    @patch('blossom_ai.utils.http_client.httpx.AsyncClient')
    def test_text_generation(self, mock_client_class):
        """Test text generation with mocked HTTP client."""
        # Arrange
        mock_client = Mock()
        mock_response = Mock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Generated text"}}],
            "usage": {"total_tokens": 50}
        }
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client
        
        config = SessionConfig(api_key="test-key")
        
        # Act
        with BlossomClient(config=config) as client:
            response = client.text.generate("test prompt")
        
        # Assert
        assert response.text == "Generated text"
        assert response.total_tokens == 50
        mock_client.post.assert_called_once()
```

### Parameterized Tests

```python
import pytest
from blossom_ai import ValidationError

@pytest.mark.parametrize("prompt,expected_error", [
    ("", "Prompt cannot be empty"),
    ("a" * 2000, "Prompt too long"),
    ("<script>alert('xss')</script>", "Invalid characters"),
    ("valid prompt", None),
])
def test_prompt_validation(prompt, expected_error):
    """Test prompt validation with various inputs."""
    from blossom_ai.utils.security import PromptValidator
    
    validator = PromptValidator(max_length=1000)
    
    if expected_error:
        with pytest.raises(ValidationError, match=expected_error):
            validator.validate(prompt)
    else:
        result = validator.validate(prompt)
        assert result == prompt
```

### Async Testing

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_async_text_generation():
    """Test async text generation."""
    
    with patch('blossom_ai.utils.http_client.httpx.AsyncClient') as mock_client:
        # Setup mock
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "choices": [{"message": {"content": "Async generated text"}}],
            "usage": {"total_tokens": 30}
        })
        
        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        
        config = SessionConfig(api_key="test-key")
        
        async with BlossomClient(config=config) as client:
            response = await client.text.generate("test prompt")
        
        assert response.text == "Async generated text"
        assert response.total_tokens == 30
```

---

## 🔗 Integration Testing

### Testing with Real API

```python
import pytest
import os
from blossom_ai import ai

@pytest.mark.integration
@pytest.mark.api
@pytest.skipif(
    not os.getenv("BLOSSOM_API_KEY"),
    reason="BLOSSOM_API_KEY not set"
)
def test_real_text_generation():
    """Test with real API (requires API key)."""
    
    response = ai.text.generate("test prompt", max_tokens=50)
    
    assert response.text is not None
    assert len(response.text) > 0
    assert response.total_tokens > 0
    assert response.model is not None
```

### Testing Cache Integration

```python
import pytest
import time
from blossom_ai.utils.cache import CacheManager, CacheConfig

@pytest.mark.integration
def test_cache_integration():
    """Test cache functionality."""
    
    config = CacheConfig(backend="redis", host="localhost", port=6379, ttl=5)
    cache = CacheManager(config)
    
    # Test set and get
    cache.set("test_key", "test_value")
    value = cache.get("test_key")
    assert value == "test_value"
    
    # Test TTL
    time.sleep(6)
    expired_value = cache.get("test_key")
    assert expired_value is None
```

### Testing Database Integration

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from models import User, Generation

@pytest.mark.integration
async def test_database_operations(db_session: AsyncSession):
    """Test database operations."""
    
    # Create user
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash="hashed_password"
    )
    db_session.add(user)
    await db_session.commit()
    
    # Query user
    retrieved_user = await db_session.get(User, user.id)
    assert retrieved_user.username == "testuser"
    
    # Create generation record
    generation = Generation(
        user_id=user.id,
        generation_type="text",
        prompt="test prompt",
        result="test result"
    )
    db_session.add(generation)
    await db_session.commit()
    
    # Verify relationship
    assert len(retrieved_user.generations) == 1
```

---

## 🎭 Mocking and Patching

### Mocking External Services

```python
import pytest
from unittest.mock import Mock, patch, AsyncMock

@pytest.fixture
def mock_http_client():
    """Fixture for mocked HTTP client."""
    with patch('blossom_ai.utils.http_client.httpx.AsyncClient') as mock_client:
        yield mock_client

def test_with_mocked_client(mock_http_client):
    """Test using mocked HTTP client."""
    
    # Setup mock response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Mocked response"}}]
    }
    
    # Configure mock client
    mock_client_instance = Mock()
    mock_client_instance.post = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__.return_value = mock_client_instance
    mock_http_client.return_value = mock_client_instance
    
    # Test
    with BlossomClient() as client:
        response = client.text.generate("test prompt")
    
    assert response.text == "Mocked response"
```

### Mocking Time

```python
import pytest
from freezegun import freeze_time

@freeze_time("2024-01-01 12:00:00")
def test_time_dependent_function():
    """Test function that depends on current time."""
    
    from datetime import datetime
    
    # This will return 2024-01-01 12:00:00
    now = datetime.now()
    assert now.year == 2024
    assert now.month == 1
    assert now.day == 1
```

### Mocking File System

```python
import pytest
from pyfakefs.fake_filesystem_unittest import Patcher

def test_file_operations():
    """Test file operations with mocked file system."""
    
    with Patcher() as patcher:
        # Create fake file
        patcher.fs.create_file('/fake/image.jpg', contents=b'fake image data')
        
        # Test file operations
        with open('/fake/image.jpg', 'rb') as f:
            data = f.read()
        
        assert data == b'fake image data'
```

---

## 🎯 End-to-End Testing

### Complete Workflow Testing

```python
import pytest
from fastapi.testclient import TestClient
from app import app

@pytest.mark.e2e
class TestCompleteWorkflow:
    """End-to-end tests for complete workflows."""
    
    def setup_method(self):
        self.client = TestClient(app)
    
    def test_user_registration_and_generation(self):
        """Test complete user workflow."""
        
        # 1. Register user
        register_response = self.client.post(
            "/auth/register",
            json={
                "username": "testuser",
                "email": "test@example.com",
                "password": "securepassword123"
            }
        )
        assert register_response.status_code == 201
        
        # 2. Login
        login_response = self.client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "securepassword123"
            }
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # 3. Generate text
        headers = {"Authorization": f"Bearer {token}"}
        generation_response = self.client.post(
            "/generate/text",
            json={"prompt": "test prompt"},
            headers=headers
        )
        assert generation_response.status_code == 200
        assert "text" in generation_response.json()
        
        # 4. Check usage statistics
        stats_response = self.client.get(
            "/analytics/usage",
            headers=headers
        )
        assert stats_response.status_code == 200
        assert stats_response.json()["total_generations"] == 1
```

### Testing WebSocket Connections

```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.e2e
async def test_websocket_communication():
    """Test WebSocket communication."""
    
    client = TestClient(app)
    
    with client.websocket_connect("/ws") as websocket:
        # Send message
        websocket.send_json({"type": "subscribe", "channel": "updates"})
        
        # Receive response
        data = websocket.receive_json()
        assert data["type"] == "subscription_confirmed"
        
        # Test real-time update
        # (This would require triggering an update in the background)
        # update = websocket.receive_json()
        # assert update["type"] == "generation_complete"
```

---

## ⚡ Performance Testing

### Benchmarking

```python
import time
import statistics
import pytest
from blossom_ai import BlossomClient

class TestPerformance:
    """Performance tests for Blossom AI operations."""
    
    def test_text_generation_performance(self):
        """Test text generation response time."""
        
        response_times = []
        
        with BlossomClient() as client:
            for i in range(10):
                start_time = time.time()
                response = client.text.generate(f"Test prompt {i}")
                end_time = time.time()
                
                response_times.append(end_time - start_time)
        
        avg_response_time = statistics.mean(response_times)
        max_response_time = max(response_times)
        
        assert avg_response_time < 2.0, f"Average response time too high: {avg_response_time:.2f}s"
        assert max_response_time < 5.0, f"Max response time too high: {max_response_time:.2f}s"
    
    def test_concurrent_performance(self):
        """Test concurrent request performance."""
        
        import asyncio
        
        async def concurrent_requests():
            tasks = []
            with BlossomClient() as client:
                for i in range(5):
                    task = client.text.generate(f"Concurrent prompt {i}")
                    tasks.append(task)
                
                start_time = time.time()
                results = await asyncio.gather(*tasks)
                end_time = time.time()
                
                total_time = end_time - start_time
                assert total_time < 3.0, f"Concurrent requests too slow: {total_time:.2f}s"
                assert len(results) == 5
        
        asyncio.run(concurrent_requests())
```

### Load Testing

```python
import asyncio
import aiohttp
import time
import pytest

@pytest.mark.load
async def test_api_load():
    """Test API under load."""
    
    async def make_request(session, prompt):
        async with session.post(
            "http://localhost:8000/api/generate/text",
            json={"prompt": prompt}
        ) as response:
            return await response.json()
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        
        # Create 100 concurrent requests
        for i in range(100):
            task = make_request(session, f"Load test prompt {i}")
            tasks.append(task)
        
        start_time = time.time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        end_time = time.time()
        
        total_time = end_time - start_time
        success_count = sum(1 for r in results if not isinstance(r, Exception))
        
        # Assertions
        assert total_time < 30.0, f"Load test too slow: {total_time:.2f}s"
        assert success_count >= 95, f"Too many failures: {100 - success_count}"
        print(f"Load test completed: {success_count}/100 successful in {total_time:.2f}s")
```

---

## 🔒 Security Testing

### Security Scanning

```bash
# Run security scans
bandit -r blossom_ai/ -f json -o bandit-report.json

# Check dependencies for vulnerabilities
safety check --json --output safety-report.json

# Run Semgrep
semgrep --config=auto blossom_ai/
```

### Testing for Common Vulnerabilities

```python
import pytest
from fastapi.testclient import TestClient

class TestSecurity:
    """Security tests for common vulnerabilities."""
    
    def test_sql_injection_protection(self):
        """Test SQL injection protection."""
        
        malicious_prompts = [
            "test'; DROP TABLE users; --",
            "test\" OR \"1\"=\"1",
            "test\'; UNION SELECT * FROM users --",
        ]
        
        with BlossomClient() as client:
            for prompt in malicious_prompts:
                try:
                    response = client.text.generate(prompt)
                    # Should not cause database errors
                    assert response.text is not None
                except Exception as e:
                    # Should handle gracefully, not expose database errors
                    assert "database" not in str(e).lower()
    
    def test_xss_protection(self):
        """Test XSS protection."""
        
        xss_payloads = [
            "<script>alert('xss')</script>",
            "<img src=x onerror=alert('xss')>",
            "javascript:alert('xss')",
        ]
        
        for payload in xss_payloads:
            with pytest.raises(ValidationError):
                ai.text.generate(payload)
    
    def test_file_upload_security(self):
        """Test file upload security."""
        
        # Test with disallowed file type
        malicious_files = [
            ("test.php", b'<?php echo "malicious"; ?>'),
            ("test.exe", b'malicious executable content'),
            ("../../../etc/passwd", b'test content'),
        ]
        
        for filename, content in malicious_files:
            with pytest.raises(ValidationError):
                # This should be caught by file validation
                validate_file_path(filename)
```

---

## 📊 Test Reporting

### Coverage Report

```bash
# Generate coverage report
pytest --cov=blossom_ai --cov-report=html:coverage_html

# View coverage
open coverage_html/index.html
```

### Test Results

```bash
# Generate HTML report
pytest --html=report.html --self-contained-html

# Generate JUnit XML for CI
pytest --junitxml=test-results.xml
```

### CI/CD Integration

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
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
        pip install pytest pytest-asyncio pytest-cov
        pip install -e .
    
    - name: Run unit tests
      run: pytest tests/unit --cov=blossom_ai --cov-report=xml
    
    - name: Run integration tests
      run: pytest tests/integration
      env:
        BLOSSOM_API_KEY: ${{ secrets.BLOSSOM_API_KEY }}
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

---

## 🎓 Testing Best Practices

### Do's ✅

1. **Write tests first** (TDD approach)
2. **Test edge cases** and error conditions
3. **Use descriptive test names** that explain what's being tested
4. **Keep tests independent** - no shared state between tests
5. **Use fixtures** for common setup/teardown
6. **Mock external dependencies** for unit tests
7. **Test both success and failure paths**
8. **Run tests frequently** during development
9. **Maintain test coverage** above 90%
10. **Document complex test scenarios**

### Don'ts ❌

1. **Don't write tests that depend on each other**
2. **Don't test implementation details** - test behavior
3. **Don't skip error case testing**
4. **Don't use sleep() in tests** - use proper async handling
5. **Don't commit commented-out tests**
6. **Don't ignore failing tests**
7. **Don't test third-party libraries** - mock them
8. **Don't write overly complex tests** - keep them simple
9. **Don't test everything** - focus on critical paths
10. **Don't forget to clean up** after tests

---

## 📚 Related Documentation

- [📝 Contributing Guide](CONTRIBUTING.md)
- [🎨 Code Style Guide](CODE_STYLE.md)
- [🔒 Security Guide](../../SECURITY.md)
- [⚙️ Configuration Guide](CONFIGURATION.md)
- [🚀 Deployment Guide](DEPLOYMENT.md)

---

## 🎯 Testing Checklist

Before committing code:

- [ ] Unit tests written for new functionality
- [ ] Integration tests pass
- [ ] Edge cases covered
- [ ] Error conditions tested
- [ ] Mock objects used appropriately
- [ ] Tests are independent
- [ ] Test coverage > 90%
- [ ] Security tests pass
- [ ] Performance tests acceptable
- [ ] All tests pass locally
- [ ] CI/CD tests pass

---

**Remember**: Good tests are as important as good code. They provide confidence in your changes and prevent regressions!
