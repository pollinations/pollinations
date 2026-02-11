# 🔒 Security Guide

> Comprehensive security practices for Blossom AI applications

---

## 🎯 Overview

This guide covers security best practices for:
- **API key management** and protection
- **Input validation** and sanitization
- **Secure configuration** handling
- **Data protection** and privacy
- **Deployment security**

---

## 🔐 API Key Security

### Environment Variables (Recommended)

```python
import os
from blossom_ai import SessionConfig

# Good ✅ - Load from environment
config = SessionConfig(
    api_key=os.getenv("BLOSSOM_API_KEY"),
    # ... other settings
)

# Bad ❌ - Hardcoded API key
config = SessionConfig(
    api_key="sk-1234567890abcdef",  # Never do this!
)
```

### .env File Management

```bash
# .env (add to .gitignore!)
BLOSSOM_API_KEY=sk-your-secret-key-here
BLOSSOM_CACHE_ENABLED=true
```

```python
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Now safe to use
api_key = os.getenv("BLOSSOM_API_KEY")
```

### Key Rotation

```python
import os
from datetime import datetime, timedelta

class APIKeyManager:
    def __init__(self):
        self.primary_key = os.getenv("BLOSSOM_API_KEY")
        self.secondary_key = os.getenv("BLOSSOM_API_KEY_BACKUP")
        self.key_last_rotated = datetime.now()
    
    def get_current_key(self):
        """Get current API key."""
        return self.primary_key
    
    def should_rotate(self, days=30):
        """Check if keys should be rotated."""
        return datetime.now() - self.key_last_rotated > timedelta(days=days)
    
    def rotate_keys(self):
        """Rotate API keys."""
        # Implementation depends on your key management system
        self.key_last_rotated = datetime.now()
        logger.info("API keys rotated")
```

---

## 🛡️ Input Validation and Sanitization

### Prompt Validation

```python
import re
from blossom_ai import ValidationError

class PromptValidator:
    """Validate and sanitize user prompts."""
    
    # Forbidden patterns (injection attempts)
    FORBIDDEN_PATTERNS = [
        r'<script.*?>.*?</script>',
        r'javascript:',
        r'vbscript:',
        r'on\w+\s*=',
        r'eval\s*\(',
        r'exec\s*\(',
        r'import\s+',
        r'__import__\s*\(',
    ]
    
    def __init__(self, max_length: int = 1000):
        self.max_length = max_length
    
    def validate(self, prompt: str) -> str:
        """Validate and sanitize prompt."""
        
        # Check length
        if len(prompt) > self.max_length:
            raise ValidationError(
                f"Prompt too long: {len(prompt)} characters. "
                f"Maximum: {self.max_length}"
            )
        
        if len(prompt) < 10:
            raise ValidationError(
                f"Prompt too short: {len(prompt)} characters. "
                f"Minimum: 10"
            )
        
        # Check for forbidden patterns
        for pattern in self.FORBIDDEN_PATTERNS:
            if re.search(pattern, prompt, re.IGNORECASE):
                raise ValidationError(
                    f"Prompt contains forbidden pattern: {pattern}"
                )
        
        # Basic sanitization
        sanitized = self.sanitize(prompt)
        
        return sanitized
    
    def sanitize(self, prompt: str) -> str:
        """Basic sanitization of prompt."""
        # Remove potential script tags
        prompt = re.sub(r'<script.*?>.*?</script>', '', prompt, flags=re.IGNORECASE | re.DOTALL)
        
        # Remove potential event handlers
        prompt = re.sub(r'on\w+\s*=\s*["\']?[^>]*["\']?', '', prompt, flags=re.IGNORECASE)
        
        # Normalize whitespace
        prompt = re.sub(r'\s+', ' ', prompt).strip()
        
        return prompt

# Usage
validator = PromptValidator(max_length=500)

try:
    safe_prompt = validator.validate(user_input)
    response = ai.text.generate(safe_prompt)
except ValidationError as e:
    logger.warning(f"Invalid prompt from user: {e}")
    return error_response(str(e))
```

### File Path Validation

