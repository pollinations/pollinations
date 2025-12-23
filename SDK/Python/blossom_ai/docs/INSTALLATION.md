# 📦 Installation Guide

> Complete installation instructions for Blossom AI SDK

---

## 📋 Requirements

**System Requirements:**
- Python 3.11 or higher
- pip (Python package installer)
- Internet connection for API calls

**Supported Platforms:**
- ✅ Windows 10/11
- ✅ macOS 10.15+
- ✅ Linux (Ubuntu 18.04+, CentOS 7+, Debian 10+)
- ✅ Docker containers

---

## ⚡ Quick Installation

### Basic Installation

```bash
pip install eclips-blossom-ai
```

### Installation with All Features

```bash
pip install eclips-blossom-ai[all]
```

### Development Installation

```bash
pip install eclips-blossom-ai[dev]
```

---

## 🔧 Installation Methods

### Method 1: pip (Recommended)

```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install package
pip install eclips-blossom-ai

# Verify installation
python -c "import blossom_ai; print(blossom_ai.__version__)"
```

### Method 2: From Source

```bash
# Clone repository
git clone https://github.com/PrimeevolutionZ/blossom-ai.git
cd blossom-ai

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install in development mode
pip install -e .

# Install development dependencies
pip install -e ".[dev]"
```

### Method 3: Using requirements.txt

```bash
# Create requirements.txt
echo "eclips-blossom-ai>=0.7.0" >> requirements.txt

# Install from requirements
pip install -r requirements.txt
```

---

## 📦 Dependency Groups

### Core Dependencies (Always Installed)

```
httpx>=0.25.0,<1.0.0        # HTTP client
python-dotenv>=1.0.0        # Environment variables
tenacity>=9.0.0,<9.1.3      # Retry mechanisms
pydantic>=2.5.0,<3.0.0      # Data validation
typing-extensions>=4.5.0    # Type hints
```

### Optional Dependencies

#### Development
```bash
pip install eclips-blossom-ai[dev]
```

Includes:
- pytest (testing)
- black (code formatting)
- ruff (linting)
- mypy (type checking)
- pre-commit (git hooks)
- bandit (security)

#### Documentation
```bash
pip install eclips-blossom-ai[docs]
```

Includes:
- mkdocs (documentation)
- mkdocs-material (theme)
- mkdocstrings (API docs)

#### Structured Logging
```bash
pip install eclips-blossom-ai[structlog]
```

Includes:
- structlog (structured logging)

#### File Type Detection
```bash
pip install eclips-blossom-ai[magic]
```

Includes:
- python-magic (file type detection)

#### All Features
```bash
pip install eclips-blossom-ai[all]
```

Includes all optional dependencies.

---

## 🔐 Environment Setup

### 1. Create Project Directory

```bash
mkdir my-blossom-project
cd my-blossom-project
```

### 2. Set Up Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate (Linux/Mac)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate
```

### 3. Create .env File

```bash
# Create .env file
touch .env
```

Add your API keys:
```env
# Optional: API keys for different providers
BLOSSOM_API_KEY=your_api_key_here
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Optional: Custom configuration
BLOSSOM_BASE_URL=https://api.example.com
BLOSSOM_RATE_LIMIT=60
BLOSSOM_CACHE_ENABLED=true
```

### 4. Install Blossom AI

```bash
pip install eclips-blossom-ai
```

---

## ✅ Verification

### Test Installation

```python
# test_installation.py
import blossom_ai

print(f"Blossom AI version: {blossom_ai.__version__}")

# Test basic functionality
from blossom_ai import ai

# Test without API key (uses free tier)
image = ai.image.generate("test")
print("✅ Installation successful!")
```

Run the test:
```bash
python test_installation.py
```

### Expected Output
```
Blossom AI version: 0.7.0
✅ Installation successful!
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Python Version Error

**Error:** `Python 3.11+ is required`

**Solution:**
```bash
# Check Python version
python --version

# Install Python 3.11+
# Ubuntu/Debian:
sudo apt update
sudo apt install python3.11 python3.11-venv

# macOS:
brew install python@3.11

# Windows:
# Download from python.org
```

#### 2. Permission Error

**Error:** `Permission denied`

**Solution:**
```bash
# Use user installation
pip install --user eclips-blossom-ai

# Or use virtual environment
python -m venv venv
source venv/bin/activate
pip install eclips-blossom-ai
```

#### 3. SSL Certificate Error

**Error:** `SSL: CERTIFICATE_VERIFY_FAILED`

**Solution:**
```bash
# Update certificates
pip install --upgrade certifi

# Or disable SSL (not recommended for production)
pip install --trusted-host pypi.org --trusted-host pypi.python.org eclips-blossom-ai
```

#### 4. Import Error

**Error:** `ModuleNotFoundError: No module named 'blossom_ai'`

**Solution:**
```bash
# Check installation
pip list | grep blossom

# Reinstall
pip uninstall eclips-blossom-ai
pip install eclips-blossom-ai

# Check Python path
python -c "import sys; print(sys.path)"
```

#### 5. Dependency Conflict

**Error:** `ERROR: ResolutionImpossible`

**Solution:**
```bash
# Create fresh environment
python -m venv fresh_env
source fresh_env/bin/activate
pip install eclips-blossom-ai
```

---

## 🐳 Docker Installation

### Dockerfile

```dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run application
CMD ["python", "app.py"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    environment:
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
    volumes:
      - ./output:/app/output
```

---

## 🚀 Next Steps

После установки:

1. [⚡ Быстрый старт](QUICKSTART.md) — ваш первый код за 2 минуты
2. [🎓 Туториал](TUTORIAL.md) — пошаговое руководство
3. [🎨 Генерация изображений](IMAGE_GENERATION.md) — работа с изображениями
4. [💬 Генерация текста](TEXT_GENERATION.md) — работа с текстом

---

## 📚 См. также

- [🎓 Tutorial](TUTORIAL.md)
- [⚡ Quick Start](QUICKSTART.md)
- [🏗️ Architecture](ARCHITECTURE.md)
- [🔧 Configuration](CONFIGURATION.md)