```python
from pathlib import Path
import os

def validate_file_path(file_path: str, allowed_extensions: list = None) -> Path:
    """Validate and sanitize file path."""
    
    # Convert to Path object
    path = Path(file_path)
    
    # Check for directory traversal attempts
    if ".." in str(path) or path.is_absolute():
        raise ValidationError("Invalid file path: directory traversal detected")
    
    # Check file extension
    if allowed_extensions:
        if path.suffix.lower() not in allowed_extensions:
            raise ValidationError(
                f"Invalid file type: {path.suffix}. "
                f"Allowed: {allowed_extensions}"
            )
    
    # Check if file exists
    if not path.exists():
        raise ValidationError(f"File not found: {path}")
    
    # Check file size (prevent DoS)
    max_size = 10 * 1024 * 1024  # 10MB
    if path.stat().st_size > max_size:
        raise ValidationError(f"File too large: {path.stat().st_size / (1024*1024):.1f}MB")
    
    return path.resolve()

# Usage
allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif']
try:
    safe_path = validate_file_path("user_uploads/photo.jpg", allowed_extensions)
    analysis = ai.vision.analyze(image_path=str(safe_path))
except ValidationError as e:
    logger.warning(f"Invalid file path: {e}")
```

---

## 🔒 Secure Configuration

### Configuration Validation

```python
from pydantic import BaseModel, validator
import os

class SecureConfig(BaseModel):
    """Secure configuration with validation."""
    
    api_key: str
    allowed_origins: List[str]
    max_file_size_mb: int = 10
    rate_limit_per_minute: int = 60
    
    @validator('api_key')
    def validate_api_key(cls, v):
        if not v or len(v) < 20:
            raise ValueError("Invalid API key length")
        if not v.startswith("sk-"):
            raise ValueError("API key must start with 'sk-'")
        return v
    
    @validator('allowed_origins')
    def validate_origins(cls, v):
        for origin in v:
            if not origin.startswith(('http://', 'https://')):
                raise ValueError(f"Invalid origin: {origin}")
        return v
    
    @validator('max_file_size_mb')
    def validate_file_size(cls, v):
        if v < 1 or v > 100:
            raise ValueError("File size must be between 1 and 100 MB")
        return v

# Usage
try:
    config = SecureConfig(
        api_key=os.getenv("BLOSSOM_API_KEY"),
        allowed_origins=["https://app.example.com"],
        max_file_size_mb=10
    )
except ValueError as e:
    logger.error(f"Invalid configuration: {e}")
    raise
```

### Environment-Specific Security

```python
import os
from blossom_ai import SessionConfig

class SecurityConfig:
    @staticmethod
    def create_secure_config():
        """Create security-aware configuration."""
        
        environment = os.getenv("ENVIRONMENT", "development")
        
        if environment == "production":
            return SessionConfig(
                api_key=os.getenv("BLOSSOM_API_KEY"),  # Never hardcode
                cache_enabled=True,
                cache_backend="redis",  # Distributed cache
                rate_limit_per_minute=60,
                timeout=30.0,
                max_file_size_mb=5,  # Conservative limit
                log_level="WARNING"  # Less verbose
            )
        elif environment == "staging":
            return SessionConfig(
                api_key=os.getenv("STAGING_API_KEY"),
                cache_enabled=True,
                cache_backend="file",
                rate_limit_per_minute=100,
                timeout=45.0,
                max_file_size_mb=10,
                log_level="INFO"
            )
        else:  # development
            return SessionConfig(
                api_key=os.getenv("DEV_API_KEY", "dev-key"),
                cache_enabled=True,
                cache_backend="memory",
                rate_limit_per_minute=30,
                timeout=10.0,
                max_file_size_mb=10,
                log_level="DEBUG"
            )
```

---

## 📝 Logging Security

### Sanitizing Logs

```python
import re
from blossom_ai.utils.logging import StructuredLogger

logger = StructuredLogger("security")

def sanitize_for_logging(data: str) -> str:
    """Remove sensitive information from logs."""
    
    # API keys
    data = re.sub(r'sk-[a-zA-Z0-9]+', 'sk-***', data)
    
    # Passwords
    data = re.sub(r'password[=:]\s*\S+', 'password=***', data, flags=re.IGNORECASE)
    
    # Tokens
    data = re.sub(r'token[=:]\s*\S+', 'token=***', data, flags=re.IGNORECASE)
    
    # Credit cards (basic pattern)
    data = re.sub(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', '****-****-****-****', data)
    
    # Email addresses
    data = re.sub(r'\S+@\S+', '***@***.com', data)
    
    return data

# Usage
user_prompt = "My email is user@example.com and api key is sk-1234567890abcdef"
safe_prompt = sanitize_for_logging(user_prompt)

logger.info("User request processed", prompt=safe_prompt)
```

### Security Events Logging

```python
from datetime import datetime
from enum import Enum

class SecurityEventType(Enum):
    LOGIN_ATTEMPT = "login_attempt"
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    INVALID_INPUT = "invalid_input"

class SecurityLogger:
    def __init__(self):
        self.logger = StructuredLogger("security")
    
    def log_security_event(
        self,
        event_type: SecurityEventType,
        user_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        details: Optional[dict] = None
    ):
        """Log security events for monitoring."""
        
        event_data = {
            "event_type": event_type.value,
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "ip_address": ip_address,
            "details": details or {}
        }
        
        if event_type in [SecurityEventType.LOGIN_FAILURE, SecurityEventType.SUSPICIOUS_ACTIVITY]:
            self.logger.warning("Security event", **event_data)
        elif event_type == SecurityEventType.RATE_LIMIT_EXCEEDED:
            self.logger.info("Rate limit exceeded", **event_data)
        else:
            self.logger.info("Security event", **event_data)

# Usage
security_logger = SecurityLogger()

# Log failed login attempt
security_logger.log_security_event(
    SecurityEventType.LOGIN_FAILURE,
    user_id=12345,
    ip_address="192.168.1.100",
    details={"reason": "invalid_password", "attempt_count": 3}
)
```

---

## 🌐 Web Application Security

### CORS Configuration

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Good ✅ - Restrictive CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],  # Specific origins only
    allow_credentials=True,
    allow_methods=["GET", "POST"],  # Only necessary methods
    allow_headers=["Authorization", "Content-Type"],  # Only necessary headers
)

# Bad ❌ - Permissive CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Too permissive
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Input Validation in Web Apps

```python
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel, validator

app = FastAPI()

class GenerationRequest(BaseModel):
    prompt: str
    max_tokens: int = 1000
    
    @validator('prompt')
    def validate_prompt(cls, v):
        if len(v) < 10:
            raise ValueError('Prompt too short')
        if len(v) > 1000:
            raise ValueError('Prompt too long')
        
        # Check for potential injection
        if '<script>' in v.lower():
            raise ValueError('Invalid characters in prompt')
        
        return v
    
    @validator('max_tokens')
    def validate_max_tokens(cls, v):
        if v < 1 or v > 4000:
            raise ValueError('max_tokens must be between 1 and 4000')
        return v

@app.post("/generate/text")
async def generate_text(request: GenerationRequest):
    try:
        response = ai.text.generate(
            request.prompt,
            max_tokens=request.max_tokens
        )
        return {"text": response.text}
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### File Upload Security

```python
import os
from pathlib import Path

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_upload_file(file: UploadFile) -> Path:
    """Validate uploaded file for security."""
    
    # Check file extension
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {ALLOWED_EXTENSIONS}"
        )
    
    # Check content type
    if not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="File must be an image"
        )
    
    # Read file content and check size
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
        )
    
    # Generate safe filename
    safe_filename = f"{uuid.uuid4()}{file_extension}"
    
    # Save to secure location
    upload_path = Path("secure_uploads") / safe_filename
    upload_path.parent.mkdir(exist_ok=True)
    
    with open(upload_path, 'wb') as f:
        f.write(content)
    
    return upload_path

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = validate_upload_file(file)
        analysis = ai.vision.analyze(image_path=str(file_path))
        
        # Clean up file after analysis
        file_path.unlink()
        
        return {"analysis": analysis.description}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")
```

---

## 🔐 Authentication and Authorization

### JWT Token Management

```python
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Create secure JWT token."""
    to_encode = data.copy()
    
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token."""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication credentials"
            )
        return {"user_id": user_id}
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials"
        )

@app.get("/protected")
async def protected_endpoint(current_user: dict = Depends(verify_token)):
    return {"message": "Access granted", "user_id": current_user["user_id"]}
```

### Rate Limiting by User

```python
from fastapi import Depends
from redis import asyncio as aioredis

class UserRateLimiter:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.default_limit = 60  # requests per minute
    
    async def check_rate_limit(self, user_id: int) -> bool:
        """Check if user has exceeded rate limit."""
        key = f"rate_limit:{user_id}"
        current_count = await self.redis.get(key)
        
        if current_count is None:
            await self.redis.setex(key, 60, 1)  # 1 minute expiry
            return True
        
        if int(current_count) >= self.default_limit:
            return False
        
        await self.redis.incr(key)
        return True

# Usage
redis_client = aioredis.from_url("redis://localhost")
rate_limiter = UserRateLimiter(redis_client)

@app.post("/generate")
async def generate(
    request: GenerationRequest,
    current_user: dict = Depends(verify_token)
):
    if not await rate_limiter.check_rate_limit(current_user["user_id"]):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded"
        )
    
    # Process request
    response = ai.text.generate(request.prompt)
    return {"text": response.text}
```

---

## 🛡️ Deployment Security

### Docker Security

```dockerfile
# Good ✅ - Secure Dockerfile
FROM python:3.11-slim

# Create non-root user
RUN groupadd -r blossom && useradd -r -g blossom blossom

# Set working directory
WORKDIR /app

# Copy requirements first (for layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY --chown=blossom:blossom blossom_ai/docs .

# Create necessary directories
RUN mkdir -p uploads logs && \
    chown -R blossom:blossom uploads logs

# Switch to non-root user
USER blossom

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

# Bad ❌ - Insecure Dockerfile
FROM python:3.11

# Missing user creation - runs as root
COPY blossom_ai/docs .
RUN pip install -r requirements.txt

EXPOSE 8000
CMD ["python", "app.py"]
```

### Environment Variables Security

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}  # From .env file
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    secrets:
      - api_key
    networks:
      - app_network
    restart: unless-stopped

secrets:
  api_key:
    file: ./secrets/api_key.txt

networks:
  app_network:
    driver: bridge
```

### Network Security

```yaml
# Restrict network access
services:
  app:
    ports:
      - "80:8000"  # Only expose necessary ports
    networks:
      - frontend
      - backend
  
  redis:
    networks:
      - backend  # Not accessible from outside
  
  database:
    networks:
      - backend  # Not accessible from outside

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access
```

---

## 🔍 Security Monitoring

### Intrusion Detection

```python
class SecurityMonitor:
    def __init__(self):
        self.suspicious_patterns = [
            r'\.\./',  # Directory traversal
            r'<script',  # Script injection
            r'union\s+select',  # SQL injection
            r'javascript:',  # JavaScript injection
        ]
    
    def check_request(self, request_data: dict) -> bool:
        """Check if request is suspicious."""
        for key, value in request_data.items():
            if isinstance(value, str):
                for pattern in self.suspicious_patterns:
                    if re.search(pattern, value, re.IGNORECASE):
                        return True
        return False
    
    def log_suspicious_activity(self, request, user_id: int = None):
        """Log suspicious activity."""
        security_logger.log_security_event(
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            user_id=user_id,
            ip_address=request.client.host,
            details={
                "user_agent": request.headers.get("user-agent"),
                "path": request.url.path,
                "query_params": str(request.query_params)
            }
        )

# Usage
security_monitor = SecurityMonitor()

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Check for suspicious patterns
    request_data = {
        "path": str(request.url.path),
        "query": str(request.query_params),
        "headers": dict(request.headers)
    }
    
    if security_monitor.check_request(request_data):
        security_monitor.log_suspicious_activity(request)
    
    response = await call_next(request)
    return response
```

### Performance Monitoring

```python
import time
from collections import defaultdict

class PerformanceMonitor:
    def __init__(self):
        self.request_counts = defaultdict(int)
        self.error_counts = defaultdict(int)
        self.response_times = defaultdict(list)
    
    def record_request(self, endpoint: str, response_time: float, status_code: int):
        """Record request metrics."""
        self.request_counts[endpoint] += 1
        self.response_times[endpoint].append(response_time)
        
        if status_code >= 400:
            self.error_counts[endpoint] += 1
    
    def get_anomalies(self) -> List[dict]:
        """Detect performance anomalies."""
        anomalies = []
        
        for endpoint, times in self.response_times.items():
            if len(times) > 10:  # Need sufficient data
                avg_time = sum(times) / len(times)
                recent_avg = sum(times[-10:]) / 10
                
                # Check for sudden increase
                if recent_avg > avg_time * 2:
                    anomalies.append({
                        "endpoint": endpoint,
                        "type": "response_time_increase",
                        "avg_response_time": avg_time,
                        "recent_avg": recent_avg
                    })
        
        return anomalies

# Usage
perf_monitor = PerformanceMonitor()

@app.middleware("http")
async def performance_middleware(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    perf_monitor.record_request(
        request.url.path,
        duration,
        response.status_code
    )
    
    return response
```

---

## 🎓 Security Best Practices

### Do's ✅

1. **Use environment variables** for sensitive data
2. **Validate all inputs** before processing
3. **Sanitize logs** to remove sensitive information
4. **Use HTTPS** in production
5. **Implement rate limiting** to prevent abuse
6. **Keep dependencies updated** regularly
7. **Use parameterized queries** for database operations
8. **Implement proper authentication** and authorization
9. **Monitor for suspicious activity**
10. **Have an incident response plan**

### Don'ts ❌

1. **Don't hardcode secrets** in source code
2. **Don't trust user input** without validation
3. **Don't expose debug information** in production
4. **Don't use default passwords** or weak authentication
5. **Don't ignore security updates**
6. **Don't log sensitive data** (passwords, API keys, tokens)
7. **Don't allow unrestricted file uploads**
8. **Don't disable security features** without good reason
9. **Don't ignore error handling**
10. **Don't assume your application is secure** - test it

---

## 🚨 Security Incident Response

### Incident Response Plan

1. **Detect** - Monitor for security events
2. **Contain** - Isolate affected systems
3. **Assess** - Determine scope and impact
4. **Eradicate** - Remove security threat
5. **Recover** - Restore normal operations
6. **Learn** - Document lessons learned

### Emergency Contacts

```python
# Security incident contacts
SECURITY_CONTACTS = {
    "security_team": "security@company.com",
    "devops_team": "devops@company.com",
    "legal_team": "legal@company.com",
    "on_call_phone": "+1-555-0123"
}

def report_security_incident(incident_type: str, severity: str, details: dict):
    """Report security incident to appropriate teams."""
    
    incident_report = {
        "type": incident_type,
        "severity": severity,
        "timestamp": datetime.utcnow().isoformat(),
        "details": details
    }
    
    # Send to security team
    send_email(
        to=SECURITY_CONTACTS["security_team"],
        subject=f"Security Incident: {incident_type}",
        body=json.dumps(incident_report, indent=2)
    )
    
    # Log incident
    logger.critical("Security incident reported", **incident_report)
```

---

## 📚 Security Resources

### Documentation
- [OWASP Top 10](https://owasp.org/Top10/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Python Security Best Practices](https://python.readthedocs.io/en/latest/library/security_warnings.html)

### Tools
- [Bandit](https://bandit.readthedocs.io/) - Python security linter
- [Safety](https://pyup.io/safety/) - Dependency vulnerability scanner
- [Semgrep](https://semgrep.dev/) - Static analysis security tool

### Training
- [OWASP Training](https://owasp.org/www-training/)
- [SANS Security Training](https://www.sans.org/)
- [Coursera Cybersecurity](https://www.coursera.org/browse/information-technology/security)

---

## 🔗 Related Documentation

- [🔧 Configuration System](CONFIGURATION.md)
- [📝 Contributing Guide](CONTRIBUTING.md)
- [🧪 Testing Guide](TESTING.md)
- [🚀 Deployment Guide](DEPLOYMENT.md)
- [📊 Monitoring Guide](MONITORING.md)

---

## 🏆 Security Checklist

Before deploying to production:

- [ ] API keys stored securely (environment variables)
- [ ] Input validation implemented for all user inputs
- [ ] File upload restrictions in place
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] Logging sanitization implemented
- [ ] HTTPS enforced
- [ ] Authentication and authorization working
- [ ] Dependencies scanned for vulnerabilities
- [ ] Security headers configured
- [ ] Monitoring and alerting set up
- [ ] Incident response plan documented
- [ ] Regular security updates scheduled

---

**Remember**: Security is not a feature, it's a requirement. Always prioritize security in your applications!
